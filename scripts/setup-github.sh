#!/usr/bin/env bash
set -euo pipefail

# Interactive setup wizard for the GitHub App integration.
# Guides you through creating a GitHub App and configuring .env.local.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/codebox-orchestrator/.env.local"

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

header() { echo -e "\n${BOLD}${CYAN}=== $1 ===${RESET}\n"; }
info()   { echo -e "${DIM}$1${RESET}"; }
ok()     { echo -e "${GREEN}$1${RESET}"; }
warn()   { echo -e "${YELLOW}$1${RESET}"; }

prompt() {
    local var_name="$1" prompt_text="$2" default="${3:-}"
    if [[ -n "$default" ]]; then
        read -rp "$(echo -e "$prompt_text ${DIM}[$default]${RESET}: ")" value
        eval "$var_name=\"${value:-$default}\""
    else
        read -rp "$(echo -e "$prompt_text: ")" value
        eval "$var_name=\"$value\""
    fi
}

# ─── Step 1: Prerequisites ──────────────────────────────────

header "Step 1: Prerequisites"

if ! command -v pnpm &>/dev/null; then
    warn "pnpm not found. It's needed to run the smee webhook proxy."
    warn "Install: curl -fsSL https://get.pnpm.io/install.sh | sh"
    echo ""
fi

if ! command -v docker &>/dev/null; then
    echo -e "${RED}docker not found. Docker is required to run sandbox containers.${RESET}"
    exit 1
fi

if ! command -v openssl &>/dev/null; then
    warn "openssl not found. You'll need to provide your own webhook secret."
fi

ok "Prerequisites OK"

# ─── Step 2: smee.io Channel ────────────────────────────────

header "Step 2: Webhook Tunnel (smee.io)"

echo "GitHub needs a public URL to deliver webhooks. smee.io proxies them to localhost."
echo ""
echo "1. Go to https://smee.io and click 'Start a new channel'"
echo "2. Copy the channel URL (e.g. https://smee.io/AbCdEfGhIjKl)"
echo ""

prompt SMEE_URL "Paste your smee.io channel URL"

if [[ ! "$SMEE_URL" =~ ^https://smee\.io/ ]]; then
    warn "That doesn't look like a smee.io URL, but continuing anyway."
fi

# ─── Step 3: GitHub App Creation Guide ──────────────────────

header "Step 3: Create a GitHub App"

echo "Go to: https://github.com/settings/apps/new"
echo ""
echo "Fill in these settings:"
echo ""
echo -e "  ${BOLD}App name:${RESET}          codebox-dev (or your preferred name)"
echo -e "  ${BOLD}Homepage URL:${RESET}      http://localhost:3000"
echo -e "  ${BOLD}Webhook URL:${RESET}       ${CYAN}$SMEE_URL${RESET}"
echo -e "  ${BOLD}Setup URL:${RESET}         ${CYAN}http://localhost:8080/api/github/callback${RESET}"
echo -e "                     (check 'Redirect on update')"
echo ""
echo -e "  ${BOLD}Permissions:${RESET}"
echo "    Contents:         Read & Write"
echo "    Pull requests:    Read & Write"
echo "    Issues:           Read & Write"
echo "    Commit statuses:  Read & Write"
echo "    Metadata:         Read"
echo ""
echo -e "  ${BOLD}Subscribe to events:${RESET}"
echo "    Issue comment"
echo "    Pull request review comment"
echo "    Installation"
echo ""
echo "After creating the app, generate a private key (button at the bottom"
echo "of the app settings page). It will download a .pem file."
echo ""

read -rp "Press Enter when you've created the app and downloaded the private key..."

# ─── Step 4: Collect Credentials ────────────────────────────

header "Step 4: Configure Credentials"

echo "You can find these values on your GitHub App's settings page."
echo ""

prompt APP_ID "GitHub App ID (number from the app's About section)"
prompt APP_SLUG "GitHub App slug (the URL-friendly name)" "codebox-dev"

echo ""
echo "Webhook secret — used to verify webhook signatures."
if command -v openssl &>/dev/null; then
    GENERATED_SECRET=$(openssl rand -hex 20)
    echo -e "  Auto-generated: ${DIM}$GENERATED_SECRET${RESET}"
    prompt WEBHOOK_SECRET "Webhook secret (Enter to use generated, or paste your own)" "$GENERATED_SECRET"
else
    prompt WEBHOOK_SECRET "Webhook secret"
fi

echo ""
echo -e "${YELLOW}Important:${RESET} Set this same webhook secret in your GitHub App settings"
echo -e "  (GitHub App settings > General > Webhook secret)"
echo ""

prompt PEM_PATH "Path to the downloaded .pem private key file"

# Expand ~ in path
PEM_PATH="${PEM_PATH/#\~/$HOME}"

if [[ ! -f "$PEM_PATH" ]]; then
    echo -e "${RED}File not found: $PEM_PATH${RESET}"
    echo "Please check the path and re-run this script."
    exit 1
fi

prompt BOT_NAME "Bot trigger name (users will type @<name> in comments)" "$APP_SLUG"

# ─── Step 5: Write .env.local ───────────────────────────────

header "Step 5: Write Configuration"

# Check if GitHub vars already exist
if grep -q "GITHUB_APP_ID" "$ENV_FILE" 2>/dev/null; then
    warn "GitHub configuration already exists in $ENV_FILE"
    read -rp "Overwrite existing GitHub settings? [y/N]: " overwrite
    if [[ "${overwrite,,}" != "y" ]]; then
        echo "Aborted. No changes made."
        exit 0
    fi
    # Remove existing GitHub lines
    sed -i '/^GITHUB_APP_ID=/d' "$ENV_FILE"
    sed -i '/^GITHUB_APP_SLUG=/d' "$ENV_FILE"
    sed -i '/^GITHUB_APP_PRIVATE_KEY_PATH=/d' "$ENV_FILE"
    sed -i '/^GITHUB_WEBHOOK_SECRET=/d' "$ENV_FILE"
    sed -i '/^GITHUB_BOT_NAME=/d' "$ENV_FILE"
    # Remove trailing blank lines
    sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$ENV_FILE"
fi

cat >> "$ENV_FILE" << EOF

# GitHub App integration
GITHUB_APP_ID=$APP_ID
GITHUB_APP_SLUG=$APP_SLUG
GITHUB_APP_PRIVATE_KEY_PATH=$PEM_PATH
GITHUB_WEBHOOK_SECRET=$WEBHOOK_SECRET
GITHUB_BOT_NAME=$BOT_NAME
EOF

ok "Written to $ENV_FILE"
echo ""
echo "Values saved:"
echo -e "  GITHUB_APP_ID=${CYAN}$APP_ID${RESET}"
echo -e "  GITHUB_APP_SLUG=${CYAN}$APP_SLUG${RESET}"
echo -e "  GITHUB_APP_PRIVATE_KEY_PATH=${CYAN}$PEM_PATH${RESET}"
echo -e "  GITHUB_WEBHOOK_SECRET=${CYAN}${WEBHOOK_SECRET:0:8}...${RESET}"
echo -e "  GITHUB_BOT_NAME=${CYAN}$BOT_NAME${RESET}"

# ─── Step 6: Next Steps ────────────────────────────────────

header "Step 6: Next Steps"

echo "1. Start the webhook tunnel (keep running in a separate terminal):"
echo ""
echo -e "   ${BOLD}pnpm dlx smee-client -u $SMEE_URL --target http://localhost:8080/api/github/webhook${RESET}"
echo ""
echo "2. Build the sandbox image (if not already done):"
echo ""
echo -e "   ${BOLD}bash scripts/build-sandbox.sh${RESET}"
echo ""
echo "3. Start the orchestrator:"
echo ""
echo -e "   ${BOLD}cd codebox-orchestrator && python -m codebox_orchestrator${RESET}"
echo ""
echo "4. Install the GitHub App on a test repo:"
echo ""
echo -e "   ${BOLD}https://github.com/apps/$APP_SLUG/installations/new${RESET}"
echo ""
echo "5. Add the installation via the web UI (http://localhost:3000/settings/github)"
echo "   or manually via the API."
echo ""
echo "6. Comment on an issue to trigger the agent:"
echo ""
echo -e "   ${BOLD}@$BOT_NAME implement this feature${RESET}"
echo ""
ok "Setup complete!"

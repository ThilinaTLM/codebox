#!/usr/bin/env bash
# Generate self-signed CA and server certificates for gRPC TLS development.
# Usage: ./scripts/generate_grpc_certs.sh [output_dir]
#
# The server certificate includes SANs for common Docker/Podman host aliases
# so sandbox containers can verify the orchestrator's identity.

set -euo pipefail

CERT_DIR="${1:-certs}"
DAYS=365

mkdir -p "$CERT_DIR"

echo "==> Generating CA key + certificate …"
openssl req -x509 -newkey rsa:4096 \
  -keyout "$CERT_DIR/ca.key" \
  -out "$CERT_DIR/ca.crt" \
  -days "$DAYS" -nodes \
  -subj "/CN=codebox-grpc-ca"

echo "==> Generating server key + CSR …"
openssl req -newkey rsa:4096 \
  -keyout "$CERT_DIR/server.key" \
  -out "$CERT_DIR/server.csr" \
  -nodes \
  -subj "/CN=orchestrator"

echo "==> Signing server certificate with CA (SANs for Docker/Podman networking) …"
openssl x509 -req \
  -in "$CERT_DIR/server.csr" \
  -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" -CAcreateserial \
  -out "$CERT_DIR/server.crt" \
  -days "$DAYS" \
  -extfile <(printf "subjectAltName=DNS:orchestrator,DNS:localhost,DNS:host.docker.internal,DNS:host.containers.internal,IP:127.0.0.1")

# Clean up intermediate files
rm -f "$CERT_DIR/server.csr" "$CERT_DIR/ca.srl"

echo ""
echo "Certificates generated in ./$CERT_DIR/"
echo "  ca.crt      – CA certificate (mount into sandbox containers)"
echo "  ca.key      – CA private key (keep safe, not needed at runtime)"
echo "  server.crt  – Server certificate (used by orchestrator)"
echo "  server.key  – Server private key (used by orchestrator)"
echo ""
echo "Set these environment variables to enable gRPC TLS:"
echo "  GRPC_TLS_CERT=$CERT_DIR/server.crt"
echo "  GRPC_TLS_KEY=$CERT_DIR/server.key"
echo "  GRPC_TLS_CA_CERT=$CERT_DIR/ca.crt"

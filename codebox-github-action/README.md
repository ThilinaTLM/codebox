# codebox-github-action

GitHub Action that runs a codebox AI agent on issue comments.

## Usage

```yaml
name: Codebox Agent
on:
  issue_comment:
    types: [created]

jobs:
  agent:
    if: contains(github.event.comment.body, '/codebox')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/codebox-swe-agents/codebox-github-action@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          llm-provider: openrouter
          llm-api-key: ${{ secrets.OPENROUTER_API_KEY }}
          llm-model: anthropic/claude-sonnet-4
```

## Inputs

| Input                    | Required | Default     | Description                                                                 |
| ------------------------ | -------- | ----------- | --------------------------------------------------------------------------- |
| `github-token`           | Yes      | –           | GitHub token for API access                                                 |
| `llm-provider`           | No       | `openrouter`| LLM provider (`openai` or `openrouter`)                                     |
| `llm-model`              | Yes*     | –           | Model identifier (e.g. `anthropic/claude-sonnet-4`, `gpt-4o`)               |
| `llm-api-key`            | Yes*     | –           | API key for the selected provider                                           |
| `llm-base-url`           | No       | –           | Custom base URL for OpenAI-compatible providers                             |
| `tavily-api-key`         | No       | –           | Tavily API key for web search                                               |
| `trigger-keyword`        | No       | `/codebox`  | Comment keyword that triggers the agent                                     |
| `agent-system-prompt`    | No       | –           | Additional system prompt appended after core and environment prompts       |
| `agent-recursion-limit`  | No       | `300`       | Maximum agent graph recursion                                              |
| `agent-execute-timeout`  | No       | `120`       | Default per-command timeout for the execute tool, seconds                  |
| `log-mode`               | No       | `human`     | `human` for clean output, `debug` for verbose technical logs               |

\* Required unless the agent is supposed to run without an LLM (no realistic use case today).

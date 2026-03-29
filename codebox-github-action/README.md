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
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
          openrouter-model: 'anthropic/claude-sonnet-4'
```

## Inputs

| Input                   | Required | Default                     | Description                                                          |
| ----------------------- | -------- | --------------------------- | -------------------------------------------------------------------- |
| `github-token`          | Yes      | -                           | GitHub token for API access                                          |
| `openrouter-api-key`    | Yes      | -                           | OpenRouter API key                                                   |
| `openrouter-model`      | Yes      | -                           | Model identifier (e.g. `anthropic/claude-sonnet-4`)                  |
| `trigger-keyword`       | No       | `/codebox`                  | Comment keyword that triggers the agent                              |
| `tavily-api-key`        | No       | -                           | Tavily API key for web search                                        |
| `dynamic-system-prompt` | No       | -                           | Additional system prompt appended after core and environment prompts |

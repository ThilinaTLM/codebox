# Deep Agents Chat

A terminal-based interactive chat application that provides a powerful coding assistant with direct access to filesystem operations and shell execution tools. Built with [Textual](https://textual.textualize.io/) for a modern TUI experience and powered by the [Deep Agents](https://github.com/your-org/deepagents) framework.

## Features

- **Interactive TUI Interface**: Modern, responsive terminal user interface built with Textual
- **Filesystem Operations**: Browse, read, write, edit, and search files with tools like `ls`, `read_file`, `write_file`, `edit_file`, `glob`, and `grep`
- **Shell Execution**: Run shell commands directly with the `execute` tool
- **Real-time Streaming**: See AI responses and tool execution updates in real-time
- **Event Visualization**: Watch tool calls as they start, run, and complete with color-coded status indicators
- **Conversation History**: Maintains context across multiple messages

## Prerequisites

- Python 3.12 or higher
- OpenRouter API key
- A supported LLM model via OpenRouter

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd demo-deepagents
```

2. Create and activate a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -e .
```

Or install manually:
```bash
pip install deepagents langchain-openrouter python-dotenv textual
```

## Configuration

Create a `.env` file in the project root with your OpenRouter credentials:

```env
OPENROUTER_API_KEY=your_api_key_here
OPENROUTER_MODEL=your_model_name_here
```

Example models:
- `openai/gpt-4o`
- `anthropic/claude-3.5-sonnet`
- `meta-llama/llama-3.1-70b-instruct`

## Usage

Run the application:

```bash
python main.py
```

Or if installed via pip:

```bash
deepagents-chat
```

### Interacting with the Assistant

1. Type your message in the input field at the bottom and press Enter
2. Watch as the assistant processes your request and uses tools
3. Tool calls are shown with status indicators:
   - Yellow rotating arrow: Tool is running
   - Green checkmark: Tool completed successfully
4. The assistant can perform tasks like:
   - Reading and analyzing files
   - Writing or modifying code
   - Searching for patterns
   - Running shell commands
   - Listing directory contents

5. Type `exit` or `quit` to close the application

### Available Tools

The assistant has access to the following tools:

| Tool | Description |
|------|-------------|
| `ls` | List files and directories |
| `read_file` | Read contents of a file |
| `write_file` | Create or overwrite a file |
| `edit_file` | Make precise edits to existing files |
| `glob` | Find files matching a pattern |
| `grep` | Search for text within files |
| `execute` | Run shell commands |

## Project Structure

```
demo-deepagents/
├── .env                    # Environment variables (create this)
├── .gitignore
├── .python-version         # Python version specification
├── .venv/                 # Virtual environment (gitignored)
├── __pycache__/           # Python cache (gitignored)
├── main.py                # Main application entry point
├── pyproject.toml         # Project metadata and dependencies
├── README.md              # This file
└── uv.lock               # Dependency lock file
```

## How It Works

1. **Initialization**: On startup, the app creates a Deep Agent with:
   - A ChatOpenRouter LLM configured from environment variables
   - A LocalShellBackend that provides filesystem and shell tools
   - A system prompt defining the assistant's capabilities and constraints

2. **Event Streaming**: The agent streams events using `astream_events()`, which are processed to provide real-time feedback:
   - `on_chat_model_start`: Prepares for AI response
   - `on_tool_start`: Shows tool execution beginning
   - `on_tool_end`: Updates tool status on completion
   - `on_chat_model_stream`: Displays streaming text response

3. **Backend**: The LocalShellBackend runs tools in a sandboxed environment with configurable timeout and virtual mode enabled for safety.

## Development

### Adding New Tools

To add custom tools, modify the agent creation in `main.py`:

```python
from deepagents.tools import Tool

# Define your custom tool
def my_custom_tool(arg1: str, arg2: int) -> str:
    """Tool description."""
    # Implementation
    return result

# Pass tools to create_deep_agent
self.agent = create_deep_agent(
    model=llm,
    tools=[my_custom_tool],  # Add your tools here
    backend=backend,
    system_prompt=...
)
```

### Modifying the UI

The app uses Textual's reactive framework. Edit the `CSS` string and `compose()` method to customize the interface.

## Troubleshooting

**Issue**: "OPENROUTER_API_KEY not found"
- **Solution**: Ensure your `.env` file is in the project root and contains the correct API key

**Issue**: Tools not executing or timing out
- **Solution**: Check that the `LocalShellBackend` has proper permissions and the timeout is sufficient (default: 120 seconds)

**Issue**: Import errors
- **Solution**: Make sure all dependencies are installed: `pip install -e .`

## License

[Add your license information here]

## Acknowledgments

- [Deep Agents](https://github.com/your-org/deepagents) - The agent framework
- [Textual](https://github.com/Textualize/textual) - TUI framework
- [LangChain](https://github.com/langchain-ai/langchain) - LLM orchestration
- [OpenRouter](https://openrouter.ai) - LLM API gateway
# GitHub Models CLI

A command-line interface tool to interact with GitHub Copilot models. This tool allows you to list available models and run prompts against them.

## Installation

```bash
# Clone the repository
git clone https://github.com/daliusd/copilot-cli.git
cd copilot-cli

# Install dependencies
npm install

# Link the package (optional)
npm link
```

## Prerequisites

You need to have GitHub Copilot access and be authenticated (e.g. some Neovim copilot plugin). This tool will use the same authentication tokens that the GitHub Copilot extension uses.

## Usage

### List Available Models

```bash
./index.js models
```

or if linked:

```bash
copilot models
```

### Chat with a Model

Using a prompt directly:

```bash
./index.js chat --model gpt-4o --prompt "What is the capital of France?"
```

Using a prompt from a file:

```bash
./index.js chat --model gpt-4o --file ./example-prompt.txt
```

With a system prompt:

```bash
./index.js chat --model gpt-4o --prompt "Generate a poem" --system "You are a helpful poetry assistant."
```

Adjust temperature:

```bash
./index.js chat --model gpt-4o --prompt "Tell me a creative story" --temperature 0.8
```

Run prompt and pass parameters to it:

```bash
./index.js chat --model o3-mini --file ./example-prompt-2.txt -P fn=./index.js
```

Run prompt and pass parameters to it:

```bash
copilot chat --model o3-mini --tool editor --file ./example-prompt-3.txt -P fn=./index.js
```

## Options

### Global Options

- `--version`: Display version information
- `--help`: Display help information

### Chat Command Options

- `-m, --model <model>`: Model ID to use (required)
- `-p, --prompt <prompt>`: Prompt to send to the model
- `-f, --file <file>`: Read prompt from a file
- `-s, --system <system>`: System prompt to use
- `-t, --temperature <temperature>`: Temperature (0-2, default: 0)
- `--tool <name>`: Enable a specific tool (fetch, editor)
- `-P, --param <key=value>`: Parameter to replace in the prompt. Any occurrence of `{{ key }}`, `{{ key:file }}`, or `{{ key:code }}` in the prompt (where key may contain alphanumerics, underscores, and hyphens) is replaced with the corresponding value. For `:file`, the value is treated as a file path and its file content is used. For `:code`, the file content is used with each line prefixed by its line number.

## How It Works

This CLI tool authenticates with GitHub Copilot using your existing credentials, fetches available models, and allows you to run prompts against those models.

## License

MIT

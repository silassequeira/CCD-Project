# AI Prompt Processor

A server-side application that connects to an AI model API, processes prompts from Markdown files, and saves responses as JSON files.

## Features

- Connect to OpenRouter AI API with customizable model selection
- Read prompts from Markdown files
- Process prompts through the AI API
- Save AI responses to JSON files
- Express server with RESTful endpoints
- CLI tool for direct file processing

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory with your API credentials:

```
OPENROUTER_API_KEY=your_api_key_here
AI_MODEL=microsoft/phi-4-reasoning-plus:free
PORT=3000
SITE_URL=http://localhost:3000
SITE_NAME=AI Prompt Processor
```

## Usage

### Option 1: Run as an Express Server

Start the server:

```bash
npm start
```

Then you can use the API endpoints:

#### Process a prompt file

```bash
curl -X POST http://localhost:3000/process-prompt \
  -H "Content-Type: application/json" \
  -d '{"promptFile": "path/to/your/prompt.md", "outputFile": "output.json"}'
```

#### Process a file directly with default output naming

```bash
curl -X POST http://localhost:3000/process-file \
  -H "Content-Type: application/json" \
  -d '{"inputFile": "path/to/your/prompt.md"}'
```

### Option 2: Run as a CLI Tool

Process a prompt file directly:

```bash
node process-prompt.js path/to/your/prompt.md [optional/output/path.json]
```

If no output path is specified, it will create a file with the same name as the input file but with "\_response.json" appended.

## Example Files

- `example-prompt.md` - An example prompt file that requests product recommendations in JSON format
- You can test the application with this file:

```bash
node process-prompt.js example-prompt.md
```

## File Structure

- `server.js` - Express server implementation
- `process-prompt.js` - CLI tool for direct file processing
- `.env` - Environment variables configuration
- `package.json` - Project dependencies and scripts
- `example-prompt.md` - Example prompt file

## Dependencies

- express - Web server framework
- dotenv - Environment variable management
- node-fetch - HTTP request client
- nodemon (dev) - Auto-restart during development

## License

MIT

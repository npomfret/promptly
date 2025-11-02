# Gemini Session Server

A modern TypeScript web server that provides long-lived chat sessions with Google's Gemini AI. Built with Express and full type safety.

## Features

- **Automatic Repository Watching**: Monitors Git repos for changes every minute and updates context automatically
- **Context Caching**: Loads real project context (file listings, structure) into Gemini's cache for accurate, grounded responses (75-90% cost savings)
- **Long-lived sessions**: Maintains conversation context across multiple requests
- **Custom system prompts**: Configure AI behavior for your specific use case
- **Session management**: Automatic cleanup of inactive sessions
- **Type-safe**: Built with modern TypeScript for excellent IDE support
- **RESTful API**: Simple HTTP endpoints for easy integration
- **Gemini 2.5 Flash**: Uses Gemini 2.5 Flash with context caching (90% cost savings)
- **Anti-hallucination**: Real file data prevents Gemini from making up file paths
- **Just-in-Time Cache Refresh**: Preserves chat history while updating project context lazily

## Prerequisites

- Node.js 18+
- A Gemini API key from [Google AI Studio](https://ai.google.dev/)

## Installation

1. Clone or navigate to this directory:

```bash
cd gemini-server
```

2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

```bash
cp .env.example .env
```

4. Edit `.env` and configure:

```env
GEMINI_API_KEY=your_api_key_here
PROJECT_DIR=/Users/yourname/projects/your-project
PORT=3000
```

The `PROJECT_DIR` will be injected into the system prompt wherever `{{PROJECT_DIR}}` appears.

## Getting Your API Key

1. Visit [Google AI Studio](https://ai.google.dev/)
2. Sign in with your Google account
3. Click "Get API Key"
4. Copy the key to your `.env` file

The free tier includes:

- 1,500 daily requests for Flash models
- No credit card required
- Perfect for development and small projects

## Usage

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

### Type Checking

```bash
npm run type-check
```

## API Endpoints

### Health Check

```bash
GET /health
```

Response:

```json
{
  "status": "ok",
  "sessions": 2,
  "systemPrompt": "You are a helpful AI assistant."
}
```

### Send Message

```bash
POST /chat
Content-Type: application/json

{
  "message": "What is TypeScript?"
}
```

Response:

```json
{
  "success": true,
  "sessionId": "abc123...",
  "response": "TypeScript is a strongly typed programming language...",
  "messageCount": 2
}
```

### Get Session Info

```bash
GET /session
```

Response:

```json
{
  "sessionId": "abc123...",
  "hasActiveSession": true,
  "messageCount": 10,
  "createdAt": "2025-11-01T12:00:00.000Z",
  "lastUsed": "2025-11-01T12:05:00.000Z"
}
```

### Get Chat History

```bash
GET /history
```

Response:

```json
{
  "sessionId": "abc123...",
  "history": [
    {
      "role": "user",
      "message": "Hello!",
      "timestamp": "2025-11-01T12:00:00.000Z"
    },
    {
      "role": "model",
      "message": "Hi! How can I help you?",
      "timestamp": "2025-11-01T12:00:01.000Z"
    }
  ],
  "messageCount": 2
}
```

### Clear Session

```bash
POST /session/clear
```

Response:

```json
{
  "success": true,
  "message": "Session cleared",
  "sessionId": "abc123..."
}
```

## Example Usage with curl

```bash
# Send a message
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Explain closures in JavaScript"}'

# Follow-up question (same session via cookie)
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -b cookies.txt -c cookies.txt \
  -d '{"message": "Can you give me an example?"}'

# Get history
curl http://localhost:3000/history -b cookies.txt
```

## Example with JavaScript/TypeScript

```typescript
// Using fetch
const response = await fetch('http://localhost:3000/chat', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    credentials: 'include', // Important: includes cookies for session tracking
    body: JSON.stringify({
        message: 'What is a closure?',
    }),
});

const data = await response.json();
console.log(data.response);
```

## Session Management

- **Session Duration**: 24 hours (configurable via `SESSION_MAX_AGE`)
- **Cleanup**: Inactive sessions are automatically removed every hour
- **Cookies**: Sessions are tracked via HTTP cookies
- **Persistence**: Chat history is maintained in memory (sessions are lost on server restart)

## Custom System Prompts

The system prompt defines how the AI behaves and is loaded from the **`system-prompt.md`** file.

### How It Works

**Priority order:**

1. **`system-prompt.md` file** (preferred) - Custom prompt loaded from file
2. **`SYSTEM_PROMPT` env variable** - Fallback if file doesn't exist
3. **Default prompt** - "You are a helpful AI assistant."

**Variable Injection:**

- Use `{{PROJECT_DIR}}` in your system prompt
- It will be replaced with the value from your `.env` file
- Allows dynamic project directory references

When you start the server, you'll see:

```
[✓] Loaded system prompt from: /path/to/system-prompt.md
[✓] Injected PROJECT_DIR: /Users/yourname/projects/your-project
```

### Example Usage in System Prompt

```markdown
The primary project directory is: `{{PROJECT_DIR}}`

When suggesting commands, reference this directory:

- `cd {{PROJECT_DIR}} && git ls-files`
- `grep -r 'pattern' {{PROJECT_DIR}}/src`
```

### Editing the System Prompt

Simply edit `system-prompt.md` and restart the server. The file is tracked in git, so you can version control your prompt engineering instructions.

**Benefits:**

- Multi-line markdown support
- Use `{{PROJECT_DIR}}` placeholder for dynamic paths
- Track changes in git
- No quote escaping needed

## Context Caching

The server uses Gemini's **Context Caching** feature to provide Gemini with real project context, preventing hallucinations and reducing costs.

### How It Works

On startup, the server:

1. **Gathers project context** from `PROJECT_DIR`:
   - Git-tracked files (`git ls-files`)
   - Directory structure
   - Key config files (package.json, tsconfig.json, README.md, .claude/settings.json)

2. **Creates cached content** with this context using Gemini's caching API
3. **Reuses the cache** for all chat sessions (75-90% cost savings)
4. **Refreshes cache** on demand or after 1 hour TTL

### Benefits

✅ **Accurate responses**: Gemini knows your actual files, not guesses
✅ **No hallucinations**: Can't make up file paths that don't exist
✅ **Cost savings**: 75-90% discount on cached tokens
✅ **Faster responses**: Cached content loads instantly

### Startup Output

When the server starts, you'll see:

```
[...] Gathering project context from: /Users/yourname/projects/your-project
[✓] Found 247 git-tracked files
[✓] Gathered 125843 characters of project context
[...] Creating cached content with project context...
[✓] Created cached content: cachedContents/abc123
[✓] Cache expires at: 2025-01-15T14:30:00.000Z

Server running on: http://localhost:3000
Cached content: cachedContents/abc123
Context caching: ENABLED (75-90% cost savings)
```

### Refresh Cache

When your project changes (new files, updated structure), refresh the cache:

```bash
curl -X POST http://localhost:3000/cache/refresh
```

Response:

```json
{
  "success": true,
  "message": "Cache refreshed successfully",
  "cachedContentName": "cachedContents/xyz789",
  "clearedSessions": 3
}
```

This will:

- Gather fresh project context
- Create new cached content
- Clear existing sessions (they use old cache)

### Cache Details

- **TTL**: 1 hour (configurable in `createCachedContent()`)
- **Size**: Depends on project (typically 50-200KB)
- **Includes**: File listings, directory structure, key config files
- **Excludes**: node_modules, .git, dist, actual file contents (except config files preview)

## Automatic Repository Watching

The server automatically monitors all configured Git repositories for changes and keeps project context up-to-date.

### How It Works

Every minute, the watcher:

1. **Checks for updates**: Runs `git fetch` and compares local vs remote commits
2. **Pulls changes**: If remote has new commits, runs `git pull`
3. **Marks cache as stale**: Sets a flag instead of immediately refreshing
4. **Lazy refresh**: Cache is refreshed just-in-time when the next chat request arrives

### Benefits

✅ **Always up-to-date**: Your AI always works with the latest code
✅ **Preserves chat history**: Existing conversations continue uninterrupted
✅ **Efficient**: Cache only refreshes when you actually use it
✅ **Silent operation**: No disruption to active sessions

### Server Logs

When changes are detected, you'll see:

```
[!] Updates detected for project abc123def456
[...] Pulling updates for project abc123def456...
[✓] Successfully pulled updates for project abc123def456
[✓] Project abc123def456 updated and marked stale (cache will refresh on next request)
```

When cache refreshes on next request:

```
[...] Cache is stale for project abc123def456, refreshing...
[...] Gathering project context from: /path/to/project
[✓] Found 247 git-tracked files
[✓] Gathered 125843 characters of project context
[...] Creating cached content for project abc123def456...
[✓] Created cached content for project abc123def456: cachedContents/xyz789
[✓] Cache refreshed for project abc123def456
```

### Technical Details

- **Polling interval**: 1 minute (hardcoded in `server.ts`)
- **No configuration needed**: Always enabled, works automatically
- **Requires git credentials**: Private repos need SSH keys or credential helpers
- **Network timeouts**: 30s for fetch, 60s for pull operations
- **Handles failures gracefully**: Errors logged but don't crash the server

## History Logging

The server can optionally save all chat interactions to disk with timestamp-based filenames for easy review.

### Enabling History Logging

Add `HISTORY_DIR` to your `.env` file:

```env
# Absolute path
HISTORY_DIR=/path/to/history/directory

# Or relative path (relative to where you start the server)
HISTORY_DIR=./history
```

The server will:

- Resolve relative paths to absolute paths before changing directories
- Create the directory if it doesn't exist
- Save each request/response pair as a separate JSON file
- Use ISO timestamp filenames for easy sorting (e.g., `2025-11-01T12-30-45-123Z_abc12345.json`)

### History File Format

Each history file contains:

```json
{
  "sessionId": "abc123...",
  "timestamp": "2025-11-01T12:30:45.123Z",
  "messageCount": 2,
  "cachedContentName": "cachedContents/xyz789",
  "request": "What is TypeScript?",
  "response": "TypeScript is a strongly typed programming language...",
  "metadata": {
    "serverVersion": "1.0.0",
    "model": "gemini-2.5-flash",
    "projectDir": "/Users/yourname/projects/your-project"
  }
}
```

### Viewing History

Files are sorted chronologically by filename, so you can easily find recent interactions:

```bash
# View most recent interaction
ls -t $HISTORY_DIR | head -1 | xargs -I {} cat "$HISTORY_DIR/{}"

# View last 10 interactions
ls -t $HISTORY_DIR | head -10

# Search for specific queries
grep -l "TypeScript" $HISTORY_DIR/*.json
```

### Disabling History Logging

History logging is **disabled by default**. Simply don't set `HISTORY_DIR` in your `.env` file.

## Project Structure

```
gemini-server/
├── src/
│   ├── server.ts              # Main server implementation
│   └── types.ts               # TypeScript type definitions
├── dist/                      # Compiled JavaScript (generated)
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── .env                       # Environment variables (not in git)
├── .env.example               # Example environment variables
├── system-prompt.md           # Prompt engineering system prompt (tracked in git)
├── .gitignore                 # Git ignore rules
└── README.md                  # This file
```

## Changing Models

The server uses **Gemini 2.0 Flash Experimental** by default. To use a different model, edit `src/server.ts` line 70:

```typescript
const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp', // Change this
    systemInstruction: SYSTEM_PROMPT,
});
```

### Available Models (2025)

| Model                  | Best For                    | Speed   | Cost          |
| ---------------------- | --------------------------- | ------- | ------------- |
| `gemini-2.0-flash-exp` | General use, fast responses | Fastest | Free tier     |
| `gemini-2.5-flash`     | Production, reliable        | Fast    | Pay as you go |
| `gemini-2.5-pro`       | Complex tasks, best quality | Slower  | Pay as you go |

**Note**: Gemini 1.5 models (including `gemini-1.5-flash`) were retired in 2025 and will return 404 errors.

After changing the model, rebuild the project:

```bash
npm run build
npm start
```

## Security Considerations

- **API Key**: Never commit your `.env` file or expose your API key
- **HTTPS**: Set `cookie.secure: true` in production with HTTPS
- **Rate Limiting**: Consider adding rate limiting for production use
- **Input Validation**: The server validates message input; add more as needed
- **CORS**: Add CORS middleware if accessing from different origins

## Troubleshooting

### "GEMINI_API_KEY environment variable is required"

- Make sure you created a `.env` file with your API key

### "PROJECT_DIR environment variable is required"

- Add `PROJECT_DIR=/path/to/your/project` to your `.env` file
- The path must exist and be a valid directory
- Server will not start without a valid PROJECT_DIR

### "PROJECT_DIR does not exist"

- Check the path in your `.env` file is correct
- Use absolute paths, not relative paths
- Ensure the directory exists and you have read permissions

### 404 Error: "models/gemini-1.5-flash is not found"

- The Gemini 1.5 models were retired in 2025
- Update to `gemini-2.0-flash-exp` or newer (see "Changing Models" section above)
- Rebuild the project: `npm run build && npm start`

### TypeScript errors

- Run `npm run type-check` to see detailed type errors
- Ensure all dependencies are installed with `npm install`

### Sessions not persisting

- Make sure you're including cookies in your requests (`credentials: 'include'` in fetch)
- Sessions are in-memory and will be lost on server restart

## License

ISC

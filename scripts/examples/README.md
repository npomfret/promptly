# Example Hook Scripts

These example scripts demonstrate how to integrate Promptly with AI coding assistants like Claude Code and Gemini CLI using hooks.

**Server**: `https://promptly.snowmonkey.co.uk` (deployed with SSL/TLS)

## Available Scripts

### 1. `prompt-enhancer.sh` - Enhance Mode

**Purpose**: Enhances prompts by adding project context, suggestions, and best practices.

**Trigger**: Prompts that start or end with underscore (`_`)

**Use Case**: When you want the AI to enhance/improve your prompt before execution, adding relevant project context, documentation references, and suggestions.

### 2. `ask-the-expert.sh` - Ask Mode

**Purpose**: Provides critical analysis, probing questions, and identifies potential issues.

**Trigger**: Always active - sends all input to `/ask` endpoint

**Use Case**: When you want critical feedback on an idea or approach, including edge cases, potential problems, and alternative solutions.

## Setup Instructions

### 1. Verify Server is Running

Check that your deployed server is running:

```bash
curl https://promptly.snowmonkey.co.uk/health
# Or use the status script:
./scripts/status.sh
```

### 2. Get Your Project ID

Get your project ID from the server:

```bash
curl https://promptly.snowmonkey.co.uk/projects
```

Note your project ID from the list (currently: `cec04d6b28ab`).

### 3. Update Scripts (if needed)

If your project ID is different, edit both scripts and update the `projectId`:

```bash
# In prompt-enhancer.sh and ask-the-expert.sh, change:
curl -s -X POST https://promptly.snowmonkey.co.uk/enhance?projectId=cec04d6b28ab
# To:
curl -s -X POST https://promptly.snowmonkey.co.uk/enhance?projectId=YOUR_PROJECT_ID
```

### 4. Configure Your AI Assistant

#### For Claude Code

The "prompt-enhancer.sh" is designed for use with _UserPromptSubmit_ hook: add to your `.claude/hooks.json`:

```json
{
  "hooks": [
    {
      "event": "UserPromptSubmit",
      "command": "/path/to/prompt-enhancer.sh"
    }
  ]
}
```

#### For Other Tools

Consult your tool's documentation for hook configuration.

## How It Works

### Prompt Enhancer (`_` trigger)

1. You type: `_implement user auth_`
2. Script detects underscore and sends to `/enhance` endpoint
3. Promptly analyzes your codebase and returns enhanced context
4. AI receives your original prompt + additional context
5. AI implements with full project awareness

### Ask the Expert (always active)

1. You type: `should I use JWT for authentication?`
2. Script sends to `/ask` endpoint
3. Promptly analyzes and returns critical questions/concerns
4. AI receives probing questions like:
   - "Have you considered refresh token rotation?"
   - "What happens if tokens are compromised?"
   - "Consider existing auth patterns in the codebase..."
5. You get thoughtful analysis before proceeding

## Trigger Patterns

| Trigger    | Script              | Endpoint   | Purpose                     |
| ---------- | ------------------- | ---------- | --------------------------- |
| `_prompt_` | prompt-enhancer.sh  | `/enhance` | Add context and suggestions |
| Always on  | ask-the-expert.sh   | `/ask`     | Get critical analysis       |

## Examples

### Example 1: Enhance Mode

```bash
# Input
echo "_add a new API endpoint for user profiles_" | ./prompt-enhancer.sh

# Output includes:
# - Existing API patterns in your project
# - Relevant middleware and authentication
# - Database schema references
# - Testing conventions
```

### Example 2: Ask Mode

```bash
# Input
echo "I want to add Redis caching to all database queries" | ./ask-the-expert.sh

# Output includes:
# - Have you considered cache invalidation strategy?
# - What about cache stampede scenarios?
# - Consider existing caching patterns in the codebase
# - What's the invalidation policy for user data?
```

### Example 3: Multi-line Input

```bash
# Using heredoc for multi-line prompts
cat <<EOF | ./ask-the-expert.sh
I'm planning to implement the following architecture:
- Split the monolith into microservices
- Use Kafka for event streaming
- Deploy each service independently
- Share a common database

What potential issues should I consider?
EOF

# Output includes critical analysis of:
# - Database coupling anti-pattern
# - Network latency and failure scenarios
# - Deployment complexity
# - Data consistency challenges
# - Migration strategy concerns
```

### Example 4: Testing from File

```bash
# Save your prompt to a file
cat > my-question.txt <<EOF
Should I use WebSockets or Server-Sent Events for real-time notifications?
Consider:
- Browser compatibility
- Scalability with 10k+ concurrent users
- Bi-directional vs uni-directional communication needs
EOF

# Pipe the file content to the script
cat my-question.txt | ./ask-the-expert.sh
```

## Debugging

Both scripts log activity to temporary directories:

- Enhancer: `tmp/prompt-enhancer/activity.log`
- Ask the Expert: `tmp/ask-the-expert/activity.log`

Check these logs if requests aren't working as expected.

## Tips

1. **Use Enhance for implementation**: When you know what you want and need context
2. **Use Ask for planning**: When you're exploring options or need feedback
3. **Combine both**: Use Ask first for analysis, then Enhance for implementation

## Customization

You can modify the trigger pattern for the prompt-enhancer script by editing it:

```bash
# Change from _ to another pattern:
if [[ "$PROMPT" == _* || "$PROMPT" == *_ ]]; then
# To something else, like !!:
if [[ "$PROMPT" == !!* || "$PROMPT" == *!! ]]; then
```

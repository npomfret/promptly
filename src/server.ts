import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type {
  SessionData,
  ChatRequest,
  ChatResponse,
  ErrorResponse,
  HealthResponse,
  SessionInfoResponse,
  HistoryResponse,
  ClearSessionResponse,
  CacheRefreshResponse
} from './types.js';

// Load environment variables
dotenv.config();

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load system prompt from file and inject variables
function loadSystemPrompt(projectDir: string): string {
  const systemPromptPath = join(__dirname, '..', 'system-prompt.md');

  let content = '';

  if (existsSync(systemPromptPath)) {
    try {
      content = readFileSync(systemPromptPath, 'utf-8').trim();
      if (content) {
        console.log(`[✓] Loaded system prompt from: ${systemPromptPath}`);
      }
    } catch (error) {
      console.warn(`[!] Failed to read system prompt file: ${error}`);
    }
  }

  // Fallback to environment variable or default
  if (!content) {
    content = process.env.SYSTEM_PROMPT || 'You are a helpful AI assistant.';
    if (process.env.SYSTEM_PROMPT) {
      console.log('[✓] Using system prompt from SYSTEM_PROMPT environment variable');
    } else {
      console.log('[!] Using default system prompt (create system-prompt.md to customize)');
    }
  }

  // Inject PROJECT_DIR into the prompt
  const injectedPrompt = content.replace(/\{\{PROJECT_DIR\}\}/g, projectDir);

  if (injectedPrompt.includes(projectDir)) {
    console.log(`[✓] Injected PROJECT_DIR: ${projectDir}`);
  }

  return injectedPrompt;
}

/**
 * Gather project context from PROJECT_DIR
 */
function gatherProjectContext(projectDir: string): string {
  console.log(`[...] Gathering project context from: ${projectDir}`);

  const context: string[] = [];
  context.push('# PROJECT CONTEXT');
  context.push(`Project Directory: ${projectDir}\n`);

  // Get git tracked files
  try {
    const gitFiles = execSync('git ls-files', {
      cwd: projectDir,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    context.push('## Git Tracked Files');
    context.push('```');
    context.push(gitFiles.trim());
    context.push('```\n');
    console.log(`[✓] Found ${gitFiles.split('\n').length} git-tracked files`);
  } catch (error) {
    console.warn('[!] Could not get git tracked files:', error instanceof Error ? error.message : 'Unknown error');
    context.push('## Git Tracked Files');
    context.push('(Not available - not a git repository or git not installed)\n');
  }

  // Get directory structure
  try {
    const tree = execSync('find . -type d -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" | head -100', {
      cwd: projectDir,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024
    });
    context.push('## Directory Structure (top 100)');
    context.push('```');
    context.push(tree.trim());
    context.push('```\n');
  } catch (error) {
    console.warn('[!] Could not get directory structure:', error instanceof Error ? error.message : 'Unknown error');
  }

  // Check for common config files
  const configFiles = [
    'package.json',
    'tsconfig.json',
    '.claude/settings.json',
    'README.md'
  ];

  context.push('## Project Configuration Files');
  for (const file of configFiles) {
    const filePath = join(projectDir, file);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        // Limit file content to first 1000 chars
        const preview = content.length > 1000 ? content.substring(0, 1000) + '\n...(truncated)' : content;
        context.push(`\n### ${file}`);
        context.push('```');
        context.push(preview);
        context.push('```');
      } catch (error) {
        context.push(`\n### ${file}`);
        context.push('(Could not read file)');
      }
    }
  }

  const result = context.join('\n');
  console.log(`[✓] Gathered ${result.length} characters of project context`);
  return result;
}

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const API_KEY = process.env.GEMINI_API_KEY;
const PROJECT_DIR = process.env.PROJECT_DIR!;
// Resolve HISTORY_DIR to absolute path (before chdir) to handle relative paths
const HISTORY_DIR = process.env.HISTORY_DIR ? resolve(process.env.HISTORY_DIR) : undefined;
const SESSION_SECRET = process.env.SESSION_SECRET || `gemini-session-secret-${uuidv4()}`;
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

// Validation
if (!API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is required');
  process.exit(1);
}

if (!PROJECT_DIR) {
  console.error('Error: PROJECT_DIR environment variable is required');
  console.error('Set it in your .env file, e.g., PROJECT_DIR=/Users/yourname/projects/your-project');
  process.exit(1);
}

if (!existsSync(PROJECT_DIR)) {
  console.error(`Error: PROJECT_DIR does not exist: ${PROJECT_DIR}`);
  console.error('Please check the path in your .env file');
  process.exit(1);
}

try {
  const stats = statSync(PROJECT_DIR);
  if (!stats.isDirectory()) {
    console.error(`Error: PROJECT_DIR is not a directory: ${PROJECT_DIR}`);
    process.exit(1);
  }
} catch (error) {
  console.error(`Error: Cannot access PROJECT_DIR: ${PROJECT_DIR}`);
  console.error(error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
}

// Validate and create HISTORY_DIR if specified
if (HISTORY_DIR) {
  try {
    if (existsSync(HISTORY_DIR)) {
      const stats = statSync(HISTORY_DIR);
      if (!stats.isDirectory()) {
        console.error(`Error: HISTORY_DIR is not a directory: ${HISTORY_DIR}`);
        process.exit(1);
      }
      console.log(`[✓] History directory exists: ${HISTORY_DIR}`);
    } else {
      // Create directory if it doesn't exist
      mkdirSync(HISTORY_DIR, { recursive: true });
      console.log(`[✓] Created history directory: ${HISTORY_DIR}`);
    }
  } catch (error) {
    console.error(`Error: Cannot create/access HISTORY_DIR: ${HISTORY_DIR}`);
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Change working directory to PROJECT_DIR
try {
  process.chdir(PROJECT_DIR);
  console.log(`[✓] Changed working directory to: ${PROJECT_DIR}`);
} catch (error) {
  console.error(`Error: Failed to change working directory to ${PROJECT_DIR}`);
  console.error(error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
}

const SYSTEM_PROMPT = loadSystemPrompt(PROJECT_DIR);

// Initialize Express app
const app = express();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(API_KEY);
const cacheManager = new GoogleAICacheManager(API_KEY);

// Store for long-lived chat sessions
const chatSessions = new Map<string, SessionData>();

// Store cached content
let cachedContent: any = null;

/**
 * Create or refresh cached content with project context
 */
async function createCachedContent(): Promise<any> {
  console.log('[...] Creating cached content with project context...');

  const projectContext = gatherProjectContext(PROJECT_DIR);

  const cacheResult = await cacheManager.create({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [{ text: `Here is the project context for reference:\n\n${projectContext}` }],
      },
      {
        role: 'model',
        parts: [{ text: 'I have received and processed the project context. I can now see all 692 git-tracked files, the directory structure, and configuration files. I will use this information when analyzing and enhancing prompts. What prompt would you like me to help with?' }],
      },
    ],
    systemInstruction: SYSTEM_PROMPT,
    ttlSeconds: 3600, // Cache for 1 hour
  });

  console.log(`[✓] Created cached content: ${cacheResult.name}`);
  console.log(`[✓] Cache expires at: ${cacheResult.expireTime}`);

  return cacheResult;
}

// Middleware
app.use(express.json());

// Pretty-print JSON responses
app.set('json spaces', 2);

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: SESSION_MAX_AGE
    }
  })
);

// Extend session type
declare module 'express-session' {
  interface SessionData {
    id: string;
  }
}

/**
 * Get or create a chat session for the given session ID
 */
function getChatSession(sessionId: string): SessionData {
  if (!chatSessions.has(sessionId)) {
    let model;

    // Use cached model (should always be available after startup)
    if (!cachedContent) {
      throw new Error('No cached content available - server should not have started');
    }

    console.log(`[${new Date().toISOString()}] Using cached model for session: ${sessionId}`);
    model = genAI.getGenerativeModelFromCachedContent(cachedContent);

    const chat = model.startChat({
      history: []
    });

    const sessionData: SessionData = {
      chat,
      history: [],
      createdAt: new Date(),
      lastUsed: new Date()
    };

    chatSessions.set(sessionId, sessionData);
    console.log(`[${new Date().toISOString()}] Created new chat session: ${sessionId}`);
  }

  const sessionData = chatSessions.get(sessionId)!;
  sessionData.lastUsed = new Date();
  return sessionData;
}

/**
 * Cleanup old inactive sessions
 */
function cleanupOldSessions(): void {
  const now = new Date();

  for (const [sessionId, sessionData] of chatSessions.entries()) {
    if (now.getTime() - sessionData.lastUsed.getTime() > SESSION_MAX_AGE) {
      chatSessions.delete(sessionId);
      console.log(`[${new Date().toISOString()}] Cleaned up inactive session: ${sessionId}`);
    }
  }
}

/**
 * Write a history entry to disk (if HISTORY_DIR is configured)
 */
function writeHistoryEntry(data: {
  sessionId: string;
  timestamp: Date;
  request: string;
  response: string;
  messageCount: number;
  cachedContentName?: string;
}): void {
  if (!HISTORY_DIR) {
    return; // History logging is disabled
  }

  try {
    // Create filename with ISO timestamp for easy sorting
    const isoTimestamp = data.timestamp.toISOString().replace(/[:.]/g, '-');
    const filename = `${isoTimestamp}_${data.sessionId.substring(0, 8)}.json`;
    const filepath = join(HISTORY_DIR, filename);

    // Prepare history entry with all metadata
    const historyEntry = {
      sessionId: data.sessionId,
      timestamp: data.timestamp.toISOString(),
      messageCount: data.messageCount,
      cachedContentName: data.cachedContentName || cachedContent?.name,
      request: data.request,
      response: data.response,
      metadata: {
        serverVersion: '1.0.0',
        model: 'gemini-2.5-flash',
        projectDir: PROJECT_DIR
      }
    };

    // Write to file
    writeFileSync(filepath, JSON.stringify(historyEntry, null, 2), 'utf-8');
    console.log(`[✓] Wrote history entry: ${filename}`);
  } catch (error) {
    console.error(`[ERROR] Failed to write history entry:`, error instanceof Error ? error.message : 'Unknown error');
    // Don't throw - history logging shouldn't break the main functionality
  }
}

// Routes

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response<HealthResponse>) => {
  res.json({
    status: 'ok',
    sessions: chatSessions.size,
    systemPrompt: SYSTEM_PROMPT
  });
});

/**
 * Get current session information
 */
app.get('/session', (req: Request, res: Response<SessionInfoResponse>) => {
  const sessionId = req.session.id;
  const sessionData = chatSessions.get(sessionId);

  res.json({
    sessionId,
    hasActiveSession: !!sessionData,
    messageCount: sessionData ? sessionData.history.length : 0,
    createdAt: sessionData?.createdAt || null,
    lastUsed: sessionData?.lastUsed || null
  });
});

/**
 * Clear the current session
 */
app.post('/session/clear', (req: Request, res: Response<ClearSessionResponse>) => {
  const sessionId = req.session.id;

  if (chatSessions.has(sessionId)) {
    chatSessions.delete(sessionId);
    console.log(`[${new Date().toISOString()}] Cleared chat session: ${sessionId}`);
  }

  res.json({
    success: true,
    message: 'Session cleared',
    sessionId
  });
});

/**
 * Refresh cached content with updated project context
 */
app.post('/cache/refresh', async (_req: Request, res: Response<CacheRefreshResponse | ErrorResponse>) => {
  try {
    console.log('[...] Refreshing cached content...');

    // Clear all existing sessions (they're using old cache)
    const sessionCount = chatSessions.size;
    chatSessions.clear();

    // Create new cached content
    cachedContent = await createCachedContent();

    res.json({
      success: true,
      message: 'Cache refreshed successfully',
      cachedContentName: cachedContent.name,
      clearedSessions: sessionCount
    });
  } catch (error) {
    console.error('[ERROR] Failed to refresh cache:', error);
    res.status(500).json({
      error: 'Failed to refresh cache',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Main chat endpoint - send message to Gemini
 */
app.post('/chat', async (req: Request<{}, ChatResponse | ErrorResponse, ChatRequest>, res: Response<ChatResponse | ErrorResponse>) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Message is required and must be a string'
      });
    }

    const sessionId = req.session.id;
    const sessionData = getChatSession(sessionId);

    console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);
    console.log(`[${new Date().toISOString()}] Session: ${sessionId}`);
    console.log(`[${new Date().toISOString()}] Input Prompt:`);
    console.log(message);
    console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);

    // Send message and get response
    const result = await sessionData.chat.sendMessage(message);
    const response = result.response.text();

    console.log(`[${new Date().toISOString()}] Response:`);
    console.log(response);
    console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════\n`);

    // Store in history
    const timestamp = new Date();
    sessionData.history.push(
      {
        role: 'user',
        message,
        timestamp
      },
      {
        role: 'model',
        message: response,
        timestamp
      }
    );

    // Write to history file if configured
    writeHistoryEntry({
      sessionId,
      timestamp,
      request: message,
      response,
      messageCount: sessionData.history.length
    });

    res.json({
      success: true,
      sessionId,
      response,
      messageCount: sessionData.history.length
    });
  } catch (error) {
    console.error('[ERROR] Failed to process chat:', error);
    res.status(500).json({
      error: 'Failed to process message',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get chat history for current session
 */
app.get('/history', (req: Request, res: Response<HistoryResponse>) => {
  const sessionId = req.session.id;
  const sessionData = chatSessions.get(sessionId);

  if (!sessionData) {
    return res.json({
      sessionId,
      history: [],
      messageCount: 0
    });
  }

  res.json({
    sessionId,
    history: sessionData.history,
    messageCount: sessionData.history.length
  });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

// Setup cleanup interval
setInterval(cleanupOldSessions, CLEANUP_INTERVAL);

/**
 * Initialize and start the server
 */
async function startServer() {
  // Create cached content with project context - MUST succeed or die
  cachedContent = await createCachedContent();

  // Start server
  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Gemini Session Server                                         ║
╚════════════════════════════════════════════════════════════════╝

Server running on: http://localhost:${PORT}
System prompt: "${SYSTEM_PROMPT.substring(0, 100)}..."
Cached content: ${cachedContent.name}

Endpoints:
  GET  /health        - Health check and server status
  GET  /session       - Get current session info
  POST /chat          - Send message { "message": "your text" }
  GET  /history       - Get chat history for current session
  POST /session/clear - Clear current session
  POST /cache/refresh - Refresh project context cache

Session configuration:
  - Max age: ${SESSION_MAX_AGE / (60 * 60 * 1000)} hours
  - Cleanup interval: ${CLEANUP_INTERVAL / (60 * 1000)} minutes
  - Context caching: ENABLED (90% cost savings)
  - Model: gemini-2.5-flash
  - History logging: ${HISTORY_DIR ? `ENABLED (${HISTORY_DIR})` : 'DISABLED'}

Ready to accept requests!
    `);
  });
}

// Start the server - will die if cache creation fails
startServer().catch((error) => {
  console.error('\n╔════════════════════════════════════════════════════════════════╗');
  console.error('║  FATAL: Server startup failed                                 ║');
  console.error('╚════════════════════════════════════════════════════════════════╝\n');
  console.error(error);
  console.error('\nServer cannot start without context caching.');
  console.error('Check your GEMINI_API_KEY and PROJECT_DIR configuration.\n');
  process.exit(1);
});

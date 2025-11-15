import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager } from '@google/generative-ai/server';
import { execSync } from 'child_process';
import type { DecodedIdToken } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, promises as fsPromises } from 'fs';
import MarkdownIt from 'markdown-it';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import {
    addProject as addProjectToConfig,
    cleanGitUrl,
    cloneRepository,
    generateProjectId,
    initializeProjects,
    loadProjectsConfig,
    removeProject as removeProjectFromConfig,
    saveProjectsConfig,
} from './projectManager.js';
import type { AuthedRequest } from './auth.js';
import { getFirebaseClientConfig, requireAuth } from './auth.js';
import { startWatching } from './repoWatcher.js';
import type {
    AddProjectRequest,
    AddProjectResponse,
    CacheRefreshResponse,
    ChatRequest,
    ChatResponse,
    ClearSessionResponse,
    ErrorResponse,
    HealthResponse,
    HistoryResponse,
    Project,
    ProjectConfig,
    ProjectInfo,
    ProjectsListResponse,
    RemoveProjectResponse,
    SessionData,
    SessionInfoResponse,
} from './types.js';

// Load environment variables
dotenv.config();

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure markdown-it with security and quality settings
const md = new MarkdownIt({
    html: false, // Disable raw HTML for security
    xhtmlOut: true, // Use XHTML-style tags
    breaks: true, // Convert line breaks to <br>
    linkify: true, // Auto-convert URLs to links
    typographer: true, // Enable smartquotes and other typographic replacements
});

// Mode type for different prompt types
type PromptMode = 'enhance' | 'ask';

// Load system prompt from file and inject variables
function loadSystemPromptForMode(projectDir: string, mode: PromptMode = 'enhance'): string {
    // Determine which prompt file to load based on mode
    const promptFileName = mode === 'ask' ? 'ask-prompt.md' : 'system-prompt.md';
    const systemPromptPath = join(__dirname, '..', 'prompts', promptFileName);

    let content = '';

    if (existsSync(systemPromptPath)) {
        try {
            content = readFileSync(systemPromptPath, 'utf-8').trim();
            if (content) {
                console.log(`[✓] Loaded ${mode} prompt from: ${systemPromptPath}`);
            }
        } catch (error) {
            console.warn(`[!] Failed to read ${mode} prompt file: ${error}`);
        }
    }

    // Fallback to environment variable or default
    if (!content) {
        content = process.env.SYSTEM_PROMPT || 'You are a helpful AI assistant.';
        if (process.env.SYSTEM_PROMPT) {
            console.log(`[✓] Using ${mode} prompt from SYSTEM_PROMPT environment variable`);
        } else {
            console.log(`[!] Using default ${mode} prompt (create ${promptFileName} to customize)`);
        }
    }

    // Inject PROJECT_DIR into the prompt
    let injectedPrompt = content.replace(/\{\{PROJECT_DIR\}\}/g, projectDir);

    if (injectedPrompt.includes(projectDir)) {
        console.log(`[✓] Injected PROJECT_DIR: ${projectDir}`);
    }

    // Inject CLAUDE_SPECIFIC_CONTENT if .claude directory exists in project
    const claudeDir = join(projectDir, '.claude');
    const claudePromptFile = join(__dirname, '..', 'prompts', 'claude-specific-prompt.md');

    if (existsSync(claudeDir) && existsSync(claudePromptFile)) {
        try {
            const claudeContent = readFileSync(claudePromptFile, 'utf-8').trim();
            console.log(`[✓] Loaded Claude-specific content from: ${claudePromptFile}`);
            injectedPrompt = injectedPrompt.replace(/\{\{CLAUDE_SPECIFIC_CONTENT\}\}/g, claudeContent);
        } catch (error) {
            console.warn(`[!] Failed to read ${claudePromptFile}:`, error);
            // Remove the placeholder if file can't be read
            injectedPrompt = injectedPrompt.replace(/\{\{CLAUDE_SPECIFIC_CONTENT\}\}\n?/g, '');
        }
    } else {
        // No .claude directory in project or claude-specific-prompt.md file doesn't exist, remove the placeholder
        injectedPrompt = injectedPrompt.replace(/\{\{CLAUDE_SPECIFIC_CONTENT\}\}\n?/g, '');
    }

    return injectedPrompt;
}

// Backward compatibility wrapper
function loadSystemPrompt(projectDir: string): string {
    return loadSystemPromptForMode(projectDir, 'enhance');
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
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
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
            maxBuffer: 1024 * 1024,
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
        'README.md',
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
const CHECKOUT_DIR = process.env.CHECKOUT_DIR!;
// Resolve HISTORY_DIR to absolute path
const HISTORY_DIR = process.env.HISTORY_DIR ? resolve(process.env.HISTORY_DIR) : undefined;
const SESSION_SECRET = process.env.SESSION_SECRET || `gemini-session-secret-${uuidv4()}`;
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const REPO_CHECK_INTERVAL = 1; // Check for repo updates every 1 minute
const PROJECT_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const PROJECT_RATE_LIMIT = 3;

// Validation
if (!API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is required');
    process.exit(1);
}

if (!CHECKOUT_DIR) {
    console.error('Error: CHECKOUT_DIR environment variable is required');
    console.error('Set it in your .env file, e.g., CHECKOUT_DIR=/Users/yourname/projects/checkouts');
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

// Initialize Express app
const app = express();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(API_KEY);
const cacheManager = new GoogleAICacheManager(API_KEY);

// Store for projects
const projects = new Map<string, Project>();

// Store for long-lived chat sessions (key: sessionId:projectId)
const chatSessions = new Map<string, SessionData>();

const projectAddAttempts = new Map<string, number[]>();

function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
        return forwarded[0];
    }
    return req.socket.remoteAddress || req.ip || 'unknown';
}

function enforceProjectRateLimit(req: Request, res: Response, next: NextFunction): void {
    const ip = getClientIp(req);
    const now = Date.now();
    const attempts = projectAddAttempts.get(ip) ?? [];
    const recentAttempts = attempts.filter(timestamp => now - timestamp < PROJECT_RATE_WINDOW_MS);

    if (recentAttempts.length >= PROJECT_RATE_LIMIT) {
        const message = 'Too many project registrations from this IP. Try again in a few minutes.';
        const acceptsHtml = typeof req.headers.accept === 'string' && req.headers.accept.includes('text/html');
        if (acceptsHtml) {
            res.status(429).send(`<p class="error">${escapeHtml(message)}</p>`);
            return;
        }
        res.status(429).json({ error: message });
        return;
    }

    recentAttempts.push(now);
    projectAddAttempts.set(ip, recentAttempts);
    next();
}

/**
 * Create or refresh cached content with project context for a specific project
 */
async function createCachedContent(project: Project): Promise<any> {
    console.log(`[...] Creating cached content for project ${project.id}...`);

    const systemPrompt = loadSystemPrompt(project.path);
    const projectContext = gatherProjectContext(project.path);

    const cacheResult = await cacheManager.create({
        model: 'gemini-2.5-flash',
        contents: [
            {
                role: 'user',
                parts: [{ text: `Here is the project context for reference:\n\n${projectContext}` }],
            },
            {
                role: 'model',
                parts: [{
                    text:
                        'I have received and processed the project context. I can now see all git-tracked files, the directory structure, and configuration files. I will use this information when analyzing and enhancing prompts. What prompt would you like me to help with?',
                }],
            },
        ],
        systemInstruction: systemPrompt,
        ttlSeconds: 3600, // Cache for 1 hour
    });

    console.log(`[✓] Created cached content for project ${project.id}: ${cacheResult.name}`);
    console.log(`[✓] Cache expires at: ${cacheResult.expireTime}`);

    return cacheResult;
}

// Trust proxy headers (we're behind nginx reverse proxy)
app.set('trust proxy', true);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(join(__dirname, '..', 'public')));

// Pretty-print JSON responses
app.set('json spaces', 2);

app.get('/config/firebase', (_req: Request, res: Response) => {
    res.json(getFirebaseClientConfig());
});

// Determine if we're in production (behind HTTPS proxy)
const isProduction = process.env.NODE_ENV === 'production';
const secureCookies = process.env.SECURE_COOKIES === 'true' || isProduction;

app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false, // Don't save empty sessions
        cookie: {
            secure: secureCookies, // Dynamic based on environment
            httpOnly: true,
            maxAge: SESSION_MAX_AGE,
            sameSite: 'lax',
            ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
        },
    }),
);

// Extend session type
declare module 'express-session' {
    interface SessionData {
        id: string;
        firebaseUser?: DecodedIdToken;
    }
}

function requireSessionUser(req: Request, res: Response, next: NextFunction): void {
    if (req.session?.firebaseUser) {
        next();
        return;
    }

    if (req.accepts('html')) {
        res.redirect('/?auth=required');
        return;
    }

    res.status(401).json({ error: 'Authentication required' });
}

/**
 * Refresh cache if it's stale
 * Returns true if cache was refreshed
 */
async function refreshCacheIfStale(project: Project): Promise<boolean> {
    if (project.cacheStale) {
        console.log(`[...] Cache is stale for project ${project.id}, refreshing...`);

        // Create new cached content
        const newCache = await createCachedContent(project);
        project.cachedContent = newCache;
        project.cacheStale = false;

        console.log(`[✓] Cache refreshed for project ${project.id}`);
        return true;
    }
    return false;
}

/**
 * Process user message - strip leading and trailing underscores
 */
function processUserMessage(message: string): string {
    return message.replace(/^_+|_+$/g, '');
}

/**
 * Check if error is a cache expiration error
 */
function isCacheExpiredError(error: any): boolean {
    // Convert error to string to catch message in any property
    const errorString = String(error);

    // Check for status 403 in multiple ways
    const statusMatch = error?.status === 403
        || error?.statusCode === 403
        || errorString.includes('[403 Forbidden]')
        || errorString.includes('403 Forbidden');

    // Check for cache-related error messages
    const messageMatch = errorString.includes('CachedContent not found')
        || errorString.includes('permission denied')
        || error?.message?.includes('CachedContent not found')
        || error?.message?.includes('permission denied');

    const isExpiredCache = statusMatch && messageMatch;

    if (isExpiredCache) {
        console.log(`[DEBUG] Detected cache expiration error:`, errorString.substring(0, 200));
    }

    return isExpiredCache;
}

/**
 * Handle cache expiration by recreating the cache and clearing affected sessions
 */
async function handleCacheExpiration(projectId: string): Promise<void> {
    const project = projects.get(projectId);
    if (!project) {
        throw new Error(`Project not found: ${projectId}`);
    }

    console.log(`[!] Cache expired for project ${projectId}, recreating...`);

    // Create new cached content
    const newCache = await createCachedContent(project);
    project.cachedContent = newCache;
    project.cacheStale = false;

    // Clear all chat sessions for this project (they reference the old cache)
    let clearedCount = 0;
    for (const [key] of chatSessions.entries()) {
        if (key.includes(`:${projectId}:`)) {
            chatSessions.delete(key);
            clearedCount++;
        }
    }

    console.log(`[✓] Cache recreated for project ${projectId}, cleared ${clearedCount} session(s)`);
}

/**
 * Send message with automatic cache expiration retry
 */
async function sendMessageWithRetry(
    sessionData: SessionData,
    message: string,
    projectId: string,
    sessionId: string,
): Promise<string> {
    try {
        const result = await sessionData.chat.sendMessage(message);
        return result.response.text();
    } catch (error) {
        // Check if this is a cache expiration error
        if (isCacheExpiredError(error)) {
            console.log(`[!] Cache expired, recovering...`);
            // Handle cache expiration and retry
            await handleCacheExpiration(projectId);
            // Get new session with fresh cache
            const newSessionData = await getChatSession(sessionId, projectId, sessionData.mode);
            const result = await newSessionData.chat.sendMessage(message);
            return result.response.text();
        } else {
            // Re-throw if it's not a cache expiration error
            throw error;
        }
    }
}

/**
 * Get or create a chat session for the given session ID, project ID, and mode
 */
async function getChatSession(sessionId: string, projectId: string, mode: PromptMode = 'enhance'): Promise<SessionData> {
    const compositeKey = `${sessionId}:${projectId}:${mode}`;

    // Get project
    const project = projects.get(projectId);
    if (!project) {
        throw new Error(`Project not found: ${projectId}`);
    }

    // Refresh cache if stale (just-in-time refresh)
    await refreshCacheIfStale(project);

    if (!chatSessions.has(compositeKey)) {
        // Use cached model for this project
        if (!project.cachedContent) {
            throw new Error(`No cached content available for project: ${projectId}`);
        }

        console.log(`[${new Date().toISOString()}] Using cached model for session: ${compositeKey}`);

        // Load mode-specific system instruction
        const systemInstruction = loadSystemPromptForMode(project.path, mode);

        const model = genAI.getGenerativeModelFromCachedContent(project.cachedContent, {
            systemInstruction,
        });

        const chat = model.startChat({
            history: [],
        });

        const sessionData: SessionData = {
            projectId,
            mode,
            chat,
            history: [],
            createdAt: new Date(),
            lastUsed: new Date(),
        };

        chatSessions.set(compositeKey, sessionData);
        console.log(`[${new Date().toISOString()}] Created new ${mode} chat session: ${compositeKey}`);
    }

    const sessionData = chatSessions.get(compositeKey)!;
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
    projectId: string;
    timestamp: Date;
    request: string;
    response: string;
    messageCount: number;
    cachedContentName?: string;
    mode?: 'enhance' | 'ask';
}): void {
    if (!HISTORY_DIR) {
        return; // History logging is disabled
    }

    try {
        // Create project-specific history directory
        const projectHistoryDir = join(HISTORY_DIR, data.projectId);
        if (!existsSync(projectHistoryDir)) {
            mkdirSync(projectHistoryDir, { recursive: true });
        }

        // Create filename with ISO timestamp for easy sorting
        const isoTimestamp = data.timestamp.toISOString().replace(/[:.]/g, '-');
        const filename = `${isoTimestamp}_${data.sessionId.substring(0, 8)}.json`;
        const filepath = join(projectHistoryDir, filename);

        // Get project for metadata
        const project = projects.get(data.projectId);

        // Prepare history entry with all metadata
        const historyEntry = {
            sessionId: data.sessionId,
            projectId: data.projectId,
            mode: data.mode || 'enhance',
            timestamp: data.timestamp.toISOString(),
            messageCount: data.messageCount,
            cachedContentName: data.cachedContentName,
            request: data.request,
            response: data.response,
            metadata: {
                serverVersion: '1.0.0',
                model: 'gemini-2.5-flash',
                projectPath: project?.path,
                gitUrl: project?.gitUrl,
            },
        };

        // Write to file
        writeFileSync(filepath, JSON.stringify(historyEntry, null, 2), 'utf-8');
        console.log(`[✓] Wrote history entry: ${data.projectId}/${filename}`);
    } catch (error) {
        console.error(`[ERROR] Failed to write history entry:`, error instanceof Error ? error.message : 'Unknown error');
        // Don't throw - history logging shouldn't break the main functionality
    }
}

/**
 * Helper function to redact sensitive tokens from Git URLs
 */
function redactGitUrl(gitUrl: string): string {
    try {
        const url = new URL(gitUrl);
        if (url.username) {
            // Replace username (token) with asterisks
            url.username = '***';
        }
        // Clear password if present (shouldn't be for modern PATs)
        if (url.password) {
            url.password = '';
        }
        return url.toString();
    } catch {
        // If not a valid URL, return as-is
        return gitUrl;
    }
}

/**
 * Extract a clean repository name from Git URL (e.g., "owner/repo")
 */
function extractRepoName(gitUrl: string): string {
    try {
        const url = new URL(gitUrl);
        // Remove leading slash and .git extension
        let path = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
        return path || gitUrl;
    } catch {
        // If not a valid URL, try to extract from string
        const match = gitUrl.match(/([^/:]+\/[^/:]+?)(\.git)?$/);
        return match ? match[1] : gitUrl;
    }
}

/**
 * Convert a date to relative time format ("2 hours ago", "3 days ago", etc.)
 */
function timeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;

    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Helper function to generate HTML table of projects
 */
function generateProjectsTable(): string {
    if (projects.size === 0) {
        return '<p class="text-muted">No projects configured. Add one above to get started.</p>';
    }

    const rows = Array
        .from(projects.values())
        .map(p => {
            // Load system prompt for this project
            const systemPrompt = loadSystemPrompt(p.path);
            const promptPreview = systemPrompt.substring(0, 100) + (systemPrompt.length > 100 ? '...' : '');
            const promptId = `prompt-${p.id}`;

            // Generate status badge
            let statusBadge = '';
            if (p.status === 'cloning') {
                statusBadge = '<span class="status-badge status-cloning">Cloning...</span>';
            } else if (p.status === 'error') {
                statusBadge = `<span class="status-badge status-error" title="${p.errorMessage || 'Unknown error'}">Error</span>`;
            } else {
                statusBadge = '<span class="status-badge status-ready">Ready</span>';
            }

            // Disable buttons if not ready
            const disabledClass = p.status !== 'ready' ? 'disabled' : '';
            const disabledAttr = p.status !== 'ready' ? 'disabled' : '';

            return `
    <tr class="project-item">
      <td>
        <a href="/projects/${p.id}/edit">${p.id}</a>
        <button onclick="copyProjectIdFromTable('${p.id}', this)" class="btn-icon" title="Copy Project ID" style="margin-left: 8px;">
          <i data-lucide="copy" class="icon" style="width: 14px; height: 14px;"></i>
        </button>
        ${statusBadge}
      </td>
      <td>${redactGitUrl(p.gitUrl)}</td>
      <td>${p.branch}</td>
      <td class="text-muted">${timeAgo(new Date(p.lastUpdated))}</td>
      <td class="actions">
        <a href="/enhance/${p.id}" class="btn btn-primary btn-small ${disabledClass}" ${disabledAttr}>
          <i data-lucide="message-circle" class="icon"></i>
          Enhance
        </a>
        <a href="/ask/${p.id}" class="btn btn-primary btn-small ${disabledClass}" ${disabledAttr}>
          <i data-lucide="help-circle" class="icon"></i>
          Ask
        </a>
        <button class="btn btn-danger btn-small"
                hx-delete="/api/projects/${p.id}"
                hx-target="#project-list"
                hx-swap="innerHTML"
                hx-confirm="Are you sure you want to delete ${p.id}?"
                title="Delete project">
          <i data-lucide="trash-2" class="icon"></i>
          Delete
        </button>
      </td>
    </tr>
    <tr id="${promptId}" class="prompt-row is-hidden">
      <td colspan="5">
        <div class="prompt-container">
          <h3>System Prompt</h3>
          <div class="prompt-content markdown-content">${renderMarkdown(systemPrompt)}</div>
        </div>
      </td>
    </tr>
  `;
        })
        .join('');

    return `
    <table>
      <thead>
        <tr>
          <th>Project ID</th>
          <th>Git URL</th>
          <th>Branch</th>
          <th>Last Updated</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderProjectEditPage(project: Project, flashHtml: string = ''): string {
    const templatePath = join(__dirname, '..', 'views', 'project-edit.html');
    let template = readFileSync(templatePath, 'utf-8');

    const repoName = extractRepoName(project.gitUrl);
    const statusBadge = project.status === 'cloning'
        ? '<span class="status-badge status-cloning">Cloning...</span>'
        : project.status === 'error'
            ? `<span class="status-badge status-error" title="${escapeHtml(project.errorMessage || 'Unknown error')}">Error</span>`
            : '<span class="status-badge status-ready">Ready</span>';

    const lastUpdated = project.lastUpdated ? new Date(project.lastUpdated).toLocaleString() : 'Not available';

    const replacements: Record<string, string> = {
        PROJECT_NAME: escapeHtml(repoName || project.id),
        PROJECT_ID: escapeHtml(project.id),
        GIT_URL: escapeHtml(project.gitUrl),
        PROJECT_BRANCH: escapeHtml(project.branch),
        PROJECT_PATH: escapeHtml(project.path),
        LAST_UPDATED: escapeHtml(lastUpdated),
        STATUS_BADGE: statusBadge,
        FLASH: flashHtml || '',
        FORM_ACTION: `/projects/${project.id}/edit`,
    };

    for (const [key, value] of Object.entries(replacements)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        template = template.replace(regex, value);
    }

    return template;
}

/**
 * Helper function to generate HTML messages with markdown rendering
 */
function generateMessageHTML(role: 'user' | 'model', message: string, timestamp: Date, sessionId?: string, mode?: 'enhance' | 'ask'): string {
    const sessionInfo = sessionId ? ` <span class="text-faint">• ${sessionId.substring(0, 8)}</span>` : '';
    const modeInfo = mode ? ` <span class="mode-badge mode-${mode}">${mode === 'enhance' ? 'Enhance' : 'Ask'}</span>` : '';
    return `
    <div class="message ${role}">
      <div class="message-content">${md.render(message)}</div>
      <div class="message-time">${new Date(timestamp).toLocaleTimeString()}${sessionInfo}${modeInfo}</div>
    </div>
  `;
}

/**
 * Render markdown content to HTML (for system prompts and other content)
 */
function renderMarkdown(text: string): string {
    return md.render(text);
}

/**
 * Escape HTML to prevent XSS (kept for backwards compatibility if needed)
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}

function resolveNextUrl(input: unknown): string {
    if (typeof input === 'string' && input.startsWith('/') && !input.startsWith('//')) {
        return input;
    }
    return '/';
}

function clearSessionsForProject(projectId: string): number {
    let clearedCount = 0;
    for (const key of chatSessions.keys()) {
        if (key.includes(`:${projectId}:`)) {
            chatSessions.delete(key);
            clearedCount++;
        }
    }
    return clearedCount;
}

// Routes

// ============================================================================
// HTML Frontend Routes (HTMX)
// ============================================================================

/**
 * Serve the main dashboard page (public, but functionality requires auth)
 */
app.get('/', (req: Request, res: Response) => {
    const indexPath = join(__dirname, '..', 'views', 'index.html');
    let indexHTML = readFileSync(indexPath, 'utf-8');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    indexHTML = indexHTML.replace(/\{\{BASE_URL\}\}/g, baseUrl);
    res.send(indexHTML);
});

app.get('/login', (req: Request, res: Response) => {
    if (req.session?.firebaseUser) {
        return res.redirect(resolveNextUrl(req.query.next));
    }
    const loginPath = join(__dirname, '..', 'views', 'login.html');
    res.sendFile(loginPath);
});

app.get('/register', (req: Request, res: Response) => {
    if (req.session?.firebaseUser) {
        return res.redirect(resolveNextUrl(req.query.next));
    }
    const registerPath = join(__dirname, '..', 'views', 'register.html');
    res.sendFile(registerPath);
});

/**
 * Serve the projects list page
 */
app.get('/projects', (req: Request, res: Response, next: NextFunction) => {
    const acceptsHtml = typeof req.headers.accept === 'string' && req.headers.accept.toLowerCase().includes('text/html');
    if (!acceptsHtml) {
        next();
        return;
    }

    if (!req.session?.firebaseUser) {
        const next = encodeURIComponent('/projects');
        res.redirect(`/login?next=${next}`);
        return;
    }

    const projectsPath = join(__dirname, '..', 'views', 'projects.html');
    res.sendFile(projectsPath);
});

app.get('/projects/:projectId/edit', requireSessionUser, (req: Request, res: Response) => {
    const { projectId } = req.params;
    const project = projects.get(projectId);

    if (!project) {
        return res.status(404).send(`
      <html>
        <head><title>Project Not Found</title></head>
        <body>
          <h1>Project Not Found</h1>
          <p>Project ID: ${escapeHtml(projectId)}</p>
          <a href="/">Back to Projects</a>
        </body>
      </html>
    `);
    }

    let flash = '';
    if ('saved' in req.query) {
        flash = '<div class="alert success">Project configuration updated.</div>';
    }
    const editPage = renderProjectEditPage(project, flash);
    res.send(editPage);
});

app.post('/projects/:projectId/edit', requireSessionUser, async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const project = projects.get(projectId);

        if (!project) {
            return res.status(404).send(`<p class="error">Project ${escapeHtml(projectId)} not found</p>`);
        }

        const { gitUrl, branch, accessToken, clearToken } = req.body;

        if (!gitUrl || typeof gitUrl !== 'string') {
            const html = renderProjectEditPage(project, '<div class="alert error">Git URL is required.</div>');
            return res.status(400).send(html);
        }

        const trimmedGitUrl = gitUrl.trim();
        if (!trimmedGitUrl) {
            const html = renderProjectEditPage(project, '<div class="alert error">Git URL cannot be empty.</div>');
            return res.status(400).send(html);
        }
        const normalizedBranch = (branch && typeof branch === 'string' ? branch.trim() : '') || 'main';

        const normalizedAccessToken = typeof accessToken === 'string' && accessToken.trim().length > 0
            ? accessToken.trim()
            : undefined;
        const shouldClearToken = clearToken === 'on';

        if (normalizedAccessToken && !trimmedGitUrl.startsWith('https://')) {
            const html = renderProjectEditPage(project, '<div class="alert error">Personal access tokens require an HTTPS Git URL.</div>');
            return res.status(400).send(html);
        }

        const cleanUrl = cleanGitUrl(trimmedGitUrl);

        const config = await loadProjectsConfig();
        const configIndex = config.projects.findIndex(p => {
            const storedBranch = p.branch || 'main';
            const storedId = generateProjectId(cleanGitUrl(p.gitUrl), storedBranch, p.accessToken);
            return storedId === projectId;
        });

        if (configIndex === -1) {
            console.warn(`[WARN] Project ${projectId} not found in configuration during edit.`);
            const html = renderProjectEditPage(project, '<div class="alert error">Project configuration entry is missing. Try re-adding the project.</div>');
            return res.status(404).send(html);
        }

        // Determine the final token to persist
        let tokenToPersist: string | undefined;
        if (shouldClearToken) {
            tokenToPersist = undefined;
        } else if (normalizedAccessToken) {
            tokenToPersist = normalizedAccessToken;
        } else {
            tokenToPersist = project.accessToken;
        }

        // Generate new project ID with the final token
        const newProjectId = generateProjectId(cleanUrl, normalizedBranch, tokenToPersist);

        // Check for conflicts with other projects
        if (newProjectId !== projectId) {
            const conflict = config.projects.some((p, index) => {
                if (index === configIndex) {
                    return false;
                }
                const storedBranch = p.branch || 'main';
                return generateProjectId(cleanGitUrl(p.gitUrl), storedBranch, p.accessToken) === newProjectId;
            });

            if (conflict) {
                const html = renderProjectEditPage(project, '<div class="alert error">Another project already uses that Git URL, branch, and access token combination.</div>');
                return res.status(400).send(html);
            }
        }

        const updatedEntry: ProjectConfig = {
            gitUrl: cleanUrl,
            branch: normalizedBranch,
        };
        if (tokenToPersist) {
            updatedEntry.accessToken = tokenToPersist;
        }

        if (newProjectId === projectId) {
            config.projects[configIndex] = updatedEntry;
            await saveProjectsConfig(config);

            project.gitUrl = cleanUrl;
            project.branch = normalizedBranch;
            project.accessToken = tokenToPersist;
            project.cacheStale = true;
            project.lastUpdated = new Date();
            project.status = 'ready';
            project.errorMessage = undefined;
            clearSessionsForProject(projectId);

            return res.redirect(`/projects/${projectId}/edit?saved=1`);
        }

        const newPath = join(CHECKOUT_DIR, newProjectId);
        try {
            await fsPromises.rm(newPath, { recursive: true, force: true });
            await cloneRepository(cleanUrl, newPath, normalizedBranch, tokenToPersist);
        } catch (error) {
            console.error('[ERROR] Failed to clone repository for updated configuration:', error);
            const html = renderProjectEditPage(project, '<div class="alert error">Failed to clone the repository with the new configuration. No changes were saved.</div>');
            return res.status(500).send(html);
        }

        config.projects[configIndex] = updatedEntry;
        await saveProjectsConfig(config);

        const clearedSessions = clearSessionsForProject(projectId);
        const updatedProject: Project = {
            id: newProjectId,
            gitUrl: cleanUrl,
            branch: normalizedBranch,
            path: newPath,
            accessToken: tokenToPersist,
            lastUpdated: new Date(),
            status: 'ready',
        };

        updatedProject.cachedContent = await createCachedContent(updatedProject);
        updatedProject.cacheStale = false;
        projects.delete(projectId);
        projects.set(updatedProject.id, updatedProject);

        console.log(`[✓] Updated project ${projectId} → ${updatedProject.id} (sessions cleared: ${clearedSessions})`);

        return res.redirect(`/projects/${updatedProject.id}/edit?saved=1`);
    } catch (error) {
        console.error('[ERROR] Failed to update project configuration:', error);
        return res.status(500).send(`<p class="error">Failed to update project: ${error instanceof Error ? escapeHtml(error.message) : 'Unknown error'}</p>`);
    }
});

/**
 * Serve the chat page for a specific project
 */
app.get('/enhance/:projectId', requireSessionUser, (req: Request, res: Response) => {
    const { projectId } = req.params;
    const project = projects.get(projectId);

    if (!project) {
        return res.status(404).send(`
      <html>
        <head><title>Project Not Found</title></head>
        <body>
          <h1>Project Not Found</h1>
          <p>Project ID: ${projectId}</p>
          <a href="/">Back to Projects</a>
        </body>
      </html>
    `);
    }

    // Get chat history from HISTORY_DIR if available
    let messagesHTML = '<p class="text-muted">No messages yet. Start the conversation below.</p>';

    if (HISTORY_DIR) {
        try {
            const projectHistoryDir = join(HISTORY_DIR, projectId);

            if (existsSync(projectHistoryDir)) {
                // Read all history files, sorted by timestamp (oldest first)
                const files = execSync(`ls "${projectHistoryDir}"/*.json 2>/dev/null | sort || true`, {
                    encoding: 'utf-8',
                    maxBuffer: 10 * 1024 * 1024,
                })
                    .trim()
                    .split('\n')
                    .filter(f => f);

                if (files.length > 0) {
                    const historyEntries: Array<{
                        timestamp: Date;
                        request: string;
                        response: string;
                    }> = [];

                    for (const file of files) {
                        try {
                            const content = readFileSync(file, 'utf-8');
                            const entry = JSON.parse(content);
                            historyEntries.push({
                                timestamp: new Date(entry.timestamp),
                                request: entry.request,
                                response: entry.response,
                            });
                        } catch (error) {
                            console.error(`[ERROR] Failed to read history file ${file}:`, error);
                        }
                    }

                    // Sort by timestamp (oldest first)
                    historyEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

                    // Generate HTML
                    messagesHTML = historyEntries
                        .map(entry => {
                            const userHTML = generateMessageHTML('user', entry.request, entry.timestamp);
                            const modelHTML = generateMessageHTML('model', entry.response, entry.timestamp);
                            return userHTML + modelHTML;
                        })
                        .join('');
                }
            }
        } catch (error) {
            console.error('[ERROR] Failed to load project history:', error);
        }
    }

    // If no saved history, check current session
    if (messagesHTML === '<p class="text-muted">No messages yet. Start the conversation below.</p>') {
        const sessionId = req.session.id;
        const compositeKey = `${sessionId}:${projectId}`;
        const sessionData = chatSessions.get(compositeKey);

        if (sessionData && sessionData.history.length > 0) {
            messagesHTML = sessionData.history.map(msg => generateMessageHTML(msg.role, msg.message, msg.timestamp, sessionId)).join('');
        }
    }

    // Load system prompt for this project (with PROJECT_DIR substituted - this is what Gemini sees)
    const systemPrompt = loadSystemPrompt(project.path);

    // Load and populate enhance template
    const chatPath = join(__dirname, '..', 'views', 'enhance.html');
    let chatHTML = readFileSync(chatPath, 'utf-8');

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    chatHTML = chatHTML
        .replace(/\{\{PROJECT_NAME\}\}/g, extractRepoName(project.gitUrl))
        .replace(/\{\{REPO_NAME\}\}/g, extractRepoName(project.gitUrl))
        .replace(/\{\{GIT_URL\}\}/g, project.gitUrl)
        .replace(/\{\{PROJECT_ID\}\}/g, project.id)
        .replace(/\{\{PROJECT_BRANCH\}\}/g, project.branch)
        .replace(/\{\{MESSAGES\}\}/g, messagesHTML)
        .replace(/\{\{SYSTEM_PROMPT\}\}/g, renderMarkdown(systemPrompt))
        .replace(/\{\{BASE_URL\}\}/g, baseUrl);

    res.send(chatHTML);
});

/**
 * Serve the ask page for a specific project
 */
app.get('/ask/:projectId', requireSessionUser, (req: Request, res: Response) => {
    const { projectId } = req.params;
    const project = projects.get(projectId);

    if (!project) {
        return res.status(404).send(`
      <html>
        <head><title>Project Not Found</title></head>
        <body>
          <h1>Project Not Found</h1>
          <p>Project ID: ${projectId}</p>
          <a href="/">Back to Projects</a>
        </body>
      </html>
    `);
    }

    // Get ask history from HISTORY_DIR if available
    let messagesHTML = '<p class="text-muted">No messages yet. Start the conversation below.</p>';

    if (HISTORY_DIR) {
        try {
            const projectHistoryDir = join(HISTORY_DIR, projectId);

            if (existsSync(projectHistoryDir)) {
                // Read all history files, sorted by timestamp (oldest first)
                const files = execSync(`ls "${projectHistoryDir}"/*.json 2>/dev/null | sort || true`, {
                    encoding: 'utf-8',
                    maxBuffer: 10 * 1024 * 1024,
                })
                    .trim()
                    .split('\n')
                    .filter(f => f);

                if (files.length > 0) {
                    const historyEntries: Array<{
                        timestamp: Date;
                        request: string;
                        response: string;
                    }> = [];

                    for (const file of files) {
                        try {
                            const content = readFileSync(file, 'utf-8');
                            const entry = JSON.parse(content);
                            historyEntries.push({
                                timestamp: new Date(entry.timestamp),
                                request: entry.request,
                                response: entry.response,
                            });
                        } catch (error) {
                            console.error(`[ERROR] Failed to read history file ${file}:`, error);
                        }
                    }

                    // Sort by timestamp (oldest first)
                    historyEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

                    // Generate HTML
                    messagesHTML = historyEntries
                        .map(entry => {
                            const userHTML = generateMessageHTML('user', entry.request, entry.timestamp);
                            const modelHTML = generateMessageHTML('model', entry.response, entry.timestamp);
                            return userHTML + modelHTML;
                        })
                        .join('');
                }
            }
        } catch (error) {
            console.error('[ERROR] Failed to load project history:', error);
        }
    }

    // If no saved history, check current session
    if (messagesHTML === '<p class="text-muted">No messages yet. Start the conversation below.</p>') {
        const sessionId = req.session.id;
        const compositeKey = `${sessionId}:${projectId}:ask`;
        const sessionData = chatSessions.get(compositeKey);

        if (sessionData && sessionData.history.length > 0) {
            messagesHTML = sessionData.history.map(msg => generateMessageHTML(msg.role, msg.message, msg.timestamp, sessionId)).join('');
        }
    }

    // Load system prompt for this project (with PROJECT_DIR substituted - this is what Gemini sees)
    const systemPrompt = loadSystemPromptForMode(project.path, 'ask');

    // Load and populate ask template
    const askPath = join(__dirname, '..', 'views', 'ask.html');
    let askHTML = readFileSync(askPath, 'utf-8');

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    askHTML = askHTML
        .replace(/\{\{PROJECT_NAME\}\}/g, extractRepoName(project.gitUrl))
        .replace(/\{\{REPO_NAME\}\}/g, extractRepoName(project.gitUrl))
        .replace(/\{\{GIT_URL\}\}/g, project.gitUrl)
        .replace(/\{\{PROJECT_ID\}\}/g, project.id)
        .replace(/\{\{PROJECT_BRANCH\}\}/g, project.branch)
        .replace(/\{\{MESSAGES\}\}/g, messagesHTML)
        .replace(/\{\{SYSTEM_PROMPT\}\}/g, renderMarkdown(systemPrompt))
        .replace(/\{\{BASE_URL\}\}/g, baseUrl);

    res.send(askHTML);
});

// ============================================================================
// API Authentication Boundary
// ============================================================================

app.use('/api', requireAuth);

app.post('/api/auth/session', (req: Request, res: Response) => {
    const user = (req as AuthedRequest).user;
    console.log('[DEBUG] POST /api/auth/session - Session ID:', req.sessionID);
    console.log('[DEBUG] POST /api/auth/session - User:', user.email);

    // Explicitly save session to ensure it persists
    req.session.save((err) => {
        if (err) {
            console.error('[AUTH] Failed to save session:', err);
            return res.status(500).json({ error: 'Failed to save session' });
        }

        console.log('[DEBUG] POST /api/auth/session - Session saved successfully');
        console.log('[DEBUG] POST /api/auth/session - firebaseUser set:', !!req.session.firebaseUser);

        res.json({
            success: true,
            user: {
                uid: user.uid,
                email: user.email,
                name: user.name,
            },
        });
    });
});

app.delete('/api/auth/session', (req: Request, res: Response) => {
    req.session.regenerate(error => {
        if (error) {
            console.error('[AUTH] Failed to clear session:', error);
            return res.status(500).json({ error: 'Failed to clear session' });
        }

        res.json({
            success: true,
        });
    });
});

/**
 * HTMX: Get projects table HTML
 */
app.get('/api/projects-table', (_req: Request, res: Response) => {
    res.send(generateProjectsTable());
});

/**
 * HTMX: Add project and return updated table
 */
app.post('/api/projects', enforceProjectRateLimit, async (req: Request, res: Response) => {
    try {
        const { gitUrl, branch, accessToken } = req.body;

        if (!gitUrl) {
            return res.status(400).send('<p class="error">Git URL is required</p>');
        }

        // Validate URL format (must be HTTPS for PAT to work)
        if (accessToken && accessToken.trim() && !gitUrl.startsWith('https://')) {
            return res.status(400).send('<p class="error">When using a Personal Access Token, Git URL must use HTTPS format (e.g., https://github.com/user/repo.git)</p>');
        }

        // Normalize the access token (trim and convert empty string to undefined)
        const normalizedToken = accessToken && accessToken.trim() ? accessToken.trim() : undefined;

        // Add project with separate access token
        const project = await addProjectToConfig(gitUrl, CHECKOUT_DIR, branch || 'main', normalizedToken);

        // Create cached content for the new project
        project.cachedContent = await createCachedContent(project);

        // Store in projects map
        projects.set(project.id, project);

        // Return updated table
        res.send(generateProjectsTable());
    } catch (error) {
        console.error('[ERROR] Failed to add project:', error);
        res.status(500).send(`<p class="error">Failed to add project: ${error instanceof Error ? error.message : 'Unknown error'}</p>`);
    }
});

/**
 * HTMX: Delete project and return updated table
 */
app.delete('/api/projects/:projectId', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;

        const project = projects.get(projectId);
        if (!project) {
            return res.status(404).send('<p class="error">Project not found</p>');
        }

        // Remove from configuration
        await removeProjectFromConfig(projectId, project);

        clearSessionsForProject(projectId);

        // Remove from projects map
        projects.delete(projectId);

        // Return updated table
        res.send(generateProjectsTable());
    } catch (error) {
        console.error('[ERROR] Failed to remove project:', error);
        res.status(500).send(`<p class="error">Failed to remove project: ${error instanceof Error ? error.message : 'Unknown error'}</p>`);
    }
});

/**
 * HTMX: Send chat message and return new message HTML
 */
app.post('/api/chat-message', async (req: Request, res: Response) => {
    try {
        const { message, projectId } = req.body;

        if (!projectId) {
            return res.status(400).send('<p class="error">Project ID is required</p>');
        }

        if (!message || typeof message !== 'string') {
            return res.status(400).send('<p class="error">Message is required</p>');
        }

        const processedMessage = processUserMessage(message);

        const sessionId = req.session.id;
        const sessionData = await getChatSession(sessionId, projectId, 'enhance');

        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);
        console.log(`[${new Date().toISOString()}] Session: ${sessionId}:${projectId}:enhance`);
        console.log(`[${new Date().toISOString()}] Prompt:`);
        console.log(processedMessage);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);

        // Send processed message and get response
        const response = await sendMessageWithRetry(sessionData, processedMessage, projectId, sessionId);

        console.log(`[${new Date().toISOString()}] Response:`);
        console.log(response);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════\n`);

        // Store in history (using processed message)
        const timestamp = new Date();
        const userMessage = { role: 'user' as const, message: processedMessage, timestamp };
        const modelMessage = { role: 'model' as const, message: response, timestamp };

        sessionData.history.push(userMessage, modelMessage);

        // Write to history file if configured
        const project = projects.get(projectId);
        writeHistoryEntry({
            sessionId,
            projectId,
            timestamp,
            request: processedMessage,
            response,
            messageCount: sessionData.history.length,
            cachedContentName: project?.cachedContent?.name,
            mode: 'enhance',
        });

        // Return HTML for both messages (showing processed message)
        const userHTML = generateMessageHTML('user', processedMessage, timestamp, sessionId);
        const modelHTML = generateMessageHTML('model', response, timestamp, sessionId);

        res.send(userHTML + modelHTML);
    } catch (error) {
        console.error('[ERROR] Failed to process chat:', error);
        res.status(500).send(`<p class="error">Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}</p>`);
    }
});

/**
 * HTMX: Send ask message and return new message HTML
 */
app.post('/api/ask-message', async (req: Request, res: Response) => {
    try {
        const { message, projectId } = req.body;

        if (!projectId) {
            return res.status(400).send('<p class="error">Project ID is required</p>');
        }

        if (!message || typeof message !== 'string') {
            return res.status(400).send('<p class="error">Message is required</p>');
        }

        const processedMessage = processUserMessage(message);

        const sessionId = req.session.id;
        const sessionData = await getChatSession(sessionId, projectId, 'ask');

        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);
        console.log(`[${new Date().toISOString()}] Session: ${sessionId}:${projectId}:ask`);
        console.log(`[${new Date().toISOString()}] Question:`);
        console.log(processedMessage);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);

        // Send processed message and get response
        const response = await sendMessageWithRetry(sessionData, processedMessage, projectId, sessionId);

        console.log(`[${new Date().toISOString()}] Response:`);
        console.log(response);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════\n`);

        // Store in history (using processed message)
        const timestamp = new Date();
        const userMessage = { role: 'user' as const, message: processedMessage, timestamp };
        const modelMessage = { role: 'model' as const, message: response, timestamp };

        sessionData.history.push(userMessage, modelMessage);

        // Write to history file if configured
        const project = projects.get(projectId);
        writeHistoryEntry({
            sessionId,
            projectId,
            timestamp,
            request: processedMessage,
            response,
            messageCount: sessionData.history.length,
            cachedContentName: project?.cachedContent?.name,
            mode: 'ask',
        });

        // Return HTML for both messages (showing processed message)
        const userHTML = generateMessageHTML('user', processedMessage, timestamp, sessionId);
        const modelHTML = generateMessageHTML('model', response, timestamp, sessionId);

        res.send(userHTML + modelHTML);
    } catch (error) {
        console.error('[ERROR] Failed to process ask:', error);
        res.status(500).send(`<p class="error">Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}</p>`);
    }
});

/**
 * HTMX: Load project history from disk
 */
app.get('/api/project-history', (req: Request, res: Response) => {
    const projectId = req.query.projectId as string;
    const mode = req.query.mode as 'enhance' | 'ask' | undefined;

    if (!projectId) {
        return res.status(400).send('<p class="error">Project ID is required</p>');
    }

    if (!HISTORY_DIR) {
        return res.send('<p class="text-muted">History logging is disabled. Enable by setting HISTORY_DIR in .env</p>');
    }

    try {
        const projectHistoryDir = join(HISTORY_DIR, projectId);

        // Check if history directory exists
        if (!existsSync(projectHistoryDir)) {
            return res.send('<p class="text-muted">No history found for this project yet.</p>');
        }

        // Read all history files
        const files = execSync(`ls -t "${projectHistoryDir}"/*.json 2>/dev/null || true`, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
        })
            .trim()
            .split('\n')
            .filter(f => f);

        if (files.length === 0) {
            return res.send('<p class="text-muted">No history found for this project yet.</p>');
        }

        // Read and parse history files
        const historyEntries: Array<{
            timestamp: Date;
            request: string;
            response: string;
            sessionId: string;
            mode: 'enhance' | 'ask';
        }> = [];

        for (const file of files) {
            try {
                const content = readFileSync(file, 'utf-8');
                const entry = JSON.parse(content);
                historyEntries.push({
                    timestamp: new Date(entry.timestamp),
                    request: entry.request,
                    response: entry.response,
                    sessionId: entry.sessionId,
                    mode: entry.mode || 'enhance',
                });
            } catch (error) {
                console.error(`[ERROR] Failed to read history file ${file}:`, error);
            }
        }

        // Filter by mode if specified
        const filteredEntries = mode
            ? historyEntries.filter(entry => entry.mode === mode)
            : historyEntries;

        // Sort by timestamp (newest first) and limit to 10 most recent
        filteredEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        const recentEntries = filteredEntries.slice(0, 10);

        // Generate HTML
        const messagesHTML = recentEntries
            .map(entry => {
                const userHTML = generateMessageHTML('user', entry.request, entry.timestamp, entry.sessionId, entry.mode);
                const modelHTML = generateMessageHTML('model', entry.response, entry.timestamp, entry.sessionId, entry.mode);
                return userHTML + modelHTML;
            })
            .join('');

        res.send(messagesHTML || '<p class="text-muted">No history found for this project yet.</p>');
    } catch (error) {
        console.error('[ERROR] Failed to load project history:', error);
        res.status(500).send('<p class="error">Failed to load project history</p>');
    }
});

/**
 * HTMX: Clear session and return empty messages
 */
app.post('/api/session/clear', (req: Request, res: Response) => {
    const sessionId = req.session.id;
    const projectId = req.query.projectId as string;
    const mode = req.query.mode as string;

    if (!projectId) {
        return res.status(400).send('<p class="error">Project ID is required</p>');
    }

    // If mode is specified, clear only that mode's session
    // If mode is not specified, clear all sessions for this project
    if (mode === 'enhance' || mode === 'ask') {
        const compositeKey = `${sessionId}:${projectId}:${mode}`;
        if (chatSessions.has(compositeKey)) {
            chatSessions.delete(compositeKey);
            console.log(`[${new Date().toISOString()}] Cleared ${mode} session: ${compositeKey}`);
        }
    } else {
        // Clear both enhance and ask sessions
        for (const modeType of ['enhance', 'ask'] as const) {
            const compositeKey = `${sessionId}:${projectId}:${modeType}`;
            if (chatSessions.has(compositeKey)) {
                chatSessions.delete(compositeKey);
                console.log(`[${new Date().toISOString()}] Cleared ${modeType} session: ${compositeKey}`);
            }
        }
    }

    res.send('<p class="text-muted">Session cleared. Start a new conversation below.</p>');
});

// ============================================================================
// JSON API Routes (original endpoints)
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response<HealthResponse>) => {
    res.json({
        status: 'ok',
        sessions: chatSessions.size,
        systemPrompt: 'Multi-project server',
    });
});

/**
 * Get current session information
 */
app.get('/session', requireAuth, (req: Request, res: Response<SessionInfoResponse | ErrorResponse>) => {
    const sessionId = req.session.id;
    const projectId = req.query.projectId as string;
    const mode = (req.query.mode as 'enhance' | 'ask') || 'enhance';

    if (!projectId) {
        return res.status(400).json({
            error: 'projectId query parameter is required',
        });
    }

    const compositeKey = `${sessionId}:${projectId}:${mode}`;
    const sessionData = chatSessions.get(compositeKey);

    res.json({
        sessionId,
        projectId,
        hasActiveSession: !!sessionData,
        createdAt: sessionData?.createdAt || null,
        lastUsed: sessionData?.lastUsed || null,
    });
});

/**
 * Clear the current session
 */
app.post('/session/clear', requireAuth, (req: Request, res: Response<ClearSessionResponse | ErrorResponse>) => {
    const sessionId = req.session.id;
    const projectId = req.query.projectId as string;
    const mode = req.query.mode as string;

    if (!projectId) {
        return res.status(400).json({
            error: 'projectId query parameter is required',
        });
    }

    // If mode is specified, clear only that mode's session
    // If mode is not specified, clear all sessions for this project
    let clearedCount = 0;
    if (mode === 'enhance' || mode === 'ask') {
        const compositeKey = `${sessionId}:${projectId}:${mode}`;
        if (chatSessions.has(compositeKey)) {
            chatSessions.delete(compositeKey);
            console.log(`[${new Date().toISOString()}] Cleared ${mode} session: ${compositeKey}`);
            clearedCount = 1;
        }
    } else {
        // Clear both enhance and ask sessions
        for (const modeType of ['enhance', 'ask'] as const) {
            const compositeKey = `${sessionId}:${projectId}:${modeType}`;
            if (chatSessions.has(compositeKey)) {
                chatSessions.delete(compositeKey);
                console.log(`[${new Date().toISOString()}] Cleared ${modeType} session: ${compositeKey}`);
                clearedCount++;
            }
        }
    }

    res.json({
        success: true,
        message: `Session${clearedCount === 1 ? '' : 's'} cleared`,
        sessionId,
    });
});

/**
 * Refresh cached content for a specific project
 */
app.post('/cache/refresh', requireAuth, async (req: Request, res: Response<CacheRefreshResponse | ErrorResponse>) => {
    try {
        const projectId = req.query.projectId as string;

        if (!projectId) {
            return res.status(400).json({
                error: 'projectId query parameter is required',
            });
        }

        const project = projects.get(projectId);
        if (!project) {
            return res.status(404).json({
                error: `Project not found: ${projectId}`,
            });
        }

        console.log(`[...] Refreshing cached content for project ${projectId}...`);

        // Clear sessions for this project
        let clearedCount = 0;
        for (const [key] of chatSessions.entries()) {
            if (key.includes(`:${projectId}:`)) {
                chatSessions.delete(key);
                clearedCount++;
            }
        }

        // Create new cached content for this project
        const newCache = await createCachedContent(project);
        project.cachedContent = newCache;

        res.json({
            success: true,
            message: `Cache refreshed successfully for project ${projectId}`,
            cachedContentName: newCache.name,
            clearedSessions: clearedCount,
        });
    } catch (error) {
        console.error('[ERROR] Failed to refresh cache:', error);
        res.status(500).json({
            error: 'Failed to refresh cache',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Main chat endpoint - send message to Gemini
 */
app.post('/enhance', async (req: Request<{}, ChatResponse | ErrorResponse, ChatRequest>, res: Response<ChatResponse | ErrorResponse>) => {
    try {
        const { message } = req.body;
        const projectId = req.query.projectId as string;

        if (!projectId) {
            return res.status(400).json({
                error: 'projectId query parameter is required',
            });
        }

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required and must be a string',
            });
        }

        const processedMessage = processUserMessage(message);

        const sessionId = req.session.id;
        const sessionData = await getChatSession(sessionId, projectId, 'enhance');

        /*
        message looks like this:
        {
            "session_id": "-id-",
            "transcript_path": "path-to-claude-convo .jsonl",
            "cwd": "target-project-dir",
            "permission_mode": "default",
            "hook_event_name": "UserPromptSubmit",
            "prompt": "what's the project about?"
        }
         */
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);
        console.log(`[${new Date().toISOString()}] Session: ${sessionId}:${projectId}:enhance`);
        console.log(`[${new Date().toISOString()}] Input Message:`);
        console.log(processedMessage);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);

        // Send processed message and get response
        const response = await sendMessageWithRetry(sessionData, processedMessage, projectId, sessionId);

        console.log(`[${new Date().toISOString()}] Response:`);
        console.log(response);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════\n`);

        // Store in history (using processed message)
        const timestamp = new Date();
        sessionData.history.push(
            {
                role: 'user',
                message: processedMessage,
                timestamp,
            },
            {
                role: 'model',
                message: response,
                timestamp,
            },
        );

        // Write to history file if configured
        const project = projects.get(projectId);
        writeHistoryEntry({
            sessionId,
            projectId,
            timestamp,
            request: processedMessage,
            response,
            messageCount: sessionData.history.length,
            cachedContentName: project?.cachedContent?.name,
            mode: 'enhance',
        });

        res.json({
            success: true,
            sessionId,
            projectId,
            response,
        });
    } catch (error) {
        console.error('[ERROR] Failed to process chat:', error);
        res.status(500).json({
            error: 'Failed to process message',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Ask endpoint - send question to critical thinking AI
 */
app.post('/ask', async (req: Request<{}, ChatResponse | ErrorResponse, ChatRequest>, res: Response<ChatResponse | ErrorResponse>) => {
    try {
        const { message } = req.body;
        const projectId = req.query.projectId as string;

        if (!projectId) {
            return res.status(400).json({
                error: 'projectId query parameter is required',
            });
        }

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required and must be a string',
            });
        }

        const processedMessage = processUserMessage(message);

        const sessionId = req.session.id;
        const sessionData = await getChatSession(sessionId, projectId, 'ask');

        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);
        console.log(`[${new Date().toISOString()}] Session: ${sessionId}:${projectId}:ask`);
        console.log(`[${new Date().toISOString()}] Input Message:`);
        console.log(processedMessage);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);

        // Send processed message and get response
        const response = await sendMessageWithRetry(sessionData, processedMessage, projectId, sessionId);

        console.log(`[${new Date().toISOString()}] Response:`);
        console.log(response);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════\n`);

        // Store in history (using processed message)
        const timestamp = new Date();
        sessionData.history.push(
            {
                role: 'user',
                message: processedMessage,
                timestamp,
            },
            {
                role: 'model',
                message: response,
                timestamp,
            },
        );

        // Write to history file if configured
        const project = projects.get(projectId);
        writeHistoryEntry({
            sessionId,
            projectId,
            timestamp,
            request: processedMessage,
            response,
            messageCount: sessionData.history.length,
            cachedContentName: project?.cachedContent?.name,
            mode: 'ask',
        });

        res.json({
            success: true,
            sessionId,
            projectId,
            response,
        });
    } catch (error) {
        console.error('[ERROR] Failed to process ask:', error);
        res.status(500).json({
            error: 'Failed to process message',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Enhance endpoint with path parameter - matches browser URL format
 */
app.post('/enhance/:projectId', async (req: Request<{projectId: string}, ChatResponse | ErrorResponse, ChatRequest>, res: Response<ChatResponse | ErrorResponse>) => {
    try {
        const { message } = req.body;
        const projectId = req.params.projectId;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required and must be a string',
            });
        }

        const processedMessage = processUserMessage(message);

        const sessionId = req.session.id;
        const sessionData = await getChatSession(sessionId, projectId, 'enhance');

        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);
        console.log(`[${new Date().toISOString()}] Session: ${sessionId}:${projectId}:enhance`);
        console.log(`[${new Date().toISOString()}] Input Message:`);
        console.log(processedMessage);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);

        // Send processed message and get response
        const response = await sendMessageWithRetry(sessionData, processedMessage, projectId, sessionId);

        console.log(`[${new Date().toISOString()}] Response:`);
        console.log(response);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════\n`);

        // Store in history (using processed message)
        const timestamp = new Date();
        sessionData.history.push(
            {
                role: 'user',
                message: processedMessage,
                timestamp,
            },
            {
                role: 'model',
                message: response,
                timestamp,
            },
        );

        // Write to history file if configured
        const project = projects.get(projectId);
        writeHistoryEntry({
            sessionId,
            projectId,
            timestamp,
            request: processedMessage,
            response,
            messageCount: sessionData.history.length,
            cachedContentName: project?.cachedContent?.name,
            mode: 'enhance',
        });

        res.json({
            success: true,
            sessionId,
            projectId,
            response,
        });
    } catch (error) {
        console.error('[ERROR] Failed to process enhance:', error);
        res.status(500).json({
            error: 'Failed to process message',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Ask endpoint with path parameter - matches browser URL format
 */
app.post('/ask/:projectId', async (req: Request<{projectId: string}, ChatResponse | ErrorResponse, ChatRequest>, res: Response<ChatResponse | ErrorResponse>) => {
    try {
        const { message } = req.body;
        const projectId = req.params.projectId;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required and must be a string',
            });
        }

        const processedMessage = processUserMessage(message);

        const sessionId = req.session.id;
        const sessionData = await getChatSession(sessionId, projectId, 'ask');

        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);
        console.log(`[${new Date().toISOString()}] Session: ${sessionId}:${projectId}:ask`);
        console.log(`[${new Date().toISOString()}] Input Message:`);
        console.log(processedMessage);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════`);

        // Send processed message and get response
        const response = await sendMessageWithRetry(sessionData, processedMessage, projectId, sessionId);

        console.log(`[${new Date().toISOString()}] Response:`);
        console.log(response);
        console.log(`[${new Date().toISOString()}] ═══════════════════════════════════════════════════\n`);

        // Store in history (using processed message)
        const timestamp = new Date();
        sessionData.history.push(
            {
                role: 'user',
                message: processedMessage,
                timestamp,
            },
            {
                role: 'model',
                message: response,
                timestamp,
            },
        );

        // Write to history file if configured
        const project = projects.get(projectId);
        writeHistoryEntry({
            sessionId,
            projectId,
            timestamp,
            request: processedMessage,
            response,
            messageCount: sessionData.history.length,
            cachedContentName: project?.cachedContent?.name,
            mode: 'ask',
        });

        res.json({
            success: true,
            sessionId,
            projectId,
            response,
        });
    } catch (error) {
        console.error('[ERROR] Failed to process ask:', error);
        res.status(500).json({
            error: 'Failed to process message',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Get chat history for current session
 */
app.get('/history', requireAuth, (req: Request, res: Response<HistoryResponse | ErrorResponse>) => {
    const sessionId = req.session.id;
    const projectId = req.query.projectId as string;
    const mode = (req.query.mode as 'enhance' | 'ask') || 'enhance';

    if (!projectId) {
        return res.status(400).json({
            error: 'projectId query parameter is required',
        });
    }

    const compositeKey = `${sessionId}:${projectId}:${mode}`;
    const sessionData = chatSessions.get(compositeKey);

    if (!sessionData) {
        return res.json({
            sessionId,
            projectId,
            history: [],
        });
    }

    res.json({
        sessionId,
        projectId,
        history: sessionData.history,
    });
});

/**
 * List all configured projects
 */
app.get('/projects', requireAuth, (_req: Request, res: Response<ProjectsListResponse>) => {
    const projectList: ProjectInfo[] = Array.from(projects.values()).map(p => ({
        id: p.id,
        gitUrl: p.gitUrl,
        branch: p.branch,
        path: p.path,
        lastUpdated: p.lastUpdated,
    }));

    res.json({
        projects: projectList,
    });
});

/**
 * Add a new project
 */
app.post('/projects', requireAuth, enforceProjectRateLimit, async (req: Request<{}, AddProjectResponse | ErrorResponse, AddProjectRequest>, res: Response<AddProjectResponse | ErrorResponse>) => {
    try {
        const { gitUrl, branch, accessToken } = req.body;

        if (!gitUrl) {
            return res.status(400).json({
                error: 'gitUrl is required',
            });
        }

        // Validate URL format (must be HTTPS for PAT to work)
        if (accessToken && accessToken.trim() && !gitUrl.startsWith('https://')) {
            return res.status(400).json({
                error: 'When using a Personal Access Token, Git URL must use HTTPS format (e.g., https://github.com/user/repo.git)',
            });
        }

        // Normalize the access token (trim and convert empty string to undefined)
        const normalizedToken = accessToken && accessToken.trim() ? accessToken.trim() : undefined;

        // Add project with separate access token
        const project = await addProjectToConfig(gitUrl, CHECKOUT_DIR, branch || 'main', normalizedToken);

        // Create cached content for the new project
        project.cachedContent = await createCachedContent(project);

        // Store in projects map
        projects.set(project.id, project);

        res.json({
            success: true,
            message: `Project added successfully: ${project.id}`,
            project: {
                id: project.id,
                gitUrl: project.gitUrl,
                branch: project.branch,
                path: project.path,
                lastUpdated: project.lastUpdated,
            },
        });
    } catch (error) {
        console.error('[ERROR] Failed to add project:', error);
        res.status(500).json({
            error: 'Failed to add project',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Remove a project
 */
app.delete('/projects/:projectId', requireAuth, async (req: Request, res: Response<RemoveProjectResponse | ErrorResponse>) => {
    try {
        const { projectId } = req.params;

        const project = projects.get(projectId);
        if (!project) {
            return res.status(404).json({
                error: `Project not found: ${projectId}`,
            });
        }

        // Remove from configuration
        await removeProjectFromConfig(projectId, project);

        // Clear all sessions for this project
        for (const [key] of chatSessions.entries()) {
            if (key.includes(`:${projectId}:`)) {
                chatSessions.delete(key);
            }
        }

        // Remove from projects map
        projects.delete(projectId);

        res.json({
            success: true,
            message: `Project removed successfully: ${projectId}`,
            projectId,
        });
    } catch (error) {
        console.error('[ERROR] Failed to remove project:', error);
        res.status(500).json({
            error: 'Failed to remove project',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Shutdown endpoint - gracefully stop the server
 */
app.post('/shutdown', requireAuth, (_req: Request, res: Response) => {
    console.log('[...] Shutdown requested');

    res.json({
        success: true,
        message: 'Server shutting down...',
    });

    // Give response time to send before shutting down
    setTimeout(() => {
        console.log('[✓] Server shutting down gracefully');
        process.exit(0);
    }, 100);
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[ERROR] Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message,
    });
});

// Setup cleanup interval
setInterval(cleanupOldSessions, CLEANUP_INTERVAL);

/**
 * Initialize and start the server
 */
async function startServer() {
    // Initialize projects from configuration
    console.log('[...] Initializing projects...');
    const initializedProjects = await initializeProjects(CHECKOUT_DIR);

    // Create cached content for each project
    for (const [projectId, project] of initializedProjects.entries()) {
        project.cachedContent = await createCachedContent(project);
        projects.set(projectId, project);
    }

    console.log(`[✓] Initialized ${projects.size} project(s)`);

    // Start repository watcher
    startWatching(projects, REPO_CHECK_INTERVAL);

    // Start server
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Gemini Multi-Project Session Server                          ║
╚════════════════════════════════════════════════════════════════╝

Server running on: http://localhost:${PORT}
Checkout directory: ${CHECKOUT_DIR}
Projects loaded: ${projects.size}

Endpoints:
  GET    /health                - Health check and server status
  POST   /api/auth/session      - Sync Firebase ID token into an Express session
  DELETE /api/auth/session      - Clear the current Express session
  GET    /projects              - List all projects
  POST   /projects              - Add new project
  DELETE /projects/:projectId   - Remove project
  GET    /session?projectId=ID  - Get current session info
  POST   /enhance?projectId=ID  - Send message { "message": "your text" }
  GET    /history?projectId=ID  - Get chat history for current session
  POST   /session/clear?projectId=ID - Clear current session
  POST   /cache/refresh?projectId=ID - Refresh project context cache
  POST   /shutdown              - Gracefully shutdown the server

Authentication: Firebase ID token via Authorization: Bearer header (or a signed-in browser session)

Session configuration:
  - Max age: ${SESSION_MAX_AGE / (60 * 60 * 1000)} hours
  - Cleanup interval: ${CLEANUP_INTERVAL / (60 * 1000)} minutes
  - Context caching: ENABLED (90% cost savings)
  - Model: gemini-2.5-flash
  - History logging: ${HISTORY_DIR ? `ENABLED (${HISTORY_DIR})` : 'DISABLED'}

Projects:
${Array.from(projects.values()).map(p => `  - ${p.id}: ${p.gitUrl}`).join('\n') || '  (none configured - use POST /projects to add)'}

Ready to accept requests!
    `);
    });
}

// Start the server - will die if initialization fails
startServer().catch(error => {
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║  FATAL: Server startup failed                                 ║');
    console.error('╚════════════════════════════════════════════════════════════════╝\n');
    console.error(error);
    console.error('\nServer cannot start without project initialization.');
    console.error('Check your GEMINI_API_KEY and CHECKOUT_DIR configuration.\n');
    process.exit(1);
});

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Project, ProjectConfig, ProjectsConfigFile } from './types.js';

const PROJECTS_CONFIG_FILE = 'projects.json';

/**
 * Build an authenticated Git URL by injecting an access token
 * Only applies to HTTPS URLs; SSH URLs are returned unchanged
 */
export function buildAuthenticatedGitUrl(gitUrl: string, accessToken?: string): string {
    // If no token provided, return original URL
    if (!accessToken) {
        return gitUrl;
    }

    // SSH URLs don't need token injection
    if (gitUrl.startsWith('git@')) {
        return gitUrl;
    }

    try {
        const url = new URL(gitUrl);

        // Manually construct the authenticated URL
        // For fine-grained tokens (github_pat_*), GitHub recommends just the token without username
        // Format: https://TOKEN@github.com/user/repo.git
        const protocol = url.protocol; // e.g., "https:"
        const host = url.host; // e.g., "github.com"
        const pathname = url.pathname; // e.g., "/user/repo.git"

        const authUrl = `${protocol}//${accessToken}@${host}${pathname}`;
        console.log(`[DEBUG] Built authenticated URL (token-only format)`);
        return authUrl;
    } catch {
        // If URL parsing fails, return original
        console.warn(`[!] Failed to parse Git URL for token injection: ${gitUrl}`);
        return gitUrl;
    }
}

/**
 * Extract the base Git URL without any embedded tokens
 * Used for normalizing and storing clean URLs
 */
export function cleanGitUrl(gitUrl: string): string {
    // If it's SSH format, return as-is
    if (gitUrl.startsWith('git@')) {
        return gitUrl;
    }

    try {
        const url = new URL(gitUrl);
        // Remove username and password
        url.username = '';
        url.password = '';
        return url.toString();
    } catch {
        // If URL parsing fails, return original
        return gitUrl;
    }
}

/**
 * Normalize a git URL to a canonical form (user/repo format)
 * Handles both HTTPS and SSH git URLs
 * Strips out any embedded tokens for consistent ID generation
 */
function normalizeGitUrl(gitUrl: string): string {
    // First, clean any embedded tokens
    let normalized = cleanGitUrl(gitUrl);

    // Remove .git suffix if present
    normalized = normalized.replace(/\.git$/, '');

    // Convert SSH format (git@github.com:user/repo) to HTTPS-like format
    normalized = normalized.replace(/^git@([^:]+):/, 'https://$1/');

    // Remove protocol prefix to get just domain/user/repo
    normalized = normalized.replace(/^https?:\/\//, '');

    return normalized.toLowerCase();
}

/**
 * Generate a unique project ID from a git URL and branch using SHA-256 hash
 * Different git URL formats (HTTPS vs SSH) for the same repo will generate the same ID
 * Different branches will generate different IDs
 */
export function generateProjectId(gitUrl: string, branch: string = 'main'): string {
    const normalizedUrl = normalizeGitUrl(gitUrl);
    const composite = `${normalizedUrl}#${branch}`;
    return createHash('sha256').update(composite).digest('hex').substring(0, 12);
}

/**
 * Load projects configuration from JSON file
 */
export async function loadProjectsConfig(configPath: string = PROJECTS_CONFIG_FILE): Promise<ProjectsConfigFile> {
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(data);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // Config file doesn't exist, return empty config
            return { projects: [] };
        }
        throw error;
    }
}

/**
 * Save projects configuration to JSON file
 */
export async function saveProjectsConfig(
    config: ProjectsConfigFile,
    configPath: string = PROJECTS_CONFIG_FILE,
): Promise<void> {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Clone a git repository to the specified path
 */
export async function cloneRepository(
    gitUrl: string,
    targetPath: string,
    branch: string = 'main',
    accessToken?: string,
): Promise<void> {
    try {
        // Check if directory already exists
        try {
            await fs.access(targetPath);
            console.log(`Project directory already exists: ${targetPath}`);
            return;
        } catch {
            // Directory doesn't exist, proceed with clone
        }

        // Create parent directory if it doesn't exist
        const parentDir = path.dirname(targetPath);
        await fs.mkdir(parentDir, { recursive: true });

        // Build authenticated URL if token provided
        const authGitUrl = buildAuthenticatedGitUrl(gitUrl, accessToken);

        // Clone the repository (use authenticated URL)
        console.log(`Cloning ${cleanGitUrl(gitUrl)} to ${targetPath}...`);
        try {
            execSync(`git clone --branch ${branch} --depth 1 "${authGitUrl}" "${targetPath}"`, {
                stdio: 'pipe',
                encoding: 'utf-8',
            });
            console.log(`Successfully cloned ${cleanGitUrl(gitUrl)}`);
        } catch (cloneError: any) {
            const errorOutput = cloneError.stderr || cloneError.stdout || cloneError.message;
            console.error(`[ERROR] Git clone failed: ${errorOutput}`);
            throw new Error(`Failed to clone repository ${cleanGitUrl(gitUrl)}: ${errorOutput}`);
        }
    } catch (error: any) {
        throw error;
    }
}

/**
 * Pull latest changes for a project
 */
export async function updateRepository(projectPath: string): Promise<void> {
    try {
        console.log(`Updating repository at ${projectPath}...`);
        execSync('git pull', {
            cwd: projectPath,
            stdio: 'inherit',
        });
        console.log(`Successfully updated repository`);
    } catch (error: any) {
        throw new Error(`Failed to update repository at ${projectPath}: ${error.message}`);
    }
}

/**
 * Initialize projects from configuration file
 */
export async function initializeProjects(checkoutDir: string): Promise<Map<string, Project>> {
    const projects = new Map<string, Project>();

    // Load configuration
    const config = await loadProjectsConfig();

    // Ensure checkout directory exists
    await fs.mkdir(checkoutDir, { recursive: true });

    // Initialize each project
    for (const projectConfig of config.projects) {
        const branch = projectConfig.branch || 'main';
        // Clean the Git URL before generating ID (removes any embedded tokens)
        const cleanUrl = cleanGitUrl(projectConfig.gitUrl);
        const projectId = generateProjectId(cleanUrl, branch);
        const projectPath = path.join(checkoutDir, projectId);

        try {
            // Clone repository if needed (pass accessToken if available)
            if (projectConfig.accessToken) {
                console.log(`[DEBUG] Project ${projectId} has access token (length: ${projectConfig.accessToken.length})`);
            }
            await cloneRepository(cleanUrl, projectPath, branch, projectConfig.accessToken);

            // Create project object
            const project: Project = {
                id: projectId,
                gitUrl: cleanUrl,
                branch,
                path: projectPath,
                accessToken: projectConfig.accessToken,
                lastUpdated: new Date(),
                status: 'ready',  // Existing projects that loaded successfully are ready
            };

            projects.set(projectId, project);
            console.log(`Initialized project ${projectId}: ${cleanUrl}`);
        } catch (error: any) {
            // If clone fails, still add the project but mark it as error
            console.error(`[ERROR] Failed to initialize project ${projectId}: ${error.message}`);

            const project: Project = {
                id: projectId,
                gitUrl: cleanUrl,
                branch,
                path: projectPath,
                accessToken: projectConfig.accessToken,
                lastUpdated: new Date(),
                status: 'error',
                errorMessage: error.message || 'Failed to clone repository',
            };

            projects.set(projectId, project);
            console.log(`Project ${projectId} added with error status`);
        }
    }

    return projects;
}

/**
 * Add a new project
 */
export async function addProject(
    gitUrl: string,
    checkoutDir: string,
    branch: string = 'main',
    accessToken?: string,
): Promise<Project> {
    // Clean the Git URL (remove any embedded tokens)
    const cleanUrl = cleanGitUrl(gitUrl);

    // Generate project ID (includes branch)
    const projectId = generateProjectId(cleanUrl, branch);
    const projectPath = path.join(checkoutDir, projectId);

    // Load existing configuration
    const config = await loadProjectsConfig();

    // Check if project already exists (same URL and branch combination)
    const exists = config.projects.some(p => {
        const existingBranch = p.branch || 'main';
        const existingCleanUrl = cleanGitUrl(p.gitUrl);
        return generateProjectId(existingCleanUrl, existingBranch) === projectId;
    });
    if (exists) {
        throw new Error(`Project with git URL ${cleanUrl} and branch ${branch} already exists`);
    }

    // Add to configuration FIRST (before cloning)
    const projectConfig: ProjectConfig = {
        gitUrl: cleanUrl,
        branch,
    };
    if (accessToken) {
        projectConfig.accessToken = accessToken;
    }
    config.projects.push(projectConfig);
    await saveProjectsConfig(config);

    // Create project object with cloning status
    const project: Project = {
        id: projectId,
        gitUrl: cleanUrl,
        branch,
        path: projectPath,
        accessToken,
        lastUpdated: new Date(),
        status: 'cloning',
    };

    // Try to clone repository (don't throw error, just update status)
    try {
        await cloneRepository(cleanUrl, projectPath, branch, accessToken);
        project.status = 'ready';
    } catch (error) {
        console.error(`[ERROR] Failed to clone project ${projectId}:`, error);
        project.status = 'error';
        project.errorMessage = error instanceof Error ? error.message : 'Unknown error during clone';
    }

    return project;
}

/**
 * Remove a project
 */
export async function removeProject(projectId: string, project: Project): Promise<void> {
    // Load configuration
    const config = await loadProjectsConfig();

    // Remove from configuration
    config.projects = config.projects.filter(p => {
        const branch = p.branch || 'main';
        const cleanUrl = cleanGitUrl(p.gitUrl);
        return generateProjectId(cleanUrl, branch) !== projectId;
    });
    await saveProjectsConfig(config);

    // Optionally delete the cloned directory (commented out for safety)
    // await fs.rm(project.path, { recursive: true, force: true });

    console.log(`Removed project ${projectId}`);
}

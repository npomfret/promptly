import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Project, ProjectConfig, ProjectsConfigFile } from './types.js';

const PROJECTS_CONFIG_FILE = 'projects.json';

/**
 * Normalize a git URL to a canonical form (user/repo format)
 * Handles both HTTPS and SSH git URLs
 */
function normalizeGitUrl(gitUrl: string): string {
    // Remove .git suffix if present
    let normalized = gitUrl.replace(/\.git$/, '');

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
export async function cloneRepository(gitUrl: string, targetPath: string, branch: string = 'main'): Promise<void> {
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

        // Clone the repository
        console.log(`Cloning ${gitUrl} to ${targetPath}...`);
        execSync(`git clone --branch ${branch} --depth 1 "${gitUrl}" "${targetPath}"`, {
            stdio: 'inherit',
        });
        console.log(`Successfully cloned ${gitUrl}`);
    } catch (error: any) {
        throw new Error(`Failed to clone repository ${gitUrl}: ${error.message}`);
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
        const projectId = generateProjectId(projectConfig.gitUrl, branch);
        const projectPath = path.join(checkoutDir, projectId);

        // Clone repository if needed
        await cloneRepository(projectConfig.gitUrl, projectPath, branch);

        // Create project object
        const project: Project = {
            id: projectId,
            gitUrl: projectConfig.gitUrl,
            branch,
            path: projectPath,
            lastUpdated: new Date(),
            status: 'ready',  // Existing projects that loaded successfully are ready
        };

        projects.set(projectId, project);
        console.log(`Initialized project ${projectId}: ${projectConfig.gitUrl}`);
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
): Promise<Project> {
    // Generate project ID (includes branch)
    const projectId = generateProjectId(gitUrl, branch);
    const projectPath = path.join(checkoutDir, projectId);

    // Load existing configuration
    const config = await loadProjectsConfig();

    // Check if project already exists (same URL and branch combination)
    const exists = config.projects.some(p => {
        const existingBranch = p.branch || 'main';
        return generateProjectId(p.gitUrl, existingBranch) === projectId;
    });
    if (exists) {
        throw new Error(`Project with git URL ${gitUrl} and branch ${branch} already exists`);
    }

    // Add to configuration FIRST (before cloning)
    config.projects.push({ gitUrl, branch });
    await saveProjectsConfig(config);

    // Create project object with cloning status
    const project: Project = {
        id: projectId,
        gitUrl,
        branch,
        path: projectPath,
        lastUpdated: new Date(),
        status: 'cloning',
    };

    // Try to clone repository (don't throw error, just update status)
    try {
        await cloneRepository(gitUrl, projectPath, branch);
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
        return generateProjectId(p.gitUrl, branch) !== projectId;
    });
    await saveProjectsConfig(config);

    // Optionally delete the cloned directory (commented out for safety)
    // await fs.rm(project.path, { recursive: true, force: true });

    console.log(`Removed project ${projectId}`);
}

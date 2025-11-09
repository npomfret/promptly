import { execSync } from 'child_process';
import { buildAuthenticatedGitUrl } from './projectManager.js';
import type { Project } from './types.js';

/**
 * Set remote URL with authentication if needed
 */
function setAuthenticatedRemote(project: Project): void {
    if (!project.accessToken) {
        return; // No token, no need to update remote
    }

    const authUrl = buildAuthenticatedGitUrl(project.gitUrl, project.accessToken);
    try {
        execSync(`git remote set-url origin "${authUrl}"`, {
            cwd: project.path,
            stdio: 'pipe',
        });
    } catch (error) {
        console.warn(`[!] Failed to set authenticated remote for ${project.id}:`, error instanceof Error ? error.message : 'Unknown error');
    }
}

/**
 * Check if a project has updates from remote repository
 * Returns true if remote has changes not yet pulled
 */
export async function checkForUpdates(project: Project): Promise<boolean> {
    try {
        // Set authenticated remote URL if token is available
        setAuthenticatedRemote(project);

        // Fetch latest from remote (doesn't modify working tree)
        execSync('git fetch origin', {
            cwd: project.path,
            stdio: 'pipe',
            timeout: 30000, // 30 second timeout
        });

        // Get local HEAD commit
        const localCommit = execSync('git rev-parse HEAD', {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe',
        })
            .trim();

        // Get remote HEAD commit for the tracked branch
        const remoteCommit = execSync(`git rev-parse origin/${project.branch}`, {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe',
        })
            .trim();

        // If commits differ, there are updates
        return localCommit !== remoteCommit;
    } catch (error) {
        console.error(`[ERROR] Failed to check updates for project ${project.id}:`, error instanceof Error ? error.message : 'Unknown error');
        return false;
    }
}

/**
 * Pull latest changes from remote repository
 * Returns true if pull was successful
 */
export async function pullUpdates(project: Project): Promise<boolean> {
    try {
        console.log(`[...] Pulling updates for project ${project.id}...`);

        // Set authenticated remote URL if token is available
        setAuthenticatedRemote(project);

        execSync(`git pull origin ${project.branch}`, {
            cwd: project.path,
            stdio: 'pipe',
            timeout: 60000, // 60 second timeout
        });

        // Update last updated timestamp
        project.lastUpdated = new Date();

        console.log(`[✓] Successfully pulled updates for project ${project.id}`);
        return true;
    } catch (error) {
        console.error(`[ERROR] Failed to pull updates for project ${project.id}:`, error instanceof Error ? error.message : 'Unknown error');
        return false;
    }
}

/**
 * Start watching all projects for updates
 * When changes are detected, pull them and mark cache as stale
 */
export function startWatching(
    projects: Map<string, Project>,
    intervalMinutes: number = 1,
): NodeJS.Timeout {
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[✓] Started repository watcher (checking every ${intervalMinutes} minute(s))`);

    const watchInterval = setInterval(async () => {
        for (const [projectId, project] of projects.entries()) {
            try {
                const hasUpdates = await checkForUpdates(project);

                if (hasUpdates) {
                    console.log(`[!] Updates detected for project ${projectId}`);

                    const pullSuccess = await pullUpdates(project);

                    if (pullSuccess) {
                        // Mark cache as stale instead of refreshing immediately
                        project.cacheStale = true;
                        console.log(`[✓] Project ${projectId} updated and marked stale (cache will refresh on next request)`);
                    }
                }
            } catch (error) {
                console.error(`[ERROR] Repo watcher failed for project ${projectId}:`, error instanceof Error ? error.message : 'Unknown error');
            }
        }
    }, intervalMs);

    return watchInterval;
}

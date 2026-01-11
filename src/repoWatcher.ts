import { getActiveGitProcessCount, runGitCommand } from './gitRunner.js';
import { buildAuthenticatedGitUrl } from './projectManager.js';
import type { Project } from './types.js';

/**
 * Set remote URL with authentication if needed
 */
async function setAuthenticatedRemote(project: Project): Promise<void> {
    if (!project.accessToken) {
        return; // No token, no need to update remote
    }

    const authUrl = buildAuthenticatedGitUrl(project.gitUrl, project.accessToken);
    try {
        await runGitCommand(['remote', 'set-url', 'origin', authUrl], {
            cwd: project.path,
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
        await setAuthenticatedRemote(project);

        // Fetch latest from remote (doesn't modify working tree)
        await runGitCommand(['fetch', 'origin'], {
            cwd: project.path,
            timeoutMs: 30000, // 30 second timeout
        });

        // Get local HEAD commit
        const localCommit = (await runGitCommand(['rev-parse', 'HEAD'], {
            cwd: project.path,
        })).stdout.trim();

        // Get remote HEAD commit for the tracked branch
        const remoteCommit = (await runGitCommand(['rev-parse', `origin/${project.branch}`], {
            cwd: project.path,
        })).stdout.trim();

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
        await setAuthenticatedRemote(project);

        await runGitCommand(['pull', 'origin', project.branch], {
            cwd: project.path,
            timeoutMs: 60000, // 60 second timeout
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
    let isRunning = false;

    console.log(`[✓] Started repository watcher (checking every ${intervalMinutes} minute(s))`);

    const watchInterval = setInterval(async () => {
        if (isRunning) {
            console.warn('[!] Repo watcher tick skipped because previous run is still in progress');
            return;
        }
        isRunning = true;
        const startProcessCount = getActiveGitProcessCount();
        console.log(`[DEBUG] Repo watcher starting (${startProcessCount} active git processes)`);
        try {
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
        } finally {
            isRunning = false;
            const endProcessCount = getActiveGitProcessCount();
            console.log(`[DEBUG] Repo watcher finished (${endProcessCount} active git processes)`);
        }
    }, intervalMs);

    return watchInterval;
}

import { spawn, ChildProcess } from 'child_process';

// Global tracking of active git processes for cleanup
const activeGitProcesses = new Set<ChildProcess>();
let shutdownHandlersRegistered = false;

/**
 * Register cleanup handlers to kill all git processes on shutdown
 */
function registerShutdownHandlers(): void {
    if (shutdownHandlersRegistered) return;
    shutdownHandlersRegistered = true;

    const cleanup = () => {
        console.log(`[CLEANUP] Killing ${activeGitProcesses.size} active git processes...`);
        for (const child of activeGitProcesses) {
            try {
                child.kill('SIGTERM');
                // Force kill after 2 seconds if still alive
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 2000);
            } catch (error) {
                // Process might already be dead
            }
        }
        activeGitProcesses.clear();
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('exit', cleanup);
}

export interface GitCommandOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    /**
     * Kill the git process if it exceeds this many milliseconds.
     * Defaults to no timeout.
     */
    timeoutMs?: number;
    /**
     * Maximum combined stdout length in bytes before aborting.
     * Defaults to 10MB when output is captured.
     */
    maxBufferBytes?: number;
    /**
     * When set to 'inherit', git output streams are piped directly to the parent.
     * Defaults to capturing stdout/stderr.
     */
    stdio?: 'pipe' | 'inherit';
}

export interface GitCommandResult {
    stdout: string;
    stderr: string;
}

export class GitCommandError extends Error {
    constructor(
        message: string,
        public readonly args: string[],
        public readonly code: number | null,
        public readonly signal: NodeJS.Signals | null,
        public readonly stdout: string,
        public readonly stderr: string,
    ) {
        super(message);
        this.name = 'GitCommandError';
    }
}

/**
 * Get the number of currently active git processes
 * Useful for debugging and monitoring
 */
export function getActiveGitProcessCount(): number {
    return activeGitProcesses.size;
}

/**
 * Spawn a git process and resolve when it exits.
 * Ensures we always wait for exit/close, preventing zombie processes.
 */
export async function runGitCommand(args: string[], options: GitCommandOptions = {}): Promise<GitCommandResult> {
    // Register shutdown handlers on first use
    registerShutdownHandlers();

    const stdio = options.stdio ?? 'pipe';
    const shouldCapture = stdio === 'pipe';
    const maxBuffer = options.maxBufferBytes ?? 10 * 1024 * 1024; // 10MB default

    return await new Promise<GitCommandResult>((resolve, reject) => {
        const child = spawn('git', args, {
            cwd: options.cwd,
            env: options.env,
            stdio: shouldCapture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
        });

        // Track this process globally for cleanup on shutdown
        activeGitProcesses.add(child);

        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;
        let resolved = false;

        const cleanup = (): void => {
            resolved = true;

            // Remove from active processes
            activeGitProcesses.delete(child);

            // Destroy streams to ensure 'close' event fires
            if (child.stdout) {
                child.stdout.removeAllListeners();
                child.stdout.destroy();
            }
            if (child.stderr) {
                child.stderr.removeAllListeners();
                child.stderr.destroy();
            }
            if (child.stdin) {
                child.stdin.destroy();
            }
        };

        const abortWithError = (error: Error): void => {
            if (resolved) return;
            cleanup();
            // Ensure the process is killed
            try {
                if (!child.killed) {
                    child.kill('SIGTERM');
                }
            } catch {
                // Process might already be dead
            }
            reject(error);
        };

        if (shouldCapture && child.stdout) {
            child.stdout.setEncoding('utf-8');
            child.stdout.on('data', (chunk: string) => {
                stdoutBytes += chunk.length;
                if (stdoutBytes > maxBuffer) {
                    child.kill('SIGTERM');
                    abortWithError(new Error(`git ${args.join(' ')} output exceeded ${maxBuffer} bytes on stdout`));
                    return;
                }
                stdout += chunk;
            });
        }

        if (shouldCapture && child.stderr) {
            child.stderr.setEncoding('utf-8');
            child.stderr.on('data', (chunk: string) => {
                stderrBytes += chunk.length;
                if (stderrBytes > maxBuffer) {
                    child.kill('SIGTERM');
                    abortWithError(new Error(`git ${args.join(' ')} output exceeded ${maxBuffer} bytes on stderr`));
                    return;
                }
                stderr += chunk;
            });
        }

        const timeoutMs = options.timeoutMs;
        let timeoutHandle: NodeJS.Timeout | undefined;
        let killTimeoutHandle: NodeJS.Timeout | undefined;

        if (timeoutMs && timeoutMs > 0) {
            timeoutHandle = setTimeout(() => {
                if (resolved) return; // Already done, no need to timeout
                timedOut = true;

                try {
                    child.kill('SIGTERM');
                } catch {
                    // Process might already be dead
                }

                // Force kill if it refuses to exit after 5 seconds
                // Only if the process hasn't been cleaned up yet
                killTimeoutHandle = setTimeout(() => {
                    if (!resolved && !child.killed) {
                        try {
                            child.kill('SIGKILL');
                        } catch {
                            // Process might already be dead
                        }
                    }
                }, 5000);
            }, timeoutMs);
        }

        const clearTimeouts = () => {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = undefined;
            }
            if (killTimeoutHandle) {
                clearTimeout(killTimeoutHandle);
                killTimeoutHandle = undefined;
            }
        };

        child.once('error', (error: Error) => {
            clearTimeouts();
            abortWithError(error);
        });

        child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
            clearTimeouts();
            if (resolved) return;
            cleanup();

            if (code === 0) {
                resolve({
                    stdout: shouldCapture ? stdout : '',
                    stderr: shouldCapture ? stderr : '',
                });
                return;
            }

            const baseMessage = timedOut
                ? `git ${args.join(' ')} timed out after ${timeoutMs}ms`
                : `git ${args.join(' ')} exited with code ${code}${signal ? ` (signal ${signal})` : ''}`;

            reject(new GitCommandError(baseMessage, args, code, signal, stdout, stderr));
        });
    });
}

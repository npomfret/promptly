import { spawn } from 'child_process';

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
 * Spawn a git process and resolve when it exits.
 * Ensures we always wait for exit/close, preventing zombie processes.
 */
export async function runGitCommand(args: string[], options: GitCommandOptions = {}): Promise<GitCommandResult> {
    const stdio = options.stdio ?? 'pipe';
    const shouldCapture = stdio === 'pipe';
    const maxBuffer = options.maxBufferBytes ?? 10 * 1024 * 1024; // 10MB default

    return await new Promise<GitCommandResult>((resolve, reject) => {
        const child = spawn('git', args, {
            cwd: options.cwd,
            env: options.env,
            stdio: shouldCapture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
        });

        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let timedOut = false;
        let resolved = false;

        const cleanup = (): void => {
            resolved = true;
            if (child.stdout) {
                child.stdout.removeAllListeners();
            }
            if (child.stderr) {
                child.stderr.removeAllListeners();
            }
        };

        const abortWithError = (error: Error): void => {
            if (resolved) return;
            cleanup();
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
        if (timeoutMs && timeoutMs > 0) {
            timeoutHandle = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                // Force kill if it refuses to exit
                setTimeout(() => child.kill('SIGKILL'), 5000).unref();
            }, timeoutMs);
        }

        child.once('error', (error: Error) => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            abortWithError(error);
        });

        child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
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

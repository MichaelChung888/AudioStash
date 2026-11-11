import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export class ProcessError extends Error {
  override name = 'ProcessError';
  readonly command: string;
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(command: string, exitCode: number | null, stderr: string) {
    super(`${command} exited with code ${exitCode}: ${lastLine(stderr) ?? 'no output'}`);
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export interface RunOptions {
  input?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onLine?: (line: string) => void;
}

// Only the end of stderr is kept: it holds the error, and yt-dlp can print megabytes of progress.
const MAX_STDERR = 64 * 1024;

// Runs a command without a shell, so arguments such as video titles are never
// interpreted. Rejects with ProcessError on a non-zero exit.
// onLine receives every line of stdout and stderr as it arrives.
export function run(command: string, args: readonly string[], options: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  const signals = [options.signal, options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined].filter((s) => s !== undefined);
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], signal: signals.length > 0 ? AbortSignal.any(signals) : undefined });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-MAX_STDERR);
  });
  if (options.onLine) {
    createInterface({ input: child.stdout }).on('line', options.onLine);
    createInterface({ input: child.stderr }).on('line', options.onLine);
  }
  child.stdin.end(options.input);

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new ProcessError(command, code, stderr))));
  });
}

export function lastLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
}

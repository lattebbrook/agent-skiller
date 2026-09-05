/**
 * Runs one Code node's script in a subprocess with a wall-clock timeout, a
 * throwaway working directory and a scrubbed environment. Python applies
 * rlimits through sandbox/runner.py; Node gets a heap cap.
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config.js';

export interface SandboxRequest {
  language: string;
  code: string;
  /** Written to the script's stdin as JSON. */
  input: unknown;
  timeoutSeconds?: number;
}

export interface SandboxResult {
  language: string;
  exitStatus: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  /** stdout parsed as JSON when it is JSON, else the trimmed text. */
  output: unknown;
  limits: { timeoutSeconds: number; maxMemoryMb: number };
}

const MAX_CAPTURED_OUTPUT = 4000;

export async function runCode(request: SandboxRequest): Promise<SandboxResult> {
  const language = normalizeLanguage(request.language);
  const timeoutSeconds = Math.min(Math.max(1, request.timeoutSeconds ?? config.codeTimeoutSeconds), config.codeMaxTimeoutSeconds);
  const maxMemoryMb = config.codeMemoryMb;
  const workDir = await fs.mkdtemp(join(tmpdir(), 'skiller-'));
  const scriptPath = join(workDir, language === 'python' ? 'main.py' : 'main.js');
  await fs.writeFile(scriptPath, request.code, 'utf8');

  const command =
    language === 'python'
      ? { bin: config.pythonBin, args: ['-I', config.sandboxRunner, scriptPath, String(maxMemoryMb), String(timeoutSeconds)] }
      : { bin: config.nodeBin, args: ['--disallow-code-generation-from-strings', `--max-old-space-size=${maxMemoryMb}`, scriptPath] };

  const startedAt = Date.now();
  const result = await new Promise<Omit<SandboxResult, 'output' | 'limits' | 'language'>>((resolvePromise) => {
    const child = spawn(command.bin, command.args, {
      cwd: workDir,
      env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: workDir, LANG: 'C.UTF-8', TMPDIR: workDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutSeconds * 1000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_CAPTURED_OUTPUT * 4) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_CAPTURED_OUTPUT * 4) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ exitStatus: -1, stdout, stderr: `${stderr}\n${error.message}`.trim(), durationMs: Date.now() - startedAt, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ exitStatus: code ?? -1, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(request.input ?? null));
  });

  await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  const stdout = truncate(result.stdout);
  const stderr = truncate(result.stderr);
  return {
    language,
    ...result,
    stdout,
    stderr,
    output: parseOutput(stdout),
    limits: { timeoutSeconds, maxMemoryMb },
  };
}

export function normalizeLanguage(language: string): 'python' | 'javascript' {
  const lower = language.trim().toLowerCase();
  if (lower === 'js' || lower === 'javascript' || lower === 'node') return 'javascript';
  return 'python';
}

function truncate(text: string): string {
  return text.length > MAX_CAPTURED_OUTPUT ? `${text.slice(0, MAX_CAPTURED_OUTPUT)}\n…[truncated]` : text;
}

function parseOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

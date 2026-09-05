import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// dist/config.js and src/config.ts both sit one level below server/.
const serverRoot = resolve(here, '..');
export const repoRoot = resolve(serverRoot, '..');

export const config = {
  port: Number(process.env['SKILLER_PORT'] ?? 4280),
  host: process.env['SKILLER_HOST'] ?? '127.0.0.1',
  workspaceDir: resolve(process.env['SKILLER_WORKSPACE'] ?? resolve(repoRoot, 'workspace')),
  examplesDir: resolve(repoRoot, 'examples'),
  webDist: resolve(repoRoot, 'web', 'dist'),
  sandboxRunner: resolve(serverRoot, 'sandbox', 'runner.py'),
  pythonBin: process.env['SKILLER_PYTHON'] ?? 'python3',
  nodeBin: process.env['SKILLER_NODE'] ?? process.execPath,
  codeTimeoutSeconds: Number(process.env['SKILLER_CODE_TIMEOUT'] ?? 10),
  codeMaxTimeoutSeconds: 60,
  codeMemoryMb: Number(process.env['SKILLER_CODE_MEMORY_MB'] ?? 256),
};

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { config } from './config.js';

// A fresh workspace gets the examples so the editor never opens empty.
async function seedExamples(): Promise<void> {
  await fs.mkdir(config.workspaceDir, { recursive: true });
  const existing = (await fs.readdir(config.workspaceDir)).filter((name) => !name.startsWith('.'));
  if (existing.length > 0) return;
  const examples = await fs.readdir(config.examplesDir).catch(() => [] as string[]);
  await fs.mkdir(join(config.workspaceDir, 'Example'), { recursive: true });
  for (const name of examples) {
    if (!name.endsWith('.md')) continue;
    await fs.copyFile(join(config.examplesDir, name), join(config.workspaceDir, 'Example', name));
  }
}

await seedExamples();
const app = await buildApp({ workspaceDir: config.workspaceDir, webDist: config.webDist, logger: true });
await app.listen({ port: config.port, host: config.host });
app.log.info(`AgentSkiller on http://${config.host}:${config.port}  (MCP at /mcp, workspace ${config.workspaceDir})`);

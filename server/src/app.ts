import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { registerApiRoutes } from './api/routes.js';
import { registerMcpRoutes } from './mcp/http.js';
import { RunService } from './runs/RunService.js';
import { runCode, type SandboxRequest, type SandboxResult } from './sandbox/run.js';
import { FileStore } from './workspace/files.js';
import { SettingsStore } from './settings/store.js';

export interface AppOptions {
  workspaceDir: string;
  webDist?: string;
  sandbox?: (request: SandboxRequest) => Promise<SandboxResult>;
  logger?: boolean;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 8 * 1024 * 1024 });
  await app.register(cors, { origin: true });

  const files = new FileStore(options.workspaceDir);
  await files.init();
  const sandbox = options.sandbox ?? runCode;
  const runs = new RunService(files, sandbox, join(options.workspaceDir, '.runs'));
  const settings = new SettingsStore(options.workspaceDir);

  registerApiRoutes(app, { files, runs, sandbox, settings });
  registerMcpRoutes(app, { files, runs, sandbox });

  if (options.webDist && existsSync(options.webDist)) {
    // wildcard: true serves whatever is in dist right now, so a rebuilt bundle needs no restart.
    await app.register(fastifyStatic, { root: options.webDist, prefix: '/', wildcard: true });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api') || request.raw.url?.startsWith('/mcp')) return reply.status(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}

#!/usr/bin/env node
/**
 * MCP over stdio: point any MCP client at `node server/dist/mcp-stdio.js`.
 * Uses the same workspace folder as the HTTP server.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join } from 'node:path';
import { config } from './config.js';
import { runCode } from './sandbox/run.js';
import { RunService } from './runs/RunService.js';
import { FileStore } from './workspace/files.js';
import { buildMcpServer } from './mcp/tools.js';

const files = new FileStore(config.workspaceDir);
await files.init();
const runs = new RunService(files, runCode, join(config.workspaceDir, '.runs'));
const server = buildMcpServer({ files, runs, sandbox: runCode });
await server.connect(new StdioServerTransport());

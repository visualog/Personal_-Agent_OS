import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect } from 'vite';
import {
  getCommandCenterDemoRuntime,
  resetCommandCenterDemoRuntime,
} from './scripts/command-center-demo-runtime.js';

function readRequestBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function commandCenterDemoApiPlugin() {
  return {
    name: 'command-center-demo-api',
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';

        if (req.method === 'GET' && pathname === '/api/command-center/state') {
          const runtime = await getCommandCenterDemoRuntime();
          const snapshot = await runtime.getSnapshot();
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(snapshot));
          return;
        }

        if (req.method === 'POST' && pathname === '/api/command-center/reset') {
          const runtime = await resetCommandCenterDemoRuntime();
          const snapshot = await runtime.getSnapshot();
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(snapshot));
          return;
        }

        if (req.method === 'GET' && pathname === '/api/remote/tasks') {
          const runtime = await getCommandCenterDemoRuntime();
          const tasks = await runtime.listRemoteTasks();
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ tasks }));
          return;
        }

        if (req.method === 'GET' && pathname.startsWith('/api/remote/tasks/')) {
          const taskId = pathname.split('/').at(-1);
          if (!taskId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'task id required' }));
            return;
          }

          const runtime = await getCommandCenterDemoRuntime();
          const detail = await runtime.getRemoteTask(taskId);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ task: detail }));
          return;
        }

        if (req.method === 'POST' && pathname === '/api/remote/commands') {
          const rawBody = await readRequestBody(req);
          const body = rawBody
            ? JSON.parse(rawBody) as { text?: string; actor_id?: string; channel?: 'telegram' | 'web' | 'cli' }
            : {};

          if (!body.text || !body.actor_id) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'text and actor_id required' }));
            return;
          }

          const runtime = await getCommandCenterDemoRuntime();
          const receipt = await runtime.submitRemoteCommand({
            text: body.text,
            actor_id: body.actor_id,
            channel: body.channel ?? 'web',
          });
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(receipt));
          return;
        }

        if (req.method === 'POST' && pathname.startsWith('/api/command-center/approvals/')) {
          const approvalId = pathname.split('/').at(-1);
          if (!approvalId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'approval id required' }));
            return;
          }

          const rawBody = await readRequestBody(req);
          const body = rawBody ? JSON.parse(rawBody) as { action?: string } : {};
          if (
            body.action !== 'approve' &&
            body.action !== 'deny' &&
            body.action !== 'request_changes' &&
            body.action !== 'cancel_task'
          ) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'unsupported action' }));
            return;
          }

          try {
            const runtime = await getCommandCenterDemoRuntime();
            const snapshot = await runtime.resolveApprovalAction(approvalId, body.action);
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(snapshot));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({
              error: error instanceof Error ? error.message : 'runtime failure',
            }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  root: 'apps/web',
  plugins: [react(), commandCenterDemoApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    outDir: '../../dist-web',
    emptyOutDir: true,
  },
});

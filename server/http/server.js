import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKILLS, EQUIPMENT, TYPES } from '../domain/catalog.js';
import { loadState, persistState } from '../infrastructure/storage.js';
import { OFFICIAL_DATASETS } from '../infrastructure/datasets.js';
import { exportScenario } from '../domain/export.js';
import { applyAction } from '../application/actions.js';
export async function startServer() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const production = process.argv.includes('--production');
  const dataDir = process.env.DATA_DIR || path.join(root, '.data');
  let state = await loadState(dataDir);
  const persist = (next) => persistState(dataDir, next);
  await persist(state);
  const clients = new Set();
  let queue = Promise.resolve();
  const vite = production
    ? null
    : await (
        await import('vite')
      ).createServer({
        root,
        server: {
          middlewareMode: true,
          hmr: { host: '127.0.0.1', port: Number(process.env.PORT || 4317) + 1000 },
        },
        appType: 'spa',
      });
  function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  async function body(req) {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 1e6) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('Некорректный JSON'), { status: 400 });
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/state' && req.method === 'GET')
        return json(res, { ...state, catalog: { skills: SKILLS, equipment: EQUIPMENT, types: TYPES } });
      if (url.pathname === '/api/datasets' && req.method === 'GET') return json(res, OFFICIAL_DATASETS);
      if (url.pathname === '/api/health') return json(res, { ok: true });
      if (url.pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        res.write(': connected\n\n');
        clients.add(res);
        const timer = setInterval(() => res.write(': heartbeat\n\n'), 20000);
        req.on('close', () => {
          clients.delete(res);
          clearInterval(timer);
        });
        return;
      }
      if (url.pathname === '/api/action' && req.method === 'POST') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host)
          return json(res, { error: 'Недопустимый источник запроса' }, 403);
        const action = await body(req);
        const work = queue.then(async () => {
          const next = await applyAction(state, action);
          await persist(next);
          state = next;
          for (const client of clients) client.write(`data: ${state.revision}\n\n`);
          return state;
        });
        queue = work.catch(() => {});
        return json(res, {
          ...(await work),
          catalog: { skills: SKILLS, equipment: EQUIPMENT, types: TYPES },
        });
      }
      if (url.pathname === '/api/export') return json(res, exportScenario(state));
      if (url.pathname.startsWith('/api/')) return json(res, { error: 'Не найдено' }, 404);
      if (vite)
        return vite.middlewares(req, res, () => {
          res.statusCode = 404;
          res.end('Not found');
        });
      const pathname = decodeURIComponent(url.pathname);
      let file = path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
      if (!file.startsWith(path.join(root, 'dist') + path.sep)) {
        res.statusCode = 403;
        return res.end();
      }
      let buffer;
      try {
        buffer = await fs.readFile(file);
      } catch {
        file = path.join(root, 'dist/index.html');
        buffer = await fs.readFile(file);
      }
      res.setHeader(
        'Content-Type',
        {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.woff2': 'font/woff2',
        }[path.extname(file)] || 'application/octet-stream',
      );
      res.end(buffer);
    } catch (error) {
      console.error(error.message);
      if (!res.headersSent)
        json(
          res,
          {
            error: error.status
              ? error.message
              : 'Не удалось выполнить действие. Подробности в журнале сервера.',
          },
          error.status || 500,
        );
      else res.end();
    }
  });
  const port = Number(process.env.PORT || 4317);
  server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Контур: http://localhost:${port}`));

  return server;
}

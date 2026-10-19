import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

function syncApiPlugin() {
  const STATE_FILE = path.resolve(__dirname, '.sync-state.json');
  let memoryState: any = null;

  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      memoryState = JSON.parse(raw);
    }
  } catch {
    memoryState = null;
  }

  return {
    name: 'vite-plugin-sync-api',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || '';
        if (url === '/api/sync' || url.startsWith('/api/sync?')) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(
              JSON.stringify({
                success: true,
                provider: 'central-server',
                payload: memoryState,
              })
            );
            return;
          }

          if (req.method === 'POST') {
            let bodyStr = '';
            req.on('data', (chunk: any) => {
              bodyStr += chunk;
            });
            req.on('end', () => {
              try {
                const body = JSON.parse(bodyStr);
                if (body && body.payload) {
                  memoryState = body.payload;
                  try {
                    fs.writeFileSync(STATE_FILE, JSON.stringify(memoryState, null, 2), 'utf-8');
                  } catch (e) {
                    console.warn('[sync-api] Could not write .sync-state.json:', e);
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 200;
                  res.end(
                    JSON.stringify({
                      success: true,
                      provider: 'central-server',
                      savedToCloud: true,
                      version: memoryState.version,
                      lastUpdated: memoryState.lastUpdated,
                    })
                  );
                  return;
                }
              } catch (parseErr) {
                console.error('[sync-api] JSON parse error:', parseErr);
              }

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 400;
              res.end(JSON.stringify({ success: false, error: 'Dữ liệu không hợp lệ' }));
            });
            return;
          }

          res.statusCode = 405;
          res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [syncApiPlugin(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});


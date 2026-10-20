import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

const CURRENT_RESET_EPOCH = '2026-10-20T10:00:00.000Z';

function mergeServerStateAdditive(existing: any, incoming: any) {
  // If incoming has an outdated resetEpoch, reject it to prevent stale data resurrection
  if (incoming && incoming.resetEpoch !== CURRENT_RESET_EPOCH) {
    return existing;
  }
  if (!existing || existing.resetEpoch !== CURRENT_RESET_EPOCH) return incoming;
  if (!incoming) return existing;

  // 1. Users additive merge
  const userMap = new Map<string, any>();
  (existing.users || []).forEach((u: any) => {
    const key = (u.username || u.id || '').trim().toLowerCase();
    if (key) userMap.set(key, u);
  });
  (incoming.users || []).forEach((u: any) => {
    const key = (u.username || u.id || '').trim().toLowerCase();
    if (!key) return;
    const prev = userMap.get(key);
    if (!prev) {
      userMap.set(key, u);
    } else {
      userMap.set(key, { ...prev, ...u });
    }
  });

  // 2. Transactions additive merge
  const trxMap = new Map<string, any>();
  (existing.transactions || []).forEach((t: any) => {
    const key = (t.id || t.code || '').trim();
    if (key) trxMap.set(key, t);
  });
  (incoming.transactions || []).forEach((t: any) => {
    const key = (t.id || t.code || '').trim();
    if (!key) return;
    const prev = trxMap.get(key);
    if (!prev) {
      trxMap.set(key, t);
    } else {
      trxMap.set(key, { ...prev, ...t });
    }
  });

  // 3. Warehouses additive merge
  const whMap = new Map<string, any>();
  (existing.warehouses || []).forEach((w: any) => {
    const key = (w.id || w.code || '').trim();
    if (key) whMap.set(key, w);
  });
  (incoming.warehouses || []).forEach((w: any) => {
    const key = (w.id || w.code || '').trim();
    if (!key) return;
    const prev = whMap.get(key);
    if (!prev) {
      whMap.set(key, w);
    } else {
      whMap.set(key, { ...prev, ...w });
    }
  });

  // 4. Items additive merge
  const itemMap = new Map<string, any>();
  (existing.items || []).forEach((i: any) => {
    const key = (i.code || i.id || '').trim().toUpperCase();
    if (key) itemMap.set(key, i);
  });
  (incoming.items || []).forEach((i: any) => {
    const key = (i.code || i.id || '').trim().toUpperCase();
    if (!key) return;
    const prev = itemMap.get(key);
    if (!prev) {
      itemMap.set(key, i);
    } else {
      itemMap.set(key, {
        ...prev,
        ...i,
        warehouseStocks: { ...(prev.warehouseStocks || {}), ...(i.warehouseStocks || {}) },
        currentStock: i.currentStock !== undefined ? i.currentStock : prev.currentStock,
      });
    }
  });

  return {
    version: Math.max(Number(existing.version) || 0, Number(incoming.version) || 0) + 1,
    lastUpdated: new Date().toISOString(),
    users: Array.from(userMap.values()),
    transactions: Array.from(trxMap.values()).sort(
      (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
    ),
    warehouses: Array.from(whMap.values()),
    items: Array.from(itemMap.values()),
    resetEpoch: CURRENT_RESET_EPOCH,
    source: incoming.source || 'server-additive-merge',
  };
}

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
            try {
              if (fs.existsSync(STATE_FILE)) {
                memoryState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
              }
            } catch {
              // keep existing memoryState
            }
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
                  if (body.cleanReset || body.payload.cleanReset) {
                    memoryState = {
                      ...body.payload,
                      resetEpoch: CURRENT_RESET_EPOCH,
                    };
                  } else {
                    // Additive merge instead of overwriting existing state
                    memoryState = mergeServerStateAdditive(memoryState, body.payload);
                  }
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
                      payload: memoryState,
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


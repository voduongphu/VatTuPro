import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { normUserKey } from './src/utils/additiveMerge.ts';
import { createSyncBackend } from './src/server/syncBackend.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const wss = new WebSocketServer({ noServer: true });

  const broadcastRaw = (payload: Record<string, unknown>) => {
    const msg = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  };

  const backend = createSyncBackend({
    isServerless: false,
    onBroadcastRaw: broadcastRaw
  });

  await backend.ensureInitialized();

  const app = backend.app;
  const store = backend.store;
  const httpServer = http.createServer(app);

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'sync:hello',
        serverRevision: store.serverRevision,
        materialsRevision: store.materialsRevision,
        activeSessions: store.activeSessions
      })
    );

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg && msg.type === 'auth:check') {
          const key = normUserKey(String(msg.userKey || ''));
          const token = String(msg.sessionToken || '').trim();
          if (!key || !token) return;

          const check = backend.validateSession({
            userKey: key,
            sessionToken: token,
            deviceId: msg.deviceId ? String(msg.deviceId) : undefined,
            deviceLabel: msg.deviceLabel ? String(msg.deviceLabel) : undefined,
            loginAt: msg.loginAt ? String(msg.loginAt) : undefined
          });

          if (!check.valid) {
            if (check.reason === 'disabled') {
              socket.send(JSON.stringify({ type: 'auth:user_disabled', userKey: key }));
            } else if (check.reason === 'replaced' && check.replacedBy) {
              const user = store.users.find((u) => normUserKey(u.username) === key);
              socket.send(
                JSON.stringify({
                  type: 'auth:session_replaced',
                  userKey: key,
                  userId: check.replacedBy.userId,
                  username: user?.username || check.replacedBy.username,
                  fullName: user?.fullName,
                  activeSessionToken: check.replacedBy.sessionToken,
                  issuedAtMs: check.replacedBy.issuedAtMs,
                  deviceId: check.replacedBy.deviceId,
                  deviceLabel: check.replacedBy.deviceLabel,
                  loginAt: check.replacedBy.loginAt
                })
              );
            } else if (check.reason === 'force_logout') {
              socket.send(
                JSON.stringify({
                  type: 'auth:session_force_logout',
                  userKey: key,
                  expiredSessionToken: token,
                  deviceLabel: check.forceLogoutBy?.deviceLabel,
                  at: check.forceLogoutBy?.at
                })
              );
            } else {
              socket.send(
                JSON.stringify({
                  type: 'auth:session_expired',
                  userKey: key,
                  expiredSessionToken: token
                })
              );
            }
          }
        }
      } catch {
        // ignore malformed ws client message
      }
    });
  });

  const isDev =
    process.env.DEV_SERVER === 'true' ||
    (process.env.NODE_ENV !== 'production' &&
      !fs.existsSync(path.join(process.cwd(), 'dist', 'index.html')));

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = (req.url || '').split('?')[0];
    if (pathname === '/api/ws-sync') {
      wss.handleUpgrade(req, socket, head, (wsClient) => {
        wss.emit('connection', wsClient, req);
      });
      return;
    }

    // Trong môi trường dev, nhường các kết nối WebSocket của Vite (vite-hmr) cho Vite server xử lý trên cùng cổng 3000
    const protocol = String(req.headers['sec-websocket-protocol'] || '');
    if (isDev && protocol.includes('vite-hmr')) {
      return;
    }

    if (!isDev) {
      socket.destroy();
    }
  });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Inventory Sync Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});

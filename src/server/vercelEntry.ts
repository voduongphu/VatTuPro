import type { IncomingMessage, ServerResponse } from 'node:http';
import { createSyncBackend } from './syncBackend.ts';

const backend = createSyncBackend({ isServerless: true });

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await backend.ensureInitialized();
  backend.app(req as any, res as any);
}

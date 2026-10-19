import { InventoryItem, Transaction, User, Warehouse } from '../types/inventory';

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';
export type CloudProvider = 'vercel-edge-config' | 'vercel-kv' | 'supabase' | 'local';

export interface CentralDataPayload {
  version: number;
  lastUpdated: string;
  items: InventoryItem[];
  transactions: Transaction[];
  warehouses: Warehouse[];
  users?: User[];
  lastUpdatedBy?: string;
  source?: string;
}

export interface SyncResult {
  success: boolean;
  payload?: CentralDataPayload;
  provider: CloudProvider;
  error?: string;
  isNewer?: boolean;
}

class CentralSyncService {
  private lastFetchedTimestamp: string | null = null;
  private currentVersion: number = 1;
  private provider: CloudProvider = 'local';

  constructor() {
    this.detectProvider();
  }

  public detectProvider(): CloudProvider {
    // Check if Supabase or Vercel KV env vars are available
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
        this.provider = 'supabase';
        return 'supabase';
      }
    }
    // Default serverless API route connects to Vercel KV on Vercel deployment
    this.provider = 'vercel-kv';
    return 'vercel-kv';
  }

  public getProvider(): CloudProvider {
    return this.provider;
  }

  /**
   * Fetch central state from serverless endpoint (/api/sync) or Supabase.
   * If remote data has a newer lastUpdated timestamp, returns it.
   */
  public async fetchLatestData(currentLastUpdated?: string): Promise<SyncResult> {
    try {
      // 1. First attempt to call the Vercel serverless /api/sync endpoint
      const response = await fetch('/api/sync', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.success && data.payload) {
          const payload = data.payload as CentralDataPayload;
          const remoteTime = new Date(payload.lastUpdated).getTime();
          const localTime = currentLastUpdated ? new Date(currentLastUpdated).getTime() : 0;
          const isNewer = isNaN(remoteTime) || remoteTime > localTime;

          this.lastFetchedTimestamp = payload.lastUpdated;
          this.currentVersion = payload.version || this.currentVersion;

          return {
            success: true,
            payload,
            provider: data.provider || 'vercel-kv',
            isNewer,
          };
        }
      }

      // If /api/sync returned 404 or running in pure client-only dev mode without active serverless backend
      return {
        success: true,
        provider: 'local',
        isNewer: false,
      };
    } catch (err: any) {
      // Graceful error handling - will fall back to local state and continue auto-polling
      return {
        success: false,
        provider: this.provider,
        error: err?.message || 'Không thể kết nối đến máy chủ đồng bộ',
      };
    }
  }

  /**
   * Push current state to central datastore (Vercel KV / Supabase)
   */
  public async pushUpdate(payload: Omit<CentralDataPayload, 'version' | 'lastUpdated'>): Promise<SyncResult> {
    const fullPayload: CentralDataPayload = {
      ...payload,
      version: this.currentVersion + 1,
      lastUpdated: new Date().toISOString(),
      source: 'web-client',
    };

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: fullPayload }),
      });

      if (response.ok) {
        const resData = await response.json();
        this.currentVersion = fullPayload.version;
        this.lastFetchedTimestamp = fullPayload.lastUpdated;
        return {
          success: true,
          payload: fullPayload,
          provider: resData.provider || 'vercel-kv',
        };
      }

      return {
        success: true,
        payload: fullPayload,
        provider: 'local',
      };
    } catch (err: any) {
      return {
        success: false,
        provider: this.provider,
        error: err?.message || 'Lỗi khi gửi dữ liệu lên máy chủ',
      };
    }
  }
}

export const centralSyncService = new CentralSyncService();

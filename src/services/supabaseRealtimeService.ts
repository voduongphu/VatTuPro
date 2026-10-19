import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { CentralDataPayload } from './centralSyncService';

export type RealtimeConnectionState = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR' | 'UNCONFIGURED';

const STORAGE_KEYS = {
  SUPABASE_URL: 'nxt_supabase_url',
  SUPABASE_KEY: 'nxt_supabase_anon_key',
};

class SupabaseRealtimeService {
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  private currentState: RealtimeConnectionState = 'UNCONFIGURED';
  private listeners: ((state: RealtimeConnectionState) => void)[] = [];
  private onDataCallback: ((payload: CentralDataPayload) => void) | null = null;

  constructor() {
    this.initClient();
  }

  public getCredentials(): { url: string; key: string } {
    let url = '';
    let key = '';

    if (typeof window !== 'undefined') {
      url = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '';
      key = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY) || '';
    }

    if (!url && typeof import.meta !== 'undefined' && import.meta.env) {
      url = import.meta.env.VITE_SUPABASE_URL || '';
    }
    if (!key && typeof import.meta !== 'undefined' && import.meta.env) {
      key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    }

    return { url, key };
  }

  public setCredentials(url: string, key: string): boolean {
    if (typeof window !== 'undefined') {
      if (url && key) {
        localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, url.trim());
        localStorage.setItem(STORAGE_KEYS.SUPABASE_KEY, key.trim());
      } else {
        localStorage.removeItem(STORAGE_KEYS.SUPABASE_URL);
        localStorage.removeItem(STORAGE_KEYS.SUPABASE_KEY);
      }
    }
    this.cleanup();
    this.initClient();
    return this.isConfigured();
  }

  public isConfigured(): boolean {
    const { url, key } = this.getCredentials();
    return Boolean(url && key);
  }

  public getConnectionState(): RealtimeConnectionState {
    return this.currentState;
  }

  public onConnectionStateChange(listener: (state: RealtimeConnectionState) => void): () => void {
    this.listeners.push(listener);
    listener(this.currentState);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private setConnectionState(state: RealtimeConnectionState) {
    this.currentState = state;
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('Error in connection state listener:', err);
      }
    });
  }

  public initClient() {
    const { url, key } = this.getCredentials();

    if (!url || !key) {
      this.setConnectionState('UNCONFIGURED');
      return;
    }

    try {
      this.setConnectionState('CONNECTING');
      this.client = createClient(url, key, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });

      this.subscribeChannel();
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      this.setConnectionState('ERROR');
    }
  }

  public subscribe(onUpdate: (payload: CentralDataPayload) => void) {
    this.onDataCallback = onUpdate;
    if (this.client && !this.channel) {
      this.subscribeChannel();
    }
  }

  private subscribeChannel() {
    if (!this.client) return;

    if (this.channel) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }

    // Subscribe to postgres_changes on inventory_state table
    this.channel = this.client
      .channel('supabase_realtime_inventory')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_state',
        },
        (payload) => {
          console.log('[Supabase Realtime] postgres_changes event received:', payload);
          const newRow = payload.new as any;
          if (newRow && newRow.data) {
            const data = newRow.data as CentralDataPayload;
            if (this.onDataCallback) {
              this.onDataCallback(data);
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Supabase Realtime] Channel status:', status, err);
        if (status === 'SUBSCRIBED') {
          this.setConnectionState('CONNECTED');
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          this.setConnectionState('ERROR');
        } else if (status === 'CLOSED') {
          this.setConnectionState('DISCONNECTED');
        }
      });
  }

  public async fetchLatest(): Promise<CentralDataPayload | null> {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('inventory_state')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (error) {
        console.error('[Supabase Realtime] Fetch error:', error);
        return null;
      }

      if (data && data.data) {
        return data.data as CentralDataPayload;
      }
      return null;
    } catch (err) {
      console.error('[Supabase Realtime] Exception fetching:', err);
      return null;
    }
  }

  public async pushState(payload: CentralDataPayload): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { error } = await this.client.from('inventory_state').upsert(
        {
          id: 'default',
          data: payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      if (error) {
        console.error('[Supabase Realtime] Upsert error:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[Supabase Realtime] Exception pushing state:', err);
      return false;
    }
  }

  public cleanup() {
    if (this.channel && this.client) {
      this.client.removeChannel(this.channel);
      this.channel = null;
    }
    this.client = null;
    this.currentState = 'UNCONFIGURED';
  }
}

export const supabaseRealtimeService = new SupabaseRealtimeService();

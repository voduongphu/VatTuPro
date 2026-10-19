/**
 * Cross-tab and local broadcast bus for immediate session state synchronization.
 * Complements Supabase Realtime and /api/sync polling with sub-millisecond local tab communication.
 */

export interface SessionBusMessage {
  type: 'LOGIN' | 'LOGOUT' | 'TAKEOVER' | 'SESSION_TERMINATED';
  userId: string;
  deviceId?: string;
  deviceName?: string;
  timestamp: string;
  reason?: string;
}

type SessionListener = (message: SessionBusMessage) => void;

class SessionBus {
  private channel: BroadcastChannel | null = null;
  private listeners: SessionListener[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('kho_vattu_session_bus');
        this.channel.onmessage = (event) => {
          if (event.data) {
            this.notify(event.data as SessionBusMessage);
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel not available, falling back to storage events:', err);
      }
    }

    // Fallback: storage event
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'nxt_inventory_session_broadcast' && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            this.notify(data);
          } catch {
            // ignore
          }
        }
      });
    }
  }

  public broadcast(message: Omit<SessionBusMessage, 'timestamp'>) {
    const fullMessage: SessionBusMessage = {
      ...message,
      timestamp: new Date().toISOString(),
    };

    if (this.channel) {
      try {
        this.channel.postMessage(fullMessage);
      } catch {
        // ignore
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('nxt_inventory_session_broadcast', JSON.stringify(fullMessage));
      } catch {
        // ignore
      }
    }
  }

  public subscribe(listener: SessionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(message: SessionBusMessage) {
    this.listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (err) {
        console.error('Error in session bus listener:', err);
      }
    });
  }
}

export const sessionBus = new SessionBus();

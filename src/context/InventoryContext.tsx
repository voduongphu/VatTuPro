import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  INITIAL_ITEMS,
  INITIAL_TRANSACTIONS,
  INITIAL_USERS,
  INITIAL_WAREHOUSES,
} from '../data/mockData';
import {
  InventoryItem,
  MultiFilterCriteria,
  StockLedgerEntry,
  StockStatus,
  Transaction,
  User,
  Warehouse,
} from '../types/inventory';
import { getStockStatus } from '../utils/formatters';
import { SyncStatus, CloudProvider, CentralDataPayload, centralSyncService } from '../services/centralSyncService';
import { supabaseRealtimeService, RealtimeConnectionState } from '../services/supabaseRealtimeService';
import { DeviceInfo, getDeviceId, getDeviceInfo, getDeviceName } from '../utils/deviceHelper';
import { sessionBus, SessionBusMessage } from '../services/sessionBus';
import {
  mergeItemsAdditive,
  mergeTransactionsAdditive,
  mergeUsersAdditive,
  mergeWarehousesAdditive,
} from '../utils/mergeSyncData';

interface InventoryContextType {
  warehouses: Warehouse[];
  items: InventoryItem[];
  transactions: Transaction[];
  categories: string[];
  suppliers: string[];

  // Auth & User Management (Single active session across devices)
  users: User[];
  currentUser: User | null;
  login: (
    username: string,
    password: string
  ) => Promise<{
    success: boolean;
    error?: string;
    code?: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'SESSION_ACTIVE_ON_ANOTHER_DEVICE';
    otherDevice?: {
      id?: string | null;
      name?: string | null;
      lastActiveAt?: string | null;
    };
  }>;
  forceLogoutOtherDeviceAndLogin: (
    username: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  revokeUserSession: (userId: string) => { success: boolean; error?: string };
  sessionTerminatedReason: string | null;
  clearSessionTerminatedReason: () => void;
  currentDeviceInfo: DeviceInfo;
  regenerateDeviceIdForTesting: () => string;
  addUser: (userData: Omit<User, 'id' | 'createdAt'>) => { success: boolean; error?: string };
  updateUser: (id: string, updates: Partial<User>) => { success: boolean; error?: string };
  deleteUser: (id: string) => { success: boolean; error?: string };

  // Warehouse Management
  addWarehouse: (data: Omit<Warehouse, 'id'>) => {
    success: boolean;
    error?: string;
    warehouse?: Warehouse;
  };
  updateWarehouse: (
    id: string,
    updates: Partial<Warehouse>
  ) => { success: boolean; error?: string };
  deleteWarehouse: (id: string) => { success: boolean; error?: string };

  // Filter state
  filterCriteria: MultiFilterCriteria;
  setFilterCriteria: React.Dispatch<React.SetStateAction<MultiFilterCriteria>>;
  updateFilter: <K extends keyof MultiFilterCriteria>(key: K, value: MultiFilterCriteria[K]) => void;
  resetFilterCriteria: () => void;
  applyPresetFilter: (presetName: string) => void;
  activeFilterCount: number;

  // Filtered results
  filteredItems: InventoryItem[];
  filteredTransactions: Transaction[];

  // CRUD Items
  addItem: (item: Omit<InventoryItem, 'id' | 'updatedAt'>) => void;
  updateItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteItem: (id: string) => void;
  deleteItemsBatch: (ids: string[]) => { success: boolean; count: number };
  importItemsBatch: (
    itemsList: Omit<InventoryItem, 'id' | 'updatedAt'>[],
    updateExisting?: boolean
  ) => { success: boolean; addedCount: number; updatedCount: number; errors: string[] };

  // CRUD Transactions
  createTransaction: (data: Omit<Transaction, 'id' | 'code'>) => {
    success: boolean;
    error?: string;
    transaction?: Transaction;
  };
  updateTransaction: (
    id: string,
    updates: Partial<Transaction>
  ) => { success: boolean; error?: string };
  deleteTransaction: (id: string) => { success: boolean; error?: string };
  importTransactionsBatch: (
    importedList: Omit<Transaction, 'id' | 'code'>[]
  ) => { success: boolean; importedCount: number; errors: string[] };

  getItemLedger: (itemId: string) => StockLedgerEntry[];
  resetToDefaultData: () => void;

  // Central Cloud Synchronization (Vercel KV / Supabase)
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  syncProvider: CloudProvider;
  triggerManualSync: () => Promise<void>;
  isSyncModalOpen: boolean;
  setIsSyncModalOpen: (open: boolean) => void;

  // Supabase Realtime WebSocket Connection & Google AI Sync
  realtimeConnectionState: RealtimeConnectionState;
  lastRealtimeUpdateMessage: string | null;
  clearRealtimeMessage: () => void;
  simulateGoogleAIUpdate: () => Promise<{ success: boolean; message: string }>;
  saveSupabaseCredentials: (url: string, key: string) => boolean;
  supabaseCredentials: { url: string; key: string };
}

const defaultCriteria: MultiFilterCriteria = {
  searchQuery: '',
  warehouses: [],
  itemTypes: [],
  categories: [],
  stockStatuses: [],
  equipmentConditions: [],
  minStockQty: undefined,
  maxStockQty: undefined,
  minValue: undefined,
  maxValue: undefined,
  supplier: '',
  needsInspection: false,
  dateRangePreset: 'ALL',
};

const STORAGE_KEYS = {
  ITEMS: 'nxt_inventory_items_v3',
  TRANSACTIONS: 'nxt_inventory_transactions_v3',
  WAREHOUSES: 'nxt_inventory_warehouses_v3',
  USERS: 'nxt_inventory_users_v3',
  AUTH: 'nxt_inventory_current_user_v3',
};

const RESET_EPOCH = '2026-10-20T10:00:00.000Z';

// Automatic cleanup of legacy data so admin starts fresh with admin/admin123
if (typeof window !== 'undefined') {
  try {
    const CLEAN_KEY = 'nxt_clean_admin_v4_clean_users';
    if (!localStorage.getItem(CLEAN_KEY)) {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('nxt_')) {
          localStorage.removeItem(k);
        }
      });
      localStorage.setItem(CLEAN_KEY, 'true');

      // Sync clean state to central endpoint immediately
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cleanReset: true,
          payload: {
            cleanReset: true,
            resetEpoch: RESET_EPOCH,
            version: 1,
            lastUpdated: new Date().toISOString(),
            users: INITIAL_USERS,
            warehouses: INITIAL_WAREHOUSES,
            items: INITIAL_ITEMS,
            transactions: INITIAL_TRANSACTIONS,
            source: 'admin-clean-reset',
          },
        }),
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

const InventoryContext = createContext<InventoryContextType | null>(null);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.WAREHOUSES);
      return stored ? JSON.parse(stored) : INITIAL_WAREHOUSES;
    } catch {
      return INITIAL_WAREHOUSES;
    }
  });

  const [items, setItems] = useState<InventoryItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ITEMS);
      return stored ? JSON.parse(stored) : INITIAL_ITEMS;
    } catch {
      return INITIAL_ITEMS;
    }
  });

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      return stored ? JSON.parse(stored) : INITIAL_TRANSACTIONS;
    } catch {
      return INITIAL_TRANSACTIONS;
    }
  });

  const [users, setUsers] = useState<User[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.USERS);
      return stored ? JSON.parse(stored) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    // Luôn đưa về màn hình đăng nhập khi mở lại hoặc tải lại ứng dụng
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH);
    } catch {
      // ignore
    }
    return null;
  });

  // Multi-device Single Session Tracking state
  const [sessionTerminatedReason, setSessionTerminatedReason] = useState<string | null>(null);
  const [currentDeviceInfo, setCurrentDeviceInfo] = useState<DeviceInfo>(() => getDeviceInfo());

  const clearSessionTerminatedReason = useCallback(() => {
    setSessionTerminatedReason(null);
  }, []);

  const regenerateDeviceIdForTesting = useCallback(() => {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timeHex = Date.now().toString(36).toUpperCase();
    const newId = `DEV-${timeHex}-${randomHex}`;
    try {
      localStorage.setItem('nxt_inventory_device_id_v1', newId);
    } catch {
      // ignore
    }
    const fresh = getDeviceInfo();
    setCurrentDeviceInfo(fresh);
    return newId;
  }, []);

  const [filterCriteria, setFilterCriteria] = useState<MultiFilterCriteria>(defaultCriteria);

  // Central Cloud Synchronization state (Vercel KV / Supabase)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(new Date());
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [syncProvider, setSyncProvider] = useState<CloudProvider>(() => {
    if (supabaseRealtimeService.isConfigured()) return 'supabase';
    return centralSyncService.getProvider();
  });
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [lastServerTimestamp, setLastServerTimestamp] = useState<string>(() => new Date().toISOString());
  const isRemoteUpdatingRef = useRef<boolean>(false);
  const pushTimerRef = useRef<any>(null);

  // Supabase Realtime state
  const [realtimeConnectionState, setRealtimeConnectionState] = useState<RealtimeConnectionState>(() =>
    supabaseRealtimeService.getConnectionState()
  );
  const [lastRealtimeUpdateMessage, setLastRealtimeUpdateMessage] = useState<string | null>(null);
  const [supabaseCredentials, setSupabaseCredentials] = useState<{ url: string; key: string }>(() =>
    supabaseRealtimeService.getCredentials()
  );

  const clearRealtimeMessage = useCallback(() => setLastRealtimeUpdateMessage(null), []);

  // Central additive merge helper: ensures remote data is added/merged rather than replacing local items/users/transactions
  const applyRemotePayloadAdditive = useCallback(
    (payload: CentralDataPayload) => {
      if (!payload) return;

      isRemoteUpdatingRef.current = true;

      // If this is a clean reset command from admin or payload is from before the reset epoch, wipe cleanly
      if (
        (payload as any).cleanReset ||
        (payload.resetEpoch && payload.resetEpoch !== RESET_EPOCH) ||
        (!payload.resetEpoch && (payload as any).version > 1)
      ) {
        setWarehouses(payload.warehouses && payload.warehouses.length > 0 ? payload.warehouses : INITIAL_WAREHOUSES);
        setUsers(payload.users && payload.users.length > 0 ? payload.users : INITIAL_USERS);
        setTransactions(payload.transactions || []);
        setItems(payload.items || []);
        try {
          localStorage.setItem(
            STORAGE_KEYS.WAREHOUSES,
            JSON.stringify(payload.warehouses && payload.warehouses.length > 0 ? payload.warehouses : INITIAL_WAREHOUSES)
          );
          localStorage.setItem(
            STORAGE_KEYS.USERS,
            JSON.stringify(payload.users && payload.users.length > 0 ? payload.users : INITIAL_USERS)
          );
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(payload.transactions || []));
          localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(payload.items || []));
        } catch {
          // ignore
        }
        if (payload.lastUpdated) {
          setLastServerTimestamp(payload.lastUpdated);
        }
        setLastSyncedAt(new Date());
        setSyncStatus('synced');
        setTimeout(() => {
          isRemoteUpdatingRef.current = false;
        }, 350);
        return;
      }

      // 1. Merge warehouses additively
      let currentWh = warehouses;
      if (Array.isArray(payload.warehouses) && payload.warehouses.length > 0) {
        setWarehouses(prevWh => {
          const mergedWh = mergeWarehousesAdditive(prevWh, payload.warehouses);
          currentWh = mergedWh;
          try {
            localStorage.setItem(STORAGE_KEYS.WAREHOUSES, JSON.stringify(mergedWh));
          } catch {
            // ignore
          }
          return mergedWh;
        });
      }

      // 2. Merge users additively (never lose any user created on any device)
      if (Array.isArray(payload.users) && payload.users.length > 0) {
        const remoteUsers = payload.users;
        setUsers(prevUsers => {
          const mergedUsers = mergeUsersAdditive(prevUsers, remoteUsers);
          try {
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mergedUsers));
          } catch {
            // ignore
          }
          return mergedUsers;
        });
      }

      // 3. Merge transactions additively & recalculate stock per warehouse
      setTransactions(prevTrx => {
        const mergedTrx =
          Array.isArray(payload.transactions) && payload.transactions.length > 0
            ? mergeTransactionsAdditive(prevTrx, payload.transactions)
            : prevTrx;
        try {
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(mergedTrx));
        } catch {
          // ignore
        }

        // 4. Merge items additively
        if (Array.isArray(payload.items) && payload.items.length > 0) {
          setItems(prevItems => {
            const mergedItems = mergeItemsAdditive(prevItems, payload.items, currentWh, mergedTrx);
            try {
              localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(mergedItems));
            } catch {
              // ignore
            }
            return mergedItems;
          });
        }

        return mergedTrx;
      });

      if (payload.lastUpdated) {
        setLastServerTimestamp(payload.lastUpdated);
      }
      setLastSyncedAt(new Date());
      setSyncStatus('synced');

      setTimeout(() => {
        isRemoteUpdatingRef.current = false;
      }, 350);
    },
    [warehouses]
  );

  const saveSupabaseCredentials = useCallback((url: string, key: string) => {
    const configured = supabaseRealtimeService.setCredentials(url, key);
    setSupabaseCredentials({ url, key });
    if (configured) {
      setSyncProvider('supabase');
      // Immediately attempt fetch from Supabase
      supabaseRealtimeService.fetchLatest().then((remoteData) => {
        if (remoteData) {
          applyRemotePayloadAdditive(remoteData);
        }
      });
    }
    return configured;
  }, [applyRemotePayloadAdditive]);

  // Listen to Supabase Realtime WebSocket events
  useEffect(() => {
    supabaseRealtimeService.subscribe((payload) => {
      if (!payload) return;
      console.log('[InventoryContext] Instant Supabase Realtime update received:', payload);

      applyRemotePayloadAdditive(payload);

      const isAI = payload.source === 'google-ai';
      const msg = isAI
        ? `⚡ Số liệu mới từ Google AI vừa được cập nhật tức thì (Supabase Realtime)!`
        : `⚡ Dữ liệu vừa được hợp nhất tự động qua Supabase Realtime WebSocket!`;
      setLastRealtimeUpdateMessage(msg);

      // Auto clear message after 6 seconds
      setTimeout(() => {
        setLastRealtimeUpdateMessage(prev => (prev === msg ? null : prev));
      }, 6000);
    });

    const unsubscribeStatus = supabaseRealtimeService.onConnectionStateChange((state) => {
      setRealtimeConnectionState(state);
      if (state === 'CONNECTED') {
        setSyncProvider('supabase');
      }
    });

    return () => {
      unsubscribeStatus();
    };
  }, [applyRemotePayloadAdditive]);

  // Direct push helper for instant cloud broadcast without debounce delay
  const pushCloudSyncImmediately = useCallback(
    async (
      newItems: InventoryItem[],
      newTransactions: Transaction[],
      newWarehouses: Warehouse[],
      newUsers: User[],
      source = 'web-client'
    ) => {
      const fullPayload: CentralDataPayload = {
        version: Date.now(),
        lastUpdated: new Date().toISOString(),
        items: newItems,
        transactions: newTransactions,
        warehouses: newWarehouses,
        users: newUsers,
        resetEpoch: RESET_EPOCH,
        source,
      };

      try {
        if (supabaseRealtimeService.isConfigured()) {
          await supabaseRealtimeService.pushState(fullPayload);
        }
      } catch (err) {
        console.warn('Immediate supabase push failed:', err);
      }

      try {
        await centralSyncService.pushUpdate({
          items: newItems,
          transactions: newTransactions,
          warehouses: newWarehouses,
          users: newUsers,
          resetEpoch: RESET_EPOCH,
          source,
        });
      } catch (err) {
        console.warn('Immediate centralSync push failed:', err);
      }
    },
    []
  );

  // Active session monitor: Terminate session if another device logs in with this user account
  useEffect(() => {
    if (!currentUser) return;
    const currentDeviceId = getDeviceId();
    const freshUser = users.find(u => u.id === currentUser.id);
    if (!freshUser) return;

    if (freshUser.status === 'LOCKED') {
      setCurrentUser(null);
      setSessionTerminatedReason('Tài khoản của bạn đã bị khóa bởi Quản trị viên.');
      return;
    }

    // Another device claimed the session
    if (freshUser.activeDeviceId && freshUser.activeDeviceId !== currentDeviceId) {
      console.warn('[Multi-Device] Account active on another device:', freshUser.activeDeviceName);
      setCurrentUser(null);
      setSessionTerminatedReason(
        `Tài khoản "${freshUser.fullName}" đã được đăng nhập trên một thiết bị khác (${freshUser.activeDeviceName || 'Thiết bị khác'}). Phiên làm việc trên thiết bị này đã được tự động kết thúc để bảo đảm an toàn dữ liệu.`
      );
    } else if (freshUser.activeDeviceId === null) {
      // Session was logged out remotely or by admin
      console.warn('[Multi-Device] Account session terminated remotely');
      setCurrentUser(null);
      setSessionTerminatedReason(
        `Tài khoản "${freshUser.fullName}" đã được đăng xuất từ xa hoặc bởi Quản trị viên.`
      );
    }
  }, [users, currentUser]);

  // Cross-tab / Cross-window broadcast listener
  useEffect(() => {
    const unsubscribe = sessionBus.subscribe((msg) => {
      if (!currentUser) return;
      if (msg.userId === currentUser.id) {
        const myDeviceId = getDeviceId();
        if (msg.type === 'TAKEOVER' && msg.deviceId && msg.deviceId !== myDeviceId) {
          setCurrentUser(null);
          setSessionTerminatedReason(
            `Tài khoản "${currentUser.fullName}" vừa được đăng nhập trên một thiết bị khác (${msg.deviceName || 'Thiết bị mới'}). Phiên làm việc trên thiết bị này đã được tự động kết thúc.`
          );
        } else if (msg.type === 'LOGOUT' && msg.deviceId !== myDeviceId) {
          setCurrentUser(null);
          setSessionTerminatedReason(
            msg.reason || `Tài khoản "${currentUser.fullName}" đã được đăng xuất từ xa.`
          );
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Trigger manual or background fetch from central server
  const triggerManualSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      // If Supabase client is connected, try direct fetch first
      if (supabaseRealtimeService.isConfigured()) {
        const directPayload = await supabaseRealtimeService.fetchLatest();
        if (directPayload) {
          applyRemotePayloadAdditive(directPayload);
          setSyncProvider('supabase');
          return;
        }
      }

      const result = await centralSyncService.fetchLatestData(lastServerTimestamp);
      if (result.success) {
        setSyncProvider(result.provider);
        if (result.payload) {
          applyRemotePayloadAdditive(result.payload);
        }
        setSyncStatus('synced');
        setLastSyncedAt(new Date());
      } else {
        setSyncStatus(result.error ? 'error' : 'offline');
      }
    } catch {
      setSyncStatus('offline');
    }
  }, [lastServerTimestamp, applyRemotePayloadAdditive]);

  // Real-time automatic polling every 3 seconds (3000ms) as heartbeat fallback
  useEffect(() => {
    if (!autoSyncEnabled) return;

    // Run initial fetch on mount
    triggerManualSync();

    const intervalId = setInterval(() => {
      // Pause polling if user is on another browser tab to save serverless bandwidth
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      triggerManualSync();
    }, 3000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerManualSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoSyncEnabled, triggerManualSync]);

  // Push local changes to cloud datastore (Supabase Realtime / Vercel KV)
  const pushLocalChanges = useCallback(
    (
      newItems: InventoryItem[],
      newTransactions: Transaction[],
      newWarehouses: Warehouse[],
      newUsers?: User[]
    ) => {
      if (isRemoteUpdatingRef.current) return;
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(() => {
        const usersToPush = newUsers || users;
        const fullPayload: CentralDataPayload = {
          version: Date.now(),
          lastUpdated: new Date().toISOString(),
          items: newItems,
          transactions: newTransactions,
          warehouses: newWarehouses,
          users: usersToPush,
          resetEpoch: RESET_EPOCH,
          source: 'web-client',
        };

        // 1. Direct push to Supabase (broadcasts immediately to all WebSocket subscribers)
        if (supabaseRealtimeService.isConfigured()) {
          supabaseRealtimeService.pushState(fullPayload).then((ok) => {
            if (ok) {
              setLastServerTimestamp(fullPayload.lastUpdated);
              setLastSyncedAt(new Date());
              setSyncStatus('synced');
            }
          });
        }

        // 2. Central API fallback / sync
        centralSyncService
          .pushUpdate({
            items: newItems,
            transactions: newTransactions,
            warehouses: newWarehouses,
            users: usersToPush,
            resetEpoch: RESET_EPOCH,
          })
          .then((res) => {
            if (res.success && res.payload) {
              setLastServerTimestamp(res.payload.lastUpdated);
              setLastSyncedAt(new Date());
              setSyncStatus('synced');
            }
          })
          .catch(() => {});
      }, 400);
    },
    [users]
  );

  // Simulate Google AI generating new inventory numbers & broadcast instantly
  const simulateGoogleAIUpdate = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    if (items.length === 0) {
      return { success: false, message: 'Chưa có danh mục vật tư để tạo số liệu AI' };
    }

    const targetIdx = Math.floor(Math.random() * items.length);
    const targetItem = items[targetIdx];
    const targetWarehouse = warehouses[0] || INITIAL_WAREHOUSES[0];

    const adjustmentQty = Math.floor(Math.random() * 25) + 5;
    const newStock = targetItem.currentStock + adjustmentQty;

    const newItems = items.map((it, idx) => (idx === targetIdx ? { ...it, currentStock: newStock } : it));

    const aiCode = `AI-NHAP-${Date.now().toString().slice(-4)}`;
    const lineAmount = adjustmentQty * (targetItem.unitPrice || 150000);
    const newTx: Transaction = {
      id: `tx-ai-${Date.now()}`,
      code: aiCode,
      type: 'NHAP_KHO',
      subtype: 'NHAP_DIEU_CHINH',
      date: new Date().toISOString().split('T')[0],
      warehouseId: targetItem.warehouseId || targetWarehouse.id,
      partnerName: 'Google AI Optimization Engine',
      departmentOrProject: 'Bộ Phận Dự Đoán Tự Động',
      creatorName: 'Google AI Gemini',
      notes: `[Google AI Auto-Analysis] Bổ sung +${adjustmentQty} ${targetItem.unit} cho vật tư "${targetItem.name}"`,
      status: 'HOAN_THANH',
      items: [
        {
          itemId: targetItem.id,
          itemCode: targetItem.code,
          itemName: targetItem.name,
          unit: targetItem.unit,
          quantity: adjustmentQty,
          unitPrice: targetItem.unitPrice || 150000,
          amount: lineAmount,
          note: 'Google AI tự động tính toán và bổ sung lượng tồn kho tối ưu',
        },
      ],
      totalAmount: lineAmount,
    };

    const newTransactions = [newTx, ...transactions];

    // Update local state
    setItems(newItems);
    setTransactions(newTransactions);

    const payload: CentralDataPayload = {
      version: Date.now(),
      lastUpdated: new Date().toISOString(),
      items: newItems,
      transactions: newTransactions,
      warehouses: warehouses,
      users: users,
      source: 'google-ai',
      lastUpdatedBy: 'Google AI Gemini',
    };

    let sentToRealtime = false;
    if (supabaseRealtimeService.isConfigured()) {
      sentToRealtime = await supabaseRealtimeService.pushState(payload);
    }

    // Also push to central API
    centralSyncService.pushUpdate({
      items: newItems,
      transactions: newTransactions,
      warehouses: warehouses,
      users: users,
      source: 'google-ai',
      lastUpdatedBy: 'Google AI Gemini',
    }).catch(() => {});

    setLastServerTimestamp(payload.lastUpdated);
    setLastSyncedAt(new Date());

    const resultMessage = sentToRealtime
      ? `⚡ Google AI vừa cập nhật +${adjustmentQty} ${targetItem.unit} cho "${targetItem.name}". Supabase Realtime đã phát sóng WebSocket đến toàn bộ người dùng ngay lập tức!`
      : `Google AI vừa cập nhật +${adjustmentQty} ${targetItem.unit} cho "${targetItem.name}". Đã lưu lên máy chủ đồng bộ!`;

    setLastRealtimeUpdateMessage(resultMessage);
    return { success: true, message: resultMessage };
  }, [items, transactions, warehouses, users]);

  // Sync to local storage & push to Cloud
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items));
    } catch {
      // ignore
    }
    pushLocalChanges(items, transactions, warehouses, users);
  }, [items, pushLocalChanges, transactions, warehouses, users]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    } catch {
      // ignore
    }
    pushLocalChanges(items, transactions, warehouses, users);
  }, [transactions, pushLocalChanges, items, warehouses, users]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch {
      // ignore
    }
    pushLocalChanges(items, transactions, warehouses, users);
  }, [users, pushLocalChanges, items, transactions, warehouses]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WAREHOUSES, JSON.stringify(warehouses));
    } catch {
      // ignore
    }
    pushLocalChanges(items, transactions, warehouses, users);
  }, [warehouses, pushLocalChanges, items, transactions, users]);

  // Auth Operations (Multi-Device Single Session Enforcement)
  const login = async (
    username: string,
    password: string
  ): Promise<{
    success: boolean;
    error?: string;
    code?: 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'SESSION_ACTIVE_ON_ANOTHER_DEVICE';
    otherDevice?: {
      id?: string | null;
      name?: string | null;
      lastActiveAt?: string | null;
    };
  }> => {
    const trimmedUsername = username.trim().toLowerCase();
    let currentUsersList = users;

    // 1. Always refresh users from cloud immediately before login to get real-time device sessions
    try {
      let remotePayload: CentralDataPayload | null = null;
      if (supabaseRealtimeService.isConfigured()) {
        remotePayload = await supabaseRealtimeService.fetchLatest();
      }
      if (!remotePayload) {
        const syncRes = await centralSyncService.fetchLatestData();
        if (syncRes.success && syncRes.payload) {
          remotePayload = syncRes.payload;
        }
      }

      if (remotePayload && Array.isArray(remotePayload.users) && remotePayload.users.length > 0) {
        const mergedUsers = mergeUsersAdditive(users, remotePayload.users);
        setUsers(mergedUsers);
        try {
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mergedUsers));
        } catch {
          // ignore
        }
        currentUsersList = mergedUsers;
      }
    } catch (err) {
      console.warn('Could not refresh remote users during login:', err);
    }

    const user = currentUsersList.find(u => u.username.toLowerCase() === trimmedUsername);

    if (!user) {
      return {
        success: false,
        code: 'INVALID_CREDENTIALS',
        error: 'Tên đăng nhập không tồn tại trong hệ thống.',
      };
    }

    if (user.status === 'LOCKED') {
      return {
        success: false,
        code: 'ACCOUNT_LOCKED',
        error: 'Tài khoản này đang bị khóa. Vui lòng liên hệ Quản trị viên.',
      };
    }

    if (user.password !== password) {
      return {
        success: false,
        code: 'INVALID_CREDENTIALS',
        error: 'Mật khẩu không chính xác. Vui lòng thử lại.',
      };
    }

    const currentDeviceId = getDeviceId();
    const currentDeviceName = getDeviceName();

    // 2. Multi-device check: block if currently active on a different device!
    if (user.activeDeviceId && user.activeDeviceId !== currentDeviceId) {
      return {
        success: false,
        code: 'SESSION_ACTIVE_ON_ANOTHER_DEVICE',
        error: `Tài khoản "${user.fullName}" hiện đang đăng nhập trên thiết bị: "${user.activeDeviceName || 'Thiết bị khác'}".`,
        otherDevice: {
          id: user.activeDeviceId,
          name: user.activeDeviceName || 'Thiết bị khác',
          lastActiveAt: user.lastActiveAt || user.lastLogin,
        },
      };
    }

    // 3. Login allowed on this device
    const nowIso = new Date().toISOString();
    const updatedUser: User = {
      ...user,
      lastLogin: nowIso.replace('T', ' ').substring(0, 16),
      activeDeviceId: currentDeviceId,
      activeDeviceName: currentDeviceName,
      lastActiveAt: nowIso,
    };

    const updatedUsers = currentUsersList.map(u => (u.id === user.id ? updatedUser : u));
    setUsers(updatedUsers);
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(updatedUser));
    } catch {
      // ignore
    }

    setCurrentUser(updatedUser);
    setSessionTerminatedReason(null);

    // Instant cloud broadcast & local tab notification
    pushCloudSyncImmediately(items, transactions, warehouses, updatedUsers);
    sessionBus.broadcast({
      type: 'LOGIN',
      userId: user.id,
      deviceId: currentDeviceId,
      deviceName: currentDeviceName,
    });

    return { success: true };
  };

  const forceLogoutOtherDeviceAndLogin = async (
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const trimmedUsername = username.trim().toLowerCase();
    let currentUsersList = users;

    try {
      let remotePayload: CentralDataPayload | null = null;
      if (supabaseRealtimeService.isConfigured()) {
        remotePayload = await supabaseRealtimeService.fetchLatest();
      }
      if (!remotePayload) {
        const syncRes = await centralSyncService.fetchLatestData();
        if (syncRes.success && syncRes.payload) {
          remotePayload = syncRes.payload;
        }
      }
      if (remotePayload && Array.isArray(remotePayload.users) && remotePayload.users.length > 0) {
        setUsers(remotePayload.users);
        currentUsersList = remotePayload.users;
      }
    } catch (err) {
      console.warn('Could not refresh remote users before takeover:', err);
    }

    const user = currentUsersList.find(u => u.username.toLowerCase() === trimmedUsername);
    if (!user) {
      return { success: false, error: 'Tên đăng nhập không tồn tại.' };
    }
    if (user.status === 'LOCKED') {
      return { success: false, error: 'Tài khoản này đang bị khóa.' };
    }
    if (user.password !== password) {
      return { success: false, error: 'Mật khẩu không chính xác.' };
    }

    const currentDeviceId = getDeviceId();
    const currentDeviceName = getDeviceName();
    const nowIso = new Date().toISOString();

    const updatedUser: User = {
      ...user,
      lastLogin: nowIso.replace('T', ' ').substring(0, 16),
      activeDeviceId: currentDeviceId,
      activeDeviceName: currentDeviceName,
      lastActiveAt: nowIso,
    };

    const updatedUsers = currentUsersList.map(u => (u.id === user.id ? updatedUser : u));
    setUsers(updatedUsers);
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
      localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(updatedUser));
    } catch {
      // ignore
    }

    setCurrentUser(updatedUser);
    setSessionTerminatedReason(null);

    // Push takeover immediately to invalidate other devices
    pushCloudSyncImmediately(items, transactions, warehouses, updatedUsers);
    sessionBus.broadcast({
      type: 'TAKEOVER',
      userId: user.id,
      deviceId: currentDeviceId,
      deviceName: currentDeviceName,
    });

    return { success: true };
  };

  const logout = useCallback(() => {
    if (currentUser) {
      const currentDeviceId = getDeviceId();
      const updatedUsers = users.map(u => {
        if (u.id === currentUser.id) {
          return {
            ...u,
            activeDeviceId: null,
            activeDeviceName: null,
            lastActiveAt: null,
          };
        }
        return u;
      });

      setUsers(updatedUsers);
      try {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
        localStorage.removeItem(STORAGE_KEYS.AUTH);
      } catch {
        // ignore
      }

      pushCloudSyncImmediately(items, transactions, warehouses, updatedUsers);
      sessionBus.broadcast({
        type: 'LOGOUT',
        userId: currentUser.id,
        deviceId: currentDeviceId,
      });
    }
    setCurrentUser(null);
  }, [currentUser, users, items, transactions, warehouses, pushCloudSyncImmediately]);

  const revokeUserSession = useCallback(
    (userId: string): { success: boolean; error?: string } => {
      if (!currentUser || currentUser.role !== 'ADMIN') {
        return { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền đăng xuất phiên người dùng.' };
      }

      const targetUser = users.find(u => u.id === userId);
      if (!targetUser) {
        return { success: false, error: 'Không tìm thấy người dùng.' };
      }

      const updatedUsers = users.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            activeDeviceId: null,
            activeDeviceName: null,
            lastActiveAt: null,
          };
        }
        return u;
      });

      setUsers(updatedUsers);
      try {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
      } catch {
        // ignore
      }

      pushCloudSyncImmediately(items, transactions, warehouses, updatedUsers);
      sessionBus.broadcast({
        type: 'LOGOUT',
        userId: userId,
        deviceId: 'admin-action',
        reason: 'Quản trị viên đã đăng xuất tài khoản này từ xa.',
      });

      return { success: true };
    },
    [currentUser, users, items, transactions, warehouses, pushCloudSyncImmediately]
  );

  // User Management
  const addUser = (userData: Omit<User, 'id' | 'createdAt'>): { success: boolean; error?: string } => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền thêm người sử dụng.' };
    }

    const trimmedUsername = userData.username.trim().toLowerCase();
    if (users.some(u => u.username.toLowerCase() === trimmedUsername)) {
      return { success: false, error: `Tên đăng nhập "${userData.username}" đã tồn tại.` };
    }

    const newUser: User = {
      ...userData,
      id: `USR-${Date.now()}`,
      username: trimmedUsername,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };

    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    } catch {
      // ignore
    }
    pushCloudSyncImmediately(items, transactions, warehouses, updatedUsers);
    pushLocalChanges(items, transactions, warehouses, updatedUsers);
    return { success: true };
  };

  const updateUser = (id: string, updates: Partial<User>): { success: boolean; error?: string } => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền chỉnh sửa người dùng.' };
    }

    if (updates.username) {
      const trimmed = updates.username.trim().toLowerCase();
      if (users.some(u => u.id !== id && u.username.toLowerCase() === trimmed)) {
        return { success: false, error: `Tên đăng nhập "${updates.username}" đã bị trùng lặp.` };
      }
    }

    const updatedUsers = users.map(u => {
      if (u.id === id) {
        const updated = { ...u, ...updates };
        // If updating self, sync currentUser
        if (currentUser.id === id) {
          setCurrentUser(updated);
        }
        return updated;
      }
      return u;
    });

    setUsers(updatedUsers);
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    } catch {
      // ignore
    }
    pushCloudSyncImmediately(items, transactions, warehouses, updatedUsers);
    pushLocalChanges(items, transactions, warehouses, updatedUsers);
    return { success: true };
  };

  const deleteUser = (id: string): { success: boolean; error?: string } => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền xóa người dùng.' };
    }

    if (currentUser.id === id) {
      return { success: false, error: 'Không thể xóa chính tài khoản bạn đang đăng nhập!' };
    }

    const updatedUsers = users.filter(u => u.id !== id);
    setUsers(updatedUsers);
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    } catch {
      // ignore
    }
    pushCloudSyncImmediately(items, transactions, warehouses, updatedUsers);
    pushLocalChanges(items, transactions, warehouses, updatedUsers);
    return { success: true };
  };

  // Warehouse Management (Admin permissions)
  const addWarehouse = (data: Omit<Warehouse, 'id'>): { success: boolean; error?: string; warehouse?: Warehouse } => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền thêm kho hàng mới.' };
    }

    const trimmedCode = data.code.trim().toUpperCase();
    const trimmedName = data.name.trim();

    if (!trimmedCode) {
      return { success: false, error: 'Vui lòng nhập mã ký hiệu kho.' };
    }
    if (!trimmedName) {
      return { success: false, error: 'Vui lòng nhập tên kho lưu trữ.' };
    }

    if (warehouses.some(w => w.code.toUpperCase() === trimmedCode)) {
      return { success: false, error: `Mã kho "${trimmedCode}" đã tồn tại trong hệ thống.` };
    }

    const newWarehouse: Warehouse = {
      ...data,
      id: `WH-${Date.now()}`,
      code: trimmedCode,
      name: trimmedName,
      status: data.status || 'ACTIVE',
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };

    setWarehouses(prev => [...prev, newWarehouse]);
    return { success: true, warehouse: newWarehouse };
  };

  const updateWarehouse = (id: string, updates: Partial<Warehouse>): { success: boolean; error?: string } => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền chỉnh sửa thông tin kho.' };
    }

    if (updates.code) {
      const trimmedCode = updates.code.trim().toUpperCase();
      if (warehouses.some(w => w.id !== id && w.code.toUpperCase() === trimmedCode)) {
        return { success: false, error: `Mã kho "${trimmedCode}" đã bị trùng lặp.` };
      }
    }

    setWarehouses(prev =>
      prev.map(w => (w.id === id ? { ...w, ...updates } : w))
    );

    return { success: true };
  };

  const deleteWarehouse = (id: string): { success: boolean; error?: string } => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { success: false, error: 'Chỉ Quản trị viên (Admin) mới có quyền xóa kho hàng.' };
    }

    if (warehouses.length <= 1) {
      return { success: false, error: 'Hệ thống cần duy trì ít nhất 1 kho hàng hoạt động.' };
    }

    const itemsCount = items.filter(i => i.warehouseId === id).length;
    if (itemsCount > 0) {
      return {
        success: false,
        error: `Không thể xóa kho này vì đang có ${itemsCount} mặt hàng tồn kho lưu trữ tại đây. Vui lòng điều chuyển các mặt hàng sang kho khác trước khi xóa.`,
      };
    }

    const trxCount = transactions.filter(t => t.warehouseId === id).length;
    if (trxCount > 0) {
      return {
        success: false,
        error: `Không thể xóa kho này vì có ${trxCount} chứng từ nhập/xuất kho đã lưu vết lịch sử tại kho này.`,
      };
    }

    setWarehouses(prev => prev.filter(w => w.id !== id));
    return { success: true };
  };

  // Derived lists
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => set.add(i.category));
    return Array.from(set).sort();
  }, [items]);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => {
      if (i.supplierDefault) set.add(i.supplierDefault);
    });
    transactions.forEach(t => {
      if (t.type === 'NHAP_KHO' && t.partnerName) set.add(t.partnerName);
    });
    return Array.from(set).sort();
  }, [items, transactions]);

  // Filter Updater
  const updateFilter = <K extends keyof MultiFilterCriteria>(key: K, value: MultiFilterCriteria[K]) => {
    setFilterCriteria(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const resetFilterCriteria = () => {
    setFilterCriteria(defaultCriteria);
  };

  // Presets
  const applyPresetFilter = (presetName: string) => {
    switch (presetName) {
      case 'LOW_STOCK':
        setFilterCriteria({
          ...defaultCriteria,
          stockStatuses: ['CANH_BAO_THAP', 'HET_HANG'],
        });
        break;
      case 'EQUIPMENT_ACTIVE':
        setFilterCriteria({
          ...defaultCriteria,
          itemTypes: ['THIET_BI', 'CONG_CU'],
          equipmentConditions: ['DANG_MUON'],
        });
        break;
      case 'NEED_MAINTENANCE':
        setFilterCriteria({
          ...defaultCriteria,
          itemTypes: ['THIET_BI'],
          needsInspection: true,
        });
        break;
      case 'HIGH_VALUE':
        setFilterCriteria({
          ...defaultCriteria,
          minValue: 20000000,
        });
        break;
      default:
        resetFilterCriteria();
    }
  };

  // Compute active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterCriteria.searchQuery.trim()) count++;
    if (filterCriteria.warehouses.length > 0) count++;
    if (filterCriteria.itemTypes.length > 0) count++;
    if (filterCriteria.categories.length > 0) count++;
    if (filterCriteria.stockStatuses.length > 0) count++;
    if (filterCriteria.equipmentConditions.length > 0) count++;
    if (filterCriteria.minStockQty !== undefined) count++;
    if (filterCriteria.maxStockQty !== undefined) count++;
    if (filterCriteria.minValue !== undefined) count++;
    if (filterCriteria.maxValue !== undefined) count++;
    if (filterCriteria.supplier) count++;
    if (filterCriteria.needsInspection) count++;
    if (filterCriteria.dateRangePreset && filterCriteria.dateRangePreset !== 'ALL') count++;
    return count;
  }, [filterCriteria]);

  // Filtered Items logic
  const filteredItems = useMemo(() => {
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    return items.filter(item => {
      // 1. Text Search (SKU, name, serial, spec)
      if (filterCriteria.searchQuery.trim()) {
        const q = filterCriteria.searchQuery.toLowerCase().trim();
        const matchCode = item.code.toLowerCase().includes(q);
        const matchName = item.name.toLowerCase().includes(q);
        const matchSerial = (item.serialOrLot || '').toLowerCase().includes(q);
        const matchSpec = (item.spec || '').toLowerCase().includes(q);
        const matchSupplier = (item.supplierDefault || '').toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchSerial && !matchSpec && !matchSupplier) {
          return false;
        }
      }

      // 2. Warehouses
      if (filterCriteria.warehouses.length > 0) {
        const itemWh = item.warehouseId || '';
        const inPrimary = Boolean(itemWh && filterCriteria.warehouses.includes(itemWh));
        const inStocks = item.warehouseStocks
          ? filterCriteria.warehouses.some(wId => (item.warehouseStocks?.[wId] || 0) > 0)
          : false;
        if (!inPrimary && !inStocks) {
          return false;
        }
      }

      // 3. Item Types
      if (filterCriteria.itemTypes.length > 0 && !filterCriteria.itemTypes.includes(item.type)) {
        return false;
      }

      // 4. Categories
      if (filterCriteria.categories.length > 0 && !filterCriteria.categories.includes(item.category)) {
        return false;
      }

      // 5. Stock Status
      if (filterCriteria.stockStatuses.length > 0) {
        const status: StockStatus = getStockStatus(item);
        if (!filterCriteria.stockStatuses.includes(status)) {
          return false;
        }
      }

      // 6. Equipment Condition
      if (filterCriteria.equipmentConditions.length > 0) {
        if (!item.condition || !filterCriteria.equipmentConditions.includes(item.condition)) {
          return false;
        }
      }

      // 7. Stock Qty Range
      if (filterCriteria.minStockQty !== undefined && item.currentStock < filterCriteria.minStockQty) {
        return false;
      }
      if (filterCriteria.maxStockQty !== undefined && item.currentStock > filterCriteria.maxStockQty) {
        return false;
      }

      // 8. Total Value Range
      const totalVal = item.currentStock * item.unitPrice;
      if (filterCriteria.minValue !== undefined && totalVal < filterCriteria.minValue) {
        return false;
      }
      if (filterCriteria.maxValue !== undefined && totalVal > filterCriteria.maxValue) {
        return false;
      }

      // 9. Supplier
      if (filterCriteria.supplier && item.supplierDefault !== filterCriteria.supplier) {
        return false;
      }

      // 10. Inspection / Maintenance Due Check
      if (filterCriteria.needsInspection) {
        if (!item.inspectionDueDate) return false;
        const due = new Date(item.inspectionDueDate);
        if (due > thirtyDaysLater) return false;
      }

      return true;
    });
  }, [items, filterCriteria]);

  // Filtered Transactions logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Search
      if (filterCriteria.searchQuery.trim()) {
        const q = filterCriteria.searchQuery.toLowerCase().trim();
        const matchCode = t.code.toLowerCase().includes(q);
        const matchPartner = t.partnerName.toLowerCase().includes(q);
        const matchProject = t.departmentOrProject.toLowerCase().includes(q);
        const matchNotes = t.notes.toLowerCase().includes(q);
        const matchItems = t.items.some(
          i => i.itemCode.toLowerCase().includes(q) || i.itemName.toLowerCase().includes(q)
        );
        if (!matchCode && !matchPartner && !matchProject && !matchNotes && !matchItems) {
          return false;
        }
      }

      // Warehouse
      if (filterCriteria.warehouses.length > 0 && !filterCriteria.warehouses.includes(t.warehouseId)) {
        return false;
      }

      // Supplier / Partner
      if (filterCriteria.supplier && t.partnerName !== filterCriteria.supplier) {
        return false;
      }

      // Date Range Preset
      if (filterCriteria.dateRangePreset && filterCriteria.dateRangePreset !== 'ALL') {
        const tDate = new Date(t.date);
        const now = new Date();
        if (filterCriteria.dateRangePreset === 'TODAY') {
          if (tDate.toDateString() !== now.toDateString()) return false;
        } else if (filterCriteria.dateRangePreset === 'LAST_7_DAYS') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          if (tDate < sevenDaysAgo) return false;
        } else if (filterCriteria.dateRangePreset === 'THIS_MONTH') {
          if (tDate.getMonth() !== now.getMonth() || tDate.getFullYear() !== now.getFullYear()) {
            return false;
          }
        }
      }

      return true;
    });
  }, [transactions, filterCriteria]);

  // CRUD Items
  const addItem = (itemData: Omit<InventoryItem, 'id' | 'updatedAt'>) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: `ITEM-${Date.now()}`,
      updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    setItems(prev => [newItem, ...prev]);
  };

  const updateItem = (id: string, updates: Partial<InventoryItem>) => {
    let originalCode = '';
    setItems(prev =>
      prev.map(item => {
        if (item.id === id) {
          originalCode = item.code;
          return {
            ...item,
            ...updates,
            updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          };
        }
        return item;
      })
    );

    // Tự động đồng bộ cập nhật tên vật tư (hoặc mã/ĐVT) vào toàn bộ phiếu nhập kho & xuất kho
    if (updates.name || updates.code || updates.unit) {
      setTransactions(prev =>
        prev.map(trx => {
          let hasModified = false;
          const updatedLineItems = trx.items.map(line => {
            const isTarget =
              line.itemId === id ||
              (originalCode && line.itemCode.trim().toLowerCase() === originalCode.trim().toLowerCase()) ||
              (updates.code && line.itemCode.trim().toLowerCase() === updates.code.trim().toLowerCase());

            if (isTarget) {
              hasModified = true;
              return {
                ...line,
                ...(updates.name ? { itemName: updates.name } : {}),
                ...(updates.code ? { itemCode: updates.code } : {}),
                ...(updates.unit ? { unit: updates.unit } : {}),
              };
            }
            return line;
          });

          return hasModified ? { ...trx, items: updatedLineItems } : trx;
        })
      );
    }
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const deleteItemsBatch = (ids: string[]) => {
    const idSet = new Set(ids);
    setItems(prev => prev.filter(i => !idSet.has(i.id)));
    return { success: true, count: ids.length };
  };

  // Create Transaction (NHAP / XUAT)
  const createTransaction = (data: Omit<Transaction, 'id' | 'code'>) => {
    if (data.type === 'XUAT_KHO') {
      for (const line of data.items) {
        const currentItem = items.find(i => i.id === line.itemId);
        if (!currentItem) {
          return { success: false, error: `Không tìm thấy vật tư mã "${line.itemCode}".` };
        }
        if (currentItem.currentStock < line.quantity) {
          return {
            success: false,
            error: `Số lượng xuất của "${currentItem.name}" (${line.quantity} ${currentItem.unit}) vượt quá số lượng tồn kho khả dụng (${currentItem.currentStock} ${currentItem.unit})!`,
          };
        }
      }
    }

    const prefix = data.type === 'NHAP_KHO' ? 'PN' : 'PX';
    const year = new Date().getFullYear();
    const count = transactions.filter(t => t.type === data.type).length + 1;
    const code = `${prefix}-${year}-${String(1000 + count).padStart(4, '0')}`;

    const newTransaction: Transaction = {
      ...data,
      id: `TRX-${Date.now()}`,
      code,
    };

    setItems(prev => {
      const updated = [...prev];
      for (const line of data.items) {
        // Find existing item by id or SKU code (case-insensitive)
        let idx = updated.findIndex(
          i =>
            (line.itemId && i.id === line.itemId) ||
            (line.itemCode && i.code.trim().toLowerCase() === line.itemCode.trim().toLowerCase())
        );

        if (idx !== -1) {
          const item = updated[idx];
          const qtyDelta = data.type === 'NHAP_KHO' ? line.quantity : -line.quantity;
          const newStock = Math.max(0, item.currentStock + qtyDelta);

          let condition = item.condition;
          if (item.type === 'THIET_BI' || item.type === 'CONG_CU') {
            if (data.type === 'XUAT_KHO' && data.subtype === 'XUAT_CHO_MUON') {
              condition = 'DANG_MUON';
            } else if (data.type === 'NHAP_KHO' && data.subtype === 'NHAP_TRA_SAU_MUON') {
              condition = 'SAN_SANG';
            }
          }

          const unitPrice =
            data.type === 'NHAP_KHO' && line.unitPrice > 0 ? line.unitPrice : item.unitPrice;

          updated[idx] = {
            ...item,
            currentStock: newStock,
            unitPrice,
            condition,
            supplierDefault:
              item.supplierDefault || (data.type === 'NHAP_KHO' && data.partnerName ? data.partnerName : item.supplierDefault),
            updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          };
          line.itemId = item.id;
        } else if (data.type === 'NHAP_KHO') {
          // Tự động thêm vật tư mới vào danh mục vật tư khi lập phiếu nhập kho
          const newItemId = `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          line.itemId = newItemId;
          const cleanCode = (line.itemCode || `VT-${Date.now().toString().slice(-4)}`).trim().toUpperCase();
          const newItem: InventoryItem = {
            id: newItemId,
            code: cleanCode,
            name: (line.itemName || 'Vật tư nhập mới').trim(),
            type: line.type || 'VAT_TU',
            category: (line.category || 'Vật tư nhập mới').trim(),
            unit: (line.unit || 'Cái').trim(),
            warehouseId: data.warehouseId,
            location: (line.location || 'Khu vực tiếp nhận').trim(),
            minStock: line.minStock !== undefined && line.minStock >= 0 ? line.minStock : 5,
            maxStock: line.maxStock !== undefined && line.maxStock > 0 ? line.maxStock : 200,
            currentStock: Math.max(0, line.quantity),
            unitPrice: Math.max(0, line.unitPrice || 0),
            serialOrLot: (line.serialNumber || '').trim(),
            condition: line.condition || 'SAN_SANG',
            supplierDefault: data.partnerName.trim(),
            spec: (line.spec || '').trim(),
            updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          };
          updated.unshift(newItem);
        }
      }
      return updated;
    });

    setTransactions(prev => [newTransaction, ...prev]);
    return { success: true, transaction: newTransaction };
  };

  // Update Transaction (Admin has full rights to edit details, items, quantities and recalculate stock)
  const updateTransaction = (
    id: string,
    updates: Partial<Transaction>
  ): { success: boolean; error?: string } => {
    if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'THU_KHO')) {
      return { success: false, error: 'Bạn không có quyền chỉnh sửa phiếu này.' };
    }

    const existing = transactions.find(t => t.id === id);
    if (!existing) {
      return { success: false, error: 'Không tìm thấy phiếu giao dịch.' };
    }

    if (updates.items && currentUser.role !== 'ADMIN') {
      return {
        success: false,
        error: 'Chỉ Quản trị viên (Admin) mới có quyền chỉnh sửa chi tiết danh mục và số lượng vật tư trong phiếu.',
      };
    }

    let updatedItemsList = [...items];

    // If items or warehouse were updated, adjust inventory balances
    if (updates.items) {
      // 1. Revert existing transaction's stock effects:
      for (const oldLine of existing.items) {
        const idx = updatedItemsList.findIndex(
          i =>
            i.id === oldLine.itemId ||
            (oldLine.itemCode &&
              i.code.trim().toUpperCase() === oldLine.itemCode.trim().toUpperCase() &&
              i.warehouseId === existing.warehouseId)
        );
        if (idx !== -1) {
          const item = updatedItemsList[idx];
          const revertDelta = existing.type === 'NHAP_KHO' ? -oldLine.quantity : oldLine.quantity;
          updatedItemsList[idx] = {
            ...item,
            currentStock: Math.max(0, item.currentStock + revertDelta),
          };
        }
      }

      // 2. Apply new items' stock effects:
      const targetWarehouseId = updates.warehouseId || existing.warehouseId;
      const targetType = updates.type || existing.type;

      for (const newLine of updates.items) {
        const idx = updatedItemsList.findIndex(
          i =>
            i.id === newLine.itemId ||
            (newLine.itemCode &&
              i.code.trim().toUpperCase() === newLine.itemCode.trim().toUpperCase() &&
              i.warehouseId === targetWarehouseId)
        );
        if (idx !== -1) {
          const item = updatedItemsList[idx];
          const applyDelta = targetType === 'NHAP_KHO' ? newLine.quantity : -newLine.quantity;
          const newUnitPrice =
            targetType === 'NHAP_KHO' && newLine.unitPrice > 0 ? newLine.unitPrice : item.unitPrice;
          updatedItemsList[idx] = {
            ...item,
            currentStock: Math.max(0, item.currentStock + applyDelta),
            unitPrice: newUnitPrice,
            updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          };
        } else if (targetType === 'NHAP_KHO') {
          // If new item row was added into a Goods Receipt
          const newItemId = newLine.itemId || `ITEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          const cleanCode = (newLine.itemCode || `VT-${Date.now().toString().slice(-4)}`).trim().toUpperCase();
          const newItem: InventoryItem = {
            id: newItemId,
            code: cleanCode,
            name: (newLine.itemName || 'Vật tư nhập mới').trim(),
            type: newLine.type || 'VAT_TU',
            category: (newLine.category || 'Vật tư dự án').trim(),
            unit: (newLine.unit || 'Cái').trim(),
            warehouseId: targetWarehouseId,
            location: (newLine.location || 'Khu vực tiếp nhận').trim(),
            minStock: newLine.minStock ?? 5,
            maxStock: newLine.maxStock ?? 200,
            currentStock: Math.max(0, newLine.quantity),
            unitPrice: Math.max(0, newLine.unitPrice || 0),
            serialOrLot: (newLine.serialNumber || '').trim(),
            condition: newLine.condition || 'SAN_SANG',
            supplierDefault: (updates.partnerName || existing.partnerName).trim(),
            spec: (newLine.spec || '').trim(),
            updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          };
          updatedItemsList.unshift(newItem);
        }
      }

      setItems(updatedItemsList);
      try {
        localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(updatedItemsList));
      } catch {
        // ignore
      }
    }

    const finalItems = updates.items || existing.items;
    const computedTotalAmount =
      updates.totalAmount !== undefined
        ? updates.totalAmount
        : finalItems.reduce((acc, it) => acc + (it.amount || it.quantity * it.unitPrice), 0);

    const updatedTrx: Transaction = {
      ...existing,
      ...updates,
      items: finalItems,
      totalAmount: computedTotalAmount,
    };

    const newTransactionsList = transactions.map(t => (t.id === id ? updatedTrx : t));
    setTransactions(newTransactionsList);
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(newTransactionsList));
    } catch {
      // ignore
    }

    pushCloudSyncImmediately(updatedItemsList, newTransactionsList, warehouses, users);
    pushLocalChanges(updatedItemsList, newTransactionsList, warehouses, users);
    return { success: true };
  };

  // Delete Transaction (Admin only, reverses stock impact!)
  const deleteTransaction = (id: string): { success: boolean; error?: string } => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return {
        success: false,
        error: 'Chỉ Quản trị viên (Admin) mới có quyền xóa phiếu nhập/xuất kho.',
      };
    }

    const targetTrx = transactions.find(t => t.id === id);
    if (!targetTrx) {
      return { success: false, error: 'Phiếu không tồn tại hoặc đã bị xóa.' };
    }

    // Revert inventory balances:
    // If deleted transaction was NHAP_KHO: we must deduct the quantities that were added!
    // If deleted transaction was XUAT_KHO: we must add back the quantities that were issued!
    setItems(prev => {
      const updated = [...prev];
      for (const line of targetTrx.items) {
        const idx = updated.findIndex(i => i.id === line.itemId);
        if (idx !== -1) {
          const item = updated[idx];
          const qtyDelta = targetTrx.type === 'NHAP_KHO' ? -line.quantity : line.quantity;
          const newStock = Math.max(0, item.currentStock + qtyDelta);

          updated[idx] = {
            ...item,
            currentStock: newStock,
            updatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          };
        }
      }
      return updated;
    });

    setTransactions(prev => prev.filter(t => t.id !== id));
    return { success: true };
  };

  // Batch Import Transactions
  const importTransactionsBatch = (
    importedList: Omit<Transaction, 'id' | 'code'>[]
  ): { success: boolean; importedCount: number; errors: string[] } => {
    const errors: string[] = [];
    let importedCount = 0;

    for (let i = 0; i < importedList.length; i++) {
      const item = importedList[i];
      const res = createTransaction(item);
      if (res.success) {
        importedCount++;
      } else {
        errors.push(`Dòng ${i + 1} (${item.partnerName}): ${res.error}`);
      }
    }

    return {
      success: importedCount > 0,
      importedCount,
      errors,
    };
  };

  // Batch Import Items / Materials Catalog
  const importItemsBatch = (
    itemsList: Omit<InventoryItem, 'id' | 'updatedAt'>[],
    updateExisting: boolean = true
  ): { success: boolean; addedCount: number; updatedCount: number; errors: string[] } => {
    let addedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    setItems(prev => {
      const updated = [...prev];
      const now = new Date().toISOString().replace('T', ' ').substring(0, 16);

      for (let i = 0; i < itemsList.length; i++) {
        const row = itemsList[i];
        if (!row.code || !row.name) {
          errors.push(`Dòng ${i + 1}: Thiếu mã SKU hoặc tên vật tư.`);
          continue;
        }

        const cleanCode = row.code.trim().toUpperCase();
        const existingIdx = updated.findIndex(
          it => it.code.trim().toUpperCase() === cleanCode
        );

        if (existingIdx !== -1) {
          if (updateExisting) {
            const oldItem = updated[existingIdx];
            updated[existingIdx] = {
              ...oldItem,
              ...row,
              code: cleanCode,
              updatedAt: now,
            };
            updatedCount++;

            // Đồng bộ tên vật tư và đơn vị tính vào các phiếu nếu có thay đổi
            if (row.name || row.unit) {
              setTransactions(prevTrx =>
                prevTrx.map(trx => {
                  let hasMod = false;
                  const updatedLines = trx.items.map(line => {
                    const isMatch =
                      line.itemId === oldItem.id ||
                      line.itemCode.trim().toLowerCase() === cleanCode.toLowerCase();
                    if (isMatch) {
                      hasMod = true;
                      return {
                        ...line,
                        ...(row.name ? { itemName: row.name } : {}),
                        ...(row.unit ? { unit: row.unit } : {}),
                      };
                    }
                    return line;
                  });
                  return hasMod ? { ...trx, items: updatedLines } : trx;
                })
              );
            }
          }
        } else {
          const newItem: InventoryItem = {
            ...row,
            code: cleanCode,
            id: `ITEM-${Date.now()}-${i}`,
            updatedAt: now,
          };
          updated.unshift(newItem);
          addedCount++;
        }
      }

      return updated;
    });

    return {
      success: addedCount > 0 || updatedCount > 0,
      addedCount,
      updatedCount,
      errors,
    };
  };

  // Generate Chronological Stock Ledger for an Item (Scoped strictly to item's storage warehouse)
  const getItemLedger = (itemId: string): StockLedgerEntry[] => {
    const targetItem = items.find(i => i.id === itemId);
    const sorted = [...transactions]
      .filter(t => t.status !== 'DA_HUY' && (!targetItem || t.warehouseId === targetItem.warehouseId))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const entries: StockLedgerEntry[] = [];

    for (const trx of sorted) {
      const matchingLines = trx.items.filter(
        i =>
          i.itemId === itemId ||
          (targetItem &&
            i.itemCode &&
            i.itemCode.trim().toUpperCase() === targetItem.code.trim().toUpperCase())
      );

      for (const line of matchingLines) {
        const inQty = trx.type === 'NHAP_KHO' ? line.quantity : 0;
        const outQty = trx.type === 'XUAT_KHO' ? line.quantity : 0;
        runningBalance = runningBalance + inQty - outQty;

        entries.push({
          transactionId: trx.id,
          transactionCode: trx.code,
          date: trx.date,
          type: trx.type,
          subtype: trx.subtype,
          partner: trx.partnerName,
          departmentOrProject: trx.departmentOrProject,
          inQty,
          outQty,
          unitPrice: line.unitPrice,
          balanceQty: runningBalance,
          notes: line.note || trx.notes,
        });
      }
    }

    return entries.reverse();
  };

  const resetToDefaultData = () => {
    setWarehouses(INITIAL_WAREHOUSES);
    setItems(INITIAL_ITEMS);
    setTransactions(INITIAL_TRANSACTIONS);
    setUsers(INITIAL_USERS);
    localStorage.removeItem(STORAGE_KEYS.WAREHOUSES);
    localStorage.removeItem(STORAGE_KEYS.ITEMS);
    localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
    localStorage.removeItem(STORAGE_KEYS.USERS);
    localStorage.removeItem(STORAGE_KEYS.AUTH);

    // Sync clean state to /api/sync
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cleanReset: true,
        payload: {
          cleanReset: true,
          resetEpoch: RESET_EPOCH,
          version: 1,
          lastUpdated: new Date().toISOString(),
          users: INITIAL_USERS,
          warehouses: INITIAL_WAREHOUSES,
          items: INITIAL_ITEMS,
          transactions: INITIAL_TRANSACTIONS,
          source: 'admin-clean-reset',
        },
      }),
    }).catch(() => {});
  };

  return (
    <InventoryContext.Provider
      value={{
        warehouses,
        items,
        transactions,
        categories,
        suppliers,
        users,
        currentUser,
        login,
        forceLogoutOtherDeviceAndLogin,
        logout,
        revokeUserSession,
        sessionTerminatedReason,
        clearSessionTerminatedReason,
        currentDeviceInfo,
        regenerateDeviceIdForTesting,
        addUser,
        updateUser,
        deleteUser,
        addWarehouse,
        updateWarehouse,
        deleteWarehouse,
        filterCriteria,
        setFilterCriteria,
        updateFilter,
        resetFilterCriteria,
        applyPresetFilter,
        activeFilterCount,
        filteredItems,
        filteredTransactions,
        addItem,
        updateItem,
        deleteItem,
        deleteItemsBatch,
        importItemsBatch,
        createTransaction,
        updateTransaction,
        deleteTransaction,
        importTransactionsBatch,
        getItemLedger,
        resetToDefaultData,
        syncStatus,
        lastSyncedAt,
        autoSyncEnabled,
        setAutoSyncEnabled,
        syncProvider,
        triggerManualSync,
        isSyncModalOpen,
        setIsSyncModalOpen,
        realtimeConnectionState,
        lastRealtimeUpdateMessage,
        clearRealtimeMessage,
        simulateGoogleAIUpdate,
        saveSupabaseCredentials,
        supabaseCredentials,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};

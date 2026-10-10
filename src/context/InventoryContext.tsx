import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  InventoryItem,
  InventoryTransaction,
  FilterPreset,
  ConditionRule,
  MatchLogic,
} from '../types/inventory';
import {
  INITIAL_ITEMS,
  INITIAL_TRANSACTIONS,
  DEFAULT_FILTER_PRESETS,
  INITIAL_WAREHOUSES,
  INITIAL_CATEGORIES,
  INITIAL_SUPPLIERS,
  INITIAL_PROJECTS,
  INITIAL_MANUFACTURERS,
  INITIAL_PROJECT_ITEMS,
} from '../data/initialData';

interface InventoryContextType {
  items: InventoryItem[];
  transactions: InventoryTransaction[];
  filterPresets: FilterPreset[];
  activeRules: ConditionRule[];
  activeLogic: MatchLogic;
  activePresetId: string | null;
  warehouses: string[];
  categories: string[];
  suppliers: string[];
  projects: string[];
  manufacturers: string[];
  projectItems: string[];
  
  // Item CRUD
  addItem: (item: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteItem: (id: string) => void;
  deleteMultipleItems: (ids: string[]) => { success: boolean; count: number };

  // Quản lý kho bãi
  addWarehouse: (name: string) => { success: boolean; message: string };
  renameWarehouse: (
    oldName: string,
    newName: string
  ) => { success: boolean; message: string; updatedItemsCount: number; updatedTransactionsCount: number };
  deleteWarehouse: (name: string) => { success: boolean; message: string };

  // Quản lý nhóm danh mục vật tư
  addCategory: (name: string) => { success: boolean; message: string };
  renameCategory: (
    oldName: string,
    newName: string
  ) => { success: boolean; message: string; updatedItemsCount: number };
  deleteCategory: (name: string, migrateToCategory?: string) => { success: boolean; message: string };
  
  // Transactions (Nhập / Xuất)
  createTransaction: (
    data: Omit<InventoryTransaction, 'id' | 'createdAt'>
  ) => { success: boolean; error?: string };
  updateTransaction: (
    id: string,
    updates: Partial<InventoryTransaction>
  ) => { success: boolean; error?: string; message?: string };
  deleteTransaction: (
    id: string
  ) => { success: boolean; error?: string; message?: string };

  // Kiểm kê / Điều chỉnh kho
  adjustStock: (itemId: string, newStock: number, reason: string, auditor: string) => void;

  // Filter conditions
  setActiveRules: React.Dispatch<React.SetStateAction<ConditionRule[]>>;
  addConditionRule: (rule: Omit<ConditionRule, 'id'>) => void;
  updateConditionRule: (id: string, updates: Partial<ConditionRule>) => void;
  removeConditionRule: (id: string) => void;
  clearConditionRules: () => void;
  setActiveLogic: (logic: MatchLogic) => void;
  applyPreset: (presetId: string) => void;
  saveCustomPreset: (name: string, description: string) => void;
  deletePreset: (presetId: string) => void;

  // Backup & Reset
  resetToInitialData: () => void;
  exportAllDataJSON: () => void;
  importAllDataJSON: (jsonString: string) => { success: boolean; message: string };

  // Excel Inbound & Outbound Import
  importInboundFromExcel: (
    rows: import('../utils/excelImport').ValidatedInboundRow[],
    options: InboundImportOptions
  ) => InboundImportResult;
  importOutboundFromExcel: (
    rows: import('../utils/excelOutboundImport').ValidatedOutboundRow[],
    options: OutboundImportOptions
  ) => OutboundImportResult;
}

export interface InboundImportOptions {
  groupingMode: 'SINGLE_VOUCHER' | 'BY_RECEIPT_CODE' | 'BY_PACKING_LIST';
  defaultWarehouse?: string;
  defaultDate?: string;
  defaultReason?: import('../types/inventory').InboundReason;
  defaultSupplier?: string;
  creator?: string;
  notes?: string;
}

export interface InboundImportResult {
  success: boolean;
  importedRowsCount: number;
  createdItemsCount: number;
  updatedItemsCount: number;
  createdTransactions: InventoryTransaction[];
  error?: string;
}

export interface OutboundImportOptions {
  groupingMode: 'SINGLE_VOUCHER' | 'BY_DISPATCH_CODE' | 'BY_RECEIVER';
  defaultWarehouse?: string;
  defaultDate?: string;
  defaultReason?: import('../types/inventory').OutboundReason;
  defaultReceiver?: string;
  defaultProject?: string;
  creator?: string;
  note?: string;
}

export interface OutboundImportResult {
  success: boolean;
  importedRowsCount: number;
  createdTransactions: InventoryTransaction[];
  error?: string;
}

const STORAGE_KEY = 'vattupro_inventory_v1';

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<InventoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_items`);
      return saved ? JSON.parse(saved) : INITIAL_ITEMS;
    } catch {
      return INITIAL_ITEMS;
    }
  });

  const [transactions, setTransactions] = useState<InventoryTransaction[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_transactions`);
      return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
    } catch {
      return INITIAL_TRANSACTIONS;
    }
  });

  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_presets`);
      return saved ? JSON.parse(saved) : DEFAULT_FILTER_PRESETS;
    } catch {
      return DEFAULT_FILTER_PRESETS;
    }
  });

  const [activeRules, setActiveRules] = useState<ConditionRule[]>([]);
  const [activeLogic, setActiveLogic] = useState<MatchLogic>('AND');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const [warehouses, setWarehouses] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_warehouses`);
      return saved ? JSON.parse(saved) : INITIAL_WAREHOUSES;
    } catch {
      return INITIAL_WAREHOUSES;
    }
  });

  const [categories, setCategories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_categories`);
      return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
    } catch {
      return INITIAL_CATEGORIES;
    }
  });

  const [suppliers] = useState<string[]>(INITIAL_SUPPLIERS);
  const [projects] = useState<string[]>(INITIAL_PROJECTS);
  const [manufacturers] = useState<string[]>(INITIAL_MANUFACTURERS);
  const [projectItems] = useState<string[]>(INITIAL_PROJECT_ITEMS);

  // Sync with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_items`, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to save items to localStorage', e);
    }
  }, [items]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_transactions`, JSON.stringify(transactions));
    } catch (e) {
      console.error('Failed to save transactions to localStorage', e);
    }
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_presets`, JSON.stringify(filterPresets));
    } catch (e) {
      console.error('Failed to save presets to localStorage', e);
    }
  }, [filterPresets]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_warehouses`, JSON.stringify(warehouses));
    } catch (e) {
      console.error('Failed to save warehouses to localStorage', e);
    }
  }, [warehouses]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_categories`, JSON.stringify(categories));
    } catch (e) {
      console.error('Failed to save categories to localStorage', e);
    }
  }, [categories]);

  // Actions
  const addItem = (newItemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString().slice(0, 10);
    const newItem: InventoryItem = {
      ...newItemData,
      id: `item-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };
    setItems(prev => [newItem, ...prev]);

    // Track warehouse and category
    if (newItem.warehouse && !warehouses.includes(newItem.warehouse)) {
      setWarehouses(prev => [...prev, newItem.warehouse]);
    }
    if (newItem.category && !categories.includes(newItem.category)) {
      setCategories(prev => [...prev, newItem.category]);
    }
  };

  const updateItem = (id: string, updates: Partial<InventoryItem>) => {
    const now = new Date().toISOString().slice(0, 10);
    setItems(prev =>
      prev.map(it => (it.id === id ? { ...it, ...updates, updatedAt: now } : it))
    );
  };

  const deleteItem = (id: string) => {
    setItems(prev => prev.filter(it => it.id !== id));
  };

  const deleteMultipleItems = (ids: string[]) => {
    if (!ids || ids.length === 0) return { success: false, count: 0 };
    setItems(prev => prev.filter(it => !ids.includes(it.id)));
    return { success: true, count: ids.length };
  };

  const addWarehouse = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, message: 'Tên kho không được để trống.' };
    }
    if (warehouses.includes(trimmed)) {
      return { success: false, message: `Kho "${trimmed}" đã tồn tại trong hệ thống.` };
    }
    setWarehouses(prev => [...prev, trimmed]);
    return { success: true, message: `Đã thêm kho "${trimmed}" thành công.` };
  };

  const renameWarehouse = (oldName: string, newName: string) => {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();

    if (!trimmedNew) {
      return { success: false, message: 'Tên kho mới không được để trống.', updatedItemsCount: 0, updatedTransactionsCount: 0 };
    }
    if (trimmedOld === trimmedNew) {
      return { success: false, message: 'Tên kho mới trùng với tên kho cũ.', updatedItemsCount: 0, updatedTransactionsCount: 0 };
    }
    if (warehouses.includes(trimmedNew)) {
      return { success: false, message: `Tên kho "${trimmedNew}" đã tồn tại trong hệ thống.`, updatedItemsCount: 0, updatedTransactionsCount: 0 };
    }

    // 1. Update warehouses list
    setWarehouses(prev => prev.map(w => (w === trimmedOld ? trimmedNew : w)));

    // 2. Cascade update items
    let updatedItemsCount = 0;
    setItems(prev =>
      prev.map(item => {
        if (item.warehouse === trimmedOld) {
          updatedItemsCount++;
          return { ...item, warehouse: trimmedNew };
        }
        return item;
      })
    );

    // 3. Cascade update transactions
    let updatedTransactionsCount = 0;
    setTransactions(prev =>
      prev.map(trans => {
        let isTransModified = false;
        let newTransWh = trans.warehouse;
        if (trans.warehouse === trimmedOld) {
          newTransWh = trimmedNew;
          isTransModified = true;
        }
        const newItems = trans.items.map(it => {
          if (it.warehouse === trimmedOld) {
            isTransModified = true;
            return { ...it, warehouse: trimmedNew };
          }
          return it;
        });

        if (isTransModified) {
          updatedTransactionsCount++;
          return { ...trans, warehouse: newTransWh, items: newItems };
        }
        return trans;
      })
    );

    return {
      success: true,
      message: `Đổi tên kho thành công sang "${trimmedNew}"! Đã đồng bộ ${updatedItemsCount} mặt hàng và ${updatedTransactionsCount} phiếu liên quan.`,
      updatedItemsCount,
      updatedTransactionsCount,
    };
  };

  const deleteWarehouse = (name: string) => {
    const trimmed = name.trim();
    const countItems = items.filter(it => it.warehouse === trimmed).length;
    if (countItems > 0) {
      return {
        success: false,
        message: `Không thể xóa kho "${trimmed}" vì đang có ${countItems} mặt hàng lưu trữ. Hãy chuyển vật tư sang kho khác trước khi xóa.`,
      };
    }
    setWarehouses(prev => prev.filter(w => w !== trimmed));
    return { success: true, message: `Đã xóa kho "${trimmed}" thành công.` };
  };

  const addCategory = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, message: 'Tên danh mục không được để trống.' };
    }
    if (categories.includes(trimmed)) {
      return { success: false, message: `Danh mục "${trimmed}" đã tồn tại trong hệ thống.` };
    }
    setCategories(prev => [...prev, trimmed]);
    return { success: true, message: `Đã thêm danh mục "${trimmed}" thành công.` };
  };

  const renameCategory = (oldName: string, newName: string) => {
    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();

    if (!trimmedNew) {
      return { success: false, message: 'Tên danh mục mới không được để trống.', updatedItemsCount: 0 };
    }
    if (trimmedOld === trimmedNew) {
      return { success: false, message: 'Tên danh mục mới trùng với tên cũ.', updatedItemsCount: 0 };
    }
    if (categories.includes(trimmedNew)) {
      return { success: false, message: `Danh mục "${trimmedNew}" đã tồn tại trong hệ thống.`, updatedItemsCount: 0 };
    }

    setCategories(prev => prev.map(c => (c === trimmedOld ? trimmedNew : c)));

    let updatedItemsCount = 0;
    setItems(prev =>
      prev.map(item => {
        if (item.category === trimmedOld) {
          updatedItemsCount++;
          return { ...item, category: trimmedNew };
        }
        return item;
      })
    );

    return {
      success: true,
      message: `Đổi tên danh mục thành công sang "${trimmedNew}"! Đã đồng bộ ${updatedItemsCount} mặt hàng liên quan.`,
      updatedItemsCount,
    };
  };

  const deleteCategory = (name: string, migrateToCategory?: string) => {
    const trimmed = name.trim();
    const itemsInCategory = items.filter(it => it.category === trimmed);
    const count = itemsInCategory.length;

    if (count > 0 && !migrateToCategory) {
      return {
        success: false,
        message: `Không thể xóa danh mục "${trimmed}" vì đang có ${count} mặt hàng thuộc nhóm này. Hãy chuyển các mặt hàng sang nhóm khác trước khi xóa.`,
      };
    }

    if (count > 0 && migrateToCategory) {
      const target = migrateToCategory.trim();
      setItems(prev =>
        prev.map(it => (it.category === trimmed ? { ...it, category: target } : it))
      );
    }

    setCategories(prev => prev.filter(c => c !== trimmed));
    return {
      success: true,
      message: count > 0 
        ? `Đã xóa danh mục "${trimmed}" và chuyển ${count} mặt hàng sang "${migrateToCategory}".`
        : `Đã xóa danh mục "${trimmed}" thành công.`,
    };
  };

  const createTransaction = (
    transData: Omit<InventoryTransaction, 'id' | 'createdAt'>
  ): { success: boolean; error?: string } => {
    // 1. Validate Outbound stock
    if (transData.type === 'OUTBOUND') {
      for (const line of transData.items) {
        const item = items.find(it => it.id === line.itemId);
        if (!item) {
          return { success: false, error: `Không tìm thấy vật tư mã ${line.itemCode}` };
        }
        if (item.currentStock < line.quantity) {
          return {
            success: false,
            error: `Số lượng xuất (${line.quantity} ${line.unit}) vượt quá tồn kho hiện tại (${item.currentStock} ${line.unit}) của mặt hàng [${item.code} - ${item.name}].`,
          };
        }
      }
    }

    // 2. Add transaction
    const now = new Date();
    const timeStr = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newTrans: InventoryTransaction = {
      ...transData,
      id: `trans-${Date.now()}`,
      createdAt: timeStr,
    };

    // 3. Update item stocks & unit price (if weighted average or replacement)
    setItems(prev => {
      return prev.map(item => {
        const line = transData.items.find(l => l.itemId === item.id);
        if (!line) return item;

        let newStock = item.currentStock;
        let newPrice = item.unitPrice;

        if (transData.type === 'INBOUND') {
          newStock += line.quantity;
          if (line.unitPrice > 0) {
            // Update unit price or average
            newPrice = line.unitPrice;
          }
        } else if (transData.type === 'OUTBOUND') {
          newStock = Math.max(0, newStock - line.quantity);
        }

        return {
          ...item,
          currentStock: newStock,
          unitPrice: newPrice,
          updatedAt: transData.date,
        };
      });
    });

    setTransactions(prev => [newTrans, ...prev]);
    return { success: true };
  };

  const deleteTransaction = (id: string): { success: boolean; error?: string; message?: string } => {
    const targetTrans = transactions.find(t => t.id === id);
    if (!targetTrans) {
      return { success: false, error: 'Không tìm thấy phiếu giao dịch cần xóa.' };
    }

    // Rollback item stock:
    setItems(prevItems => {
      return prevItems.map(item => {
        const line = targetTrans.items.find(l => l.itemId === item.id);
        if (!line) return item;

        let newStock = item.currentStock;
        if (targetTrans.type === 'INBOUND') {
          // Deleting INBOUND: subtract goods that were entered into stock
          newStock = Math.max(0, newStock - line.quantity);
        } else if (targetTrans.type === 'OUTBOUND') {
          // Deleting OUTBOUND: return goods back to inventory stock
          newStock = newStock + line.quantity;
        }
        return {
          ...item,
          currentStock: newStock,
          updatedAt: new Date().toISOString().slice(0, 10),
        };
      });
    });

    setTransactions(prev => prev.filter(t => t.id !== id));

    const typeLabel = targetTrans.type === 'INBOUND' ? 'phiếu nhập kho' : 'phiếu xuất kho';
    return {
      success: true,
      message: `Đã xóa thành công ${typeLabel} [${targetTrans.code}] và hoàn tác số lượng tồn kho của ${targetTrans.items.length} mặt hàng.`,
    };
  };

  const updateTransaction = (
    id: string,
    updates: Partial<InventoryTransaction>
  ): { success: boolean; error?: string; message?: string } => {
    const existingTrans = transactions.find(t => t.id === id);
    if (!existingTrans) {
      return { success: false, error: 'Không tìm thấy phiếu giao dịch cần chỉnh sửa.' };
    }

    // If line items updated, calculate delta and balance item stocks
    if (updates.items) {
      setItems(prevItems => {
        return prevItems.map(item => {
          const oldLine = existingTrans.items.find(l => l.itemId === item.id);
          const newLine = updates.items?.find(l => l.itemId === item.id);

          if (!oldLine && !newLine) return item;

          let newStock = item.currentStock;

          if (existingTrans.type === 'INBOUND') {
            // Revert old inbound quantity
            if (oldLine) newStock = Math.max(0, newStock - oldLine.quantity);
            // Apply new inbound quantity
            if (newLine) newStock += newLine.quantity;
          } else if (existingTrans.type === 'OUTBOUND') {
            // Revert old outbound (return to stock)
            if (oldLine) newStock += oldLine.quantity;
            // Apply new outbound (dispatch from stock)
            if (newLine) newStock = Math.max(0, newStock - newLine.quantity);
          }

          const newPrice = newLine && newLine.unitPrice > 0 ? newLine.unitPrice : item.unitPrice;

          return {
            ...item,
            currentStock: newStock,
            unitPrice: newPrice,
            updatedAt: updates.date || existingTrans.date,
          };
        });
      });
    }

    setTransactions(prev =>
      prev.map(t => (t.id === id ? { ...t, ...updates } : t))
    );

    return {
      success: true,
      message: `Đã cập nhật thông tin phiếu [${existingTrans.code}] thành công.`,
    };
  };

  const adjustStock = (itemId: string, newStock: number, reason: string, auditor: string) => {
    const item = items.find(it => it.id === itemId);
    if (!item) return;

    const diff = newStock - item.currentStock;
    const isSurplus = diff > 0;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${dateStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Create adjustment transaction
    const transCode = `PDC-${now.getFullYear()}-${String(Date.now()).slice(-4)}`;
    const newTrans: InventoryTransaction = {
      id: `trans-${Date.now()}`,
      code: transCode,
      type: 'AUDIT_ADJUSTMENT',
      subReason: isSurplus ? 'AUDIT_SURPLUS' : 'AUDIT_DEFICIT',
      date: dateStr,
      creator: auditor,
      receiverOrSupplier: 'Hệ thống kiểm kê kho',
      departmentOrProject: item.warehouse,
      warehouse: item.warehouse,
      status: 'COMPLETED',
      items: [
        {
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          unit: item.unit,
          quantity: Math.abs(diff),
          unitPrice: item.unitPrice,
          totalPrice: Math.abs(diff) * item.unitPrice,
          warehouse: item.warehouse,
          notes: `Điều chỉnh kiểm kê: ${reason} (Từ ${item.currentStock} -> ${newStock} ${item.unit})`,
        },
      ],
      totalAmount: Math.abs(diff) * item.unitPrice,
      note: `Biên bản kiểm kê điều chỉnh tồn kho: ${reason}`,
      createdAt: timeStr,
    };

    setItems(prev =>
      prev.map(it => (it.id === itemId ? { ...it, currentStock: newStock, updatedAt: dateStr } : it))
    );
    setTransactions(prev => [newTrans, ...prev]);
  };

  // Condition Rule Management
  const addConditionRule = (ruleData: Omit<ConditionRule, 'id'>) => {
    const newRule: ConditionRule = {
      ...ruleData,
      id: `rule-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    setActiveRules(prev => [...prev, newRule]);
    setActivePresetId(null);
  };

  const updateConditionRule = (id: string, updates: Partial<ConditionRule>) => {
    setActiveRules(prev =>
      prev.map(r => (r.id === id ? { ...r, ...updates } : r))
    );
    setActivePresetId(null);
  };

  const removeConditionRule = (id: string) => {
    setActiveRules(prev => prev.filter(r => r.id !== id));
    setActivePresetId(null);
  };

  const clearConditionRules = () => {
    setActiveRules([]);
    setActivePresetId(null);
  };

  const applyPreset = (presetId: string) => {
    const preset = filterPresets.find(p => p.id === presetId);
    if (!preset) return;

    setActiveRules(preset.rules);
    setActiveLogic(preset.logic);
    setActivePresetId(presetId);
  };

  const saveCustomPreset = (name: string, description: string) => {
    if (!name.trim() || activeRules.length === 0) return;

    const newPreset: FilterPreset = {
      id: `preset-custom-${Date.now()}`,
      name,
      description: description || `Bộ lọc gồm ${activeRules.length} điều kiện (${activeLogic})`,
      logic: activeLogic,
      rules: [...activeRules],
      isDefault: false,
    };

    setFilterPresets(prev => [...prev, newPreset]);
    setActivePresetId(newPreset.id);
  };

  const deletePreset = (presetId: string) => {
    setFilterPresets(prev => prev.filter(p => p.id !== presetId));
    if (activePresetId === presetId) {
      setActivePresetId(null);
    }
  };

  const resetToInitialData = () => {
    setItems(INITIAL_ITEMS);
    setTransactions(INITIAL_TRANSACTIONS);
    setFilterPresets(DEFAULT_FILTER_PRESETS);
    setWarehouses(INITIAL_WAREHOUSES);
    setCategories(INITIAL_CATEGORIES);
    setActiveRules([]);
    setActivePresetId(null);
    localStorage.clear();
  };

  const exportAllDataJSON = () => {
    const backupData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      items,
      transactions,
      filterPresets,
      warehouses,
      categories,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VatTuPro_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importAllDataJSON = (jsonString: string): { success: boolean; message: string } => {
    try {
      const data = JSON.parse(jsonString);
      if (!Array.isArray(data.items)) {
        return { success: false, message: 'Dữ liệu file JSON không đúng cấu trúc vật tư!' };
      }
      setItems(data.items);
      if (Array.isArray(data.transactions)) setTransactions(data.transactions);
      if (Array.isArray(data.filterPresets)) setFilterPresets(data.filterPresets);
      if (Array.isArray(data.warehouses)) setWarehouses(data.warehouses);
      if (Array.isArray(data.categories)) setCategories(data.categories);
      return { success: true, message: `Khôi phục thành công ${data.items.length} mặt hàng!` };
    } catch (err: any) {
      return { success: false, message: `Lỗi đọc file: ${err.message || 'Sai định dạng JSON'}` };
    }
  };

  const importInboundFromExcel = (
    rows: import('../utils/excelImport').ValidatedInboundRow[],
    options: InboundImportOptions
  ): InboundImportResult => {
    const validRows = rows.filter(r => r.isValid && r.quantity > 0);
    if (validRows.length === 0) {
      return {
        success: false,
        importedRowsCount: 0,
        createdItemsCount: 0,
        updatedItemsCount: 0,
        createdTransactions: [],
        error: 'Không có dòng dữ liệu hợp lệ nào để nhập kho.',
      };
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeStr = `${todayStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let currentItems = [...items];
    let newWarehouses = [...warehouses];
    let newCategories = [...categories];

    let createdItemsCount = 0;
    let updatedItemsCount = 0;

    const lineItemAssignments: { row: typeof validRows[0]; itemId: string }[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const targetWarehouse = row.warehouse || options.defaultWarehouse || 'Kho Tổng A (Hà Nội)';
      const existingIndex = currentItems.findIndex(
        it => it.code.trim().toLowerCase() === row.itemCode.trim().toLowerCase()
      );

      let itemId: string;

      if (existingIndex >= 0) {
        const existing = currentItems[existingIndex];
        itemId = existing.id;
        const newStock = existing.currentStock + row.quantity;
        const newPrice = (row.unitPrice !== undefined && row.unitPrice > 0) ? row.unitPrice : existing.unitPrice;

        currentItems[existingIndex] = {
          ...existing,
          currentStock: newStock,
          unitPrice: newPrice,
          modelSpecs: row.modelSpecs || existing.modelSpecs,
          packingListNo: row.packingListNo || existing.packingListNo,
          shipment: row.shipment || existing.shipment,
          manufacturer: row.manufacturer || existing.manufacturer,
          packageNo: row.packageNo || existing.packageNo,
          packageName: row.packageName || existing.packageName,
          projectItem: row.projectItem || existing.projectItem,
          lotNumber: row.lotNumber || existing.lotNumber,
          serialNumber: row.serialNumber || existing.serialNumber,
          locationBin: row.locationBin || existing.locationBin,
          updatedAt: row.date || todayStr,
        };
        updatedItemsCount++;
      } else {
        itemId = `item-${Date.now()}-${i}`;
        const newItem: InventoryItem = {
          id: itemId,
          code: row.itemCode.trim(),
          name: row.itemName.trim(),
          type: row.normalizedType,
          category: row.category || 'Chung',
          unit: row.unit || 'Cái',
          warehouse: targetWarehouse,
          locationBin: row.locationBin || '',
          modelSpecs: row.modelSpecs || '',
          serialNumber: row.serialNumber || undefined,
          lotNumber: row.lotNumber || undefined,
          packingListNo: row.packingListNo || undefined,
          shipment: row.shipment || undefined,
          manufacturer: row.manufacturer || undefined,
          packageNo: row.packageNo || undefined,
          packageName: row.packageName || undefined,
          projectItem: row.projectItem || undefined,
          minStock: 5,
          maxStock: 100,
          reorderPoint: 10,
          currentStock: row.quantity,
          unitPrice: row.unitPrice || 0,
          condition: 'NEW',
          supplier: row.supplier || options.defaultSupplier || 'Nhà cung cấp',
          notes: row.notes || 'Nhập từ file Excel',
          createdAt: row.date || todayStr,
          updatedAt: row.date || todayStr,
        };

        currentItems = [newItem, ...currentItems];
        createdItemsCount++;
      }

      lineItemAssignments.push({ row, itemId });

      if (targetWarehouse && !newWarehouses.includes(targetWarehouse)) {
        newWarehouses.push(targetWarehouse);
      }
      if (row.category && !newCategories.includes(row.category)) {
        newCategories.push(row.category);
      }
    }

    // Grouping into transactions
    const groups: { key: string; items: { row: typeof validRows[0]; itemId: string }[] }[] = [];

    lineItemAssignments.forEach(entry => {
      let groupKey = 'SINGLE';
      if (options.groupingMode === 'BY_RECEIPT_CODE') {
        groupKey = entry.row.receiptCode?.trim() || 'DEFAULT';
      } else if (options.groupingMode === 'BY_PACKING_LIST') {
        groupKey = entry.row.packingListNo?.trim() || 'DEFAULT';
      }

      let group = groups.find(g => g.key === groupKey);
      if (!group) {
        group = { key: groupKey, items: [] };
        groups.push(group);
      }
      group.items.push(entry);
    });

    const newTransactions: InventoryTransaction[] = [];

    groups.forEach((group, gIdx) => {
      const firstRow = group.items[0].row;
      const targetWarehouse = firstRow.warehouse || options.defaultWarehouse || 'Kho Tổng A (Hà Nội)';
      const targetDate = firstRow.date || options.defaultDate || todayStr;
      const targetSupplier = firstRow.supplier || options.defaultSupplier || 'Nhà cung cấp vật tư';
      const targetReason = firstRow.normalizedReason || options.defaultReason || 'PURCHASE';

      const lineItems = group.items.map(entry => {
        const r = entry.row;
        const total = r.quantity * (r.unitPrice || 0);
        return {
          itemId: entry.itemId,
          itemCode: r.itemCode,
          itemName: r.itemName,
          unit: r.unit,
          quantity: r.quantity,
          unitPrice: r.unitPrice || 0,
          totalPrice: total,
          lotNumber: r.lotNumber,
          serialNumber: r.serialNumber,
          packageNo: r.packageNo,
          packageName: r.packageName,
          manufacturer: r.manufacturer,
          packingListNo: r.packingListNo,
          warehouse: r.warehouse || targetWarehouse,
          notes: r.notes,
        };
      });

      const totalAmount = lineItems.reduce((acc, it) => acc + it.totalPrice, 0);

      let receiptCode = firstRow.receiptCode?.trim();
      if (!receiptCode || receiptCode === 'DEFAULT') {
        receiptCode = `PNK-IMP-${now.getFullYear()}-${String(gIdx + 1).padStart(3, '0')}-${String(Date.now()).slice(-4)}`;
      }

      const newTrans: InventoryTransaction = {
        id: `trans-${Date.now()}-${gIdx}`,
        code: receiptCode,
        type: 'INBOUND',
        subReason: targetReason,
        date: targetDate,
        creator: options.creator || 'Admin Kho',
        receiverOrSupplier: targetSupplier,
        departmentOrProject: firstRow.projectItem || targetWarehouse,
        projectItem: firstRow.projectItem,
        packingListNo: firstRow.packingListNo,
        shipment: firstRow.shipment,
        warehouse: targetWarehouse,
        status: 'COMPLETED',
        items: lineItems,
        totalAmount,
        note: options.notes || `Nhập kho tự động từ tệp Excel (${lineItems.length} mặt hàng${firstRow.packingListNo ? `, PL: ${firstRow.packingListNo}` : ''})`,
        createdAt: timeStr,
      };

      newTransactions.push(newTrans);
    });

    setItems(currentItems);
    setTransactions(prev => [...newTransactions, ...prev]);
    setWarehouses(newWarehouses);
    setCategories(newCategories);

    return {
      success: true,
      importedRowsCount: validRows.length,
      createdItemsCount,
      updatedItemsCount,
      createdTransactions: newTransactions,
    };
  };

  const importOutboundFromExcel = (
    rows: import('../utils/excelOutboundImport').ValidatedOutboundRow[],
    options: OutboundImportOptions
  ): OutboundImportResult => {
    const validRows = rows.filter(r => r.isValid && r.quantity > 0 && r.isStockSufficient);
    if (validRows.length === 0) {
      return {
        success: false,
        importedRowsCount: 0,
        createdTransactions: [],
        error: 'Không có dòng dữ liệu hợp lệ nào (đủ tồn kho và hợp lệ thông tin) để xuất.',
      };
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const timeStr = `${todayStr} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let currentItems = [...items];

    // Deduct stock for each valid row
    validRows.forEach(row => {
      const idx = currentItems.findIndex(
        it => it.code.trim().toLowerCase() === row.itemCode.trim().toLowerCase()
      );
      if (idx >= 0) {
        currentItems[idx] = {
          ...currentItems[idx],
          currentStock: Math.max(0, currentItems[idx].currentStock - row.quantity),
          updatedAt: row.date || todayStr,
        };
      }
    });

    // Grouping
    const groups: { key: string; items: typeof validRows }[] = [];
    validRows.forEach(row => {
      let groupKey = 'SINGLE';
      if (options.groupingMode === 'BY_DISPATCH_CODE') {
        groupKey = row.dispatchCode?.trim() || 'DEFAULT';
      } else if (options.groupingMode === 'BY_RECEIVER') {
        groupKey = row.receiver?.trim() || 'DEFAULT';
      }

      let group = groups.find(g => g.key === groupKey);
      if (!group) {
        group = { key: groupKey, items: [] };
        groups.push(group);
      }
      group.items.push(row);
    });

    const newTransactions: InventoryTransaction[] = [];

    groups.forEach((group, gIdx) => {
      const firstRow = group.items[0];
      const targetWarehouse = firstRow.warehouse || options.defaultWarehouse || 'Kho Tổng A (Hà Nội)';
      const targetDate = firstRow.date || options.defaultDate || todayStr;
      const targetReceiver = firstRow.receiver || options.defaultReceiver || 'Đơn vị tiếp nhận';
      const targetDeptProject = firstRow.departmentOrProject || options.defaultProject || '';
      const targetReason = firstRow.normalizedReason || options.defaultReason || 'PROJECT_DISPATCH';

      const lineItems = group.items.map(r => {
        const matchedItem = items.find(it => it.code.trim().toLowerCase() === r.itemCode.trim().toLowerCase());
        const total = r.quantity * (r.unitPrice || 0);
        return {
          itemId: matchedItem?.id || `item-unk-${r.itemCode}`,
          itemCode: r.itemCode,
          itemName: r.itemName,
          unit: r.unit,
          quantity: r.quantity,
          unitPrice: r.unitPrice || 0,
          totalPrice: total,
          packageNo: r.packageNo,
          packageName: r.packageName,
          packingListNo: r.packingListNo,
          lotNumber: r.lotNumber,
          serialNumber: r.serialNumber,
          warehouse: r.warehouse || targetWarehouse,
          notes: r.notes,
        };
      });

      const totalAmount = lineItems.reduce((acc, it) => acc + it.totalPrice, 0);

      let dispatchCode = firstRow.dispatchCode?.trim();
      if (!dispatchCode || dispatchCode === 'DEFAULT') {
        dispatchCode = `PXK-IMP-${now.getFullYear()}-${String(gIdx + 1).padStart(3, '0')}-${String(Date.now()).slice(-4)}`;
      }

      const newTrans: InventoryTransaction = {
        id: `trans-out-${Date.now()}-${gIdx}`,
        code: dispatchCode,
        type: 'OUTBOUND',
        subReason: targetReason,
        date: targetDate,
        creator: options.creator || 'Thủ kho xuất',
        receiverOrSupplier: targetReceiver,
        departmentOrProject: targetDeptProject,
        projectItem: firstRow.projectItem,
        packingListNo: firstRow.packingListNo,
        shipment: firstRow.shipment,
        warehouse: targetWarehouse,
        status: 'COMPLETED',
        items: lineItems,
        totalAmount,
        note: options.note || `Xuất kho tự động từ tệp Excel (${lineItems.length} mặt hàng xuất cho ${targetReceiver})`,
        createdAt: timeStr,
      };

      newTransactions.push(newTrans);
    });

    setItems(currentItems);
    setTransactions(prev => [...newTransactions, ...prev]);

    return {
      success: true,
      importedRowsCount: validRows.length,
      createdTransactions: newTransactions,
    };
  };

  return (
    <InventoryContext.Provider
      value={{
        items,
        transactions,
        filterPresets,
        activeRules,
        activeLogic,
        activePresetId,
        warehouses,
        categories,
        suppliers,
        projects,
        manufacturers,
        projectItems,
        addItem,
        updateItem,
        deleteItem,
        deleteMultipleItems,
        addWarehouse,
        renameWarehouse,
        deleteWarehouse,
        addCategory,
        renameCategory,
        deleteCategory,
        createTransaction,
        updateTransaction,
        deleteTransaction,
        adjustStock,
        setActiveRules,
        addConditionRule,
        updateConditionRule,
        removeConditionRule,
        clearConditionRules,
        setActiveLogic,
        applyPreset,
        saveCustomPreset,
        deletePreset,
        resetToInitialData,
        exportAllDataJSON,
        importAllDataJSON,
        importInboundFromExcel,
        importOutboundFromExcel,
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

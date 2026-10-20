import { InventoryItem, Transaction, User, Warehouse } from '../types/inventory';
import { calculateItemWarehouseStocks } from './formatters';

/**
 * Hợp nhất danh sách người dùng theo cơ chế thêm vào (Additive Merge).
 * Giữ nguyên tất cả người dùng được tạo trên các thiết bị, không xóa hoặc ghi đè mất người dùng.
 */
export function mergeUsersAdditive(localUsers: User[], remoteUsers: User[]): User[] {
  const userMap = new Map<string, User>();

  // Normalize key: username hoặc id
  const getKey = (u: User) => (u.username || u.id).trim().toLowerCase();

  // 1. Thêm toàn bộ người dùng local
  localUsers.forEach(u => {
    userMap.set(getKey(u), u);
  });

  // 2. Hợp nhất người dùng remote
  remoteUsers.forEach(remoteU => {
    const key = getKey(remoteU);
    const existing = userMap.get(key);

    if (!existing) {
      // Người dùng mới được tạo từ thiết bị khác -> THÊM VÀO
      userMap.set(key, remoteU);
    } else {
      // Đã có trong danh sách -> Cập nhật thông tin mới nhất (phiên làm việc, trạng thái, mật khẩu...)
      const remoteTime = remoteU.lastActiveAt ? new Date(remoteU.lastActiveAt).getTime() : 0;
      const localTime = existing.lastActiveAt ? new Date(existing.lastActiveAt).getTime() : 0;

      const useRemoteSession =
        remoteTime >= localTime ||
        (remoteU.activeDeviceId && !existing.activeDeviceId) ||
        remoteU.status === 'LOCKED';

      userMap.set(key, {
        ...existing,
        ...remoteU,
        id: remoteU.id || existing.id,
        role: remoteU.role || existing.role,
        password: remoteU.password || existing.password,
        status: remoteU.status || existing.status,
        activeDeviceId: useRemoteSession ? remoteU.activeDeviceId : existing.activeDeviceId,
        activeDeviceName: useRemoteSession ? remoteU.activeDeviceName : existing.activeDeviceName,
        lastActiveAt: useRemoteSession ? remoteU.lastActiveAt : existing.lastActiveAt,
      });
    }
  });

  return Array.from(userMap.values());
}

/**
 * Hợp nhất danh sách giao dịch (Phiếu nhập kho / xuất kho) theo cơ chế thêm vào.
 * Tuyệt đối không xóa hay thay thế phiếu của người khác đã tạo.
 */
export function mergeTransactionsAdditive(
  localTrx: Transaction[],
  remoteTrx: Transaction[]
): Transaction[] {
  const trxMap = new Map<string, Transaction>();

  // 1. Thêm tất cả phiếu local
  localTrx.forEach(t => {
    const key = (t.id || t.code).trim();
    trxMap.set(key, t);
  });

  // 2. Hợp nhất phiếu remote
  remoteTrx.forEach(t => {
    const key = (t.id || t.code).trim();
    const existing = trxMap.get(key);

    if (!existing) {
      // Phiếu mới tạo từ thiết bị khác -> THÊM VÀO
      trxMap.set(key, t);
    } else {
      // Đã tồn tại (ví dụ Admin chỉnh sửa nội dung phiếu) -> cập nhật phiên bản mới nhất
      trxMap.set(key, {
        ...existing,
        ...t,
        items: t.items && t.items.length > 0 ? t.items : existing.items,
        totalAmount: t.totalAmount !== undefined ? t.totalAmount : existing.totalAmount,
      });
    }
  });

  // Sắp xếp theo ngày giảm dần (phiếu mới nhất lên đầu)
  return Array.from(trxMap.values()).sort((a, b) => {
    const timeA = new Date(a.date).getTime() || 0;
    const timeB = new Date(b.date).getTime() || 0;
    return timeB - timeA;
  });
}

/**
 * Hợp nhất danh mục kho lưu trữ theo cơ chế thêm vào.
 */
export function mergeWarehousesAdditive(
  localWh: Warehouse[],
  remoteWh: Warehouse[]
): Warehouse[] {
  const whMap = new Map<string, Warehouse>();

  localWh.forEach(w => {
    const key = (w.id || w.code).trim();
    whMap.set(key, w);
  });

  remoteWh.forEach(w => {
    const key = (w.id || w.code).trim();
    const existing = whMap.get(key);
    if (!existing) {
      whMap.set(key, w);
    } else {
      whMap.set(key, {
        ...existing,
        ...w,
      });
    }
  });

  return Array.from(whMap.values());
}

/**
 * Hợp nhất danh mục vật tư / thiết bị theo cơ chế thêm vào.
 * Không làm mất mặt hàng nào của bất kỳ thiết bị nào khai báo.
 */
export function mergeItemsAdditive(
  localItems: InventoryItem[],
  remoteItems: InventoryItem[],
  warehouses: Warehouse[],
  mergedTransactions: Transaction[]
): InventoryItem[] {
  const itemMap = new Map<string, InventoryItem>();

  const getItemKey = (item: InventoryItem) => {
    if (item.code && item.code.trim()) {
      return item.code.trim().toUpperCase();
    }
    return item.id.trim();
  };

  // 1. Thêm tất cả mặt hàng local
  localItems.forEach(i => {
    itemMap.set(getItemKey(i), i);
  });

  // 2. Hợp nhất mặt hàng remote
  remoteItems.forEach(remoteItem => {
    const key = getItemKey(remoteItem);
    const existing = itemMap.get(key);

    if (!existing) {
      // Mặt hàng mới khai báo từ thiết bị khác -> THÊM VÀO
      itemMap.set(key, remoteItem);
    } else {
      // Đã có -> Hợp nhất thông tin thuộc tính
      const remoteTime = remoteItem.updatedAt ? new Date(remoteItem.updatedAt).getTime() : 0;
      const localTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

      const newer = remoteTime >= localTime ? remoteItem : existing;
      const older = remoteTime >= localTime ? existing : remoteItem;

      // Hợp nhất warehouseStocks
      const mergedWarehouseStocks = {
        ...(older.warehouseStocks || {}),
        ...(newer.warehouseStocks || {}),
      };

      itemMap.set(key, {
        ...older,
        ...newer,
        id: existing.id || remoteItem.id,
        code: (existing.code || remoteItem.code).trim().toUpperCase(),
        warehouseStocks:
          Object.keys(mergedWarehouseStocks).length > 0 ? mergedWarehouseStocks : undefined,
        currentStock: Math.max(newer.currentStock, older.currentStock),
      });
    }
  });

  const merged = Array.from(itemMap.values());

  // Tái tính toán tồn kho theo từng kho và tổng tồn kho dựa trên toàn bộ giao dịch đã hợp nhất
  return merged.map(item => {
    const stocks = calculateItemWarehouseStocks(item, warehouses, mergedTransactions);
    const totalStock = Object.values(stocks).reduce((a, b) => a + b, 0);
    return {
      ...item,
      warehouseStocks: stocks,
      currentStock: totalStock > 0 ? totalStock : item.currentStock,
    };
  });
}

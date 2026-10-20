import {
  EquipmentCondition,
  InventoryItem,
  IssueSubtype,
  ItemType,
  ReceiptSubtype,
  StockStatus,
  TransactionSubtype,
  TransactionType,
  UserRole,
  Warehouse,
  Transaction,
} from '../types/inventory';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('vi-VN').format(num);
};

export const formatDate = (dateString?: string): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
};

export const formatDateTime = (dateString?: string): string => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return dateString;
  }
};

export const getItemTypeLabel = (type: ItemType): string => {
  switch (type) {
    case 'VAT_TU':
      return 'Vật tư tiêu hao';
    case 'THIET_BI':
      return 'Thiết bị máy móc';
    case 'CONG_CU':
      return 'Công cụ dụng cụ';
    case 'PHU_TUNG':
      return 'Phụ tùng thay thế';
    default:
      return type;
  }
};

export const getStockStatus = (item: Pick<InventoryItem, 'currentStock' | 'minStock' | 'maxStock'>): StockStatus => {
  if (item.currentStock <= 0) return 'HET_HANG';
  if (item.currentStock < item.minStock) return 'CANH_BAO_THAP';
  if (item.maxStock > 0 && item.currentStock > item.maxStock) return 'VUOT_DINH_MUC';
  return 'BINH_THUONG';
};

export const getStockStatusLabel = (status: StockStatus): string => {
  switch (status) {
    case 'HET_HANG':
      return 'Hết hàng';
    case 'CANH_BAO_THAP':
      return 'Dưới định mức min';
    case 'VUOT_DINH_MUC':
      return 'Vượt định mức max';
    case 'BINH_THUONG':
      return 'Đủ tồn kho';
    default:
      return status;
  }
};

export const getConditionLabel = (condition?: EquipmentCondition): string => {
  switch (condition) {
    case 'SAN_SANG':
      return 'Sẵn sàng sử dụng';
    case 'DANG_MUON':
      return 'Đang cấp công trường / mượn';
    case 'BAO_DUONG':
      return 'Bảo dưỡng / Kiểm định';
    case 'HONG_CHO_SUA':
      return 'Hỏng hóc / Chờ sửa';
    default:
      return 'Bình thường';
  }
};

export const getTransactionTypeLabel = (type: TransactionType): string => {
  return type === 'NHAP_KHO' ? 'Nhập kho' : 'Xuất kho';
};

export const getSubtypeLabel = (subtype: TransactionSubtype): string => {
  const map: Record<ReceiptSubtype | IssueSubtype, string> = {
    NHAP_MUA_MOI: 'Nhập mua mới',
    NHAP_THU_HOI_DU_AN: 'Thu hồi từ dự án',
    NHAP_TRA_SAU_MUON: 'Hoàn trả sau mượn',
    NHAP_CHUYEN_KHO: 'Nhập điều chuyển kho',
    NHAP_DIEU_CHINH: 'Nhập cân đối kiểm kê',
    XUAT_THI_CONG: 'Xuất thi công công trình',
    XUAT_PHONG_BAN: 'Cấp phát phòng ban',
    XUAT_CHO_MUON: 'Xuất mượn thi công',
    XUAT_BAO_DUONG: 'Xuất gửi bảo dưỡng/sửa chữa',
    XUAT_CHUYEN_KHO: 'Xuất điều chuyển kho',
    XUAT_THANH_LY: 'Xuất thanh lý / hủy',
  };
  return map[subtype as keyof typeof map] || subtype;
};

export const getUserRoleLabel = (role: UserRole): string => {
  switch (role) {
    case 'ADMIN':
      return 'Quản trị viên (Toàn quyền)';
    case 'THU_KHO':
      return 'Thủ kho (Nhập / Xuất)';
    case 'NHAN_VIEN':
      return 'Nhân viên kỹ thuật (Chỉ xem)';
    default:
      return role;
  }
};

// Export to CSV with UTF-8 BOM for Excel
export const exportToCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const processCell = (cell: string | number) => {
    let str = cell === null || cell === undefined ? '' : String(cell);
    str = str.replace(/"/g, '""');
    if (str.search(/("|,|\n)/g) >= 0) {
      str = `"${str}"`;
    }
    return str;
  };

  const csvContent =
    '\uFEFF' + // UTF-8 BOM
    [headers.map(processCell).join(','), ...rows.map(row => row.map(processCell).join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Tính toán phân bổ số lượng tồn kho của một mặt hàng theo từng kho lưu trữ cụ thể.
 * Kết hợp thông tin cấu hình ban đầu và toàn bộ luồng giao dịch Nhập - Xuất kho thực tế.
 */
export const calculateItemWarehouseStocks = (
  item: InventoryItem,
  warehouses: Warehouse[],
  transactions: Transaction[]
): Record<string, number> => {
  const result: Record<string, number> = {};
  warehouses.forEach(w => {
    result[w.id] = 0;
  });

  // 1. Nếu mặt hàng đã có cấu hình explicit warehouseStocks
  if (item.warehouseStocks && Object.keys(item.warehouseStocks).length > 0) {
    warehouses.forEach(w => {
      if (item.warehouseStocks?.[w.id] !== undefined) {
        result[w.id] = Math.max(0, item.warehouseStocks[w.id]);
      }
    });
    return result;
  }

  // 2. Tính toán theo luồng giao dịch thực tế tại từng kho
  const activeTrx = transactions.filter(t => t.status !== 'DA_HUY');
  const whMovements: Record<string, { inQty: number; outQty: number }> = {};
  warehouses.forEach(w => {
    whMovements[w.id] = { inQty: 0, outQty: 0 };
  });

  let totalNetTransactions = 0;

  activeTrx.forEach(trx => {
    const whId = trx.warehouseId;
    if (!whMovements[whId]) {
      whMovements[whId] = { inQty: 0, outQty: 0 };
    }
    const matchingLines = trx.items.filter(
      l =>
        l.itemId === item.id ||
        (l.itemCode &&
          item.code &&
          l.itemCode.trim().toUpperCase() === item.code.trim().toUpperCase())
    );
    matchingLines.forEach(line => {
      if (trx.type === 'NHAP_KHO') {
        whMovements[whId].inQty += line.quantity;
        totalNetTransactions += line.quantity;
      } else if (trx.type === 'XUAT_KHO') {
        whMovements[whId].outQty += line.quantity;
        totalNetTransactions -= line.quantity;
      }
    });
  });

  const primaryWhId = item.warehouseId || warehouses[0]?.id || 'WH-HN';
  const baselineOpening = Math.max(0, item.currentStock - totalNetTransactions);

  warehouses.forEach(w => {
    const net = (whMovements[w.id]?.inQty || 0) - (whMovements[w.id]?.outQty || 0);
    if (w.id === primaryWhId) {
      result[w.id] = Math.max(0, baselineOpening + net);
    } else {
      result[w.id] = Math.max(0, net);
    }
  });

  const sumAll = Object.values(result).reduce((a, b) => a + b, 0);
  if (sumAll === 0 && item.currentStock > 0) {
    result[primaryWhId] = item.currentStock;
  }

  return result;
};

export const getItemStockInWarehouse = (
  item: InventoryItem,
  warehouseId: string,
  warehouses: Warehouse[],
  transactions: Transaction[]
): number => {
  const stocks = calculateItemWarehouseStocks(item, warehouses, transactions);
  return stocks[warehouseId] || 0;
};


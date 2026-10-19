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

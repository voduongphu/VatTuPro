export type ItemType = 'VAT_TU' | 'THIET_BI' | 'CONG_CU' | 'PHU_TUNG';

export type StockStatus = 'BINH_THUONG' | 'CANH_BAO_THAP' | 'HET_HANG' | 'VUOT_DINH_MUC';

export type EquipmentCondition = 'SAN_SANG' | 'DANG_MUON' | 'BAO_DUONG' | 'HONG_CHO_SUA';

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  manager: string;
  phone?: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
}

export interface InventoryItem {
  id: string;
  code: string; // SKU: e.g. VT-CD-001, TB-DK-012
  name: string;
  type: ItemType;
  category: string; // e.g. Cơ điện, Xây dựng, An toàn BHLĐ, Thiết bị đo đạc, v.v.
  unit: string; // e.g. Cái, Mét, Kg, Bộ, Cuộn, Cây, Thùng
  warehouseId: string;
  location: string; // e.g. Kệ A2-03, Khoang B
  minStock: number; // Mức tồn tối thiểu
  maxStock: number; // Mức tồn tối đa
  currentStock: number; // Tồn hiện tại
  unitPrice: number; // Đơn giá vốn bình quân (VNĐ)
  serialOrLot?: string; // Số serial thiết bị hoặc số lô vật tư
  condition?: EquipmentCondition; // Dành cho thiết bị, công cụ
  supplierDefault?: string;
  inspectionDueDate?: string; // Hạn kiểm định / bảo dưỡng thiết bị
  spec?: string; // Thông số kỹ thuật
  updatedAt: string;
}

export type TransactionType = 'NHAP_KHO' | 'XUAT_KHO';

export type ReceiptSubtype =
  | 'NHAP_MUA_MOI'
  | 'NHAP_THU_HOI_DU_AN'
  | 'NHAP_TRA_SAU_MUON'
  | 'NHAP_CHUYEN_KHO'
  | 'NHAP_DIEU_CHINH';

export type IssueSubtype =
  | 'XUAT_THI_CONG'
  | 'XUAT_PHONG_BAN'
  | 'XUAT_CHO_MUON'
  | 'XUAT_BAO_DUONG'
  | 'XUAT_CHUYEN_KHO'
  | 'XUAT_THANH_LY';

export type TransactionSubtype = ReceiptSubtype | IssueSubtype;

export interface TransactionLineItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  serialNumber?: string;
  note?: string;
  // Metadata for auto-registering new item when creating Goods Receipt
  isNewItem?: boolean;
  type?: ItemType;
  category?: string;
  location?: string;
  minStock?: number;
  maxStock?: number;
  condition?: EquipmentCondition;
  spec?: string;
}

export interface Transaction {
  id: string;
  code: string; // e.g. PN-2026-001, PX-2026-042
  type: TransactionType;
  subtype: TransactionSubtype;
  date: string; // YYYY-MM-DD HH:mm
  warehouseId: string;
  partnerName: string; // Nhà cung cấp (nếu Nhập) hoặc Người/Đơn vị nhận (nếu Xuất)
  departmentOrProject: string; // Dự án thi công hoặc Phòng ban liên quan
  creatorName: string;
  approverName?: string;
  notes: string;
  items: TransactionLineItem[];
  totalAmount: number;
  status: 'HOAN_THANH' | 'CHO_DUYET' | 'DA_HUY';
}

export interface MultiFilterCriteria {
  searchQuery: string; // Tìm mã, tên, serial, spec
  warehouses: string[]; // Danh sách kho lọc
  itemTypes: ItemType[]; // Loại mặt hàng
  categories: string[]; // Danh mục/nhóm
  stockStatuses: StockStatus[]; // Trạng thái tồn
  equipmentConditions: EquipmentCondition[]; // Tình trạng thiết bị
  minStockQty?: number;
  maxStockQty?: number;
  minValue?: number; // Giá trị tồn min (VNĐ)
  maxValue?: number; // Giá trị tồn max (VNĐ)
  supplier?: string;
  needsInspection?: boolean; // Sắp đến hạn kiểm định trong 30 ngày hoặc quá hạn
  dateRangePreset?: 'ALL' | 'TODAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'THIS_QUARTER';
  startDate?: string;
  endDate?: string;
}

export interface StockLedgerEntry {
  transactionId: string;
  transactionCode: string;
  date: string;
  type: TransactionType;
  subtype: TransactionSubtype;
  partner: string;
  departmentOrProject: string;
  inQty: number;
  outQty: number;
  unitPrice: number;
  balanceQty: number;
  notes: string;
}

// User & Role Definition
export type UserRole = 'ADMIN' | 'THU_KHO' | 'NHAN_VIEN';

export interface User {
  id: string;
  username: string;
  password: string; // in local storage for access control
  fullName: string;
  role: UserRole;
  email: string;
  phone: string;
  assignedWarehouseId: string; // 'ALL' or warehouse id
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
  lastLogin?: string;
  // Multi-device Single Session Tracking
  activeDeviceId?: string | null;
  activeDeviceName?: string | null;
  lastActiveAt?: string | null;
}

export interface ImportTransactionRow {
  code?: string;
  type: TransactionType;
  subtype: TransactionSubtype;
  date: string;
  warehouseCodeOrName: string;
  partnerName: string;
  departmentOrProject: string;
  itemCode: string;
  quantity: number;
  unitPrice?: number;
  note?: string;
  status?: string;
  error?: string;
}

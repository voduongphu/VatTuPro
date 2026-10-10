/**
 * Data structures for Material & Equipment Inventory Management System
 * (Hệ thống Quản lý Nhập Xuất Tồn Vật tư & Thiết bị)
 */

export type ItemType = 'VAT_TU' | 'THIET_BI' | 'CONG_CU' | 'PHU_TUNG';

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  VAT_TU: 'Vật tư tiêu hao',
  THIET_BI: 'Thiết bị máy móc',
  CONG_CU: 'Công cụ dụng cụ',
  PHU_TUNG: 'Phụ tùng linh kiện',
};

export type ItemCondition = 'NEW' | 'GOOD' | 'NEED_MAINTENANCE' | 'UNDER_REPAIR' | 'LIQUIDATED';

export const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
  NEW: 'Mới 100%',
  GOOD: 'Hoạt động tốt',
  NEED_MAINTENANCE: 'Cần bảo dưỡng',
  UNDER_REPAIR: 'Đang sửa chữa',
  LIQUIDATED: 'Chờ thanh lý / Hỏng',
};

export interface InventoryItem {
  id: string;
  code: string;            // Mã vật tư: VT-101, TB-202...
  name: string;            // Tên vật tư thiết bị
  type: ItemType;          // Phân loại
  category: string;        // Nhóm: Cơ khí, Điện - Tự động hóa, Xây dựng, Hóa chất, Bảo hộ...
  unit: string;            // Đơn vị tính: Cái, Mét, Kg, Bộ, Cuộn, Lít...
  warehouse: string;       // Kho lưu trữ: Kho Tổng A, Kho Kỹ thuật B, Kho Dự án...
  locationBin: string;     // Kệ / Ngăn: Kệ K01-N2, Tủ T-03...
  modelSpecs: string;      // Model / Quy cách kỹ thuật
  serialNumber?: string;   // Số Serial (cho thiết bị)
  lotNumber?: string;      // Số Lô (cho vật tư)
  
  // Thông tin logistics, đóng gói & dự án
  packingListNo?: string;  // Số Packing List (Ví dụ: PL-2026-EU-084)
  shipment?: string;       // Lô hàng / Chuyến vận chuyển (Ví dụ: SHP-2026-C01, Cont MSKU-91823)
  manufacturer?: string;   // Nhà sản xuất / Hãng chế tạo (Ví dụ: Siemens, Schneider, Jasic, Bosch)
  packageNo?: string;      // Số kiện (Ví dụ: Kiện 01/10, PK-04)
  packageName?: string;    // Tên kiện / Mô tả kiện hàng (Ví dụ: Kiện Pallet gỗ khung máy, Thùng Carton)
  projectItem?: string;    // Hạng mục công trình / Gói thầu (Ví dụ: Hạng mục Cơ điện M&E Tầng 1-5, Kết cấu thép)

  minStock: number;        // Tồn tối thiểu
  maxStock: number;        // Tồn tối đa
  reorderPoint: number;    // Điểm đặt hàng lại
  currentStock: number;    // Tồn kho hiện tại
  unitPrice: number;       // Đơn giá ước tính (VNĐ)
  condition: ItemCondition; // Tình trạng
  lastMaintenanceDate?: string; // Ngày bảo dưỡng gần nhất
  nextMaintenanceDate?: string; // Lịch bảo dưỡng kế tiếp
  expiryDate?: string;     // Hạn sử dụng (nếu có)
  allocatedProject?: string; // Dự án / Phòng ban đang sử dụng
  supplier: string;        // Nhà cung cấp chính
  notes?: string;          // Ghi chú
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'INBOUND' | 'OUTBOUND' | 'AUDIT_ADJUSTMENT';

export type InboundReason = 
  | 'PURCHASE'          // Nhập mua mới
  | 'PROJECT_RETURN'    // Nhập thu hồi từ công trình/dự án
  | 'WARRANTY_RETURN'   // Nhập bảo hành/sửa chữa về
  | 'TRANSFER_IN'       // Nhập điều chuyển từ kho khác
  | 'AUDIT_SURPLUS';    // Nhập điều chỉnh kiểm kê thừa

export const INBOUND_REASON_LABELS: Record<InboundReason, string> = {
  PURCHASE: 'Nhập mua mới',
  PROJECT_RETURN: 'Thu hồi sau thi công / Dự án',
  WARRANTY_RETURN: 'Bảo hành / Sửa chữa xong',
  TRANSFER_IN: 'Điều chuyển từ kho khác',
  AUDIT_SURPLUS: 'Kiểm kê thừa phát hiện',
};

export type OutboundReason = 
  | 'PROJECT_DISPATCH'  // Xuất thi công dự án
  | 'DEPARTMENT_USE'   // Xuất cấp phát phòng ban nội bộ
  | 'MAINTENANCE'       // Xuất gửi đi bảo dưỡng / sửa chữa
  | 'TRANSFER_OUT'      // Xuất điều chuyển sang kho khác
  | 'LIQUIDATION'       // Xuất thanh lý / loại bỏ
  | 'AUDIT_DEFICIT';    // Xuất điều chỉnh kiểm kê thiếu

export const OUTBOUND_REASON_LABELS: Record<OutboundReason, string> = {
  PROJECT_DISPATCH: 'Cấp phát thi công dự án',
  DEPARTMENT_USE: 'Cấp phát nội bộ phòng ban',
  MAINTENANCE: 'Gửi đi bảo dưỡng / Sửa chữa',
  TRANSFER_OUT: 'Điều chuyển sang kho khác',
  LIQUIDATION: 'Thanh lý / Tiêu hủy',
  AUDIT_DEFICIT: 'Kiểm kê thiếu hụt',
};

export interface TransactionLineItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  lotNumber?: string;
  serialNumber?: string;
  packageNo?: string;      // Số kiện
  packageName?: string;    // Tên kiện
  manufacturer?: string;   // Nhà sản xuất
  packingListNo?: string;  // Số Packing List riêng (nếu có)
  warehouse: string;
  notes?: string;
}

export interface InventoryTransaction {
  id: string;
  code: string;            // PNK-2024-001 hoặc PXK-2024-001
  type: TransactionType;
  subReason: InboundReason | OutboundReason | string;
  date: string;
  creator: string;         // Người lập phiếu
  receiverOrSupplier: string; // Nhà cung cấp hoặc Người nhận
  departmentOrProject: string; // Phòng ban / Dự án
  projectItem?: string;    // Hạng mục công trình / Gói thầu
  packingListNo?: string;  // Số Packing List
  shipment?: string;       // Lô hàng / Shipment / Chuyến tàu
  warehouse: string;
  status: 'COMPLETED' | 'DRAFT' | 'CANCELLED';
  items: TransactionLineItem[];
  totalAmount: number;
  note: string;
  createdAt: string;
}

// Multi-condition Filter Structure
export type FilterField =
  | 'searchQuery'        // Tìm kiếm chung (Mã, tên, model, serial, packing list, shipment...)
  | 'type'               // Phân loại vật tư/thiết bị
  | 'category'           // Nhóm danh mục
  | 'warehouse'          // Kho lưu trữ
  | 'condition'          // Tình trạng thiết bị
  | 'stockStatus'        // Trạng thái tồn: THIEU_HUT, VUOT_DINH_MUC, HET_HANG, HOP_LE
  | 'currentStock'       // Số lượng tồn
  | 'totalValue'         // Tổng giá trị tồn (Stock * UnitPrice)
  | 'unitPrice'          // Đơn giá
  | 'supplier'           // Nhà cung cấp
  | 'manufacturer'       // Nhà sản xuất
  | 'packingListNo'      // Số Packing List
  | 'shipment'           // Lô hàng / Shipment
  | 'packageNo'          // Số kiện
  | 'packageName'        // Tên kiện hàng
  | 'projectItem'        // Hạng mục công trình
  | 'allocatedProject'   // Dự án / Bộ phận đang sử dụng
  | 'maintenanceDue'     // Tình trạng hạn bảo dưỡng
  | 'expiryStatus';      // Hạn sử dụng

export type FilterOperator =
  | 'EQUALS'             // Bằng
  | 'NOT_EQUALS'         // Khác
  | 'CONTAINS'           // Chứa
  | 'GREATER_THAN'       // Lớn hơn >
  | 'LESS_THAN'          // Nhỏ hơn <
  | 'BETWEEN'            // Trong khoảng
  | 'IN_LIST'            // Thuộc danh sách
  | 'IS_EMPTY'           // Rỗng
  | 'IS_NOT_EMPTY';      // Có giá trị

export interface ConditionRule {
  id: string;
  field: FilterField;
  operator: FilterOperator;
  value: any;
  secondaryValue?: any; // Dành cho BETWEEN (ví dụ từ giá trị A đến giá trị B)
}

export type MatchLogic = 'AND' | 'OR';

export interface FilterPreset {
  id: string;
  name: string;
  description: string;
  logic: MatchLogic;
  rules: ConditionRule[];
  isDefault?: boolean;
}

export interface StockAuditItem {
  itemId: string;
  systemStock: number;
  countedStock: number;
  difference: number;
  notes?: string;
}

export interface StockAudit {
  id: string;
  code: string;
  date: string;
  warehouse: string;
  auditor: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  items: StockAuditItem[];
  notes?: string;
  createdAt: string;
}

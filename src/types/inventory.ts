export type UserRole = 'admin' | 'manager' | 'staff' | 'viewer';

export interface User {
  id: string;
  username: string; // Tên tài khoản, vd: 'Võ Dương Phú'
  fullName: string;
  role: UserRole;
  password?: string;
  phone?: string;
  email?: string;
  emailDigest?: string;
  department?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  sessionRevokedAt?: number;
  updatedAt?: number;
}

export interface Warehouse {
  id: string;
  code: string; // Mã kho bãi (vd: KB-01, BAI-CANG...)
  name: string; // Tên kho / bãi
  location: string; // Vị trí / Địa chỉ
  type: 'covered' | 'open_yard' | 'transit' | 'specialized'; // Loại kho
  capacityAreaM2?: number; // Diện tích (m2)
  capacityTons?: number; // Sức chứa tải trọng (tấn)
  keeperName?: string; // Thủ kho phụ trách
  phone?: string;
  status: 'active' | 'full' | 'maintenance';
  notes?: string;
  createdAt: string;
  updatedAt?: number;
}

export interface MaterialItem {
  id: string;
  code: string; // Mã vật tư thiết bị
  name: string; // Tên vật tư thiết bị
  unit: string; // Đơn vị tính (Cái, Bộ, Kiện, Tấn, Mét...)
  category: string; // Hạng mục mặc định (Cơ khí, Kết cấu, Điện, Tự động hóa...)
  packingListNo?: string; // Số Packing list
  shipment?: string; // Shipment / Lô vận chuyển
  packageNo?: string; // Package No. / Số kiện (PKG-01/15, BOX-03/08...)
  drawingNo?: string; // Bản vẽ kỹ thuật mặc định (nếu có)
  manufacturer?: string; // Nhà sản xuất (Siemens, Posco, ABB...)
  supplier?: string; // Nhà cung cấp (Hòa Phát, PetroSteel...)
  unitWeightKg?: number; // Khối lượng đơn vị tiêu chuẩn (kg)
  specification?: string; // Quy cách / Thông số kỹ thuật
  minStockAlert?: number; // Cảnh báo tồn kho tối thiểu
  notes?: string;
  updatedAt?: number;
}

// Chi tiết 1 dòng vật tư trong phiếu Nhập kho (Mẫu QN-OPR-PR11-FM05.01)
export interface InboundItemDetail {
  id: string;
  materialCode: string; // Mã vật tư
  materialName: string; // Tên vật tư
  unit: string; // Đơn vị tính
  batchCode?: string; // Mã lô (trên mẫu PNK QLVT, vd: 183A0108)
  
  // Các điều kiện quản trị kho vận chuyên sâu:
  packingListNo: string; // Số Packing List
  shipment: string; // Shipment (Lô hàng / chuyến vận chuyển / Bill of Lading)
  manufacturer: string; // Nhà sản xuất
  supplier: string; // Nhà cung cấp
  packageNo: string; // Số kiện (ví dụ: PKG-01/10, BOX-05)
  packageName: string; // Tên kiện (ví dụ: Kiện cụm van áp lực, Kiện dầm thép H-Beam)
  category: string; // Hạng mục (ví dụ: Kết cấu thép, Cơ điện, P&ID)
  drawingNo: string; // Bản vẽ kỹ thuật (ví dụ: DWG-STR-101 Rev 2)
  weightKg: number; // Khối lượng (Kg)
  quantity: number; // Số lượng (cây/tấm)
  
  unitPrice?: number; // Đơn giá (VNĐ)
  totalPrice?: number; // Thành tiền (VNĐ)
  storageLocation?: string; // Vị trí lưu kho (vd: Dãy A - Kệ 03)
  warehouseName?: string; // Tên kho / Nhập vào kho nào
  conditionNote?: string; // Tình trạng kiện/hàng
  note?: string; // Ghi chú dòng vật tư trên phiếu in PNK
}

export interface InboundReceipt {
  id: string;
  receiptCode: string; // Số phiếu nhập (vd: PNK25-0019)
  receiptDate: string; // Ngày nhập (YYYY-MM-DD)
  warehouseId: string; // Mã kho bãi lưu trữ
  warehouseName: string;
  
  // Thông tin theo mẫu PNK QLVT (QN-OPR-PR11-FM05.01)
  departmentName?: string; // Bộ phận (vd: DỰ ÁN LTIA-4.9)
  contractNo?: string; // Hợp đồng
  requestNo?: string; // Đề xuất số
  inboundType?: 'new' | 'return'; // Nhập mới | Nhập trả kho
  amountInWords?: string; // Viết bằng chữ
  attachedDocs?: string; // Số chứng từ gốc kèm theo

  // Tóm tắt chung của phiếu
  supplier: string;
  manufacturer?: string;
  shipment: string;
  packingListNo: string;
  
  delivererName: string; // Đơn vị giao hàng / Người giao hàng
  receiverName: string; // Người nhận / Thủ kho / NV QLVT
  driverVehicleNo?: string; // Biển số xe / Tàu
  notes?: string; // Nội dung nhập kho
  
  items: InboundItemDetail[];
  packageCount?: number;
  totalQuantity: number;
  totalWeightKg: number;
  totalAmount?: number;
  
  createdAt: string;
  createdBy: string;
  updatedAt?: number;
  itemsReplacedAt?: number;
  lastEditedBy?: string;
  lastEditedAt?: string;
}

// Chi tiết 1 dòng vật tư trong phiếu Xuất kho (Mẫu QN-OPR-PR11-FM06)
export interface OutboundItemDetail {
  id: string;
  materialCode: string;
  materialName: string;
  unit: string;
  batchCode?: string; // Mã lô (trên mẫu PXK QLVT, vd: 76C-061.35)
  warehouseName?: string; // Tên kho / Xuất từ kho nào
  
  // Các điều kiện tương ứng để truy xuất đúng nguồn gốc:
  packingListNo: string;
  shipment: string;
  manufacturer: string;
  supplier: string;
  packageNo: string;
  packageName: string;
  category: string;
  drawingNo: string;
  weightKg: number; // Khối lượng (Kg)
  quantity: number; // Số lượng (cây/tấm)
  
  unitPrice?: number;
  totalPrice?: number;
  purpose?: string; // Mục đích xuất
  note?: string; // Ghi chú dòng vật tư trên phiếu in PXK
}

export interface OutboundReceipt {
  id: string;
  issueCode: string; // Số phiếu xuất (vd: PXK25-0001)
  issueDate: string; // Ngày xuất (YYYY-MM-DD)
  warehouseId: string; // Kho xuất
  warehouseName: string;
  
  // Thông tin theo mẫu PXK QLVT (QN-OPR-PR11-FM06)
  departmentName?: string; // Bộ phận trên đầu phiếu (vd: DỰ ÁN LTIA-4.9)
  requestNo?: string; // Số PYC/PĐX (vd: PYC25-0001)
  outboundType?: 'issue' | 'transfer'; // Phiếu xuất kho | Phiếu xuất điều chuyển

  projectName?: string; // Tên dự án / Công trình nhận
  recipientDepartment: string; // Đơn vị/Tổ/Nhóm nhận (vd: Tổ thi công)
  recipientName: string; // Người nhận (vd: Nguyễn Văn Long)
  issuerName: string; // Người lập phiếu / Thủ kho
  notes?: string; // Lý do xuất kho
  
  items: OutboundItemDetail[];
  packingListSummary?: string;
  totalQuantity: number;
  totalWeightKg: number;
  totalAmount?: number;
  
  createdAt: string;
  createdBy: string;
  updatedAt?: number;
  itemsReplacedAt?: number;
  lastEditedBy?: string;
  lastEditedAt?: string;
}

// Quản lý vật tư OSD (Overage - Shortage - Damage)
export type OsdStatus = 'open' | 'closed'; // "Mở" khi chưa xử lý hoàn thành OSD, "Đóng" khi đã xử lý hoàn thành OSD
export type OsdType = 'overage' | 'shortage' | 'damage'; // Thừa | Thiếu | Hư hỏng

export interface OsdItemDetail {
  id: string;
  materialCode: string; // Mã vật tư
  materialName: string; // Tên vật tư
  unit: string; // ĐVT
  packageNo: string; // Số kiện (Package No.)
  packageName: string; // Tên kiện hàng
  packingListNo: string; // Số Packing List
  shipment: string; // Shipment
  inboundQuantity: number; // Số lượng theo phiếu nhập / chứng từ
  osdType: OsdType; // Loại OSD: Thừa / Thiếu / Hư hỏng
  osdQuantity: number; // Số lượng OSD (thừa/thiếu/hư hỏng)
  osdWeightKg?: number; // Khối lượng ảnh hưởng (kg)
  defectDescription: string; // Tình trạng lỗi, hư hỏng hoặc sai lệch thực tế
  rootCause?: string; // Nguyên nhân ban đầu (vận chuyển, bốc dỡ, nhà cung cấp...)
  proposedAction?: string; // Biện pháp xử lý kiến nghị (yêu cầu cấp bù, bồi thường, đổi trả...)
}

export interface OsdPdfAttachment {
  fileName: string; // Tên file .pdf (vd: Bien_Ban_OSD_PNK25-0019.pdf)
  fileSize: number; // Kích thước (bytes)
  fileType: string; // 'application/pdf'
  uploadedAt: string; // Thời gian tải lên (ISO)
  dataUrl: string; // Base64 data:application/pdf;base64,...
}

export interface OsdReceipt {
  id: string;
  osdCode: string; // Số biên bản / phiếu OSD (vd: OSD26-0001)
  osdDate: string; // Ngày lập biên bản OSD (YYYY-MM-DD)
  inboundReceiptId: string; // ID phiếu nhập kho nguồn
  inboundReceiptCode: string; // Số phiếu nhập kho nguồn (vd: PNK25-0019)
  warehouseId: string;
  warehouseName: string;
  supplier: string; // Nhà cung cấp / Đơn vị giao hàng
  packingListNo?: string;
  shipment?: string;
  status: OsdStatus; // 'open' (Mở) | 'closed' (Đóng) - Người sử dụng tick thủ công
  resolutionNotes?: string; // Ghi chú kết quả xử lý
  resolvedAt?: string; // Thời gian hoàn thành đóng OSD
  resolvedBy?: string; // Người xử lý đóng OSD
  pdfAttachment?: OsdPdfAttachment; // Biên bản OSD bằng file .pdf đính kèm
  items: OsdItemDetail[];
  totalOsdQuantity: number;
  totalOsdWeightKg?: number;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: number;
  lastEditedBy?: string;
  lastEditedAt?: string;
}

// Tổng hợp tồn kho theo các chiều phân tích
export interface InventoryStockRecord {
  id: string; // Unique key ghép từ các thuộc tính phân nhóm
  warehouseId: string;
  warehouseName: string;
  materialCode: string;
  materialName: string;
  unit: string;
  
  packingListNo: string;
  shipment: string;
  manufacturer: string;
  supplier: string;
  packageNo: string;
  packageName: string;
  category: string;
  drawingNo: string;
  
  // Tồn kho hiện tại (Tổng SL tồn = Tổng SL nhập + Tổng SL nhập trả kho - Tổng SL xuất kho - Tổng SL tái xuất)
  currentQuantity: number;
  currentWeightKg: number;
  
  // Luân chuyển lịch sử
  inboundQuantity: number; // Tổng SL nhập (phiếu nhập chuẩn, không tick Nhập trả kho)
  inboundWeightKg: number;
  returnInboundQuantity: number; // Tổng SL nhập trả kho (phiếu nhập có tick "Nhập trả kho")
  returnInboundWeightKg: number;
  
  outboundQuantity: number; // Tổng SL xuất kho (phiếu xuất chuẩn, không tick Xuất điều chuyển)
  outboundWeightKg: number;
  transferOutboundQuantity: number; // Tổng SL tái xuất (phiếu xuất có tick "Xuất điều chuyển")
  transferOutboundWeightKg: number;
  
  lastUpdated: string;
}

export interface StockFilterParams {
  warehouseId?: string;
  packingListNo?: string;
  shipment?: string;
  manufacturer?: string;
  supplier?: string;
  packageNo?: string;
  packageName?: string;
  category?: string;
  drawingNo?: string;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}

export interface TombstoneMap {
  inbound: Record<string, number>;
  outbound: Record<string, number>;
  materials: Record<string, number>;
  warehouses: Record<string, number>;
  users: Record<string, number>;
  osd?: Record<string, number>;
}

export interface ActiveUserSession {
  userId: string;
  username: string;
  userKey: string;
  sessionToken: string;
  deviceId: string;
  deviceLabel: string;
  loginAt: string;
  issuedAtMs?: number;
  lastSeenAt: number;
}



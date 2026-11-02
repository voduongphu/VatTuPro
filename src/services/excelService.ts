import * as XLSX from 'xlsx';
import { InboundItemDetail, OutboundItemDetail, MaterialItem } from '../types/inventory';

export type ExcelProgressCallback = (percent: number, processedRows: number, totalRows: number) => void;

// Headers chuẩn cho file mẫu Danh Mục Vật Tư
export const MATERIAL_EXCEL_COLUMNS = [
  { key: 'code', label: 'Mã vật tư / Thiết bị (*)', sample: 'TB-VAL-200H' },
  { key: 'name', label: 'Tên vật tư thiết bị (*)', sample: 'Van cầu áp lực cao Class 600 DN200' },
  { key: 'unit', label: 'Đơn vị tính (*)', sample: 'Bộ' },
  { key: 'packageNo', label: 'Package No.', sample: 'PKG-01/15' },
  { key: 'category', label: 'Hạng mục', sample: 'Đường ống công nghệ P&ID' },
  { key: 'manufacturer', label: 'Nhà sản xuất', sample: 'Kitz Corporation (Japan)' },
  { key: 'supplier', label: 'Nhà cung cấp', sample: 'Công ty CP Kỹ thuật PetroSteel' },
  { key: 'unitWeightKg', label: 'Khối lượng tiêu chuẩn (kg)', sample: 312.5 },
  { key: 'specification', label: 'Quy cách / Thông số kỹ thuật', sample: 'Thép đúc A105N, mặt bích RF Class 600, NACE MR0175' },
  { key: 'minStockAlert', label: 'Tồn kho tối thiểu', sample: 2 },
  { key: 'notes', label: 'Ghi chú', sample: 'Có chứng chỉ CO/CQ và Mill test certificate' }
];

// Headers chuẩn cho file mẫu Nhập Kho
export const INBOUND_EXCEL_COLUMNS = [
  { key: 'receiptCode', label: 'Số phiếu nhập kho (*)', sample: 'PN-20261014-001' },
  { key: 'receiptDate', label: 'Ngày nhập kho (YYYY-MM-DD)', sample: '2026-10-14' },
  { key: 'warehouseName', label: 'Kho tiếp nhận / Nhập vào kho (*)', sample: 'Kho Tổng Trung Tâm Cát Lái' },
  { key: 'packingListNo', label: 'Số Packing List (*)', sample: 'PL-2026-OCT-001' },
  { key: 'shipment', label: 'Shipment / Lô hàng (*)', sample: 'SHP-PACIFIC-V04' },
  { key: 'packageNo', label: 'Package No. / Số kiện (*)', sample: 'PKG-01/15' },
  { key: 'packageName', label: 'Tên kiện (*)', sample: 'Kiện cụm van áp lực cao DN200' },
  { key: 'materialCode', label: 'Mã vật tư / Thiết bị (*)', sample: 'TB-VAL-200H' },
  { key: 'materialName', label: 'Tên vật tư thiết bị (*)', sample: 'Van cầu áp lực cao Class 600 DN200' },
  { key: 'unit', label: 'Đơn vị tính (*)', sample: 'Bộ' },
  { key: 'quantity', label: 'Số lượng (*)', sample: 4 },
  { key: 'weightKg', label: 'Khối lượng (kg) (*)', sample: 1250 },
  { key: 'category', label: 'Hạng mục (*)', sample: 'Đường ống công nghệ P&ID' },
  { key: 'drawingNo', label: 'Bản vẽ kỹ thuật (*)', sample: 'DWG-PID-PIPE-04 Rev.C' },
  { key: 'manufacturer', label: 'Nhà sản xuất (*)', sample: 'Kitz Corporation (Japan)' },
  { key: 'supplier', label: 'Nhà cung cấp (*)', sample: 'Công ty CP Kỹ thuật PetroSteel' },
  { key: 'unitPrice', label: 'Đơn giá (VNĐ)', sample: 45000000 },
  { key: 'storageLocation', label: 'Vị trí kho', sample: 'Khu A - Dãy 02 - Kệ 01' },
  { key: 'conditionNote', label: 'Tình trạng kiện hàng', sample: 'Mới 100%, nguyên niêm phong gỗ' }
];

// Headers chuẩn cho file mẫu Xuất Kho
export const OUTBOUND_EXCEL_COLUMNS = [
  { key: 'issueCode', label: 'Số phiếu xuất kho (*)', sample: 'PX-20261014-001' },
  { key: 'issueDate', label: 'Ngày xuất kho (YYYY-MM-DD)', sample: '2026-10-14' },
  { key: 'projectName', label: 'Tên dự án / Công trình (*)', sample: 'Dự Án Nhà Máy Lọc Hóa Dầu Long Sơn' },
  { key: 'recipientDepartment', label: 'Người nhận / Đội thi công (*)', sample: 'Ban Chỉ Huy Công Trường - Đội Lắp Đặt Số 2' },
  { key: 'warehouseName', label: 'Kho xuất / Xuất từ kho (*)', sample: 'Kho Tổng Trung Tâm Cát Lái' },
  { key: 'packingListNo', label: 'Số Packing List (*)', sample: 'PL-2026-OCT-001' },
  { key: 'shipment', label: 'Shipment / Lô hàng (*)', sample: 'SHP-PACIFIC-V04' },
  { key: 'packageNo', label: 'Package No. / Số kiện (*)', sample: 'PKG-01/15' },
  { key: 'packageName', label: 'Tên kiện (*)', sample: 'Kiện cụm van áp lực cao DN200' },
  { key: 'materialCode', label: 'Mã vật tư / Thiết bị (*)', sample: 'TB-VAL-200H' },
  { key: 'materialName', label: 'Tên vật tư thiết bị (*)', sample: 'Van cầu áp lực cao Class 600 DN200' },
  { key: 'unit', label: 'Đơn vị tính (*)', sample: 'Bộ' },
  { key: 'quantity', label: 'Số lượng xuất (*)', sample: 2 },
  { key: 'weightKg', label: 'Khối lượng xuất (kg) (*)', sample: 625 },
  { key: 'category', label: 'Hạng mục (*)', sample: 'Đường ống công nghệ P&ID' },
  { key: 'drawingNo', label: 'Bản vẽ kỹ thuật (*)', sample: 'DWG-PID-PIPE-04 Rev.C' },
  { key: 'manufacturer', label: 'Nhà sản xuất (*)', sample: 'Kitz Corporation (Japan)' },
  { key: 'supplier', label: 'Nhà cung cấp (*)', sample: 'Công ty CP Kỹ thuật PetroSteel' },
  { key: 'purpose', label: 'Mục đích xuất / Lắp đặt', sample: 'Lắp đặt cụm van trạm bơm số 1' }
];

// Hàm tải file mẫu Excel Danh Mục Vật Tư
export function downloadMaterialTemplate(): void {
  const sampleRows = [
    {
      'Mã vật tư / Thiết bị (*)': 'TB-VAL-200H',
      'Tên vật tư thiết bị (*)': 'Van cầu áp lực cao Class 600 DN200',
      'Đơn vị tính (*)': 'Bộ',
      'Package No.': 'PKG-01/15',
      'Hạng mục': 'Đường ống công nghệ P&ID',
      'Nhà sản xuất': 'Kitz Corporation (Japan)',
      'Nhà cung cấp': 'Công ty CP Kỹ thuật PetroSteel',
      'Khối lượng tiêu chuẩn (kg)': 312.5,
      'Quy cách / Thông số kỹ thuật': 'Thép đúc A105N, mặt bích RF Class 600, tiêu chuẩn API 602/600',
      'Tồn kho tối thiểu': 2,
      'Ghi chú': 'Hàng dự án hóa dầu, có đầy đủ chứng chỉ CO/CQ và Mill test certificate'
    },
    {
      'Mã vật tư / Thiết bị (*)': 'KC-BEAM-H350',
      'Tên vật tư thiết bị (*)': 'Thép hình H-Beam H350x350x12x19 L=12m',
      'Đơn vị tính (*)': 'Cây',
      'Package No.': 'PKG-02/15',
      'Hạng mục': 'Kết cấu thép',
      'Nhà sản xuất': 'Posco E&C (Korea)',
      'Nhà cung cấp': 'Tập đoàn Thép Hòa Phát',
      'Khối lượng tiêu chuẩn (kg)': 1643.75,
      'Quy cách / Thông số kỹ thuật': 'Mác thép SS400 chuẩn JIS G3101, sơn phủ chống rỉ 3 lớp epoxy',
      'Tồn kho tối thiểu': 5,
      'Ghi chú': 'Kiện dầm chính chịu lực nhà xưởng phân xưởng cracking'
    },
    {
      'Mã vật tư / Thiết bị (*)': 'EL-PLC-S7-1500',
      'Tên vật tư thiết bị (*)': 'Hệ thống tủ điện điều khiển PLC Siemens S7-1500',
      'Đơn vị tính (*)': 'Tủ',
      'Package No.': 'BOX-03/08',
      'Hạng mục': 'Điện & Tự động hóa',
      'Nhà sản xuất': 'Siemens AG (Germany)',
      'Nhà cung cấp': 'Công ty Thiết bị Điện Schneider VN',
      'Khối lượng tiêu chuẩn (kg)': 425.0,
      'Quy cách / Thông số kỹ thuật': 'CPU 1516-3 PN/DP, tích hợp module AI/AO/DI/DO và nguồn dự phòng UPS',
      'Tồn kho tối thiểu': 1,
      'Ghi chú': 'Bảo quản phòng kho kín có máy điều hòa và kiểm soát độ ẩm'
    },
    {
      'Mã vật tư / Thiết bị (*)': 'VT-FLANGE-DN150',
      'Tên vật tư thiết bị (*)': 'Mặt bích cổ hàn WNRF Class 300 DN150 A105',
      'Đơn vị tính (*)': 'Cái',
      'Package No.': 'PKG-03/15',
      'Hạng mục': 'Đường ống công nghệ P&ID',
      'Nhà sản xuất': 'Ulma Forja (Spain)',
      'Nhà cung cấp': 'Công ty TNHH Thép Việt Nhật',
      'Khối lượng tiêu chuẩn (kg)': 18.5,
      'Quy cách / Thông số kỹ thuật': 'Chuẩn ASME B16.5, Schedule 80, gờ nhô RF, vật liệu ASTM A105',
      'Tồn kho tối thiểu': 10,
      'Ghi chú': 'Kiểm tra 100% dung sai kích thước và bề mặt bọc màng co PE'
    },
    {
      'Mã vật tư / Thiết bị (*)': 'TB-PUMP-75K',
      'Tên vật tư thiết bị (*)': 'Máy bơm ly tâm trục ngang công nghiệp 75kW',
      'Đơn vị tính (*)': 'Bộ',
      'Package No.': 'CASE-01/04',
      'Hạng mục': 'Cơ khí / Thiết bị quay',
      'Nhà sản xuất': 'KSB Pumps (Germany)',
      'Nhà cung cấp': 'Vingroup EPC Logistics',
      'Khối lượng tiêu chuẩn (kg)': 1150.0,
      'Quy cách / Thông số kỹ thuật': 'Lưu lượng Q=250m3/h, Cột áp H=65m, Động cơ IP55 Ex-d chuẩn chống nổ',
      'Tồn kho tối thiểu': 1,
      'Ghi chú': 'Kèm theo bộ phụ tùng spare parts vận hành 2 năm đầu'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 22 }, { wch: 38 }, { wch: 14 }, { wch: 20 }, { wch: 26 },
    { wch: 26 }, { wch: 30 }, { wch: 22 }, { wch: 45 }, { wch: 18 }, { wch: 40 }
  ];

  const guideRows = [
    { 'MỤC HƯỚNG DẪN': 'CÁCH NHẬP FILE EXCEL DANH MỤC VẬT TƯ & THIẾT BỊ', 'CHI TIẾT': '' },
    { 'MỤC HƯỚNG DẪN': '1. Cột bắt buộc (*)', 'CHI TIẾT': 'Mã vật tư, Tên vật tư thiết bị và Đơn vị tính là 3 trường bắt buộc.' },
    { 'MỤC HƯỚNG DẪN': '2. Cột Package No.', 'CHI TIẾT': 'Điền mã kiện / Package No. (ví dụ: PKG-01/15, BOX-03/08, CASE-01/04).' },
    { 'MỤC HƯỚNG DẪN': '3. Mã vật tư trùng', 'CHI TIẾT': 'Nếu mã vật tư đã có trong hệ thống, hệ thống sẽ tự động cập nhật thông tin mới nhất.' },
    { 'MỤC HƯỚNG DẪN': '4. Khối lượng & Tồn kho', 'CHI TIẾT': 'Nhập số (ví dụ: 312.5, 2). Không nhập chữ vào cột số lượng/khối lượng.' },
    { 'MỤC HƯỚNG DẪN': '5. Hạng mục gợi ý', 'CHI TIẾT': 'Đường ống công nghệ P&ID, Kết cấu thép, Điện & Tự động hóa, Cơ khí / Thiết bị quay, Bồn bể áp lực, Phòng cháy chữa cháy, Xây dựng dân dụng.' }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 25 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Vat_Tu');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan');
  XLSX.writeFile(wb, 'Mau_Import_Danh_Muc_Vat_Tu.xlsx');
}

// Hàm tải file mẫu Excel Nhập kho
export function downloadInboundTemplate(): void {
  const sampleRows = [
    {
      'Số phiếu nhập kho (*)': 'PN-20261014-001',
      'Ngày nhập kho': '2026-10-14',
      'Kho tiếp nhận / Nhập vào kho (*)': 'Kho Tổng Trung Tâm Cát Lái',
      'Số Packing List (*)': 'PL-2026-OCT-001',
      'Shipment / Lô hàng (*)': 'SHP-PACIFIC-V04',
      'Package No. / Số kiện (*)': 'PKG-01/15',
      'Tên kiện (*)': 'Kiện cụm van áp lực cao DN200',
      'Mã vật tư / Thiết bị (*)': 'TB-VAL-200H',
      'Tên vật tư thiết bị (*)': 'Van cầu áp lực cao Class 600 DN200',
      'Đơn vị tính (*)': 'Bộ',
      'Số lượng (*)': 4,
      'Khối lượng (kg) (*)': 1250,
      'Hạng mục (*)': 'Đường ống công nghệ P&ID',
      'Bản vẽ kỹ thuật (*)': 'DWG-PID-PIPE-04 Rev.C',
      'Nhà sản xuất (*)': 'Kitz Corporation (Japan)',
      'Nhà cung cấp (*)': 'Công ty CP Kỹ thuật PetroSteel',
      'Đơn giá (VNĐ)': 45000000,
      'Vị trí kho': 'Khu A - Dãy 02 - Kệ 01',
      'Tình trạng kiện hàng': 'Mới 100%, nguyên niêm phong pallet gỗ'
    },
    {
      'Số phiếu nhập kho (*)': 'PN-20261014-001',
      'Ngày nhập kho': '2026-10-14',
      'Kho tiếp nhận / Nhập vào kho (*)': 'Kho Tổng Trung Tâm Cát Lái',
      'Số Packing List (*)': 'PL-2026-OCT-001',
      'Shipment / Lô hàng (*)': 'SHP-PACIFIC-V04',
      'Package No. / Số kiện (*)': 'PKG-02/15',
      'Tên kiện (*)': 'Kiện mặt bích áp lực cao DN150',
      'Mã vật tư / Thiết bị (*)': 'VT-FLANGE-DN150',
      'Tên vật tư thiết bị (*)': 'Mặt bích cổ hàn WNRF Class 300 DN150 A105',
      'Đơn vị tính (*)': 'Cái',
      'Số lượng (*)': 20,
      'Khối lượng (kg) (*)': 370,
      'Hạng mục (*)': 'Đường ống công nghệ P&ID',
      'Bản vẽ kỹ thuật (*)': 'DWG-PID-FLG-01',
      'Nhà sản xuất (*)': 'Ulma Forja (Spain)',
      'Nhà cung cấp (*)': 'Công ty TNHH Thép Việt Nhật',
      'Đơn giá (VNĐ)': 3500000,
      'Vị trí kho': 'Khu A - Dãy 02 - Kệ 02',
      'Tình trạng kiện hàng': 'Mới 100%, đã phủ mỡ bảo quản'
    },
    {
      'Số phiếu nhập kho (*)': 'PN-20261014-002',
      'Ngày nhập kho': '2026-10-14',
      'Kho tiếp nhận / Nhập vào kho (*)': 'Bãi Cảng Phú Mỹ (Hàng Siêu Trường Siêu Trọng)',
      'Số Packing List (*)': 'PL-2026-OCT-002',
      'Shipment / Lô hàng (*)': 'SHP-PACIFIC-V04',
      'Package No. / Số kiện (*)': 'PKG-01/05',
      'Tên kiện (*)': 'Kiện dầm thép hình H-Beam H350',
      'Mã vật tư / Thiết bị (*)': 'KC-BEAM-H350',
      'Tên vật tư thiết bị (*)': 'Thép hình H-Beam H350x350x12x19 L=12m',
      'Đơn vị tính (*)': 'Cây',
      'Số lượng (*)': 16,
      'Khối lượng (kg) (*)': 26300,
      'Hạng mục (*)': 'Kết cấu thép nhà xưởng chính',
      'Bản vẽ kỹ thuật (*)': 'DWG-STR-BEAM-12 Rev.B',
      'Nhà sản xuất (*)': 'Posco E&C (Korea)',
      'Nhà cung cấp (*)': 'Tập đoàn Thép Hòa Phát',
      'Đơn giá (VNĐ)': 32000000,
      'Vị trí kho': 'Bãi ngoài trời số 01',
      'Tình trạng kiện hàng': 'Sơn chống rỉ epoxy đạt chuẩn'
    },
    {
      'Số phiếu nhập kho (*)': 'PN-20261014-003',
      'Ngày nhập kho': '2026-10-14',
      'Kho tiếp nhận / Nhập vào kho (*)': 'Kho Kỹ Thuật Điện & Tự Động Hóa',
      'Số Packing List (*)': 'PL-2026-OCT-003',
      'Shipment / Lô hàng (*)': 'SHP-MAERSK-L08',
      'Package No. / Số kiện (*)': 'BOX-01/02',
      'Tên kiện (*)': 'Tủ điều khiển PLC biến tần trung thế',
      'Mã vật tư / Thiết bị (*)': 'EL-PLC-S7-1500',
      'Tên vật tư thiết bị (*)': 'Hệ thống tủ điện điều khiển PLC Siemens S7-1500',
      'Đơn vị tính (*)': 'Tủ',
      'Số lượng (*)': 2,
      'Khối lượng (kg) (*)': 850,
      'Hạng mục (*)': 'Hệ thống Điện & Tự động hóa',
      'Bản vẽ kỹ thuật (*)': 'DWG-ELE-PLC-003',
      'Nhà sản xuất (*)': 'Siemens AG (Germany)',
      'Nhà cung cấp (*)': 'Công ty Thiết bị Điện Schneider VN',
      'Đơn giá (VNĐ)': 280000000,
      'Vị trí kho': 'Kho kín điều hòa - Phòng 01',
      'Tình trạng kiện hàng': 'Kiện kín chống ẩm, nguyên vẹn tem seal'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 22 }, { wch: 16 }, { wch: 32 }, { wch: 22 }, { wch: 22 },
    { wch: 15 }, { wch: 32 }, { wch: 20 }, { wch: 35 }, { wch: 14 },
    { wch: 12 }, { wch: 18 }, { wch: 26 }, { wch: 24 }, { wch: 26 },
    { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 32 }
  ];

  const guideRows = [
    { 'HƯỚNG DẪN': 'QUY TẮC TỰ ĐỘNG TẠO PHIẾU NHẬP KHO TỪ FILE EXCEL', 'CHI TIẾT': '' },
    { 'HƯỚNG DẪN': '1. Cột Số phiếu nhập kho (*)', 'CHI TIẾT': 'Các dòng có cùng Số phiếu nhập kho (ví dụ PN-20261014-001) sẽ được ứng dụng tự động gom lại thành 1 phiếu nhập kho duy nhất với đầy đủ các mặt hàng tương ứng.' },
    { 'HƯỚNG DẪN': '2. Tạo nhiều phiếu cùng lúc', 'CHI TIẾT': 'Điền các mã phiếu khác nhau (ví dụ dòng 1-2 là PN-20261014-001, dòng 3 là PN-20261014-002) để ứng dụng tự động sinh nhiều phiếu nhập kho một lần import.' },
    { 'HƯỚNG DẪN': '3. Để trống Số phiếu', 'CHI TIẾT': 'Nếu để trống cột này, hệ thống sẽ tự động tạo mã phiếu theo chuẩn PN-[SốPackingList]-[Ngày].' },
    { 'HƯỚNG DẪN': '4. Tự cập nhật Danh mục', 'CHI TIẾT': 'Vật tư mới chưa có trong hệ thống sẽ được tự động cập nhật vào Danh mục vật tư & thiết bị.' }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 30 }, { wch: 75 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_Kho');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan');
  XLSX.writeFile(wb, 'Mau_Nhap_Kho_Vat_Tu_Thiet_Bi.xlsx');
}

// Tải mẫu Excel Xuất kho
export function downloadOutboundTemplate(): void {
  const sampleRows = [
    {
      'Số phiếu xuất kho (*)': 'PX-20261014-001',
      'Ngày xuất kho': '2026-10-14',
      'Tên dự án / Công trình (*)': 'Dự Án Nhà Máy Lọc Hóa Dầu Long Sơn',
      'Người nhận / Đội thi công (*)': 'Ban Chỉ Huy Công Trường - Đội Lắp Đặt Số 2',
      'Kho xuất / Xuất từ kho (*)': 'Kho Tổng Trung Tâm Cát Lái',
      'Số Packing List (*)': 'PL-2026-OCT-001',
      'Shipment / Lô hàng (*)': 'SHP-PACIFIC-V04',
      'Package No. / Số kiện (*)': 'PKG-01/15',
      'Tên kiện (*)': 'Kiện cụm van áp lực cao DN200',
      'Mã vật tư / Thiết bị (*)': 'TB-VAL-200H',
      'Tên vật tư thiết bị (*)': 'Van cầu áp lực cao Class 600 DN200',
      'Đơn vị tính (*)': 'Bộ',
      'Số lượng xuất (*)': 2,
      'Khối lượng xuất (kg) (*)': 625,
      'Hạng mục (*)': 'Đường ống công nghệ P&ID',
      'Bản vẽ kỹ thuật (*)': 'DWG-PID-PIPE-04 Rev.C',
      'Nhà sản xuất (*)': 'Kitz Corporation (Japan)',
      'Nhà cung cấp (*)': 'Công ty CP Kỹ thuật PetroSteel',
      'Mục đích xuất / Lắp đặt': 'Lắp đặt cụm van trạm bơm số 1'
    },
    {
      'Số phiếu xuất kho (*)': 'PX-20261014-001',
      'Ngày xuất kho': '2026-10-14',
      'Tên dự án / Công trình (*)': 'Dự Án Nhà Máy Lọc Hóa Dầu Long Sơn',
      'Người nhận / Đội thi công (*)': 'Ban Chỉ Huy Công Trường - Đội Lắp Đặt Số 2',
      'Kho xuất / Xuất từ kho (*)': 'Kho Tổng Trung Tâm Cát Lái',
      'Số Packing List (*)': 'PL-2026-OCT-001',
      'Shipment / Lô hàng (*)': 'SHP-PACIFIC-V04',
      'Package No. / Số kiện (*)': 'PKG-02/15',
      'Tên kiện (*)': 'Kiện mặt bích áp lực cao DN150',
      'Mã vật tư / Thiết bị (*)': 'VT-FLANGE-DN150',
      'Tên vật tư thiết bị (*)': 'Mặt bích cổ hàn WNRF Class 300 DN150 A105',
      'Đơn vị tính (*)': 'Cái',
      'Số lượng xuất (*)': 10,
      'Khối lượng xuất (kg) (*)': 185,
      'Hạng mục (*)': 'Đường ống công nghệ P&ID',
      'Bản vẽ kỹ thuật (*)': 'DWG-PID-FLG-01',
      'Nhà sản xuất (*)': 'Ulma Forja (Spain)',
      'Nhà cung cấp (*)': 'Công ty TNHH Thép Việt Nhật',
      'Mục đích xuất / Lắp đặt': 'Lắp đặt cụm đường ống dẫn áp lực'
    },
    {
      'Số phiếu xuất kho (*)': 'PX-20261014-002',
      'Ngày xuất kho': '2026-10-14',
      'Tên dự án / Công trình (*)': 'Dự Án Nhà Máy Nhiệt Điện Ô Môn',
      'Người nhận / Đội thi công (*)': 'Tổ Cơ Điện Máy 1 - Kỹ thuật công trường',
      'Kho xuất / Xuất từ kho (*)': 'Bãi Cảng Phú Mỹ (Hàng Siêu Trường Siêu Trọng)',
      'Số Packing List (*)': 'PL-2026-SEP-088',
      'Shipment / Lô hàng (*)': 'SHP-EVERGREEN-E12',
      'Package No. / Số kiện (*)': 'CASE-01/04',
      'Tên kiện (*)': 'Kiện máy bơm ly tâm trục ngang công nghiệp',
      'Mã vật tư / Thiết bị (*)': 'TB-PUMP-75K',
      'Tên vật tư thiết bị (*)': 'Máy bơm ly tâm trục ngang công nghiệp 75kW',
      'Đơn vị tính (*)': 'Bộ',
      'Số lượng xuất (*)': 1,
      'Khối lượng xuất (kg) (*)': 1150,
      'Hạng mục (*)': 'Thiết bị cơ khí quay',
      'Bản vẽ kỹ thuật (*)': 'DWG-MEC-PUMP-01',
      'Nhà sản xuất (*)': 'KSB Pumps (Germany)',
      'Nhà cung cấp (*)': 'Vingroup EPC Logistics',
      'Mục đích xuất / Lắp đặt': 'Lắp ráp tổ máy bơm 1 trạm xử lý nước'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 22 }, { wch: 16 }, { wch: 35 }, { wch: 35 }, { wch: 32 },
    { wch: 22 }, { wch: 22 }, { wch: 15 }, { wch: 32 }, { wch: 20 },
    { wch: 35 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 26 },
    { wch: 24 }, { wch: 26 }, { wch: 30 }, { wch: 35 }
  ];

  const guideRows = [
    { 'HƯỚNG DẪN': 'QUY TẮC TỰ ĐỘNG TẠO PHIẾU XUẤT KHO TỪ FILE EXCEL', 'CHI TIẾT': '' },
    { 'HƯỚNG DẪN': '1. Cột Số phiếu xuất kho (*)', 'CHI TIẾT': 'Các dòng có cùng Số phiếu xuất kho (ví dụ PX-20261014-001) sẽ được ứng dụng tự động gom lại thành 1 phiếu xuất kho duy nhất với đầy đủ các mặt hàng.' },
    { 'HƯỚNG DẪN': '2. Tạo nhiều phiếu cùng lúc', 'CHI TIẾT': 'Điền các mã phiếu khác nhau (ví dụ PX-20261014-001, PX-20261014-002) để ứng dụng tự động sinh nhiều phiếu xuất kho trong một lần nạp.' },
    { 'HƯỚNG DẪN': '3. Để trống Số phiếu', 'CHI TIẾT': 'Nếu để trống cột này, hệ thống sẽ tự động tạo mã phiếu theo chuẩn PX-[SốPackingList]-[Ngày].' }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 30 }, { wch: 75 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Xuat_Kho');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan');
  XLSX.writeFile(wb, 'Mau_Xuat_Kho_Vat_Tu_Thiet_Bi.xlsx');
}

// Chuẩn hóa chuỗi tiêu đề cột (chỉ chạy 1 lần trên dòng header!)
function normalizeHeaderKey(str: string): string {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

// Chuyển đổi ngày Excel (Date object, số serial, DD/MM/YYYY, YYYY-MM-DD) sang YYYY-MM-DD
function formatExcelDate(val: any): string {
  if (!val && val !== 0) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && val > 25000 && val < 90000) {
    // Excel serial date
    const utcDays = Math.floor(val - 25569);
    const dt = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10);
    }
  }
  const str = String(val).trim();
  if (!str) return '';
  // DD/MM/YYYY hoặc DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  // YYYY/MM/DD hoặc YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }
  return str;
}

function parseNum(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).trim().replace(/,/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function isRowBlank(row: any[]): boolean {
  if (!row || row.length === 0) return true;
  for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (v !== '' && v !== null && v !== undefined) {
      if (typeof v !== 'string' || v.trim() !== '') return false;
    }
  }
  return true;
}

const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

async function readSheetRows(file: File, onProgress?: ExcelProgressCallback): Promise<{ rows: any[][]; error?: string }> {
  try {
    onProgress?.(5, 0, 0);
    const buffer = await file.arrayBuffer();
    onProgress?.(20, 0, 0);
    await yieldToMain();

    // Sử dụng dense: true giảm ~70% RAM và tăng tốc x5 với file >100.000 dòng
    const wb = XLSX.read(buffer, { type: 'array', dense: true, cellDates: true });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return { rows: [], error: 'File Excel không có sheet nào!' };
    }

    const ws = wb.Sheets[firstSheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    onProgress?.(40, 0, rows.length);
    await yieldToMain();

    if (rows.length <= 1) {
      return { rows: [], error: 'Sheet dữ liệu trống, vui lòng kiểm tra lại.' };
    }
    return { rows };
  } catch (err: any) {
    return { rows: [], error: `Lỗi xử lý file Excel: ${err?.message || 'Định dạng không hợp lệ'}` };
  }
}

function findHeaderRowIndex(rows: any[][], classifyCol: (norm: string) => string | null): number {
  const maxScan = Math.min(10, rows.length);
  let bestRow = 0;
  let bestScore = -1;
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    let score = 0;
    for (let c = 0; c < row.length; c++) {
      const norm = normalizeHeaderKey(String(row[c] ?? ''));
      if (norm && classifyCol(norm)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
    if (r === 0 && score >= 2) return 0;
  }
  return bestRow;
}

// Parse file Excel Danh Mục Vật Tư & Thiết Bị (Hỗ trợ 100.000+ dòng)
export async function parseMaterialExcel(
  file: File,
  onProgress?: ExcelProgressCallback
): Promise<{
  success: boolean;
  data: Partial<MaterialItem>[];
  errors: string[];
}> {
  const { rows, error } = await readSheetRows(file, onProgress);
  if (error) return { success: false, data: [], errors: [error] };

  type MatCol = 'code' | 'name' | 'unit' | 'packageNo' | 'category' | 'drawingNo' | 'manufacturer' | 'supplier' | 'unitWeightKg' | 'specification' | 'minStockAlert' | 'notes';

  const classifyMaterialCol = (norm: string): MatCol | null => {
    if (!norm) return null;
    if (norm.includes('mavattu') || norm.includes('mathietbi') || norm.includes('mavait') || norm.includes('mattu') || norm.includes('mavt') || norm.includes('materialcode') || norm.includes('itemcode') || norm === 'ma' || norm === 'code') return 'code';
    if (norm.includes('tenvattu') || norm.includes('tenthietbi') || norm.includes('materialname') || norm.includes('itemname') || norm === 'ten' || norm === 'name') return 'name';
    if (norm.includes('donvitinh') || norm === 'dvt' || norm === 'unit') return 'unit';
    if (norm.includes('packageno') || norm.includes('pkgno') || norm === 'package' || norm === 'pkg' || norm.includes('sokien') || norm.includes('kienso') || norm.includes('makien') || norm.includes('boxno') || norm.includes('crateno')) return 'packageNo';
    if (norm.includes('hangmuc') || norm.includes('category') || norm.includes('discipline')) return 'category';
    if (norm.includes('banve') || norm.includes('drawing') || norm === 'dwg') return 'drawingNo';
    if (norm.includes('nhasanxuat') || norm.includes('nsx') || norm.includes('manufacturer') || norm.includes('maker')) return 'manufacturer';
    if (norm.includes('nhacungcap') || norm.includes('ncc') || norm.includes('supplier') || norm.includes('vendor')) return 'supplier';
    if (norm.includes('khoiluong') || norm.includes('trongluong') || norm.includes('weight') || norm.includes('unitweight') || norm === 'kg') return 'unitWeightKg';
    if (norm.includes('quycach') || norm.includes('thongso') || norm.includes('spec') || norm.includes('specification')) return 'specification';
    if (norm.includes('tonkho') || norm.includes('toithieu') || norm.includes('minstock') || norm.includes('canhbao')) return 'minStockAlert';
    if (norm.includes('ghichu') || norm.includes('note') || norm.includes('mota')) return 'notes';
    return null;
  };

  const headerIdx = findHeaderRowIndex(rows, classifyMaterialCol);
  const headerRow = rows[headerIdx] || [];
  const colMap: (MatCol | null)[] = headerRow.map(h => classifyMaterialCol(normalizeHeaderKey(String(h ?? ''))));

  const totalDataRows = rows.length - headerIdx - 1;
  const parsedItems: Partial<MaterialItem>[] = [];
  const errors: string[] = [];
  let skippedErrorCount = 0;
  const baseTs = Date.now();
  const CHUNK_SIZE = 20000;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isRowBlank(row)) continue;

    const item: Partial<MaterialItem> = { id: `mat-${baseTs}-${r}` };

    for (let c = 0; c < colMap.length; c++) {
      const field = colMap[c];
      if (!field) continue;
      const val = row[c];
      if (val === '' || val === null || val === undefined) continue;

      if (field === 'unitWeightKg') {
        item.unitWeightKg = parseNum(val);
      } else if (field === 'minStockAlert') {
        item.minStockAlert = parseNum(val);
      } else if (field === 'code') {
        item.code = String(val).trim().toUpperCase();
      } else {
        (item as any)[field] = String(val).trim();
      }
    }

    if (!item.code && item.name) {
      item.code = 'VT-' + item.name.slice(0, 6).toUpperCase().replace(/\s+/g, '');
    }
    if (!item.unit) item.unit = 'Bộ';
    if (!item.category) item.category = 'Chung';

    if (!item.name && !item.code) {
      skippedErrorCount++;
      if (errors.length < 30) {
        errors.push(`Dòng ${r + 1}: Bỏ qua vì thiếu mã vật tư và tên vật tư.`);
      }
    } else {
      if (!item.name) item.name = item.code || 'Vật tư thiết bị mới';
      parsedItems.push(item);
    }

    const done = r - headerIdx;
    if (done % CHUNK_SIZE === 0) {
      onProgress?.(40 + Math.round((done / totalDataRows) * 58), done, totalDataRows);
      await yieldToMain();
    }
  }

  if (skippedErrorCount > 30) {
    errors.push(`... và ${skippedErrorCount - 30} dòng khác bị bỏ qua do thiếu thông tin bắt buộc.`);
  }

  onProgress?.(100, totalDataRows, totalDataRows);
  return {
    success: parsedItems.length > 0,
    data: parsedItems,
    errors
  };
}

// Parse file Excel Nhập kho (Hỗ trợ 100.000+ dòng mượt mà)
export async function parseInboundExcel(
  file: File,
  onProgress?: ExcelProgressCallback
): Promise<{
  success: boolean;
  data: Partial<InboundItemDetail>[];
  errors: string[];
}> {
  const { rows, error } = await readSheetRows(file, onProgress);
  if (error) return { success: false, data: [], errors: [error] };

  type InboundCol =
    | 'receiptCode'
    | 'receiptDate'
    | 'delivererName'
    | 'driverVehicleNo'
    | 'warehouseName'
    | 'packingListNo'
    | 'shipment'
    | 'packageNo'
    | 'packageName'
    | 'materialCode'
    | 'materialName'
    | 'unit'
    | 'quantity'
    | 'weightKg'
    | 'category'
    | 'drawingNo'
    | 'manufacturer'
    | 'supplier'
    | 'unitPrice'
    | 'storageLocation'
    | 'conditionNote';

  const classifyInboundCol = (norm: string): InboundCol | null => {
    if (!norm) return null;
    if (norm.includes('maphieunhap') || norm.includes('sophieunhap') || norm.includes('maphieu') || norm.includes('sophieu') || norm.includes('sochungtu') || norm.includes('receiptcode')) return 'receiptCode';
    if (norm.includes('ngaynhapkho') || norm.includes('ngaynhap') || norm.includes('ngaylap') || norm.includes('ngaychungtu') || (norm.includes('ngay') && !norm.includes('denngay')) || norm.includes('receiptdate')) return 'receiptDate';
    if (norm.includes('nguoigiao') || norm.includes('donvigiao') || norm.includes('deliverer')) return 'delivererName';
    if (norm.includes('soxe') || norm.includes('phuongtien') || norm.includes('biensoxe') || norm.includes('drivervehicle')) return 'driverVehicleNo';
    if (norm.includes('nhapvaokho') || norm.includes('khotiepnhan') || norm.includes('khonhap') || norm.includes('tenkho') || norm === 'kho' || norm.includes('warehouse')) return 'warehouseName';
    if (norm.includes('packing') || norm.includes('sopackinglist') || norm === 'pl' || norm.includes('phieupacking')) return 'packingListNo';
    if (norm.includes('shipment') || norm.includes('lohang') || norm.includes('chuyentau') || norm === 'sh') return 'shipment';
    if (norm.includes('sokien') || norm.includes('kienso') || norm.includes('makien') || norm === 'pkg' || norm === 'package' || norm.includes('packageno') || norm.includes('pkgno') || norm.includes('boxno') || norm.includes('crateno')) return 'packageNo';
    if (norm.includes('tenkien') || norm.includes('packagename') || norm.includes('mota')) return 'packageName';
    if (norm.includes('mavattu') || norm.includes('mathietbi') || norm.includes('mavait') || norm.includes('mattu') || norm.includes('mavt') || norm.includes('materialcode') || norm.includes('itemcode') || norm === 'ma' || norm === 'code') return 'materialCode';
    if (norm.includes('tenvattu') || norm.includes('tenthietbi') || norm.includes('materialname') || norm.includes('itemname') || norm === 'ten' || norm === 'name') return 'materialName';
    if (norm.includes('donvitinh') || norm === 'dvt' || norm === 'unit') return 'unit';
    if (norm.includes('soluong') || norm === 'sl' || norm === 'quantity' || norm === 'qty') return 'quantity';
    if (norm.includes('khoiluong') || norm.includes('trongluong') || norm.includes('weight') || norm === 'kg' || norm === 'kl') return 'weightKg';
    if (norm.includes('hangmuc') || norm.includes('category') || norm.includes('discipline')) return 'category';
    if (norm.includes('banve') || norm.includes('drawing') || norm === 'dwg') return 'drawingNo';
    if (norm.includes('nhasanxuat') || norm.includes('nsx') || norm.includes('manufacturer') || norm.includes('maker')) return 'manufacturer';
    if (norm.includes('nhacungcap') || norm.includes('ncc') || norm.includes('supplier') || norm.includes('vendor')) return 'supplier';
    if (norm.includes('dongia') || norm.includes('unitprice') || norm === 'gia') return 'unitPrice';
    if (norm.includes('vitri') || norm.includes('vitrikho') || norm.includes('location')) return 'storageLocation';
    if (norm.includes('tinhtrang') || norm.includes('ghichu') || norm.includes('note')) return 'conditionNote';
    return null;
  };

  const headerIdx = findHeaderRowIndex(rows, classifyInboundCol);
  const headerRow = rows[headerIdx] || [];
  const colMap: (InboundCol | null)[] = headerRow.map(h => classifyInboundCol(normalizeHeaderKey(String(h ?? ''))));

  const totalDataRows = rows.length - headerIdx - 1;
  const parsedItems: Partial<InboundItemDetail>[] = [];
  const errors: string[] = [];
  let skippedErrorCount = 0;
  const baseTs = Date.now();
  const CHUNK_SIZE = 20000;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isRowBlank(row)) continue;

    const item: any = { id: `item-${baseTs}-${r}` };

    for (let c = 0; c < colMap.length; c++) {
      const field = colMap[c];
      if (!field) continue;
      const val = row[c];
      if (val === '' || val === null || val === undefined) continue;

      if (field === 'quantity' || field === 'weightKg' || field === 'unitPrice') {
        item[field] = parseNum(val);
      } else if (field === 'receiptDate') {
        item.receiptDate = formatExcelDate(val);
      } else if (field === 'materialCode') {
        item.materialCode = String(val).trim().toUpperCase();
      } else {
        item[field] = String(val).trim();
      }
    }

    if (!item.materialName && (item.materialCode || item.packageName)) {
      item.materialName = item.materialCode || item.packageName;
    }
    if (!item.materialCode && item.materialName) {
      item.materialCode = 'VT-' + item.materialName.slice(0, 6).toUpperCase().replace(/\s+/g, '');
    }
    if (!item.packageNo) item.packageNo = `PKG-${r - headerIdx}`;
    if (!item.packageName) item.packageName = `Kiện ${item.packageNo}`;
    if (!item.unit) item.unit = 'Cái';
    if (!item.packingListNo) item.packingListNo = 'PL-CHUA-RO';
    if (!item.shipment) item.shipment = 'SHP-CHUA-RO';
    if (!item.category) item.category = 'Chung';
    if (!item.drawingNo) item.drawingNo = 'N/A';
    if (!item.manufacturer) item.manufacturer = 'Đang cập nhật';
    if (!item.supplier) item.supplier = 'Đang cập nhật';

    if (!item.materialName) {
      skippedErrorCount++;
      if (errors.length < 30) {
        errors.push(`Dòng ${r + 1}: Thiếu tên vật tư thiết bị.`);
      }
    } else {
      parsedItems.push(item);
    }

    const done = r - headerIdx;
    if (done % CHUNK_SIZE === 0) {
      onProgress?.(40 + Math.round((done / totalDataRows) * 58), done, totalDataRows);
      await yieldToMain();
    }
  }

  if (skippedErrorCount > 30) {
    errors.push(`... và ${skippedErrorCount - 30} dòng khác bị bỏ qua do thiếu tên vật tư.`);
  }

  onProgress?.(100, totalDataRows, totalDataRows);
  return {
    success: parsedItems.length > 0,
    data: parsedItems,
    errors
  };
}

// Parse file Excel Xuất kho (Hỗ trợ 100.000+ dòng mượt mà)
export async function parseOutboundExcel(
  file: File,
  onProgress?: ExcelProgressCallback
): Promise<{
  success: boolean;
  data: Partial<OutboundItemDetail>[];
  errors: string[];
}> {
  const { rows, error } = await readSheetRows(file, onProgress);
  if (error) return { success: false, data: [], errors: [error] };

  type OutboundCol =
    | 'issueCode'
    | 'issueDate'
    | 'projectName'
    | 'recipientDepartment'
    | 'warehouseName'
    | 'packingListNo'
    | 'shipment'
    | 'packageNo'
    | 'packageName'
    | 'materialCode'
    | 'materialName'
    | 'unit'
    | 'quantity'
    | 'weightKg'
    | 'category'
    | 'drawingNo'
    | 'manufacturer'
    | 'supplier'
    | 'purpose';

  const classifyOutboundCol = (norm: string): OutboundCol | null => {
    if (!norm) return null;
    if (norm.includes('maphieuxuat') || norm.includes('sophieuxuat') || norm.includes('maphieu') || norm.includes('sophieu') || norm.includes('sochungtu') || norm.includes('issuecode')) return 'issueCode';
    if (norm.includes('ngayxuatkho') || norm.includes('ngayxuat') || norm.includes('ngaylap') || norm.includes('ngaychungtu') || (norm.includes('ngay') && !norm.includes('denngay')) || norm.includes('issuedate')) return 'issueDate';
    if (norm.includes('tenduan') || norm.includes('duan') || norm.includes('congtrinh') || norm.includes('project')) return 'projectName';
    if (norm.includes('nguoinhan') || norm.includes('doithicong') || norm.includes('donvinhan') || norm.includes('bophannhan') || norm.includes('recipient')) return 'recipientDepartment';
    if (norm.includes('xuattukho') || norm.includes('khoxuat') || norm.includes('khotiepnhan') || norm.includes('tenkho') || norm === 'kho' || norm.includes('warehouse')) return 'warehouseName';
    if (norm.includes('packing') || norm.includes('sopackinglist') || norm === 'pl') return 'packingListNo';
    if (norm.includes('shipment') || norm.includes('lohang') || norm === 'sh') return 'shipment';
    if (norm.includes('sokien') || norm.includes('kienso') || norm.includes('makien') || norm === 'pkg' || norm === 'package' || norm.includes('packageno') || norm.includes('pkgno') || norm.includes('boxno') || norm.includes('crateno')) return 'packageNo';
    if (norm.includes('tenkien') || norm.includes('packagename')) return 'packageName';
    if (norm.includes('mavattu') || norm.includes('mathietbi') || norm.includes('mavait') || norm.includes('mattu') || norm.includes('mavt') || norm.includes('materialcode') || norm.includes('itemcode') || norm === 'ma' || norm === 'code') return 'materialCode';
    if (norm.includes('tenvattu') || norm.includes('tenthietbi') || norm.includes('materialname') || norm.includes('itemname') || norm === 'ten' || norm === 'name') return 'materialName';
    if (norm.includes('donvitinh') || norm === 'dvt' || norm === 'unit') return 'unit';
    if (norm.includes('soluong') || norm === 'sl' || norm === 'quantity' || norm === 'qty') return 'quantity';
    if (norm.includes('khoiluong') || norm.includes('trongluong') || norm.includes('weight') || norm === 'kg' || norm === 'kl') return 'weightKg';
    if (norm.includes('hangmuc') || norm.includes('category') || norm.includes('discipline')) return 'category';
    if (norm.includes('banve') || norm.includes('drawing') || norm === 'dwg') return 'drawingNo';
    if (norm.includes('nhasanxuat') || norm.includes('nsx') || norm.includes('manufacturer') || norm.includes('maker')) return 'manufacturer';
    if (norm.includes('nhacungcap') || norm.includes('ncc') || norm.includes('supplier') || norm.includes('vendor')) return 'supplier';
    if (norm.includes('mucdich') || norm.includes('lapdat') || norm.includes('purpose') || norm.includes('ghichu')) return 'purpose';
    return null;
  };

  const headerIdx = findHeaderRowIndex(rows, classifyOutboundCol);
  const headerRow = rows[headerIdx] || [];
  const colMap: (OutboundCol | null)[] = headerRow.map(h => classifyOutboundCol(normalizeHeaderKey(String(h ?? ''))));

  const totalDataRows = rows.length - headerIdx - 1;
  const parsedItems: Partial<OutboundItemDetail>[] = [];
  const errors: string[] = [];
  let skippedErrorCount = 0;
  const baseTs = Date.now();
  const CHUNK_SIZE = 20000;

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (isRowBlank(row)) continue;

    const item: any = { id: `out-item-${baseTs}-${r}` };

    for (let c = 0; c < colMap.length; c++) {
      const field = colMap[c];
      if (!field) continue;
      const val = row[c];
      if (val === '' || val === null || val === undefined) continue;

      if (field === 'quantity' || field === 'weightKg') {
        item[field] = parseNum(val);
      } else if (field === 'issueDate') {
        item.issueDate = formatExcelDate(val);
      } else if (field === 'materialCode') {
        item.materialCode = String(val).trim().toUpperCase();
      } else {
        item[field] = String(val).trim();
      }
    }

    if (!item.materialName && (item.materialCode || item.packageName)) {
      item.materialName = item.materialCode || item.packageName;
    }

    if (!item.materialName && !item.packingListNo) {
      skippedErrorCount++;
      if (errors.length < 30) {
        errors.push(`Dòng ${r + 1}: Thiếu tên vật tư hoặc số Packing List.`);
      }
    } else {
      parsedItems.push(item);
    }

    const done = r - headerIdx;
    if (done % CHUNK_SIZE === 0) {
      onProgress?.(40 + Math.round((done / totalDataRows) * 58), done, totalDataRows);
      await yieldToMain();
    }
  }

  if (skippedErrorCount > 30) {
    errors.push(`... và ${skippedErrorCount - 30} dòng khác bị bỏ qua do thiếu thông tin.`);
  }

  onProgress?.(100, totalDataRows, totalDataRows);
  return {
    success: parsedItems.length > 0,
    data: parsedItems,
    errors
  };
}

// Xuất danh sách báo cáo ra file Excel (sử dụng dense mode để tối ưu bộ nhớ cho 100.000+ dòng)
export function exportToExcel(data: any[], fileName: string, sheetTitle: string = 'Báo Cáo'): void {
  const ws = XLSX.utils.json_to_sheet(data, { dense: true } as any);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
  XLSX.writeFile(wb, `${fileName}.xlsx`, { compression: true });
}

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

// Hàm tải file mẫu Excel Nhập kho (Chuẩn QN-OPR-PR11-FM05.01 + Logistics)
export function downloadInboundTemplate(): void {
  const sampleRows = [
    {
      'Số phiếu (*)': 'PNK25-0001',
      'Ngày nhập kho': '2025-03-07',
      'Bộ phận': '',
      'Kho tiếp nhận (*)': 'Kho Long Phú 1',
      'Đơn vị giao hàng (*)': 'Việt Xuân Mới',
      'Hợp đồng': '',
      'Đề xuất số': '',
      'Nội dung': 'Phục vụ thi công hạng mục PIPING',
      'Mã vật tư (*)': 'PI-P.AA.S.2.0.0.1AG2-1.0.G.0',
      'Tên vật tư (*)': '20"x12m PIPE, API 5L B PSL1 SAWL, BE, SCH 40, UG',
      'Mã lô': '183A0108',
      'Số lượng (cây/tấm) (*)': 1,
      'ĐVT (*)': 'Ống',
      'Khối lượng (Kg) (*)': 2202.0,
      'Đơn giá (VNĐ)': 0,
      'Thành tiền (VNĐ)': 0,
      'Ghi chú': '',
      'Số Packing List': 'PL-01',
      'Shipment': 'SHP-01',
      'Package No.': '183A0108',
      'Nhà sản xuất': 'API 5L Maker',
      'Nhà cung cấp': 'Việt Xuân Mới'
    },
    {
      'Số phiếu (*)': 'PNK25-0001',
      'Ngày nhập kho': '2025-03-07',
      'Bộ phận': '',
      'Kho tiếp nhận (*)': 'Kho Long Phú 1',
      'Đơn vị giao hàng (*)': 'Việt Xuân Mới',
      'Hợp đồng': '',
      'Đề xuất số': '',
      'Nội dung': 'Phục vụ thi công hạng mục PIPING',
      'Mã vật tư (*)': 'PI-P.AA.S.2.0.0.1AG2-1.0.G.0',
      'Tên vật tư (*)': '20"x12m PIPE, API 5L B PSL1 SAWL, BE, SCH 40, UG',
      'Mã lô': '183A0248',
      'Số lượng (cây/tấm) (*)': 1,
      'ĐVT (*)': 'Ống',
      'Khối lượng (Kg) (*)': 2202.0,
      'Đơn giá (VNĐ)': 0,
      'Thành tiền (VNĐ)': 0,
      'Ghi chú': '',
      'Số Packing List': 'PL-01',
      'Shipment': 'SHP-01',
      'Package No.': '183A0248',
      'Nhà sản xuất': 'API 5L Maker',
      'Nhà cung cấp': 'Việt Xuân Mới'
    },
    {
      'Số phiếu (*)': 'PNK25-0001',
      'Ngày nhập kho': '2025-03-07',
      'Bộ phận': '',
      'Kho tiếp nhận (*)': 'Kho Long Phú 1',
      'Đơn vị giao hàng (*)': 'Việt Xuân Mới',
      'Hợp đồng': '',
      'Đề xuất số': '',
      'Nội dung': 'Phục vụ thi công hạng mục PIPING',
      'Mã vật tư (*)': 'PI-P.AA.S.2.0.0.1AG1-1.0.G.0',
      'Tên vật tư (*)': '20"x12m PIPE, API 5L B PSL1 SAWL, BE, SCH 40, AG',
      'Mã lô': '183A0494',
      'Số lượng (cây/tấm) (*)': 1,
      'ĐVT (*)': 'Ống',
      'Khối lượng (Kg) (*)': 2202.0,
      'Đơn giá (VNĐ)': 0,
      'Thành tiền (VNĐ)': 0,
      'Ghi chú': '',
      'Số Packing List': 'PL-01',
      'Shipment': 'SHP-01',
      'Package No.': '183A0494',
      'Nhà sản xuất': 'API 5L Maker',
      'Nhà cung cấp': 'Việt Xuân Mới'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 22 },
    { wch: 16 }, { wch: 16 }, { wch: 32 }, { wch: 28 }, { wch: 44 },
    { wch: 15 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 15 },
    { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
    { wch: 20 }, { wch: 22 }
  ];

  const guideRows = [
    { 'HƯỚNG DẪN': 'QUY TẮC TẠO PHIẾU NHẬP KHO (MẪU QN-OPR-PR11-FM05.01) TỪ FILE EXCEL', 'CHI TIẾT': '' },
    { 'HƯỚNG DẪN': '1. Cột Số phiếu (*)', 'CHI TIẾT': 'Các dòng có cùng Số phiếu (ví dụ PNK25-0019) sẽ được gom lại thành 1 Phiếu Nhập Kho duy nhất.' },
    { 'HƯỚNG DẪN': '2. Cột biểu mẫu QLVT', 'CHI TIẾT': 'Hỗ trợ đầy đủ: Bộ phận, Đơn vị giao hàng, Hợp đồng, Đề xuất số, Nội dung, Mã vật tư, Tên vật tư, Mã lô, Số lượng (cây/tấm), ĐVT, Khối lượng (Kg), Đơn giá (VNĐ), Thành tiền (VNĐ), Ghi chú.' },
    { 'HƯỚNG DẪN': '3. Tương thích ngược', 'CHI TIẾT': 'Tương thích hoàn toàn với cả các file Excel mẫu cũ theo Packing List, Shipment, Package No.' }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 30 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_PNK_QLVT');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan');
  XLSX.writeFile(wb, 'Mau_Phieu_Nhap_Kho_QLVT.xlsx');
}

// Tải mẫu Excel Xuất kho (Chuẩn QN-OPR-PR11-FM06 + Logistics)
export function downloadOutboundTemplate(): void {
  const sampleRows = [
    {
      'Số phiếu (*)': 'PXK25-0001',
      'Ngày xuất kho': '2025-03-04',
      'Bộ phận': '',
      'Kho xuất (*)': 'Kho Long Phú 1',
      'Người nhận (*)': 'Nguyễn Văn Long',
      'Đơn vị/Tổ/Nhóm (*)': 'Tổ thi công',
      'Số PYC/PĐX': 'PYC25-0001',
      'Lý do xuất kho': 'Phục vụ công tác thi công UG piping',
      'Mã vật tư (*)': 'PI-P.AA.S.2.0.0.1AG2-1.0.G.0',
      'Tên vật tư (*)': '20"x12m PIPE, API 5L B PSL1 SAWL, BE, SCH 40, UG',
      'Mã lô': '76C-061.35',
      'Số lượng (cây/tấm) (*)': 8,
      'ĐVT (*)': 'Ống',
      'Khối lượng (Kg) (*)': 17616.0,
      'Ghi chú': '',
      'Số Packing List': 'PL-01',
      'Shipment': 'SHP-01',
      'Package No.': '76C-061.35'
    },
    {
      'Số phiếu (*)': 'PXK25-0001',
      'Ngày xuất kho': '2025-03-04',
      'Bộ phận': '',
      'Kho xuất (*)': 'Kho Long Phú 1',
      'Người nhận (*)': 'Nguyễn Văn Long',
      'Đơn vị/Tổ/Nhóm (*)': 'Tổ thi công',
      'Số PYC/PĐX': 'PYC25-0001',
      'Lý do xuất kho': 'Phục vụ công tác thi công UG piping',
      'Mã vật tư (*)': 'PI-P.AA.S.2.0.0.1AG2-1.0.G.0',
      'Tên vật tư (*)': '20"x12m PIPE, API 5L B PSL1 SAWL, BE, SCH 40, UG',
      'Mã lô': '76E-005.50',
      'Số lượng (cây/tấm) (*)': 7,
      'ĐVT (*)': 'Ống',
      'Khối lượng (Kg) (*)': 15414.0,
      'Ghi chú': '',
      'Số Packing List': 'PL-01',
      'Shipment': 'SHP-01',
      'Package No.': '76E-005.50'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 22 }, { wch: 22 },
    { wch: 20 }, { wch: 16 }, { wch: 34 }, { wch: 28 }, { wch: 44 },
    { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 22 },
    { wch: 18 }, { wch: 18 }, { wch: 16 }
  ];

  const guideRows = [
    { 'HƯỚNG DẪN': 'QUY TẮC TẠO PHIẾU XUẤT KHO (MẪU QN-OPR-PR11-FM06) TỪ FILE EXCEL', 'CHI TIẾT': '' },
    { 'HƯỚNG DẪN': '1. Cột Số phiếu (*)', 'CHI TIẾT': 'Các dòng có cùng Số phiếu (ví dụ PXK25-0001) sẽ được gom lại thành 1 Phiếu Xuất Kho duy nhất.' },
    { 'HƯỚNG DẪN': '2. Cột biểu mẫu QLVT', 'CHI TIẾT': 'Hỗ trợ đầy đủ: Bộ phận, Người nhận, Đơn vị/Tổ/Nhóm, Số PYC/PĐX, Lý do xuất kho, Mã vật tư, Tên vật tư, Mã lô, Số lượng (cây/tấm), ĐVT, Khối lượng (Kg), Ghi chú.' }
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 30 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_PXK_QLVT');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan');
  XLSX.writeFile(wb, 'Mau_Phieu_Xuat_Kho_QLVT.xlsx');
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

// Chuyển đổi ngày Excel (Date object, số serial, chuỗi serial "46311", "Ngày ... tháng ... năm ...", DD/MM/YYYY, YYYY-MM-DD) sang YYYY-MM-DD
export function formatExcelDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && val > 25000 && val < 90000) {
    const utcDays = Math.floor(val - 25569);
    const dt = new Date(utcDays * 86400 * 1000);
    if (!isNaN(dt.getTime())) {
      return dt.toISOString().slice(0, 10);
    }
  }
  const str = String(val).trim();
  if (!str) return '';

  // Chuỗi số serial Excel (ví dụ "46311")
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = Number(str);
    if (serial > 25000 && serial < 90000) {
      const utcDays = Math.floor(serial - 25569);
      const dt = new Date(utcDays * 86400 * 1000);
      if (!isNaN(dt.getTime())) {
        return dt.toISOString().slice(0, 10);
      }
    }
  }

  // "Ngày 07 tháng 03 năm 2025"
  const vnMatch = str.match(/ng[àa]y\s*(\d{1,2})\s*th[áa]ng\s*(\d{1,2})\s*n[ăa]m\s*(\d{4})/i);
  if (vnMatch) {
    return `${vnMatch[3]}-${vnMatch[2].padStart(2, '0')}-${vnMatch[1].padStart(2, '0')}`;
  }

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

// Định dạng ngày hiển thị DD/MM/YYYY an toàn không lệch múi giờ và tự xử lý serial Excel
export function formatVoucherDateVi(val: unknown): string {
  const normalized = formatExcelDate(val);
  if (!normalized) return '—';
  const ymd = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }
  const dt = new Date(normalized);
  if (!isNaN(dt.getTime())) {
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return normalized;
}

// Phân tích số lượng / khối lượng / đơn giá chính xác cho cả định dạng Việt Nam ("1,5", "1.234,56") và Quốc tế ("1,234.56", "15,414")
export function parseNum(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.round(val * 10000) / 10000 : 0;
  }
  if (val === null || val === undefined) return 0;

  let str = String(val).trim();
  if (!str || str === '-' || str === '–' || str === '—') return 0;

  // Hỗ trợ số âm dạng kế toán "(123)"
  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1).trim();
  }

  // Loại bỏ ký tự khoảng trắng và hậu tố tiền tệ/đơn vị nếu gõ kèm
  str = str
    .replace(/\s+/g, '')
    .replace(/(vnđ|vnd|đ|kg|pcs)$/i, '');

  if (!str || str === '-' || str === '–' || str === '—') return 0;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Định dạng Việt Nam / Châu Âu: "1.234,56" -> "1234.56"
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Định dạng Quốc tế: "1,234.56" -> "1234.56"
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = str.split(',');
    if (parts.length > 2) {
      // Nhiều dấu phẩy phân cách hàng nghìn: "1,234,567" -> "1234567"
      str = parts.join('');
    } else {
      const [intPart, fracPart] = parts;
      const cleanInt = intPart.replace(/^[+-]/, '');
      if (
        fracPart.length === 3 &&
        cleanInt.length >= 1 &&
        cleanInt.length <= 3 &&
        cleanInt !== '0'
      ) {
        // Phân cách hàng nghìn kiểu Anh: "15,414", "1,250" -> "15414", "1250"
        str = `${intPart}${fracPart}`;
      } else {
        // Dấu phẩy thập phân kiểu Việt Nam: "1,5", "2,25", "0,500" -> "1.5", "2.25", "0.500"
        str = `${intPart}.${fracPart}`;
      }
    }
  } else if (hasDot) {
    const parts = str.split('.');
    if (parts.length > 2) {
      // Nhiều dấu chấm phân cách hàng nghìn kiểu Việt Nam: "1.250.000" -> "1250000"
      str = parts.join('');
    }
  }

  const n = Number(str);
  if (!Number.isFinite(n)) return 0;
  const signed = isNegative ? -Math.abs(n) : n;
  return Math.round(signed * 10000) / 10000;
}

function cleanCellText(val: unknown): string {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s === '-' || s === '–' || s === '—') return '';
  return s;
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

// Kiểm tra dòng TỔNG CỘNG / CỘNG / TOTAL hoặc dòng chân trang chữ ký / ghi chú mẫu biểu QLVT
const SUMMARY_ROW_NORMS = new Set<string>([
  'tongcong',
  'cong',
  'tong',
  'total',
  'grandtotal',
  'subtotal',
  'tongsoluong',
  'tongkhoiluong',
  'congtienhang',
  'tongtien'
]);

function isSummaryOrFooterRow(row: any[]): boolean {
  if (!Array.isArray(row) || row.length === 0) return true;

  let nonEmptyCount = 0;
  let firstTextNorm = '';

  for (let c = 0; c < Math.min(row.length, 12); c++) {
    const raw = row[c];
    if (raw === '' || raw === null || raw === undefined) continue;
    const text = String(raw).trim();
    if (!text) continue;
    nonEmptyCount++;

    const norm = normalizeHeaderKey(text);
    if (!norm) continue;
    if (!firstTextNorm) firstTextNorm = norm;

    // Dòng TỔNG CỘNG nằm ở các cột đầu (STT / Mã vật tư / Tên vật tư / Mã lô)
    if (c <= 4 && SUMMARY_ROW_NORMS.has(norm)) {
      return true;
    }

    // Dòng ghi chú / chứng từ / chữ ký dưới bảng mẫu QN-OPR-PR11-FM05.01 & FM06
    if (
      c <= 3 &&
      (norm.startsWith('vietbangchu') ||
        norm.startsWith('sochungtugockemtheo') ||
        norm.startsWith('notecotsoluong') ||
        norm.startsWith('ghichucotsoluong') ||
        norm === 'nguoigiaohang' ||
        norm === 'nguoinhanhang' ||
        norm === 'thukhonvqlvt' ||
        norm === 'thukho' ||
        norm === 'ptckt' ||
        norm === 'pheduyet' ||
        norm === 'kyghirohoten' ||
        /^page\d+of\d+$/.test(norm))
    ) {
      return true;
    }
  }

  if (nonEmptyCount === 0) return true;
  if (
    firstTextNorm === 'nguoigiaohang' ||
    firstTextNorm === 'nguoinhan' ||
    firstTextNorm === 'kyghirohoten' ||
    /^page\d+of\d+$/.test(firstTextNorm)
  ) {
    return true;
  }

  // Bỏ qua dòng đánh ký hiệu cột kế toán (A | B | C | D | 1 | 2 | 3...) ngay dưới header
  const nonEmptyNorms: string[] = [];
  for (let i = 0; i < row.length; i++) {
    const s = String(row[i] ?? '').trim();
    if (!s) continue;
    nonEmptyNorms.push(normalizeHeaderKey(s));
  }
  if (
    nonEmptyNorms.length >= 4 &&
    nonEmptyNorms[0] === 'a' &&
    nonEmptyNorms[1] === 'b' &&
    nonEmptyNorms.every((x) => /^[a-z]$/.test(x) || /^\d{1,2}$/.test(x))
  ) {
    return true;
  }

  return false;
}

function isMaterialCodeHeader(norm: string): boolean {
  return (
    norm.includes('mavattu') ||
    norm.includes('mathietbi') ||
    norm.includes('mavait') ||
    norm.includes('mattu') ||
    norm.includes('mavt') ||
    norm.includes('mahang') ||
    norm.includes('materialcode') ||
    norm.includes('itemcode') ||
    norm === 'maso' ||
    norm === 'ma' ||
    norm === 'code' ||
    norm === 'partno' ||
    norm === 'partnumber'
  );
}

function isMaterialNameHeader(norm: string): boolean {
  return (
    norm.includes('tenvattu') ||
    norm.includes('tenthietbi') ||
    norm.includes('tennhanhieu') ||
    norm.includes('tenhang') ||
    norm.includes('tensanpham') ||
    (norm.startsWith('ten') &&
      (norm.includes('vattu') ||
        norm.includes('quycach') ||
        norm.includes('thietbi') ||
        norm.includes('hanghoa') ||
        norm.includes('congcu') ||
        norm.includes('dungcu'))) ||
    norm.includes('materialname') ||
    norm.includes('itemname') ||
    norm.includes('itemdescription') ||
    norm === 'ten' ||
    norm === 'name' ||
    norm === 'description' ||
    norm === 'motavattu' ||
    norm === 'diengiai'
  );
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

// Quét tối đa 45 dòng đầu để tìm đúng dòng Header bảng chi tiết vật tư (kể cả phiếu PNK/PXK có 12-20 dòng tiêu đề đầu phiếu)
function findHeaderRowIndex(
  rows: any[][],
  classifyCol: (norm: string) => string | null,
  coreFields: string[]
): number {
  const maxScan = Math.min(45, rows.length);
  let bestRow = 0;
  let bestScore = -1;
  const coreSet = new Set(coreFields);

  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const matchedFields = new Set<string>();
    let hasStt = false;
    for (let c = 0; c < row.length; c++) {
      const norm = normalizeHeaderKey(String(row[c] ?? ''));
      if (!norm) continue;
      if (norm === 'stt' || norm === 'tt' || norm === 'no') {
        hasStt = true;
        continue;
      }
      // Không chấm điểm cho nhãn đầu phiếu có dấu hai chấm kèm giá trị dài
      const rawCell = String(row[c] ?? '').trim();
      if (rawCell.length > 65) continue;

      const classified = classifyCol(norm);
      if (classified) {
        matchedFields.add(classified);
      }
    }

    let score = matchedFields.size * 2 + (hasStt ? 1 : 0);
    for (const cf of coreSet) {
      if (matchedFields.has(cf)) score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}

// Nhận diện dòng sub-header gộp ô (ví dụ dòng trên là "Số lượng", dòng dưới là "Theo chứng từ | Thực nhập")
function detectMergedSubHeader(
  rows: any[][],
  headerIdx: number
): { mergedHeaderCells: string[]; dataStartIdx: number } {
  const headerRow = rows[headerIdx] || [];
  const nextRow = rows[headerIdx + 1];
  if (!Array.isArray(nextRow) || isRowBlank(nextRow)) {
    return {
      mergedHeaderCells: headerRow.map((h) => String(h ?? '')),
      dataStartIdx: headerIdx + 1
    };
  }

  let subHeaderKeywordHits = 0;
  let numericDataHits = 0;
  for (let c = 0; c < nextRow.length; c++) {
    const cellVal = nextRow[c];
    if (typeof cellVal === 'number') {
      numericDataHits++;
      continue;
    }
    const norm = normalizeHeaderKey(String(cellVal ?? ''));
    if (!norm) continue;
    if (/^\d+$/.test(norm)) {
      numericDataHits++;
      continue;
    }
    if (
      norm.includes('theochungtu') ||
      norm.includes('thucnhap') ||
      norm.includes('thucxuat') ||
      norm.includes('yeucau') ||
      norm === 'caytam' ||
      norm === 'kg' ||
      norm === 'vnd'
    ) {
      subHeaderKeywordHits++;
    }
  }

  if (subHeaderKeywordHits >= 1 && numericDataHits === 0) {
    const maxCols = Math.max(headerRow.length, nextRow.length);
    const merged: string[] = new Array(maxCols);
    let carryParent = '';
    for (let c = 0; c < maxCols; c++) {
      const topText = String(headerRow[c] ?? '').trim();
      if (topText) carryParent = topText;
      const subText = String(nextRow[c] ?? '').trim();
      merged[c] = subText ? `${carryParent} ${subText}`.trim() : topText;
    }
    return { mergedHeaderCells: merged, dataStartIdx: headerIdx + 2 };
  }

  return {
    mergedHeaderCells: headerRow.map((h) => String(h ?? '')),
    dataStartIdx: headerIdx + 1
  };
}

interface SheetVoucherMeta {
  code?: string;
  date?: string;
  departmentName?: string;
  delivererName?: string;
  recipientName?: string;
  recipientDepartment?: string;
  contractNo?: string;
  requestNo?: string;
  notes?: string;
  warehouseName?: string;
}

// Bóc tách thông tin đầu phiếu nếu người dùng import trực tiếp từ tờ Phiếu Nhập/Xuất Kho Excel (có phần tiêu đề phía trên bảng)
function extractSheetVoucherMeta(rows: any[][], headerIdx: number): SheetVoucherMeta {
  const meta: SheetVoucherMeta = {};
  if (headerIdx <= 0) return meta;

  const findNextNonEmptyInRow = (row: any[], fromCol: number): string => {
    for (let k = fromCol + 1; k < row.length; k++) {
      const txt = cleanCellText(row[k]);
      if (txt) return txt;
    }
    return '';
  };

  const extractAfterColonOrNextCell = (row: any[], col: number, rawText: string): string => {
    const colonIdx = rawText.indexOf(':');
    if (colonIdx !== -1) {
      const after = rawText.slice(colonIdx + 1).trim();
      if (after) return after;
    }
    return findNextNonEmptyInRow(row, col);
  };

  for (let r = 0; r < headerIdx; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const rawVal = row[c];
      if (rawVal === '' || rawVal === null || rawVal === undefined) continue;
      const text = String(rawVal).trim();
      if (!text) continue;

      const norm = normalizeHeaderKey(text);
      if (!norm) continue;

      if (!meta.date && /ng[àa]y\s*\d{1,2}\s*th[áa]ng\s*\d{1,2}\s*n[ăa]m\s*\d{4}/i.test(text)) {
        meta.date = formatExcelDate(text);
      }

      if (
        !meta.code &&
        (norm.startsWith('sophieu') || norm.startsWith('maphieu') || norm === 'so')
      ) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val && val.length <= 40) meta.code = val;
      } else if (!meta.departmentName && norm.startsWith('bophan')) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val) meta.departmentName = val;
      } else if (
        !meta.delivererName &&
        (norm.startsWith('donvigiaohang') || norm.startsWith('nguoigiaohang'))
      ) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val) meta.delivererName = val;
      } else if (!meta.recipientName && (norm.startsWith('nguoinhan') || norm.startsWith('hotennguoinhan'))) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val) meta.recipientName = val;
      } else if (!meta.recipientDepartment && norm.startsWith('donvitonhom')) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val) meta.recipientDepartment = val;
      } else if (!meta.contractNo && (norm.startsWith('hopdong') || norm.startsWith('sohopdong'))) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val) meta.contractNo = val;
      } else if (
        !meta.requestNo &&
        (norm.startsWith('dexuatso') || norm.startsWith('sopyc') || norm.startsWith('sodexuat'))
      ) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val) meta.requestNo = val;
      } else if (
        !meta.notes &&
        (norm.startsWith('noidung') || norm.startsWith('lydoxuat'))
      ) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val) meta.notes = val;
      } else if (
        !meta.warehouseName &&
        (norm.startsWith('nhaptaikho') || norm.startsWith('xuattaikho') || norm.startsWith('khotiepnhan') || norm.startsWith('khoxuat'))
      ) {
        const val = extractAfterColonOrNextCell(row, c, text);
        if (val) meta.warehouseName = val;
      }
    }
  }

  return meta;
}

// Phân loại độ ưu tiên cột Số Lượng (tránh nhầm "Tổng số lượng", "Số lượng kiện", "Số lượng tồn" và ưu tiên "Thực nhập/Thực xuất" hơn "Theo chứng từ")
function getQuantityColPriority(norm: string): number {
  if (!norm) return 0;
  // Loại trừ các cột KHÔNG phải số lượng dòng vật tư
  if (
    norm.includes('tongsoluong') ||
    norm.includes('tongsl') ||
    norm.includes('totalqty') ||
    norm.includes('totalquantity') ||
    norm.includes('soluongkien') ||
    norm.includes('sokien') ||
    norm.includes('soluongton') ||
    norm.includes('tonkho') ||
    norm.includes('toithieu') ||
    norm.includes('minstock')
  ) {
    return 0;
  }

  // Ưu tiên 3 (cao nhất): Số lượng thực nhập / thực xuất
  if (
    norm.includes('thucnhap') ||
    norm.includes('thucxuat') ||
    norm.includes('actualqty') ||
    norm.includes('actualquantity')
  ) {
    return 3;
  }

  // Ưu tiên 1 (thấp nhất - chỉ dùng nếu không có cột Số lượng thực tế / chuẩn)
  if (
    norm.includes('theochungtu') ||
    norm.includes('slchungtu') ||
    norm.includes('yeucau') ||
    norm.includes('docqty')
  ) {
    return 1;
  }

  // Ưu tiên 2 (chuẩn): Số lượng (cây/tấm), SL (cây/tấm), Số lượng, SL nhập, SL xuất, SL, Qty, Quantity, Cây/tấm...
  if (
    norm.includes('soluong') ||
    norm === 'sl' ||
    norm.startsWith('slcay') ||
    norm === 'slnhap' ||
    norm === 'slxuat' ||
    norm === 'caytam' ||
    norm === 'socay' ||
    norm === 'sotam' ||
    norm === 'soong' ||
    norm === 'quantity' ||
    norm === 'quantitypcs' ||
    norm === 'qty' ||
    norm === 'qtypcs' ||
    norm === 'pcs'
  ) {
    return 2;
  }

  return 0;
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
    if (!norm || norm === 'stt' || norm === 'tt' || norm === 'no') return null;
    if (isMaterialCodeHeader(norm)) return 'code';
    if (isMaterialNameHeader(norm)) return 'name';
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

  const headerIdx = findHeaderRowIndex(rows, classifyMaterialCol, ['code', 'name']);
  const { mergedHeaderCells, dataStartIdx } = detectMergedSubHeader(rows, headerIdx);
  const colMap: (MatCol | null)[] = mergedHeaderCells.map(h => classifyMaterialCol(normalizeHeaderKey(h)));

  const totalDataRows = Math.max(1, rows.length - dataStartIdx);
  const parsedItems: Partial<MaterialItem>[] = [];
  const errors: string[] = [];
  let skippedErrorCount = 0;
  const baseTs = Date.now();
  const CHUNK_SIZE = 20000;

  for (let r = dataStartIdx; r < rows.length; r++) {
    const row = rows[r];
    if (isRowBlank(row) || isSummaryOrFooterRow(row)) continue;

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
        const cleaned = cleanCellText(val);
        if (cleaned) item.code = cleaned.toUpperCase();
      } else {
        const cleaned = cleanCellText(val);
        if (cleaned) (item as any)[field] = cleaned;
      }
    }

    if (!item.code && !item.name) {
      continue;
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

    const done = r - dataStartIdx + 1;
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

// Parse file Excel Nhập kho (Hỗ trợ 100.000+ dòng mượt mà + chuẩn QN-OPR-PR11-FM05.01)
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
    | 'departmentName'
    | 'delivererName'
    | 'contractNo'
    | 'requestNo'
    | 'receiptNotes'
    | 'driverVehicleNo'
    | 'warehouseName'
    | 'packingListNo'
    | 'shipment'
    | 'batchCode'
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
    | 'totalPrice'
    | 'storageLocation'
    | 'conditionNote'
    | 'note';

  const classifyInboundCol = (norm: string): InboundCol | null => {
    if (!norm || norm === 'stt' || norm === 'no') return null;
    if (norm.includes('sochungtugoc')) return null;
    if (norm.includes('maphieunhap') || norm.includes('sophieunhap') || norm.includes('maphieu') || norm.includes('sophieu') || norm.includes('sochungtu') || norm.includes('receiptcode')) return 'receiptCode';
    if (norm.includes('ngaynhapkho') || norm.includes('ngaynhap') || norm.includes('ngaylap') || norm.includes('ngaychungtu') || (norm.includes('ngay') && !norm.includes('denngay')) || norm.includes('receiptdate')) return 'receiptDate';
    if (norm === 'bophan' || norm.includes('bophanduan') || norm.includes('department')) return 'departmentName';
    if (norm.includes('nguoigiao') || norm.includes('donvigiao') || norm.includes('deliverer')) return 'delivererName';
    if (norm.includes('hopdong') || norm.includes('sohopdong') || norm.includes('contract')) return 'contractNo';
    if (norm.includes('dexuatso') || norm.includes('sodexuat') || norm === 'dexuat' || norm.includes('requestno')) return 'requestNo';
    if (norm === 'noidung' || norm.includes('noidungnhap')) return 'receiptNotes';
    if (norm.includes('soxe') || norm.includes('phuongtien') || norm.includes('biensoxe') || norm.includes('drivervehicle')) return 'driverVehicleNo';
    if (norm.includes('nhapvaokho') || norm.includes('khotiepnhan') || norm.includes('khonhap') || norm.includes('tenkho') || norm === 'kho' || norm.includes('warehouse')) return 'warehouseName';
    if (norm.includes('packing') || norm.includes('sopackinglist') || norm === 'pl' || norm.includes('phieupacking')) return 'packingListNo';
    if (norm === 'malo' || norm.includes('batchcode') || norm === 'lotno' || norm === 'heatno') return 'batchCode';
    if (norm.includes('shipment') || norm.includes('lohang') || norm.includes('chuyentau') || norm === 'sh') return 'shipment';
    if (getQuantityColPriority(norm) > 0) return 'quantity';
    if (norm.includes('sokien') || norm.includes('kienso') || norm.includes('makien') || norm === 'pkg' || norm === 'package' || norm.includes('packageno') || norm.includes('pkgno') || norm.includes('boxno') || norm.includes('crateno')) return 'packageNo';
    if (norm.includes('tenkien') || norm.includes('packagename')) return 'packageName';
    if (isMaterialCodeHeader(norm)) return 'materialCode';
    if (isMaterialNameHeader(norm)) return 'materialName';
    if (norm.includes('donvitinh') || norm === 'dvt' || norm === 'unit' || norm === 'uom') return 'unit';
    if ((norm.includes('khoiluong') || norm.includes('trongluong') || norm.includes('weight') || norm === 'kg' || norm === 'kl') && !norm.includes('tongkhoiluong')) return 'weightKg';
    if (norm.includes('hangmuc') || norm.includes('category') || norm.includes('discipline')) return 'category';
    if (norm.includes('banve') || norm.includes('drawing') || norm === 'dwg') return 'drawingNo';
    if (norm.includes('nhasanxuat') || norm.includes('nsx') || norm.includes('manufacturer') || norm.includes('maker')) return 'manufacturer';
    if (norm.includes('nhacungcap') || norm.includes('ncc') || norm.includes('supplier') || norm.includes('vendor')) return 'supplier';
    if (norm.includes('dongia') || norm.includes('unitprice') || norm === 'gia') return 'unitPrice';
    if ((norm.includes('thanhtien') || norm.includes('totalprice') || norm === 'amount') && !norm.includes('tongthanhtien')) return 'totalPrice';
    if (norm.includes('vitri') || norm.includes('vitrikho') || norm.includes('location')) return 'storageLocation';
    if (norm === 'ghichu' || norm === 'note' || norm === 'remarks' || norm === 'remark') return 'note';
    if (norm.includes('tinhtrang') || norm.includes('ghichu')) return 'conditionNote';
    return null;
  };

  const headerIdx = findHeaderRowIndex(rows, classifyInboundCol, ['materialCode', 'materialName', 'quantity', 'weightKg']);
  const sheetMeta = extractSheetVoucherMeta(rows, headerIdx);
  const { mergedHeaderCells, dataStartIdx } = detectMergedSubHeader(rows, headerIdx);

  const normalizedHeaders = mergedHeaderCells.map((h) => normalizeHeaderKey(h));
  const colMap: (InboundCol | null)[] = normalizedHeaders.map((norm) => classifyInboundCol(norm));

  // Chỉ giữ duy nhất 1 cột 'quantity' có độ ưu tiên cao nhất (ví dụ "Thực nhập" thắng "Theo chứng từ", không bị cột phụ ghi đè)
  let bestQtyCol = -1;
  let bestQtyPriority = 0;
  for (let c = 0; c < colMap.length; c++) {
    if (colMap[c] === 'quantity') {
      const prio = getQuantityColPriority(normalizedHeaders[c]);
      if (prio > bestQtyPriority) {
        bestQtyPriority = prio;
        bestQtyCol = c;
      }
    }
  }
  for (let c = 0; c < colMap.length; c++) {
    if (colMap[c] === 'quantity' && c !== bestQtyCol) {
      colMap[c] = null;
    }
  }

  const totalDataRows = Math.max(1, rows.length - dataStartIdx);
  const parsedItems: Partial<InboundItemDetail>[] = [];
  const errors: string[] = [];
  let skippedErrorCount = 0;
  const baseTs = Date.now();
  const CHUNK_SIZE = 20000;

  for (let r = dataStartIdx; r < rows.length; r++) {
    const row = rows[r];
    if (isRowBlank(row) || isSummaryOrFooterRow(row)) continue;

    const item: any = {
      id: `item-${baseTs}-${r}`,
      quantity: 0,
      weightKg: 0
    };

    for (let c = 0; c < colMap.length; c++) {
      const field = colMap[c];
      if (!field) continue;
      const val = row[c];
      if (val === '' || val === null || val === undefined) continue;

      if (field === 'quantity' || field === 'weightKg' || field === 'unitPrice' || field === 'totalPrice') {
        item[field] = Math.max(0, parseNum(val));
      } else if (field === 'receiptDate') {
        const dt = formatExcelDate(val);
        if (dt) item.receiptDate = dt;
      } else if (field === 'materialCode') {
        const cleaned = cleanCellText(val);
        if (cleaned) item.materialCode = cleaned.toUpperCase();
      } else {
        const cleaned = cleanCellText(val);
        if (cleaned) item[field] = cleaned;
      }
    }

    // Bỏ qua các dòng trống đánh sẵn số thứ tự trên biểu mẫu (không có mã vật tư, tên vật tư, số lượng và khối lượng)
    if (!item.materialCode && !item.materialName && !item.packageName && !item.quantity && !item.weightKg) {
      continue;
    }

    // Gắn thông tin đầu phiếu bóc tách từ phần tiêu đề trên của sheet (nếu cột tương ứng không có trên từng dòng)
    if (!item.receiptCode && sheetMeta.code) item.receiptCode = sheetMeta.code;
    if (!item.receiptDate && sheetMeta.date) item.receiptDate = sheetMeta.date;
    if (!item.departmentName && sheetMeta.departmentName) item.departmentName = sheetMeta.departmentName;
    if (!item.delivererName && sheetMeta.delivererName) item.delivererName = sheetMeta.delivererName;
    if (!item.contractNo && sheetMeta.contractNo) item.contractNo = sheetMeta.contractNo;
    if (!item.requestNo && sheetMeta.requestNo) item.requestNo = sheetMeta.requestNo;
    if (!item.receiptNotes && sheetMeta.notes) item.receiptNotes = sheetMeta.notes;
    if (!item.warehouseName && sheetMeta.warehouseName) item.warehouseName = sheetMeta.warehouseName;

    if (!item.materialName && (item.materialCode || item.packageName)) {
      item.materialName = item.materialCode || item.packageName;
    }
    if (!item.materialCode && item.materialName) {
      item.materialCode = 'VT-' + item.materialName.slice(0, 6).toUpperCase().replace(/\s+/g, '');
    }
    if (item.batchCode && !item.packageNo) item.packageNo = item.batchCode;
    if (item.packageNo && !item.batchCode) item.batchCode = item.packageNo;
    if (!item.packageNo) item.packageNo = `PKG-${parsedItems.length + 1}`;
    if (!item.packageName) item.packageName = `Kiện ${item.packageNo}`;
    if (!item.unit) item.unit = 'Ống';
    if (!item.packingListNo) item.packingListNo = 'PL-CHUA-RO';
    if (!item.shipment) item.shipment = 'SHP-CHUA-RO';
    if (!item.category) item.category = 'Chung';
    if (!item.drawingNo) item.drawingNo = 'N/A';
    if (!item.manufacturer) item.manufacturer = 'Đang cập nhật';
    if (!item.supplier) item.supplier = item.delivererName || 'Đang cập nhật';

    if (!item.materialName) {
      skippedErrorCount++;
      if (errors.length < 30) {
        errors.push(`Dòng ${r + 1}: Thiếu tên vật tư thiết bị.`);
      }
    } else {
      parsedItems.push(item);
    }

    const done = r - dataStartIdx + 1;
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

// Parse file Excel Xuất kho (Hỗ trợ 100.000+ dòng mượt mà + chuẩn QN-OPR-PR11-FM06)
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
    | 'departmentName'
    | 'projectName'
    | 'recipientName'
    | 'recipientDepartment'
    | 'requestNo'
    | 'issueNotes'
    | 'warehouseName'
    | 'packingListNo'
    | 'shipment'
    | 'batchCode'
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
    | 'purpose'
    | 'note';

  const classifyOutboundCol = (norm: string): OutboundCol | null => {
    if (!norm || norm === 'stt' || norm === 'no') return null;
    if (norm.includes('maphieuxuat') || norm.includes('sophieuxuat') || norm.includes('maphieu') || norm.includes('sophieu') || norm.includes('sochungtu') || norm.includes('issuecode')) return 'issueCode';
    if (norm.includes('ngayxuatkho') || norm.includes('ngayxuat') || norm.includes('ngaylap') || norm.includes('ngaychungtu') || (norm.includes('ngay') && !norm.includes('denngay')) || norm.includes('issuedate')) return 'issueDate';
    if (norm === 'bophan' || norm.includes('bophanduan')) return 'departmentName';
    if (norm.includes('tenduan') || norm.includes('duan') || norm.includes('congtrinh') || norm.includes('project')) return 'projectName';
    if (norm === 'nguoinhan' || norm === 'hotennguoinhan' || norm === 'recipientname') return 'recipientName';
    if (norm.includes('donvitonhom') || norm.includes('tonhom') || norm.includes('doithicong') || norm.includes('donvinhan') || norm.includes('bophannhan') || norm.includes('nguoinhandoithicong') || norm.includes('recipient')) return 'recipientDepartment';
    if (norm.includes('sopyc') || norm.includes('pyc') || norm.includes('pdx') || norm.includes('dexuat') || norm.includes('requestno')) return 'requestNo';
    if (norm.includes('lydoxuat') || norm === 'lydo' || norm === 'noidung') return 'issueNotes';
    if (norm.includes('xuattukho') || norm.includes('khoxuat') || norm.includes('khotiepnhan') || norm.includes('tenkho') || norm === 'kho' || norm.includes('warehouse')) return 'warehouseName';
    if (norm.includes('packing') || norm.includes('sopackinglist') || norm === 'pl') return 'packingListNo';
    if (norm === 'malo' || norm.includes('batchcode') || norm === 'lotno' || norm === 'heatno') return 'batchCode';
    if (norm.includes('shipment') || norm.includes('lohang') || norm === 'sh') return 'shipment';
    if (getQuantityColPriority(norm) > 0) return 'quantity';
    if (norm.includes('sokien') || norm.includes('kienso') || norm.includes('makien') || norm === 'pkg' || norm === 'package' || norm.includes('packageno') || norm.includes('pkgno') || norm.includes('boxno') || norm.includes('crateno')) return 'packageNo';
    if (norm.includes('tenkien') || norm.includes('packagename')) return 'packageName';
    if (isMaterialCodeHeader(norm)) return 'materialCode';
    if (isMaterialNameHeader(norm)) return 'materialName';
    if (norm.includes('donvitinh') || norm === 'dvt' || norm === 'unit' || norm === 'uom') return 'unit';
    if ((norm.includes('khoiluong') || norm.includes('trongluong') || norm.includes('weight') || norm === 'kg' || norm === 'kl') && !norm.includes('tongkhoiluong')) return 'weightKg';
    if (norm.includes('hangmuc') || norm.includes('category') || norm.includes('discipline')) return 'category';
    if (norm.includes('banve') || norm.includes('drawing') || norm === 'dwg') return 'drawingNo';
    if (norm.includes('nhasanxuat') || norm.includes('nsx') || norm.includes('manufacturer') || norm.includes('maker')) return 'manufacturer';
    if (norm.includes('nhacungcap') || norm.includes('ncc') || norm.includes('supplier') || norm.includes('vendor')) return 'supplier';
    if (norm === 'ghichu' || norm === 'note' || norm === 'remarks' || norm === 'remark') return 'note';
    if (norm.includes('mucdich') || norm.includes('lapdat') || norm.includes('purpose')) return 'purpose';
    return null;
  };

  const headerIdx = findHeaderRowIndex(rows, classifyOutboundCol, ['materialCode', 'materialName', 'quantity', 'weightKg']);
  const sheetMeta = extractSheetVoucherMeta(rows, headerIdx);
  const { mergedHeaderCells, dataStartIdx } = detectMergedSubHeader(rows, headerIdx);

  const normalizedHeaders = mergedHeaderCells.map((h) => normalizeHeaderKey(h));
  const colMap: (OutboundCol | null)[] = normalizedHeaders.map((norm) => classifyOutboundCol(norm));

  let bestQtyCol = -1;
  let bestQtyPriority = 0;
  for (let c = 0; c < colMap.length; c++) {
    if (colMap[c] === 'quantity') {
      const prio = getQuantityColPriority(normalizedHeaders[c]);
      if (prio > bestQtyPriority) {
        bestQtyPriority = prio;
        bestQtyCol = c;
      }
    }
  }
  for (let c = 0; c < colMap.length; c++) {
    if (colMap[c] === 'quantity' && c !== bestQtyCol) {
      colMap[c] = null;
    }
  }

  const totalDataRows = Math.max(1, rows.length - dataStartIdx);
  const parsedItems: Partial<OutboundItemDetail>[] = [];
  const errors: string[] = [];
  let skippedErrorCount = 0;
  const baseTs = Date.now();
  const CHUNK_SIZE = 20000;

  for (let r = dataStartIdx; r < rows.length; r++) {
    const row = rows[r];
    if (isRowBlank(row) || isSummaryOrFooterRow(row)) continue;

    const item: any = {
      id: `out-item-${baseTs}-${r}`,
      quantity: 0,
      weightKg: 0
    };

    for (let c = 0; c < colMap.length; c++) {
      const field = colMap[c];
      if (!field) continue;
      const val = row[c];
      if (val === '' || val === null || val === undefined) continue;

      if (field === 'quantity' || field === 'weightKg') {
        item[field] = Math.max(0, parseNum(val));
      } else if (field === 'issueDate') {
        const dt = formatExcelDate(val);
        if (dt) item.issueDate = dt;
      } else if (field === 'materialCode') {
        const cleaned = cleanCellText(val);
        if (cleaned) item.materialCode = cleaned.toUpperCase();
      } else {
        const cleaned = cleanCellText(val);
        if (cleaned) item[field] = cleaned;
      }
    }

    if (!item.materialCode && !item.materialName && !item.packageName && !item.packingListNo && !item.quantity && !item.weightKg) {
      continue;
    }

    if (!item.issueCode && sheetMeta.code) item.issueCode = sheetMeta.code;
    if (!item.issueDate && sheetMeta.date) item.issueDate = sheetMeta.date;
    if (!item.departmentName && sheetMeta.departmentName) item.departmentName = sheetMeta.departmentName;
    if (!item.recipientName && sheetMeta.recipientName) item.recipientName = sheetMeta.recipientName;
    if (!item.recipientDepartment && sheetMeta.recipientDepartment) item.recipientDepartment = sheetMeta.recipientDepartment;
    if (!item.requestNo && sheetMeta.requestNo) item.requestNo = sheetMeta.requestNo;
    if (!item.issueNotes && sheetMeta.notes) item.issueNotes = sheetMeta.notes;
    if (!item.warehouseName && sheetMeta.warehouseName) item.warehouseName = sheetMeta.warehouseName;

    if (item.batchCode && !item.packageNo) item.packageNo = item.batchCode;
    if (item.packageNo && !item.batchCode) item.batchCode = item.packageNo;

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

    const done = r - dataStartIdx + 1;
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

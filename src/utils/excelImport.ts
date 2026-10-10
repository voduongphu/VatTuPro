import * as XLSX from 'xlsx';
import {
  InventoryItem,
  ItemType,
  InboundReason,
  INBOUND_REASON_LABELS,
  ITEM_TYPE_LABELS,
} from '../types/inventory';
import { removeVietnameseTones } from './formatters';

export interface RawInboundExcelRow {
  rowIndex: number;
  receiptCode?: string;
  date?: string;
  warehouse?: string;
  subReason?: string;
  supplier?: string;
  packingListNo?: string;
  shipment?: string;
  projectItem?: string;
  itemCode: string;
  itemName: string;
  type?: string;
  category?: string;
  unit: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  manufacturer?: string;
  packageNo?: string;
  packageName?: string;
  modelSpecs?: string;
  lotNumber?: string;
  serialNumber?: string;
  locationBin?: string;
  notes?: string;
}

export interface ValidatedInboundRow extends RawInboundExcelRow {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  isExistingItem: boolean;
  matchedItem?: InventoryItem;
  normalizedType: ItemType;
  normalizedReason: InboundReason;
  calculatedTotal: number;
}

export interface ColumnMapping {
  itemCode: string;
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  receiptCode: string;
  date: string;
  warehouse: string;
  subReason: string;
  supplier: string;
  packingListNo: string;
  shipment: string;
  projectItem: string;
  type: string;
  category: string;
  manufacturer: string;
  packageNo: string;
  packageName: string;
  modelSpecs: string;
  lotNumber: string;
  serialNumber: string;
  locationBin: string;
  notes: string;
}

/**
 * Common column name patterns for fuzzy auto-matching
 */
const COLUMN_PATTERNS: Record<keyof ColumnMapping, string[]> = {
  itemCode: ['ma vat tu', 'ma vt', 'ma thiet bi', 'ma tb', 'ma hang', 'item code', 'itemcode', 'code', 'ma'],
  itemName: ['ten vat tu', 'ten thiet bi', 'ten hang', 'ten sp', 'item name', 'itemname', 'description', 'mo ta', 'ten'],
  quantity: ['so luong', 'sl', 'sl nhap', 'so luong nhap', 'quantity', 'qty'],
  unit: ['don vi tinh', 'dvt', 'don vi', 'unit', 'uom'],
  unitPrice: ['don gia', 'don gia nhap', 'gia nhap', 'gia', 'price', 'unit price', 'unitprice', 'cost'],
  receiptCode: ['ma phieu', 'ma phieu nhap', 'so phieu', 'so phieu nhap', 'receipt code', 'pnk', 'voucher no', 'so chung tu'],
  date: ['ngay nhap', 'ngay', 'date', 'receipt date', 'ngay chung tu', 'ngay lap'],
  warehouse: ['kho', 'kho nhap', 'kho tiep nhan', 'kho luu tru', 'warehouse', 'vi tri kho'],
  subReason: ['ly do', 'ly do nhap', 'loai nhap', 'hinh thuc nhap', 'reason', 'inbound reason'],
  supplier: ['nha cung cap', 'ncc', 'nguon giao', 'don vi giao', 'supplier', 'vendor'],
  packingListNo: ['packing list', 'so packing list', 'pl', 'so pl', 'so packinglist', 'packing list no', 'p/l'],
  shipment: ['shipment', 'lo hang', 'chuyen hang', 'van don', 'chuyen tau', 'so container', 'cont'],
  projectItem: ['hang muc', 'hang muc cong trinh', 'goi thau', 'du an', 'project item', 'work package'],
  type: ['phan loai', 'loai vat tu', 'loai vt/tb', 'loai hang', 'item type', 'type'],
  category: ['nhom', 'nhom vat tu', 'nhom danh muc', 'danh muc', 'category', 'group'],
  manufacturer: ['nha san xuat', 'hang sx', 'hang che tao', 'nsx', 'manufacturer', 'make', 'brand'],
  packageNo: ['so kien', 'ma kien', 'kien so', 'package no', 'pack no', 'box no', 'carton no'],
  packageName: ['ten kien', 'mo ta kien', 'loai kien', 'package name', 'pack desc'],
  modelSpecs: ['quy cach', 'model', 'thong so', 'quy cach ky thuat', 'specs', 'specification', 'nhan hieu'],
  lotNumber: ['so lo', 'lo', 'so lot', 'lot', 'lot number', 'lot no', 'batch'],
  serialNumber: ['so serial', 'serial', 'sn', 's/n', 'serial number'],
  locationBin: ['vi tri', 'ke', 'ngan', 'vi tri ke', 'bin', 'location', 'rack'],
  notes: ['ghi chu', 'note', 'notes', 'chu thich', 'remark', 'dien giai'],
};

/**
 * Match a header string against known column patterns
 */
function findBestFieldMatch(header: string): keyof ColumnMapping | null {
  const normalized = removeVietnameseTones(header).toLowerCase().trim().replace(/[^a-z0-9]/g, ' ');
  
  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS) as [keyof ColumnMapping, string[]][]) {
    for (const pat of patterns) {
      if (normalized === pat || normalized.includes(pat)) {
        return field;
      }
    }
  }
  return null;
}

/**
 * Auto-detect column mapping from Excel headers
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    itemCode: '',
    itemName: '',
    quantity: '',
    unit: '',
    unitPrice: '',
    receiptCode: '',
    date: '',
    warehouse: '',
    subReason: '',
    supplier: '',
    packingListNo: '',
    shipment: '',
    projectItem: '',
    type: '',
    category: '',
    manufacturer: '',
    packageNo: '',
    packageName: '',
    modelSpecs: '',
    lotNumber: '',
    serialNumber: '',
    locationBin: '',
    notes: '',
  };

  const assignedFields = new Set<string>();

  headers.forEach(header => {
    const matched = findBestFieldMatch(header);
    if (matched && !assignedFields.has(matched)) {
      mapping[matched] = header;
      assignedFields.add(matched);
    }
  });

  return mapping;
}

/**
 * Parse uploaded Excel or CSV file
 */
export async function parseExcelFile(
  file: File
): Promise<{ headers: string[]; rawRows: Record<string, any>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = e => {
      try {
        const buffer = e.target?.result;
        if (!buffer) {
          reject(new Error('Không thể đọc nội dung file.'));
          return;
        }

        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          reject(new Error('Tệp Excel không có trang tính (Sheet) nào.'));
          return;
        }

        const sheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
          raw: false,
          defval: '',
        });

        if (jsonData.length === 0) {
          reject(new Error('Trang tính trống hoặc không có dữ liệu hàng.'));
          return;
        }

        // Get headers from first row keys
        const headers = Object.keys(jsonData[0]);
        resolve({ headers, rawRows: jsonData });
      } catch (err: any) {
        reject(new Error(`Lỗi giải mã file Excel: ${err.message || 'Sai định dạng'}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Lỗi trong quá trình đọc file.'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Normalize and validate rows according to column mapping
 */
export function validateAndNormalizeRows(
  rawRows: Record<string, any>[],
  mapping: ColumnMapping,
  existingItems: InventoryItem[],
  defaultWarehouse?: string,
  defaultDate?: string,
  defaultSupplier?: string,
  defaultReason?: InboundReason
): ValidatedInboundRow[] {
  const todayStr = new Date().toISOString().slice(0, 10);

  return rawRows.map((row, index) => {
    const rawCode = String(row[mapping.itemCode] || '').trim();
    const rawName = String(row[mapping.itemName] || '').trim();
    const rawQty = parseFloat(String(row[mapping.quantity] || '0').replace(/,/g, ''));
    const rawUnitPrice = parseFloat(String(row[mapping.unitPrice] || '0').replace(/,/g, ''));
    const rawUnit = String(row[mapping.unit] || '').trim();

    const rawWarehouse = String(row[mapping.warehouse] || '').trim() || defaultWarehouse || 'Kho Tổng A (Hà Nội)';
    const rawDate = normalizeDateString(String(row[mapping.date] || '').trim()) || defaultDate || todayStr;
    const rawSupplier = String(row[mapping.supplier] || '').trim() || defaultSupplier || 'Nhà cung cấp vật tư';
    const rawReceiptCode = String(row[mapping.receiptCode] || '').trim();
    const rawPackingList = String(row[mapping.packingListNo] || '').trim();
    const rawShipment = String(row[mapping.shipment] || '').trim();
    const rawProjectItem = String(row[mapping.projectItem] || '').trim();
    const rawManufacturer = String(row[mapping.manufacturer] || '').trim();
    const rawPackageNo = String(row[mapping.packageNo] || '').trim();
    const rawPackageName = String(row[mapping.packageName] || '').trim();
    const rawModelSpecs = String(row[mapping.modelSpecs] || '').trim();
    const rawLotNumber = String(row[mapping.lotNumber] || '').trim();
    const rawSerialNumber = String(row[mapping.serialNumber] || '').trim();
    const rawLocationBin = String(row[mapping.locationBin] || '').trim();
    const rawNotes = String(row[mapping.notes] || '').trim();

    // Reason normalization
    const rawReasonStr = String(row[mapping.subReason] || '').trim();
    const normalizedReason = detectInboundReason(rawReasonStr) || defaultReason || 'PURCHASE';

    // Type normalization
    const rawTypeStr = String(row[mapping.type] || '').trim();
    const normalizedType = detectItemType(rawTypeStr);

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validation
    if (!rawCode) {
      errors.push('Thiếu mã vật tư / thiết bị.');
    }
    if (!rawName) {
      errors.push('Thiếu tên vật tư / thiết bị.');
    }
    if (isNaN(rawQty) || rawQty <= 0) {
      errors.push(`Số lượng không hợp lệ (phải > 0, hiện tại: ${rawQty}).`);
    }

    if (!rawUnit) {
      warnings.push('Chưa có ĐVT, mặc định sẽ là "Cái".');
    }

    // Check existing item
    const matchedItem = existingItems.find(
      it => it.code.toLowerCase() === rawCode.toLowerCase()
    );
    const isExistingItem = !!matchedItem;

    const unitPrice = !isNaN(rawUnitPrice) && rawUnitPrice >= 0
      ? rawUnitPrice
      : matchedItem?.unitPrice || 0;

    if (unitPrice === 0) {
      warnings.push('Đơn giá bằng 0 đ.');
    }

    const calculatedTotal = (isNaN(rawQty) || rawQty <= 0 ? 0 : rawQty) * unitPrice;

    return {
      rowIndex: index + 2, // 1-based, considering header is row 1
      receiptCode: rawReceiptCode,
      date: rawDate,
      warehouse: rawWarehouse,
      subReason: normalizedReason,
      supplier: rawSupplier,
      packingListNo: rawPackingList,
      shipment: rawShipment,
      projectItem: rawProjectItem,
      itemCode: rawCode,
      itemName: rawName || matchedItem?.name || '',
      type: rawTypeStr,
      category: String(row[mapping.category] || '').trim() || matchedItem?.category || 'Chung',
      unit: rawUnit || matchedItem?.unit || 'Cái',
      quantity: isNaN(rawQty) ? 0 : rawQty,
      unitPrice,
      totalPrice: calculatedTotal,
      manufacturer: rawManufacturer || matchedItem?.manufacturer,
      packageNo: rawPackageNo || matchedItem?.packageNo,
      packageName: rawPackageName || matchedItem?.packageName,
      modelSpecs: rawModelSpecs || matchedItem?.modelSpecs || '',
      lotNumber: rawLotNumber || matchedItem?.lotNumber,
      serialNumber: rawSerialNumber || matchedItem?.serialNumber,
      locationBin: rawLocationBin || matchedItem?.locationBin || '',
      notes: rawNotes,

      isValid: errors.length === 0,
      errors,
      warnings,
      isExistingItem,
      matchedItem,
      normalizedType,
      normalizedReason,
      calculatedTotal,
    };
  });
}

/**
 * Format / Normalize date strings (supports DD/MM/YYYY, YYYY-MM-DD, or Excel serial number)
 */
function normalizeDateString(dateStr: string): string | null {
  if (!dateStr) return null;

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // If DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // If Date string representation (e.g., Sat Oct 10 2026...)
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

/**
 * Detect item type from user text
 */
function detectItemType(typeStr: string): ItemType {
  const norm = removeVietnameseTones(typeStr).toLowerCase();
  if (norm.includes('thiet bi') || norm.includes('may moc')) return 'THIET_BI';
  if (norm.includes('cong cu') || norm.includes('dung cu')) return 'CONG_CU';
  if (norm.includes('phu tung') || norm.includes('linh kien')) return 'PHU_TUNG';
  return 'VAT_TU';
}

/**
 * Detect inbound reason from text
 */
function detectInboundReason(reasonStr: string): InboundReason | null {
  const norm = removeVietnameseTones(reasonStr).toLowerCase();
  if (norm.includes('thu hoi') || norm.includes('cong trinh') || norm.includes('du an')) return 'PROJECT_RETURN';
  if (norm.includes('bao hanh') || norm.includes('sua chua')) return 'WARRANTY_RETURN';
  if (norm.includes('dieu chuyen')) return 'TRANSFER_IN';
  if (norm.includes('kiem ke') || norm.includes('thua')) return 'AUDIT_SURPLUS';
  if (norm.includes('mua') || norm.includes('moi') || norm.includes('purchase')) return 'PURCHASE';
  return null;
}

/**
 * Download standardized Excel template with sample rows and guidance sheet
 */
export function downloadInboundExcelTemplate(warehouses: string[] = [], categories: string[] = []) {
  const wb = XLSX.utils.book_new();

  // 1. Data template headers and realistic sample rows
  const headers = [
    'Mã phiếu nhập (Tùy chọn)',
    'Ngày nhập (YYYY-MM-DD)',
    'Kho tiếp nhận',
    'Lý do nhập',
    'Nhà cung cấp / Nguồn giao',
    'Số Packing List',
    'Lô hàng / Shipment',
    'Hạng mục công trình',
    'Mã vật tư / Thiết bị (*)',
    'Tên vật tư / Thiết bị (*)',
    'Phân loại',
    'Nhóm danh mục',
    'Đơn vị tính (*)',
    'Số lượng nhập (*)',
    'Đơn giá nhập (VNĐ)',
    'Nhà sản xuất / Hãng',
    'Số kiện',
    'Tên kiện hàng',
    'Model / Quy cách',
    'Số Lô',
    'Số Serial',
    'Vị trí kệ/ngăn',
    'Ghi chú',
  ];

  const sampleRows = [
    [
      'PNK-2026-088',
      '2026-10-10',
      warehouses[0] || 'Kho Tổng A (Hà Nội)',
      'Nhập mua mới',
      'Công ty TNHH Thiết bị Công nghiệp Tân Phát',
      'PL-2026-EU-084',
      'SHP-2026-VN02',
      'Hạng mục Cơ điện M&E Tầng 1-5',
      'VT-101',
      'Que hàn chịu lực E7018 - 3.2mm',
      'Vật tư tiêu hao',
      'Cơ khí - Gia công',
      'Hộp',
      50,
      145000,
      'Kobelco (Nhật Bản)',
      'PK-01',
      'Thùng Carton 20 hộp',
      'E7018 D3.2mm tiêu chuẩn AWS',
      'LOT-2026-KOB-09',
      '',
      'Kệ K01-N2',
      'Nhập bổ sung theo hợp đồng 12/HĐ-TP',
    ],
    [
      'PNK-2026-088',
      '2026-10-10',
      warehouses[0] || 'Kho Tổng A (Hà Nội)',
      'Nhập mua mới',
      'Công ty TNHH Thiết bị Công nghiệp Tân Phát',
      'PL-2026-EU-084',
      'SHP-2026-VN02',
      'Hạng mục Cơ điện M&E Tầng 1-5',
      'TB-205',
      'Máy hàn Inverter Mig/Mag Jasic NB-250E',
      'Thiết bị máy móc',
      'Cơ khí - Gia công',
      'Bộ',
      6,
      13800000,
      'Jasic Technology',
      'PK-02',
      'Kiện khung gỗ chống sốc',
      'Jasic NB-250E IGBT 380V',
      '',
      'JS-2026-M891, JS-2026-M892',
      'Khu máy B2',
      'Kèm dây mỏ hàn 3m và đồng hồ khí',
    ],
    [
      'PNK-2026-089',
      '2026-10-10',
      warehouses[1] || 'Kho Kỹ thuật B (Bắc Ninh)',
      'Thu hồi sau thi công / Dự án',
      'Đội thi công Cơ điện số 2',
      'PL-TH-CT02',
      'SHP-NOIBO-01',
      'Gói thầu Nhà xưởng số 3',
      'CC-302',
      'Kìm bấm cos thủy lực pin 16-400mm2',
      'Công cụ dụng cụ',
      'Điện - Đo lường',
      'Bộ',
      2,
      7600000,
      'Zupper Tools',
      'PK-01',
      'Hộp vali nhôm bảo quản',
      'Lực ép 12 tấn, pin 18V Li-ion',
      '',
      'ZP-8812-A, ZP-8812-B',
      'Tủ T-04',
      'Thu hồi từ công trình nghiệm thu đợt 1',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);

  // Set friendly column widths
  ws['!cols'] = [
    { wch: 22 }, // Mã phiếu
    { wch: 14 }, // Ngày
    { wch: 24 }, // Kho
    { wch: 20 }, // Lý do
    { wch: 32 }, // Nhà cung cấp
    { wch: 18 }, // Packing list
    { wch: 18 }, // Shipment
    { wch: 26 }, // Hạng mục
    { wch: 22 }, // Mã VT
    { wch: 32 }, // Tên VT
    { wch: 18 }, // Phân loại
    { wch: 20 }, // Danh mục
    { wch: 12 }, // ĐVT
    { wch: 14 }, // Số lượng
    { wch: 16 }, // Đơn giá
    { wch: 22 }, // NSX
    { wch: 14 }, // Số kiện
    { wch: 24 }, // Tên kiện
    { wch: 26 }, // Quy cách
    { wch: 16 }, // Lô
    { wch: 20 }, // Serial
    { wch: 14 }, // Vị trí
    { wch: 30 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Du_Lieu_Nhap_Kho');

  // 2. Guidance & Standard Master Data Reference Sheet
  const guideHeaders = ['Mục hướng dẫn', 'Chi tiết quy định / Giá trị hợp lệ'];
  const guideRows = [
    ['CÁC CỘT BẮT BUỘC (*)', 'Mã vật tư / Thiết bị, Tên vật tư / Thiết bị, Đơn vị tính, Số lượng nhập'],
    ['Định dạng ngày nhập', 'Khuyên dùng định dạng YYYY-MM-DD (Ví dụ: 2026-10-10) hoặc DD/MM/YYYY'],
    ['Cơ chế cập nhật vật tư', 'Nếu Mã VT đã tồn tại: Hệ thống sẽ tự động tăng tồn kho tương ứng và cập nhật đơn giá. Nếu Mã VT chưa có: Hệ thống tự động thêm mới vào danh mục!'],
    ['Gom nhóm phiếu nhập', 'Các dòng có cùng "Mã phiếu nhập" hoặc "Số Packing List" có thể tự động gom chung thành 1 phiếu nhập kho chính thức.'],
    ['Phân loại hợp lệ', Object.values(ITEM_TYPE_LABELS).join(' | ')],
    ['Lý do nhập kho', Object.values(INBOUND_REASON_LABELS).join(' | ')],
    ['Kho lưu trữ hiện có', warehouses.join(' | ') || 'Kho Tổng A, Kho Kỹ thuật B, Kho Dự án'],
    ['Nhóm danh mục hiện có', categories.join(' | ') || 'Cơ khí, Điện - Tự động hóa, Xây dựng, Hóa chất, Bảo hộ'],
  ];

  const wsGuide = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideRows]);
  wsGuide['!cols'] = [{ wch: 26 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan_Nhap');

  // Trigger download
  XLSX.writeFile(wb, `Mau_Nhap_Kho_Vat_Tu_Thiet_Bi_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

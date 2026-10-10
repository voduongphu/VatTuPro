import * as XLSX from 'xlsx';
import {
  InventoryItem,
  OutboundReason,
  OUTBOUND_REASON_LABELS,
} from '../types/inventory';
import { removeVietnameseTones } from './formatters';

export interface RawOutboundExcelRow {
  rowIndex: number;
  dispatchCode?: string;
  date?: string;
  warehouse?: string;
  subReason?: string;
  receiver?: string;
  departmentOrProject?: string;
  projectItem?: string;
  packingListNo?: string;
  shipment?: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  packageNo?: string;
  packageName?: string;
  lotNumber?: string;
  serialNumber?: string;
  notes?: string;
}

export interface ValidatedOutboundRow extends RawOutboundExcelRow {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  matchedItem?: InventoryItem;
  currentStock: number;
  isStockSufficient: boolean;
  normalizedReason: OutboundReason;
  calculatedTotal: number;
}

export interface OutboundColumnMapping {
  itemCode: string;
  itemName: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  dispatchCode: string;
  date: string;
  warehouse: string;
  subReason: string;
  receiver: string;
  departmentOrProject: string;
  projectItem: string;
  packingListNo: string;
  shipment: string;
  packageNo: string;
  packageName: string;
  lotNumber: string;
  serialNumber: string;
  notes: string;
}

const OUTBOUND_COLUMN_PATTERNS: Record<keyof OutboundColumnMapping, string[]> = {
  itemCode: ['ma vat tu', 'ma vt', 'ma thiet bi', 'ma tb', 'ma hang', 'item code', 'itemcode', 'code', 'ma'],
  itemName: ['ten vat tu', 'ten thiet bi', 'ten hang', 'ten sp', 'item name', 'itemname', 'description', 'mo ta', 'ten'],
  quantity: ['so luong', 'sl', 'sl xuat', 'so luong xuat', 'quantity', 'qty', 'xuat'],
  unit: ['don vi tinh', 'dvt', 'don vi', 'unit', 'uom'],
  unitPrice: ['don gia', 'don gia xuat', 'gia xuat', 'gia', 'price', 'unit price', 'unitprice', 'cost'],
  dispatchCode: ['ma phieu', 'ma phieu xuat', 'so phieu', 'so phieu xuat', 'dispatch code', 'pxk', 'voucher no', 'so chung tu xuat'],
  date: ['ngay xuat', 'ngay', 'date', 'dispatch date', 'ngay chung tu', 'ngay lap'],
  warehouse: ['kho', 'kho xuat', 'kho cap', 'kho hang', 'warehouse', 'vi tri kho'],
  subReason: ['ly do', 'ly do xuat', 'muc dich xuat', 'loai xuat', 'hinh thuc xuat', 'reason', 'outbound reason'],
  receiver: ['nguoi nhan', 'don vi nhan', 'bo phan nhan', 'receiver', 'recipient', 'doi thi cong', 'ben nhan'],
  departmentOrProject: ['du an', 'phong ban', 'bo phan', 'cong trinh', 'project', 'department'],
  projectItem: ['hang muc', 'hang muc cong trinh', 'goi thau', 'project item', 'work package'],
  packingListNo: ['packing list', 'so packing list', 'pl', 'so pl', 'packing list no', 'p/l'],
  shipment: ['shipment', 'lo hang', 'chuyen hang', 'van don', 'chuyen tau', 'so container', 'cont'],
  packageNo: ['so kien', 'ma kien', 'kien so', 'package no', 'pack no', 'box no'],
  packageName: ['ten kien', 'mo ta kien', 'loai kien', 'package name'],
  lotNumber: ['so lo', 'lo', 'so lot', 'lot', 'lot number', 'batch'],
  serialNumber: ['so serial', 'serial', 'sn', 's/n', 'serial number'],
  notes: ['ghi chu', 'note', 'dien giai', 'ghi chu xuat', 'comments', 'remark'],
};

export function detectOutboundColumnMapping(headers: string[]): OutboundColumnMapping {
  const mapping: OutboundColumnMapping = {
    itemCode: '',
    itemName: '',
    quantity: '',
    unit: '',
    unitPrice: '',
    dispatchCode: '',
    date: '',
    warehouse: '',
    subReason: '',
    receiver: '',
    departmentOrProject: '',
    projectItem: '',
    packingListNo: '',
    shipment: '',
    packageNo: '',
    packageName: '',
    lotNumber: '',
    serialNumber: '',
    notes: '',
  };

  const normalizedHeaders = headers.map(h => ({
    original: h,
    cleaned: removeVietnameseTones(h.trim()).toLowerCase().replace(/[^a-z0-9]/g, ' '),
  }));

  const keys = Object.keys(mapping) as (keyof OutboundColumnMapping)[];

  keys.forEach(key => {
    const patterns = OUTBOUND_COLUMN_PATTERNS[key];
    for (const pattern of patterns) {
      const found = normalizedHeaders.find(h => {
        const cleaned = h.cleaned;
        return cleaned === pattern || cleaned.startsWith(pattern) || cleaned.includes(` ${pattern} `);
      });
      if (found) {
        mapping[key] = found.original;
        break;
      }
    }
  });

  return mapping;
}

function detectOutboundReason(reasonStr: string): OutboundReason | null {
  const norm = removeVietnameseTones(reasonStr).toLowerCase();
  if (norm.includes('thi cong') || norm.includes('du an') || norm.includes('cong trinh')) return 'PROJECT_DISPATCH';
  if (norm.includes('phong ban') || norm.includes('noi bo') || norm.includes('cap phat')) return 'DEPARTMENT_USE';
  if (norm.includes('bao duong') || norm.includes('sua chua') || norm.includes('gui di')) return 'MAINTENANCE';
  if (norm.includes('dieu chuyen') || norm.includes('chuyen kho')) return 'TRANSFER_OUT';
  if (norm.includes('thanh ly') || norm.includes('tieu huy')) return 'LIQUIDATION';
  if (norm.includes('kiem ke') || norm.includes('thieu')) return 'AUDIT_DEFICIT';
  return null;
}

export function validateAndNormalizeOutboundRows(
  rawRows: Record<string, any>[],
  mapping: OutboundColumnMapping,
  existingItems: InventoryItem[],
  defaultWarehouse: string = 'Kho Tổng A (Hà Nội)',
  defaultReason: OutboundReason = 'PROJECT_DISPATCH',
  defaultReceiver: string = 'Đội thi công công trình',
  defaultProject: string = 'Dự án trọng điểm'
): ValidatedOutboundRow[] {
  return rawRows.map((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawCode = String(row[mapping.itemCode] || '').trim();
    const rawName = String(row[mapping.itemName] || '').trim();
    const rawQty = Number(row[mapping.quantity]);
    const rawUnit = String(row[mapping.unit] || '').trim();
    const rawPrice = Number(row[mapping.unitPrice]);

    const rawWarehouse = String(row[mapping.warehouse] || '').trim() || defaultWarehouse;
    const rawReasonStr = String(row[mapping.subReason] || '').trim();
    const rawReceiver = String(row[mapping.receiver] || '').trim() || defaultReceiver;
    const rawDeptProject = String(row[mapping.departmentOrProject] || '').trim() || defaultProject;
    const rawProjectItem = String(row[mapping.projectItem] || '').trim();
    const rawDispatchCode = String(row[mapping.dispatchCode] || '').trim();
    const rawDate = String(row[mapping.date] || '').trim();
    const rawPackingList = String(row[mapping.packingListNo] || '').trim();
    const rawShipment = String(row[mapping.shipment] || '').trim();
    const rawNotes = String(row[mapping.notes] || '').trim();

    // 1. Check item code or name
    if (!rawCode && !rawName) {
      errors.push('Thiếu Mã vật tư hoặc Tên vật tư');
    }

    // 2. Find matching item in inventory
    let matchedItem = existingItems.find(it => {
      if (rawCode && it.code.trim().toLowerCase() === rawCode.toLowerCase()) return true;
      if (rawName && it.name.trim().toLowerCase() === rawName.toLowerCase()) return true;
      return false;
    });

    if (!matchedItem) {
      errors.push(`Không tìm thấy mã vật tư "${rawCode || rawName}" trong kho.`);
    }

    // 3. Check quantity
    if (isNaN(rawQty) || rawQty <= 0) {
      errors.push('Số lượng xuất phải lớn hơn 0');
    }

    // 4. Check stock availability!
    const currentStock = matchedItem ? matchedItem.currentStock : 0;
    const isStockSufficient = matchedItem ? currentStock >= rawQty : false;

    if (matchedItem && !isStockSufficient) {
      errors.push(`Tồn kho không đủ! (Yêu cầu xuất: ${rawQty} ${matchedItem.unit}, còn tồn: ${currentStock} ${matchedItem.unit})`);
    } else if (matchedItem && currentStock - rawQty <= matchedItem.minStock) {
      warnings.push(`Xuất xong sẽ chạm hoặc dưới ngưỡng tồn tối thiểu (${matchedItem.minStock} ${matchedItem.unit}).`);
    }

    // Normalize reason
    const detectedReason = rawReasonStr ? detectOutboundReason(rawReasonStr) : null;
    const normalizedReason = detectedReason || defaultReason;

    const unitPrice = !isNaN(rawPrice) && rawPrice > 0 ? rawPrice : matchedItem?.unitPrice || 0;
    const calculatedTotal = (isNaN(rawQty) ? 0 : rawQty) * unitPrice;

    return {
      rowIndex: index + 1,
      dispatchCode: rawDispatchCode,
      date: rawDate,
      warehouse: rawWarehouse,
      subReason: rawReasonStr,
      receiver: rawReceiver,
      departmentOrProject: rawDeptProject,
      projectItem: rawProjectItem,
      packingListNo: rawPackingList,
      shipment: rawShipment,
      itemCode: rawCode || matchedItem?.code || '',
      itemName: rawName || matchedItem?.name || '',
      unit: rawUnit || matchedItem?.unit || 'Cái',
      quantity: isNaN(rawQty) ? 0 : rawQty,
      unitPrice,
      totalPrice: calculatedTotal,
      packageNo: String(row[mapping.packageNo] || '').trim(),
      packageName: String(row[mapping.packageName] || '').trim(),
      lotNumber: String(row[mapping.lotNumber] || '').trim(),
      serialNumber: String(row[mapping.serialNumber] || '').trim(),
      notes: rawNotes,

      isValid: errors.length === 0,
      errors,
      warnings,
      matchedItem,
      currentStock,
      isStockSufficient,
      normalizedReason,
      calculatedTotal,
    };
  });
}

export function downloadOutboundExcelTemplate(
  warehouses: string[] = [],
  projects: string[] = [],
  existingItems: InventoryItem[] = []
) {
  const wb = XLSX.utils.book_new();

  const headers = [
    'Mã phiếu xuất (Tùy chọn)',
    'Ngày xuất (YYYY-MM-DD)',
    'Kho xuất (*)',
    'Mục đích / Lý do xuất (*)',
    'Đơn vị / Người nhận (*)',
    'Dự án / Phòng ban',
    'Hạng mục công trình',
    'Số Packing List',
    'Lô hàng / Shipment',
    'Mã vật tư / Thiết bị (*)',
    'Tên vật tư / Thiết bị',
    'Đơn vị tính',
    'Số lượng xuất (*)',
    'Đơn giá xuất (VNĐ)',
    'Số kiện',
    'Tên kiện hàng',
    'Ghi chú xuất',
  ];

  const sampleRows = [
    [
      'PXK-2026-041',
      new Date().toISOString().slice(0, 10),
      warehouses[0] || 'Kho Tổng A (Hà Nội)',
      'Cấp phát thi công dự án',
      'Đội thi công Cơ điện số 1 - Anh Hùng',
      projects[0] || 'Dự án Tòa nhà phức hợp Sunrise Tower',
      'Hạng mục Cơ điện M&E Tầng 1-5',
      'PL-2026-EU-084',
      'SHP-2026-VN02',
      existingItems[0]?.code || 'VT-101',
      existingItems[0]?.name || 'Que hàn chịu lực E7018 - 3.2mm',
      existingItems[0]?.unit || 'Hộp',
      10,
      existingItems[0]?.unitPrice || 145000,
      'PK-01',
      'Thùng Carton 10 hộp',
      'Cấp phát theo phiếu yêu cầu vật tư số 04/YC-ME',
    ],
    [
      'PXK-2026-041',
      new Date().toISOString().slice(0, 10),
      warehouses[0] || 'Kho Tổng A (Hà Nội)',
      'Cấp phát thi công dự án',
      'Đội thi công Cơ điện số 1 - Anh Hùng',
      projects[0] || 'Dự án Tòa nhà phức hợp Sunrise Tower',
      'Hạng mục Cơ điện M&E Tầng 1-5',
      'PL-2026-EU-084',
      'SHP-2026-VN02',
      existingItems[1]?.code || 'TB-205',
      existingItems[1]?.name || 'Máy hàn Inverter Mig/Mag Jasic NB-250E',
      existingItems[1]?.unit || 'Bộ',
      2,
      existingItems[1]?.unitPrice || 13800000,
      'PK-02',
      'Kiện khung gỗ',
      'Bàn giao máy kèm biên bản nghiệm thu kỹ thuật',
    ],
    [
      'PXK-2026-042',
      new Date().toISOString().slice(0, 10),
      warehouses[1] || 'Kho Kỹ thuật B (Bắc Ninh)',
      'Gửi đi bảo dưỡng / Sửa chữa',
      'Trung tâm Kỹ thuật Dịch vụ Bosch Việt Nam',
      'Phòng Bảo trì Thiết bị Nhà xưởng',
      'Bảo dưỡng định kỳ Quý 4',
      '',
      '',
      existingItems[2]?.code || 'CC-302',
      existingItems[2]?.name || 'Kìm bấm cos thủy lực pin 16-400mm2',
      existingItems[2]?.unit || 'Bộ',
      1,
      existingItems[2]?.unitPrice || 7600000,
      'PK-01',
      'Hộp vali nhôm',
      'Bảo dưỡng căn chỉnh lực ép thủy lực',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);

  ws['!cols'] = [
    { wch: 22 }, // Mã phiếu xuất
    { wch: 14 }, // Ngày xuất
    { wch: 24 }, // Kho xuất
    { wch: 26 }, // Lý do xuất
    { wch: 32 }, // Người nhận
    { wch: 30 }, // Dự án / Phòng ban
    { wch: 26 }, // Hạng mục
    { wch: 18 }, // Packing list
    { wch: 18 }, // Shipment
    { wch: 22 }, // Mã VT
    { wch: 32 }, // Tên VT
    { wch: 12 }, // ĐVT
    { wch: 14 }, // Số lượng xuất
    { wch: 16 }, // Đơn giá
    { wch: 14 }, // Số kiện
    { wch: 24 }, // Tên kiện
    { wch: 32 }, // Ghi chú
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Du_Lieu_Xuat_Kho');

  // Guidance sheet
  const guideHeaders = ['Mục hướng dẫn', 'Chi tiết quy định / Giá trị hợp lệ'];
  const guideRows = [
    ['CÁC CỘT BẮT BUỘC (*)', 'Kho xuất, Mục đích / Lý do xuất, Đơn vị / Người nhận, Mã vật tư, Số lượng xuất'],
    ['Kiểm tra tồn kho', 'Hệ thống tự động kiểm tra số lượng tồn hiện tại của từng mặt hàng. Nếu Số lượng xuất > Tồn kho hiện có, dòng đó sẽ bị báo lỗi và không được xuất.'],
    ['Định dạng ngày xuất', 'Khuyên dùng định dạng YYYY-MM-DD (Ví dụ: 2026-10-10) hoặc DD/MM/YYYY'],
    ['Gom nhóm phiếu xuất', 'Có thể gom các dòng có cùng "Mã phiếu xuất", cùng "Người nhận" hoặc gom tất cả thành 1 phiếu xuất.'],
    ['Mục đích xuất kho', Object.values(OUTBOUND_REASON_LABELS).join(' | ')],
    ['Kho lưu trữ hiện có', warehouses.join(' | ') || 'Kho Tổng A, Kho Kỹ thuật B, Kho Dự án'],
    ['Dự án hiện có', projects.join(' | ') || 'Dự án Sunrise Tower, Nhà máy SamSung, Cầu Nhật Tân'],
  ];

  const wsGuide = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideRows]);
  wsGuide['!cols'] = [{ wch: 24 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Huong_Dan_Xuat');

  XLSX.writeFile(wb, `Mau_Xuat_Kho_Vat_Tu_Thiet_Bi_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

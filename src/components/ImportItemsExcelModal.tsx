import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  FileSpreadsheet,
  UploadCloud,
  Download,
  AlertTriangle,
  CheckCircle2,
  Boxes,
  Check,
  AlertCircle,
  RefreshCw,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { EquipmentCondition, InventoryItem, ItemType } from '../types/inventory';
import { formatCurrency, formatNumber, getItemTypeLabel } from '../utils/formatters';

interface ImportItemsExcelModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedItemRow {
  code: string;
  name: string;
  type: ItemType;
  category: string;
  unit: string;
  warehouseId: string;
  warehouseName: string;
  location: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unitPrice: number;
  serialOrLot?: string;
  condition?: EquipmentCondition;
  inspectionDueDate?: string;
  supplierDefault?: string;
  spec?: string;
  status: 'NEW' | 'UPDATE' | 'ERROR';
  errors: string[];
}

export const ImportItemsExcelModal: React.FC<ImportItemsExcelModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const { warehouses, items, importItemsBatch } = useInventory();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedItemRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [filterTab, setFilterTab] = useState<'ALL' | 'NEW' | 'UPDATE' | 'ERROR'>('ALL');
  const [importSummary, setImportSummary] = useState<{
    success: boolean;
    addedCount: number;
    updatedCount: number;
    errors: string[];
  } | null>(null);

  // Helper to extract values by looking up candidate column headers
  const getCleanVal = (row: any, ...candidates: string[]) => {
    for (const cand of candidates) {
      for (const key of Object.keys(row)) {
        const cleanKey = key
          .toLowerCase()
          .replace(/[_\-*#]/g, '')
          .replace(/\s+/g, '')
          .trim();
        const cleanCand = cand
          .toLowerCase()
          .replace(/[_\-*#]/g, '')
          .replace(/\s+/g, '')
          .trim();
        if (cleanKey === cleanCand || cleanKey.includes(cleanCand)) {
          return row[key];
        }
      }
    }
    return undefined;
  };

  // Helper to parse ItemType
  const parseItemType = (val: any): ItemType => {
    if (!val) return 'VAT_TU';
    const s = String(val).toUpperCase().trim();
    if (s.includes('THIET_BI') || s.includes('THIẾT BỊ') || s.includes('DEVICE') || s.includes('EQUIPMENT')) {
      return 'THIET_BI';
    }
    if (s.includes('CONG_CU') || s.includes('CÔNG CỤ') || s.includes('TOOL')) {
      return 'CONG_CU';
    }
    if (s.includes('PHU_TUNG') || s.includes('PHỤ TÙNG') || s.includes('SPARE')) {
      return 'PHU_TUNG';
    }
    return 'VAT_TU';
  };

  // Helper to parse Equipment Condition
  const parseCondition = (val: any): EquipmentCondition => {
    if (!val) return 'SAN_SANG';
    const s = String(val).toUpperCase().trim();
    if (s.includes('MUON') || s.includes('MƯỢN')) return 'DANG_MUON';
    if (s.includes('BAO_DUONG') || s.includes('BẢO DƯỠNG')) return 'BAO_DUONG';
    if (s.includes('HONG') || s.includes('HỎNG') || s.includes('SUA')) return 'HONG_CHO_SUA';
    return 'SAN_SANG';
  };

  // 1. Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Mã SKU (*)': 'VT-CD-105',
        'Tên Vật Tư / Thiết Bị (*)': 'Cáp đồng trần tiếp địa M50 Cadivi',
        'Phân Loại (VAT_TU/THIET_BI/CONG_CU/PHU_TUNG)': 'VAT_TU',
        'Nhóm Ngành / Danh Mục (*)': 'Cơ điện & Dây cáp',
        'Đơn Vị Tính (*)': 'Mét',
        'Mã Kho Lưu Trữ (*)': warehouses[0]?.code || 'WH-HN',
        'Vị Trí Kệ': 'Kệ C1-04',
        'Số Lượng Tồn Kho': 350,
        'Định Mức Min': 50,
        'Định Mức Max': 1000,
        'Đơn Giá Vốn (VNĐ)': 95000,
        'Số Serial / Lô': 'LOT-M50-2026',
        'Tình Trạng Thiết Bị': 'SAN_SANG',
        'Hạn Kiểm Định (YYYY-MM-DD)': '',
        'Nhà Cung Cấp Mặc Định': 'Công ty Cổ phần Cadivi Việt Nam',
        'Quy Cách Kỹ Thuật': 'Tiết diện 50mm2, đồng nguyên chất 99.9%',
      },
      {
        'Mã SKU (*)': 'TB-DK-205',
        'Tên Vật Tư / Thiết Bị (*)': 'Máy hàn que điện tử Inverter Jasic ARC-200',
        'Phân Loại (VAT_TU/THIET_BI/CONG_CU/PHU_TUNG)': 'THIET_BI',
        'Nhóm Ngành / Danh Mục (*)': 'Máy móc & Thiết bị cơ khí',
        'Đơn Vị Tính (*)': 'Cái',
        'Mã Kho Lưu Trữ (*)': warehouses[1]?.code || warehouses[0]?.code || 'WH-HP',
        'Vị Trí Kệ': 'Kệ M2-01',
        'Số Lượng Tồn Kho': 8,
        'Định Mức Min': 2,
        'Định Mức Max': 20,
        'Đơn Giá Vốn (VNĐ)': 3450000,
        'Số Serial / Lô': 'SN-JAS-2026-889',
        'Tình Trạng Thiết Bị': 'SAN_SANG',
        'Hạn Kiểm Định (YYYY-MM-DD)': '2026-12-31',
        'Nhà Cung Cấp Mặc Định': 'Công ty CP Công Nghệ Jasic Việt Nam',
        'Quy Cách Kỹ Thuật': 'Điện áp 220V, dòng hàn 20-200A, que 1.6-4.0mm',
      },
      {
        'Mã SKU (*)': 'CC-DC-301',
        'Tên Vật Tư / Thiết Bị (*)': 'Bộ cờ lê tròng tự động Kingtony 8-24mm',
        'Phân Loại (VAT_TU/THIET_BI/CONG_CU/PHU_TUNG)': 'CONG_CU',
        'Nhóm Ngành / Danh Mục (*)': 'Dụng cụ cầm tay',
        'Đơn Vị Tính (*)': 'Bộ',
        'Mã Kho Lưu Trữ (*)': warehouses[0]?.code || 'WH-HN',
        'Vị Trí Kệ': 'Tủ Tool-02',
        'Số Lượng Tồn Kho': 15,
        'Định Mức Min': 5,
        'Định Mức Max': 30,
        'Đơn Giá Vốn (VNĐ)': 1280000,
        'Số Serial / Lô': 'KT-2026-CRV',
        'Tình Trạng Thiết Bị': 'SAN_SANG',
        'Hạn Kiểm Định (YYYY-MM-DD)': '',
        'Nhà Cung Cấp Mặc Định': 'Kingtony Tools VN',
        'Quy Cách Kỹ Thuật': 'Thép Cr-V tôi nhiệt, 14 chi tiết từ 8mm đến 24mm',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [
      { wch: 16 }, // SKU
      { wch: 38 }, // Name
      { wch: 22 }, // Type
      { wch: 26 }, // Category
      { wch: 14 }, // Unit
      { wch: 18 }, // Warehouse
      { wch: 16 }, // Location
      { wch: 18 }, // Stock
      { wch: 16 }, // Min
      { wch: 16 }, // Max
      { wch: 18 }, // Price
      { wch: 20 }, // Serial
      { wch: 22 }, // Condition
      { wch: 20 }, // Inspection date
      { wch: 32 }, // Supplier
      { wch: 40 }, // Spec
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh_Muc_Vat_Tu');

    // Add warehouse reference sheet to help user enter correct warehouse codes
    const whSheetData = warehouses.map(w => ({
      'Mã Kho (Nhập vào cột Mã Kho)': w.code,
      'Mã Hệ Thống': w.id,
      'Tên Kho Hàng': w.name,
      'Địa Điểm': w.address,
      'Thủ Kho Phụ Trách': w.manager,
    }));
    const whWorksheet = XLSX.utils.json_to_sheet(whSheetData);
    whWorksheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 35 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, whWorksheet, 'Danh_Sach_Ma_Kho_Hop_Le');

    XLSX.writeFile(workbook, 'Mau_Import_Danh_Muc_Vat_Tu.xlsx');
  };

  // 2. Parse Excel/CSV File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData: any[] = XLSX.utils.sheet_to_json(ws);

        if (!rawData || rawData.length === 0) {
          alert('File Excel trống hoặc không đọc được dữ liệu.');
          setIsProcessing(false);
          return;
        }

        const seenCodes = new Set<string>();
        const parsed: ParsedItemRow[] = [];

        rawData.forEach((row, idx) => {
          const rowNum = idx + 2;
          const errors: string[] = [];

          // 1. Code
          const rawCode = getCleanVal(
            row,
            'Mã SKU (*)',
            'Mã SKU',
            'Mã vật tư',
            'Mã VT',
            'SKU',
            'Code',
            'ma_vt',
            'Mã'
          );
          const code = String(rawCode || '').trim().toUpperCase();
          if (!code) {
            errors.push(`Dòng ${rowNum}: Thiếu mã SKU định danh.`);
          } else if (seenCodes.has(code)) {
            errors.push(`Dòng ${rowNum}: Mã SKU "${code}" bị trùng lặp trong file.`);
          } else {
            seenCodes.add(code);
          }

          // 2. Name
          const rawName = getCleanVal(
            row,
            'Tên Vật Tư / Thiết Bị (*)',
            'Tên Vật Tư',
            'Tên Thiết Bị',
            'Tên hàng',
            'Tên',
            'Name',
            'ten_vt'
          );
          const name = String(rawName || '').trim();
          if (!name) {
            errors.push(`Dòng ${rowNum}: Thiếu tên vật tư / thiết bị.`);
          }

          // 3. Type
          const rawType = getCleanVal(row, 'Phân Loại', 'Loại', 'Type', 'phan_loai');
          const type = parseItemType(rawType);

          // 4. Category
          const rawCat = getCleanVal(
            row,
            'Nhóm Ngành / Danh Mục (*)',
            'Nhóm Ngành',
            'Danh Mục',
            'Category',
            'danh_muc'
          );
          const category = String(rawCat || 'Vật tư tổng hợp').trim();

          // 5. Unit
          const rawUnit = getCleanVal(row, 'Đơn Vị Tính (*)', 'Đơn Vị Tính', 'ĐVT', 'Unit', 'don_vi_tinh');
          const unit = String(rawUnit || 'Cái').trim();

          // 6. Warehouse
          const rawWh = String(
            getCleanVal(
              row,
              'Mã Kho Lưu Trữ (*)',
              'Mã Kho',
              'Kho Lưu Trữ',
              'Kho Hàng',
              'Kho',
              'Warehouse',
              'ma_kho'
            ) || ''
          ).trim();

          let matchedWh = warehouses.find(
            w =>
              w.code.toLowerCase() === rawWh.toLowerCase() ||
              w.id.toLowerCase() === rawWh.toLowerCase() ||
              w.name.toLowerCase().includes(rawWh.toLowerCase())
          );
          if (!matchedWh) {
            matchedWh = warehouses[0]; // Fallback to first available warehouse
          }

          // 7. Location
          const rawLoc = getCleanVal(row, 'Vị Trí Kệ', 'Vị Trí', 'Kệ', 'Location', 'vi_tri');
          const location = String(rawLoc || 'Kệ A1-01').trim();

          // 8. Stock & Price
          const rawStock = getCleanVal(row, 'Số Lượng Tồn Kho', 'Tồn Kho', 'Số Lượng', 'Stock', 'ton_kho');
          const currentStock = Math.max(0, Number(rawStock) || 0);

          const rawMin = getCleanVal(row, 'Định Mức Min', 'Tồn Min', 'Min', 'min_stock');
          const minStock = Math.max(0, Number(rawMin) || 5);

          const rawMax = getCleanVal(row, 'Định Mức Max', 'Tồn Max', 'Max', 'max_stock');
          const maxStock = Math.max(minStock, Number(rawMax) || 100);

          const rawPrice = getCleanVal(row, 'Đơn Giá Vốn (VNĐ)', 'Đơn Giá Vốn', 'Đơn Giá', 'Giá', 'Price', 'don_gia');
          const unitPrice = Math.max(0, Number(rawPrice) || 0);

          // 9. Serial & Condition & Others
          const rawSerial = getCleanVal(row, 'Số Serial / Lô', 'Số Serial', 'Serial', 'Số Lô', 'Lô', 'serial');
          const serialOrLot = rawSerial ? String(rawSerial).trim() : undefined;

          const rawCond = getCleanVal(row, 'Tình Trạng Thiết Bị', 'Tình Trạng', 'Condition', 'tinh_trang');
          const condition = parseCondition(rawCond);

          const rawDate = getCleanVal(row, 'Hạn Kiểm Định', 'Hạn Kiểm Định (YYYY-MM-DD)', 'Kiểm Định');
          let inspectionDueDate: string | undefined = undefined;
          if (rawDate instanceof Date) {
            inspectionDueDate = rawDate.toISOString().substring(0, 10);
          } else if (typeof rawDate === 'string' && rawDate.trim()) {
            inspectionDueDate = rawDate.trim();
          }

          const rawSupplier = getCleanVal(row, 'Nhà Cung Cấp Mặc Định', 'Nhà Cung Cấp', 'NCC', 'Supplier');
          const supplierDefault = rawSupplier ? String(rawSupplier).trim() : undefined;

          const rawSpec = getCleanVal(row, 'Quy Cách Kỹ Thuật', 'Quy Cách', 'Thông Số', 'Spec');
          const spec = rawSpec ? String(rawSpec).trim() : undefined;

          // Check if code already exists in catalog
          const existingItem = items.find(
            i => i.code.trim().toUpperCase() === code
          );

          let rowStatus: 'NEW' | 'UPDATE' | 'ERROR' = 'NEW';
          if (errors.length > 0) {
            rowStatus = 'ERROR';
          } else if (existingItem) {
            rowStatus = 'UPDATE';
          }

          parsed.push({
            code,
            name,
            type,
            category,
            unit,
            warehouseId: matchedWh?.id || 'WH-HN',
            warehouseName: matchedWh?.name || 'Kho Hà Nội',
            location,
            currentStock,
            minStock,
            maxStock,
            unitPrice,
            serialOrLot,
            condition,
            inspectionDueDate,
            supplierDefault,
            spec,
            status: rowStatus,
            errors,
          });
        });

        setParsedRows(parsed);
      } catch (err: any) {
        alert('Lỗi đọc file Excel: ' + (err.message || 'File không hợp lệ'));
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Summary counts
  const totalCount = parsedRows.length;
  const newCount = parsedRows.filter(r => r.status === 'NEW').length;
  const updateCount = parsedRows.filter(r => r.status === 'UPDATE').length;
  const errorCount = parsedRows.filter(r => r.status === 'ERROR').length;
  const validCount = updateExisting ? newCount + updateCount : newCount;

  // Filtered rows for preview
  const displayRows = parsedRows.filter(r => {
    if (filterTab === 'NEW') return r.status === 'NEW';
    if (filterTab === 'UPDATE') return r.status === 'UPDATE';
    if (filterTab === 'ERROR') return r.status === 'ERROR';
    return true;
  });

  // Handle final import confirmation
  const handleExecuteImport = () => {
    const validRows = parsedRows.filter(r => {
      if (r.status === 'ERROR') return false;
      if (r.status === 'UPDATE' && !updateExisting) return false;
      return true;
    });

    if (validRows.length === 0) {
      alert('Không có mặt hàng hợp lệ nào để import.');
      return;
    }

    const payload = validRows.map(r => ({
      code: r.code,
      name: r.name,
      type: r.type,
      category: r.category,
      unit: r.unit,
      warehouseId: r.warehouseId,
      location: r.location,
      minStock: r.minStock,
      maxStock: r.maxStock,
      currentStock: r.currentStock,
      unitPrice: r.unitPrice,
      serialOrLot: r.serialOrLot,
      condition: r.condition,
      inspectionDueDate: r.inspectionDueDate,
      supplierDefault: r.supplierDefault,
      spec: r.spec,
    }));

    const result = importItemsBatch(payload, updateExisting);
    setImportSummary(result);

    if (result.success) {
      setTimeout(() => {
        onSuccess();
      }, 1400);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Import Danh Mục Vật Tư &amp; Thiết Bị Từ Excel
              </h2>
              <p className="text-xs text-slate-500">
                Nhập danh mục hàng loạt hoặc đồng bộ số dư tồn kho, giá vốn từ file Excel (.xlsx / .csv)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Success Result Banner */}
          {importSummary && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in ${
                importSummary.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {importSummary.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <h4 className="font-bold text-sm">
                  {importSummary.success
                    ? 'Import danh mục vật tư thành công!'
                    : 'Import danh mục thất bại'}
                </h4>
                <p className="mt-1">
                  Đã thêm mới{' '}
                  <strong className="text-emerald-700 font-bold">
                    {importSummary.addedCount}
                  </strong>{' '}
                  vật tư và cập nhật{' '}
                  <strong className="text-indigo-700 font-bold">
                    {importSummary.updatedCount}
                  </strong>{' '}
                  mặt hàng hiện có vào hệ thống.
                </p>
              </div>
            </div>
          )}

          {/* Step 1 & 2 Action Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Download Template Box */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider mb-1">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 inline-flex items-center justify-center text-[10px]">
                    1
                  </span>
                  <span>Tải file Excel mẫu chuẩn</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Tải biểu mẫu danh mục vật tư với đầy đủ các cột chuẩn (Mã SKU, Tên, ĐVT, Loại, Kho lưu trữ, Tồn kho, Giá vốn, Serial) kèm sheet danh sách mã kho hợp lệ.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="mt-3 inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Mẫu Excel Danh Mục Vật Tư (.xlsx)</span>
              </button>
            </div>

            {/* Upload File Box */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider mb-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center justify-center text-[10px]">
                    2
                  </span>
                  <span>Tải lên file danh mục (.xlsx / .csv)</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Chọn file từ máy tính của bạn. Hệ thống sẽ tự động quét, kiểm tra dữ liệu và hiển thị bảng xem trước trước khi lưu.
                </p>
              </div>

              <div className="mt-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>{fileName ? `Đổi file: ${fileName}` : 'Chọn File Excel / CSV'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Import Settings & Validation Strip */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                {/* Options */}
                <label className="flex items-center gap-2 text-xs text-slate-800 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={e => setUpdateExisting(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span>
                    Cập nhật số tồn, giá vốn, định mức nếu mã SKU đã tồn tại trong danh mục
                  </span>
                </label>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterTab('ALL')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      filterTab === 'ALL'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    Tất cả ({totalCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('NEW')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      filterTab === 'NEW'
                        ? 'bg-emerald-600 text-white'
                        : 'text-emerald-700 hover:bg-emerald-100/60'
                    }`}
                  >
                    Thêm mới ({newCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('UPDATE')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      filterTab === 'UPDATE'
                        ? 'bg-indigo-600 text-white'
                        : 'text-indigo-700 hover:bg-indigo-100/60'
                    }`}
                  >
                    Cập nhật ({updateCount})
                  </button>
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterTab('ERROR')}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                        filterTab === 'ERROR'
                          ? 'bg-rose-600 text-white'
                          : 'text-rose-700 hover:bg-rose-100/60'
                      }`}
                    >
                      Lỗi ({errorCount})
                    </button>
                  )}
                </div>
              </div>

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="max-h-[360px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">STT</th>
                        <th className="py-2.5 px-3 w-28">Trạng thái</th>
                        <th className="py-2.5 px-3 w-28">Mã SKU</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Tên Vật tư / Thiết bị</th>
                        <th className="py-2.5 px-2 w-24">Phân loại</th>
                        <th className="py-2.5 px-2 w-20">ĐVT</th>
                        <th className="py-2.5 px-2 w-28">Kho lưu trữ</th>
                        <th className="py-2.5 px-2 w-20 text-right">Tồn kho</th>
                        <th className="py-2.5 px-2 w-28 text-right">Đơn giá vốn</th>
                        <th className="py-2.5 px-3 min-w-[140px]">Serial / Thông số</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-400">
                            Không có dòng nào trong bộ lọc này.
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((row, idx) => {
                          const isErr = row.status === 'ERROR';
                          const isUpd = row.status === 'UPDATE';

                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-slate-50/60 ${
                                isErr
                                  ? 'bg-rose-50/40 text-rose-900'
                                  : isUpd
                                  ? 'bg-indigo-50/20'
                                  : ''
                              }`}
                            >
                              <td className="py-2 px-3 text-center text-slate-400 font-medium">
                                {idx + 1}
                              </td>
                              <td className="py-2 px-3">
                                {row.status === 'NEW' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                    <Plus className="w-2.5 h-2.5" />
                                    <span>Thêm mới</span>
                                  </span>
                                )}
                                {row.status === 'UPDATE' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                                    <RefreshCw className="w-2.5 h-2.5" />
                                    <span>Cập nhật</span>
                                  </span>
                                )}
                                {row.status === 'ERROR' && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800"
                                    title={row.errors.join('; ')}
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    <span>Lỗi</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">
                                {row.code || '-'}
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-medium text-slate-900">{row.name}</div>
                                {row.errors.length > 0 && (
                                  <div className="text-[10px] text-rose-600 font-normal mt-0.5">
                                    {row.errors.join('; ')}
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-400">
                                  {row.category} {row.location ? `• ${row.location}` : ''}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-slate-600">
                                {getItemTypeLabel(row.type)}
                              </td>
                              <td className="py-2 px-2 text-slate-600">{row.unit}</td>
                              <td className="py-2 px-2 text-slate-600">{row.warehouseName}</td>
                              <td className="py-2 px-2 text-right tabular-nums font-semibold text-slate-900">
                                {formatNumber(row.currentStock)}
                              </td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-700">
                                {formatCurrency(row.unitPrice)}
                              </td>
                              <td className="py-2 px-3 text-slate-500 text-[11px]">
                                {row.serialOrLot ? `Lô: ${row.serialOrLot}` : ''}
                                {row.spec ? ` (${row.spec})` : ''}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 hidden sm:block">
            {parsedRows.length > 0 && (
              <span>
                Sẵn sàng import:{' '}
                <strong className="text-emerald-700 font-bold">{validCount}</strong> mặt hàng hợp lệ
                {errorCount > 0 && (
                  <span className="text-rose-600 ml-2">({errorCount} dòng lỗi bỏ qua)</span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors"
            >
              Đóng
            </button>

            {parsedRows.length > 0 && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={validCount === 0 || isProcessing}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                <span>Tiến hành Import ({validCount} vật tư)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

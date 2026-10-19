import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  FileSpreadsheet,
  UploadCloud,
  Download,
  AlertTriangle,
  CheckCircle2,
  PackagePlus,
  PackageMinus,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  InventoryItem,
  IssueSubtype,
  ReceiptSubtype,
  Transaction,
  TransactionLineItem,
  TransactionSubtype,
  TransactionType,
} from '../types/inventory';
import {
  formatCurrency,
  formatNumber,
  getSubtypeLabel,
  getTransactionTypeLabel,
} from '../utils/formatters';

interface ExcelImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedGroupedTransaction {
  id: string;
  type: TransactionType;
  subtype: TransactionSubtype;
  date: string;
  warehouseId: string;
  warehouseName: string;
  partnerName: string;
  departmentOrProject: string;
  notes: string;
  items: TransactionLineItem[];
  totalAmount: number;
  isValid: boolean;
  errors: string[];
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({ onClose, onSuccess }) => {
  const { warehouses, items, importTransactionsBatch, currentUser } = useInventory();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedGroupedTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    success: boolean;
    importedCount: number;
    errors: string[];
  } | null>(null);

  // Download Sample Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Loại Phiếu (NHAP_KHO/XUAT_KHO)': 'NHAP_KHO',
        'Nghiệp Vụ': 'NHAP_MUA_MOI',
        'Ngày (YYYY-MM-DD)': '2026-10-16 09:00',
        'Mã Kho': 'WH-HN',
        'Đối Tác / Nhà Cung Cấp / Người Nhận': 'Công ty Cổ phần Cadivi Việt Nam',
        'Dự Án / Phòng Ban': 'Dự án Cơ điện Hạ tầng Long Biên',
        'Mã SKU Vật Tư': 'VT-CD-101',
        'Tên Vật Tư': 'Dây cáp điện Cadivi CV 2.5mm2 (Cuộn 100m)',
        'Đơn Vị Tính': 'Cuộn',
        'Số Lượng': 200,
        'Đơn Giá (VNĐ)': 185000,
        'Số Serial / Lô': 'LOT-CAD-2026-X1',
        'Ghi Chú': 'Nhập bổ sung đợt 2 theo hợp đồng số 42',
      },
      {
        'Loại Phiếu (NHAP_KHO/XUAT_KHO)': 'NHAP_KHO',
        'Nghiệp Vụ': 'NHAP_MUA_MOI',
        'Ngày (YYYY-MM-DD)': '2026-10-16 09:00',
        'Mã Kho': 'WH-HN',
        'Đối Tác / Nhà Cung Cấp / Người Nhận': 'Công ty Cổ phần Cadivi Việt Nam',
        'Dự Án / Phòng Ban': 'Dự án Cơ điện Hạ tầng Long Biên',
        'Mã SKU Vật Tư': 'VT-CD-102',
        'Tên Vật Tư': 'Aptomat Schneider MCB 3P 63A',
        'Đơn Vị Tính': 'Cái',
        'Số Lượng': 10,
        'Đơn Giá (VNĐ)': 2850000,
        'Số Serial / Lô': 'LOT-SCH-2026-X2',
        'Ghi Chú': 'Aptomat Schneider nguyên kiện',
      },
      {
        'Loại Phiếu (NHAP_KHO/XUAT_KHO)': 'XUAT_KHO',
        'Nghiệp Vụ': 'XUAT_THI_CONG',
        'Ngày (YYYY-MM-DD)': '2026-10-16 14:30',
        'Mã Kho': 'WH-HP',
        'Đối Tác / Nhà Cung Cấp / Người Nhận': 'Đội Thi công Thép (KS. Hùng)',
        'Dự Án / Phòng Ban': 'Dự án Nhà xưởng Hải Phòng',
        'Mã SKU Vật Tư': 'VT-KL-401',
        'Tên Vật Tư': 'Thép hình chữ H Posco 200x200x8x12',
        'Đơn Vị Tính': 'Cây',
        'Số Lượng': 20,
        'Đơn Giá (VNĐ)': 7200000,
        'Số Serial / Lô': 'LOT-HP-H200-2026',
        'Ghi Chú': 'Xuất dầm thép H200 thi công trục C-D',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 16 },
      { wch: 18 },
      { wch: 12 },
      { wch: 32 },
      { wch: 30 },
      { wch: 16 },
      { wch: 38 },
      { wch: 14 },
      { wch: 12 },
      { wch: 16 },
      { wch: 18 },
      { wch: 32 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mau_Nhap_Xuat_Kho');
    XLSX.writeFile(workbook, 'Mau_Import_Phieu_Nhap_Xuat_Kho.xlsx');
  };

  // Helper function to normalize keys
  const getCleanVal = (row: any, ...candidates: string[]) => {
    for (const cand of candidates) {
      for (const key of Object.keys(row)) {
        if (key.toLowerCase().trim() === cand.toLowerCase().trim()) {
          return row[key];
        }
      }
    }
    return undefined;
  };

  // Parse Uploaded File
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
          alert('File Excel trống hoặc không có dữ liệu hợp lệ.');
          setIsProcessing(false);
          return;
        }

        // Group rows into transactions by Type + Date + Partner + Warehouse
        const groupedMap = new Map<string, ParsedGroupedTransaction>();

        rawData.forEach((row, idx) => {
          // Extract fields with multiple possible column names
          const rawType = String(
            getCleanVal(
              row,
              'Loại Phiếu (NHAP_KHO/XUAT_KHO)',
              'Loại Phiếu',
              'Loại',
              'Type',
              'loai_phieu'
            ) || 'NHAP_KHO'
          )
            .toUpperCase()
            .trim();

          const type: TransactionType = rawType.includes('XUAT') ? 'XUAT_KHO' : 'NHAP_KHO';

          const rawSubtype = String(
            getCleanVal(row, 'Nghiệp Vụ', 'Phân loại', 'Subtype', 'nghiep_vu') ||
              (type === 'NHAP_KHO' ? 'NHAP_MUA_MOI' : 'XUAT_THI_CONG')
          ).trim();

          const rawDate = getCleanVal(row, 'Ngày (YYYY-MM-DD)', 'Ngày', 'Date', 'ngay');
          let dateStr = new Date().toISOString().substring(0, 16).replace('T', ' ');
          if (rawDate instanceof Date) {
            dateStr = rawDate.toISOString().substring(0, 16).replace('T', ' ');
          } else if (typeof rawDate === 'string' && rawDate.trim()) {
            dateStr = rawDate.trim();
          }

          const rawWh = String(
            getCleanVal(row, 'Mã Kho', 'Kho', 'Kho hàng', 'Warehouse', 'ma_kho') || warehouses[0]?.id
          ).trim();

          // Find warehouse by code or id or name
          const matchedWh =
            warehouses.find(
              w =>
                w.id.toLowerCase() === rawWh.toLowerCase() ||
                w.code.toLowerCase() === rawWh.toLowerCase() ||
                w.name.toLowerCase().includes(rawWh.toLowerCase())
            ) || warehouses[0];

          const partner = String(
            getCleanVal(
              row,
              'Đối Tác / Nhà Cung Cấp / Người Nhận',
              'Đối tác',
              'Nhà cung cấp',
              'Người nhận',
              'Partner',
              'doi_tac'
            ) || 'Đối tác chưa xác định'
          ).trim();

          const project = String(
            getCleanVal(
              row,
              'Dự Án / Phòng Ban',
              'Dự án',
              'Phòng ban',
              'Mục đích',
              'Project',
              'du_an'
            ) || 'Công trình xây dựng'
          ).trim();

          const itemCode = String(
            getCleanVal(
              row,
              'Mã SKU Vật Tư',
              'Mã SKU',
              'Mã vật tư',
              'Mã VT',
              'SKU',
              'Code',
              'ma_vt'
            ) || ''
          ).trim();

          const qty = Number(getCleanVal(row, 'Số Lượng', 'Số lượng', 'Qty', 'so_luong') || 0);

          const rawPrice = getCleanVal(row, 'Đơn Giá (VNĐ)', 'Đơn Giá', 'Giá', 'Price', 'don_gia');

          const serial = String(
            getCleanVal(row, 'Số Serial / Lô', 'Số serial', 'Số lô', 'Serial', 'so_serial') || ''
          ).trim();

          const note = String(getCleanVal(row, 'Ghi Chú', 'Ghi chú', 'Lưu ý', 'Note', 'ghi_chu') || '').trim();

          // Grouping key: date (day) + type + partner + warehouseId
          const groupKey = `${dateStr.substring(0, 10)}_${type}_${matchedWh.id}_${partner}`;

          // Match item
          const matchedItem = items.find(
            i => i.code.toLowerCase() === itemCode.toLowerCase()
          );

          // Extract additional optional item info if introducing new item in Goods Receipt
          const rawItemName = getCleanVal(
            row,
            'Tên Vật Tư / Thiết Bị',
            'Tên Vật Tư',
            'Tên Hàng',
            'Tên',
            'Item Name',
            'Name',
            'ten_vt'
          );
          const rawUnit = getCleanVal(row, 'Đơn Vị Tính', 'ĐVT', 'Unit', 'don_vi_tinh') || 'Cái';
          const rawCat = getCleanVal(row, 'Danh Mục', 'Nhóm Ngành', 'Category', 'danh_muc') || 'Cơ điện & Vật tư công trình';
          const rawLoc = getCleanVal(row, 'Vị Trí Kệ', 'Vị Trí', 'Location', 'vi_tri') || 'Khu vực tiếp nhận';

          const isNewItem = !matchedItem && type === 'NHAP_KHO';

          const errors: string[] = [];
          if (!itemCode) {
            errors.push(`Dòng ${idx + 2}: Thiếu mã SKU vật tư`);
          } else if (!matchedItem) {
            if (type !== 'NHAP_KHO') {
              errors.push(`Dòng ${idx + 2}: Không tìm thấy mã SKU "${itemCode}" trong kho để xuất`);
            }
          }

          if (qty <= 0) {
            errors.push(`Dòng ${idx + 2}: Số lượng phải lớn hơn 0 (hiện tại: ${qty})`);
          }

          if (type === 'XUAT_KHO' && matchedItem && qty > matchedItem.currentStock) {
            errors.push(
              `Dòng ${idx + 2}: Số lượng xuất (${qty} ${matchedItem.unit}) vượt quá tồn khả dụng (${matchedItem.currentStock} ${matchedItem.unit})`
            );
          }

          const unitPrice =
            rawPrice !== undefined && Number(rawPrice) > 0
              ? Number(rawPrice)
              : matchedItem
              ? matchedItem.unitPrice
              : 0;

          const lineItem: TransactionLineItem = {
            itemId: matchedItem?.id || '',
            itemCode: itemCode || 'CHƯA_RÕ',
            itemName: rawItemName ? String(rawItemName).trim() : (matchedItem?.name || itemCode),
            unit: rawUnit ? String(rawUnit).trim() : (matchedItem?.unit || 'Cái'),
            quantity: qty,
            unitPrice,
            amount: qty * unitPrice,
            serialNumber: serial,
            note,
            isNewItem,
            category: String(rawCat),
            location: String(rawLoc),
          };

          if (groupedMap.has(groupKey)) {
            const existing = groupedMap.get(groupKey)!;
            existing.items.push(lineItem);
            existing.totalAmount += lineItem.amount;
            if (errors.length > 0) {
              existing.errors.push(...errors);
              existing.isValid = false;
            }
          } else {
            groupedMap.set(groupKey, {
              id: `GROUP-${Date.now()}-${idx}`,
              type,
              subtype: rawSubtype as TransactionSubtype,
              date: dateStr,
              warehouseId: matchedWh.id,
              warehouseName: matchedWh.name,
              partnerName: partner,
              departmentOrProject: project,
              notes: `Import tự động từ file ${file.name}`,
              items: [lineItem],
              totalAmount: lineItem.amount,
              isValid: errors.length === 0,
              errors,
            });
          }
        });

        setParsedTransactions(Array.from(groupedMap.values()));
      } catch (err: any) {
        alert('Lỗi khi đọc file Excel: ' + (err.message || 'Định dạng file không phù hợp'));
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Confirm Import
  const handleConfirmImport = () => {
    const validTransactions = parsedTransactions.filter(t => t.isValid);
    if (validTransactions.length === 0) {
      alert('Không có phiếu nào hợp lệ để import. Vui lòng kiểm tra lại lỗi dữ liệu.');
      return;
    }

    const payload: Omit<Transaction, 'id' | 'code'>[] = validTransactions.map(t => ({
      type: t.type,
      subtype: t.subtype,
      date: t.date,
      warehouseId: t.warehouseId,
      partnerName: t.partnerName,
      departmentOrProject: t.departmentOrProject,
      creatorName: currentUser ? currentUser.fullName : 'Hệ thống Import Excel',
      approverName: 'Đã duyệt qua Excel',
      notes: t.notes,
      items: t.items,
      totalAmount: t.totalAmount,
      status: 'HOAN_THANH',
    }));

    const result = importTransactionsBatch(payload);
    setImportSummary(result);

    if (result.success && result.errors.length === 0) {
      setTimeout(() => {
        onSuccess();
      }, 1200);
    }
  };

  const validCount = parsedTransactions.filter(t => t.isValid).length;
  const invalidCount = parsedTransactions.filter(t => !t.isValid).length;
  const totalLines = parsedTransactions.reduce((acc, t) => acc + t.items.length, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import Phiếu Nhập &amp; Xuất Kho Từ File Excel
              </h2>
              <p className="text-xs text-slate-500">
                Hỗ trợ định dạng .xlsx, .xls hoặc .csv với tính năng kiểm tra tồn kho tự động
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải file mẫu Excel (.xlsx)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* File Upload Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-indigo-50/30"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="font-semibold text-slate-800">
              {fileName ? fileName : 'Bấm vào đây để chọn file Excel hoặc kéo thả file'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Chấp nhận các file định dạng .xlsx, .xls, .csv theo mẫu quy định
            </p>
          </div>

          {/* Import Result Notification if finished */}
          {importSummary && (
            <div
              className={`p-4 rounded-xl border ${
                importSummary.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm mb-1">
                {importSummary.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                )}
                <span>
                  {importSummary.success
                    ? `Import thành công ${importSummary.importedCount} phiếu vào kho!`
                    : 'Import thất bại.'}
                </span>
              </div>
              {importSummary.errors.length > 0 && (
                <div className="mt-2 space-y-1 text-xs">
                  {importSummary.errors.map((err, i) => (
                    <div key={i} className="text-rose-700">
                      &bull; {err}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedTransactions.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Xem Trước Dữ Liệu Import ({parsedTransactions.length} phiếu &bull; {totalLines} dòng vật tư)
                  </h3>
                  <div className="flex items-center gap-3 text-slate-500 mt-0.5">
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>{validCount} phiếu hợp lệ</span>
                    </span>
                    {invalidCount > 0 && (
                      <span className="text-rose-600 font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{invalidCount} phiếu có lỗi cần kiểm tra</span>
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={validCount === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác nhận Import ({validCount} phiếu)</span>
                </button>
              </div>

              {/* Transactions list */}
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {parsedTransactions.map((trx, idx) => (
                  <div
                    key={trx.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      trx.isValid
                        ? 'bg-white border-slate-200'
                        : 'bg-rose-50/40 border-rose-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            trx.type === 'NHAP_KHO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {getTransactionTypeLabel(trx.type)}
                        </span>
                        <span className="font-semibold text-slate-800">{trx.partnerName}</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="text-slate-600">{trx.departmentOrProject}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 font-medium">
                          Kho: <strong className="text-slate-800">{trx.warehouseName}</strong>
                        </span>
                        <span className="font-bold text-slate-900 tabular-nums">
                          {formatCurrency(trx.totalAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Errors if any */}
                    {trx.errors.length > 0 && (
                      <div className="mb-2 p-2 bg-rose-100/60 rounded text-[11px] text-rose-700 space-y-0.5">
                        {trx.errors.map((e, ei) => (
                          <div key={ei} className="flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                            <span>{e}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Line items mini table */}
                    <div className="border border-slate-100 rounded-lg overflow-hidden bg-slate-50/50">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-500 font-semibold">
                            <th className="py-1.5 px-3">Mã SKU</th>
                            <th className="py-1.5 px-3">Tên vật tư</th>
                            <th className="py-1.5 px-2 text-right">Số lượng</th>
                            <th className="py-1.5 px-3 text-right">Đơn giá</th>
                            <th className="py-1.5 px-3 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {trx.items.map((line, li) => (
                            <tr key={li}>
                              <td className="py-1 px-3 font-mono font-medium text-slate-800">
                                {line.itemCode}
                              </td>
                              <td className="py-1 px-3 text-slate-700">{line.itemName}</td>
                              <td className="py-1 px-2 text-right font-bold tabular-nums">
                                {formatNumber(line.quantity)} {line.unit}
                              </td>
                              <td className="py-1 px-3 text-right tabular-nums text-slate-600">
                                {formatCurrency(line.unitPrice)}
                              </td>
                              <td className="py-1 px-3 text-right tabular-nums font-semibold text-slate-900">
                                {formatCurrency(line.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            * Dữ liệu sau khi import sẽ lập tức cộng/trừ vào số dư tồn kho thực tế.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold text-xs transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

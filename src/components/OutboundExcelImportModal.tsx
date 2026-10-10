import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  RotateCcw,
  Printer,
  ChevronDown,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { parseExcelFile } from '../utils/excelImport';
import {
  detectOutboundColumnMapping,
  validateAndNormalizeOutboundRows,
  downloadOutboundExcelTemplate,
  OutboundColumnMapping,
  ValidatedOutboundRow,
} from '../utils/excelOutboundImport';
import { formatVND, formatNumber } from '../utils/formatters';
import {
  OutboundReason,
  OUTBOUND_REASON_LABELS,
  InventoryTransaction,
} from '../types/inventory';

interface OutboundExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewPrint?: (transaction: InventoryTransaction) => void;
}

type ImportStep = 'UPLOAD' | 'PREVIEW' | 'SUCCESS';

export const OutboundExcelImportModal: React.FC<OutboundExcelImportModalProps> = ({
  isOpen,
  onClose,
  onViewPrint,
}) => {
  const { items, warehouses, projects, importOutboundFromExcel } = useInventory();

  // Steps
  const [step, setStep] = useState<ImportStep>('UPLOAD');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Raw data & Column mapping
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<OutboundColumnMapping | null>(null);
  const [showMappingSettings, setShowMappingSettings] = useState(false);

  // Import options
  const [groupingMode, setGroupingMode] = useState<
    'SINGLE_VOUCHER' | 'BY_DISPATCH_CODE' | 'BY_RECEIVER'
  >('SINGLE_VOUCHER');
  const [defaultWarehouse, setDefaultWarehouse] = useState(
    warehouses[0] || 'Kho Tổng A (Hà Nội)'
  );
  const [defaultDate, setDefaultDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [defaultReason, setDefaultReason] = useState<OutboundReason>('PROJECT_DISPATCH');
  const [defaultReceiver, setDefaultReceiver] = useState('Đội thi công công trình');
  const [defaultProject, setDefaultProject] = useState(
    projects[0] || 'Dự án Sunrise Tower'
  );
  const [creator, setCreator] = useState('Thủ kho xuất');
  const [importNote, setImportNote] = useState('');

  // Preview filtering
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');

  // Outcome
  const [createdTransactions, setCreatedTransactions] = useState<InventoryTransaction[]>([]);
  const [importSummary, setImportSummary] = useState<{
    importedRows: number;
    dispatchedQty: number;
    totalAmount: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Compute validated rows
  const validatedRows: ValidatedOutboundRow[] =
    mapping && rawRows.length > 0
      ? validateAndNormalizeOutboundRows(
          rawRows,
          mapping,
          items,
          defaultWarehouse,
          defaultReason,
          defaultReceiver,
          defaultProject
        )
      : [];

  const validRows = validatedRows.filter(r => r.isValid);
  const invalidRows = validatedRows.filter(r => !r.isValid);
  const totalOutboundValue = validRows.reduce((acc, r) => acc + r.calculatedTotal, 0);
  const totalOutboundQty = validRows.reduce((acc, r) => acc + r.quantity, 0);

  const displayedRows =
    previewFilter === 'VALID'
      ? validRows
      : previewFilter === 'INVALID'
      ? invalidRows
      : validatedRows;

  // Handlers
  const handleFileProcess = async (selectedFile: File) => {
    if (!selectedFile.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError('Vui lòng chọn file Excel đúng định dạng (.xlsx, .xls) hoặc CSV.');
      return;
    }

    setLoading(true);
    setParseError(null);
    setFile(selectedFile);

    try {
      const { headers: parsedHeaders, rows: parsedRows } = await parseExcelFile(selectedFile);
      if (parsedRows.length === 0) {
        setParseError('File Excel không có dữ liệu hàng nào.');
        setLoading(false);
        return;
      }

      setHeaders(parsedHeaders);
      setRawRows(parsedRows);

      const autoMapping = detectOutboundColumnMapping(parsedHeaders);
      setMapping(autoMapping);
      setStep('PREVIEW');
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || 'Không thể đọc nội dung file Excel.');
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleMappingChange = (key: keyof OutboundColumnMapping, value: string) => {
    if (!mapping) return;
    setMapping({ ...mapping, [key]: value });
  };

  const handleConfirmImport = () => {
    if (validRows.length === 0) return;

    setLoading(true);
    try {
      const result = importOutboundFromExcel(validatedRows, {
        groupingMode,
        defaultWarehouse,
        defaultDate,
        defaultReason,
        defaultReceiver,
        defaultProject,
        creator,
        note: importNote || `Import xuất kho từ file: ${file?.name || 'Excel'}`,
      });

      if (result.success) {
        setCreatedTransactions(result.createdTransactions);
        setImportSummary({
          importedRows: result.importedRowsCount,
          dispatchedQty: totalOutboundQty,
          totalAmount: totalOutboundValue,
        });
        setStep('SUCCESS');
      } else {
        alert(result.error || 'Có lỗi xảy ra khi tạo phiếu xuất kho.');
      }
    } catch (e: any) {
      alert(`Lỗi thực thi: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('UPLOAD');
    setFile(null);
    setRawRows([]);
    setHeaders([]);
    setMapping(null);
    setCreatedTransactions([]);
    setImportSummary(null);
    setParseError(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 border border-emerald-400/30">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Import Dữ Liệu Xuất Kho từ File Excel
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-medium">
                  PXK Bulk Import
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Kiểm tra tự động tồn kho thực tế, đối soát số lượng và tạo phiếu xuất kho hàng loạt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 'UPLOAD' && (
          <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
            {/* Guide card */}
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Tải file mẫu Excel Xuất Kho chuẩn hóa
                </div>
                <p className="text-xs text-emerald-800">
                  File mẫu bao gồm các cột Mã VT, Tên VT, Số lượng xuất, Người nhận, Dự án, Lý do xuất và danh sách kho hợp lệ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadOutboundExcelTemplate(warehouses, projects, items)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Tải file Excel mẫu (.xlsx)</span>
              </button>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileProcess(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-white rounded-2xl shadow-xs border border-slate-200 text-emerald-600">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    Kéo thả file Excel xuất kho vào đây, hoặc{' '}
                    <span className="text-emerald-600 underline">chọn từ máy tính</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Hỗ trợ định dạng: .xlsx, .xls, .csv (Tự động nhận diện cột thông minh)
                  </p>
                </div>
              </div>
            </div>

            {loading && (
              <div className="text-center py-4 text-xs text-slate-600 font-medium">
                Đang đọc và phân tích cấu trúc file Excel...
              </div>
            )}

            {parseError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-red-700">
                <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Lỗi đọc file:</strong> {parseError}
                </div>
              </div>
            )}

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Đối soát tồn kho an toàn
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Chỉ cho phép xuất khi số lượng trong kho đủ. Cảnh báo đỏ nếu vượt quá tồn thực tế.
                </p>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Gom nhóm phiếu linh hoạt
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Tùy chọn tạo 1 phiếu xuất chung hoặc phân tách theo người nhận, dự án, mã phiếu.
                </p>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Tự động trừ tồn kho
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Hệ thống tự động trừ tồn kho chính xác và cập nhật thẻ kho ngay sau khi nhập.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW */}
        {step === 'PREVIEW' && mapping && (
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            {/* Summary statistics bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">Tổng số dòng đọc được</div>
                <div className="text-xl font-mono font-bold text-slate-900 mt-0.5">
                  {rawRows.length}
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <div className="text-[11px] text-emerald-700 font-medium">Hợp lệ (Đủ tồn kho)</div>
                <div className="text-xl font-mono font-bold text-emerald-700 mt-0.5">
                  {validRows.length}
                </div>
              </div>

              <div
                className={`rounded-xl p-3 border ${
                  invalidRows.length > 0
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="text-[11px] font-medium">Lỗi / Không đủ tồn kho</div>
                <div className="text-xl font-mono font-bold mt-0.5">
                  {invalidRows.length}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <div className="text-[11px] text-blue-700 font-medium">Tổng giá trị xuất dự kiến</div>
                <div className="text-sm sm:text-base font-mono font-bold text-blue-900 mt-0.5 truncate">
                  {formatVND(totalOutboundValue)}
                </div>
              </div>
            </div>

            {/* Settings & Options Panel */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  1. Thiết lập quy tắc xuất kho
                </span>
                <button
                  type="button"
                  onClick={() => setShowMappingSettings(!showMappingSettings)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <span>{showMappingSettings ? 'Ẩn cấu hình cột' : 'Tùy chỉnh khớp nối cột Excel'}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${showMappingSettings ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Cơ chế gom nhóm phiếu xuất
                  </label>
                  <select
                    value={groupingMode}
                    onChange={e => setGroupingMode(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-slate-800"
                  >
                    <option value="SINGLE_VOUCHER">Gom tất cả thành 1 Phiếu xuất duy nhất</option>
                    <option value="BY_DISPATCH_CODE">Gom theo Mã phiếu xuất trong file</option>
                    <option value="BY_RECEIVER">Gom theo Người nhận / Đơn vị nhận</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Kho xuất mặc định
                  </label>
                  <select
                    value={defaultWarehouse}
                    onChange={e => setDefaultWarehouse(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-slate-800"
                  >
                    {warehouses.map(w => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mục đích / Lý do xuất mặc định
                  </label>
                  <select
                    value={defaultReason}
                    onChange={e => setDefaultReason(e.target.value as OutboundReason)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-slate-800"
                  >
                    {Object.entries(OUTBOUND_REASON_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Đơn vị / Người nhận mặc định
                  </label>
                  <input
                    type="text"
                    value={defaultReceiver}
                    onChange={e => setDefaultReceiver(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Dự án / Phòng ban mặc định
                  </label>
                  <input
                    type="text"
                    value={defaultProject}
                    onChange={e => setDefaultProject(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Người lập phiếu xuất
                  </label>
                  <input
                    type="text"
                    value={creator}
                    onChange={e => setCreator(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              {/* Collapsible Column Mapping Config */}
              {showMappingSettings && (
                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-lg text-[11px]">
                  <div>
                    <label className="block font-semibold text-slate-600 mb-0.5">Cột Mã vật tư (*)</label>
                    <select
                      value={mapping.itemCode}
                      onChange={e => handleMappingChange('itemCode', e.target.value)}
                      className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="">-- Chọn cột --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-0.5">Cột Số lượng xuất (*)</label>
                    <select
                      value={mapping.quantity}
                      onChange={e => handleMappingChange('quantity', e.target.value)}
                      className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="">-- Chọn cột --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-0.5">Cột Người nhận</label>
                    <select
                      value={mapping.receiver}
                      onChange={e => handleMappingChange('receiver', e.target.value)}
                      className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="">-- Mặc định --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-600 mb-0.5">Cột Dự án / Phòng ban</label>
                    <select
                      value={mapping.departmentOrProject}
                      onChange={e => handleMappingChange('departmentOrProject', e.target.value)}
                      className="w-full p-1 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="">-- Mặc định --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Data Preview Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  2. Xem trước & Kiểm tra tồn kho ({displayedRows.length} dòng)
                </span>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500">Lọc xem:</span>
                  {(['ALL', 'VALID', 'INVALID'] as const).map(flt => (
                    <button
                      key={flt}
                      onClick={() => setPreviewFilter(flt)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        previewFilter === flt
                          ? flt === 'INVALID'
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {flt === 'ALL'
                        ? `Tất cả (${validatedRows.length})`
                        : flt === 'VALID'
                        ? `Hợp lệ (${validRows.length})`
                        : `Lỗi / Thiếu tồn (${invalidRows.length})`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 font-semibold text-slate-700 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">STT</th>
                      <th className="py-2.5 px-3 w-28">Trạng thái</th>
                      <th className="py-2.5 px-3">Mã vật tư</th>
                      <th className="py-2.5 px-3">Tên vật tư</th>
                      <th className="py-2.5 px-3 text-right">SL Xuất</th>
                      <th className="py-2.5 px-3 text-right">Tồn hiện tại</th>
                      <th className="py-2.5 px-3 text-right">Đơn giá</th>
                      <th className="py-2.5 px-3 text-right">Thành tiền</th>
                      <th className="py-2.5 px-3">Người nhận / Dự án</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                          Không có dòng dữ liệu nào theo bộ lọc này.
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map(row => (
                        <tr
                          key={row.rowIndex}
                          className={`hover:bg-slate-50 transition-colors ${
                            !row.isValid ? 'bg-rose-50/40' : ''
                          }`}
                        >
                          <td className="py-2 px-3 text-center font-mono text-slate-400 text-[11px]">
                            {row.rowIndex}
                          </td>
                          <td className="py-2 px-3">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Đủ hàng
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full"
                                title={row.errors.join('; ')}
                              >
                                <XCircle className="w-3 h-3" />
                                {row.errors[0]}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                            {row.itemCode}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-medium truncate max-w-xs">{row.itemName}</div>
                            {row.packageNo && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                Kiện: {row.packageNo}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {formatNumber(row.quantity)} {row.unit}
                          </td>
                          <td className="py-2 px-3 text-right font-mono">
                            <span
                              className={`font-semibold ${
                                row.currentStock < row.quantity
                                  ? 'text-rose-600 font-bold'
                                  : 'text-slate-600'
                              }`}
                            >
                              {formatNumber(row.currentStock)} {row.unit}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            {formatVND(row.unitPrice || 0)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                            {formatVND(row.calculatedTotal)}
                          </td>
                          <td className="py-2 px-3 text-slate-600 truncate max-w-[150px]">
                            <div className="truncate font-medium">{row.receiver}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {row.departmentOrProject}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 'SUCCESS' && importSummary && (
          <div className="p-8 sm:p-12 overflow-y-auto text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-bold text-slate-900">
                Xuất kho từ file Excel thành công!
              </h3>
              <p className="text-xs text-slate-500">
                Đã trừ tồn kho chính xác và lập {createdTransactions.length} phiếu xuất kho chính thức.
              </p>
            </div>

            {/* Results card */}
            <div className="max-w-md mx-auto bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2.5 text-left">
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Số dòng vật tư đã xuất:</span>
                <strong className="font-mono text-slate-900">{importSummary.importedRows} dòng</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Tổng số lượng xuất:</span>
                <strong className="font-mono text-slate-900">{formatNumber(importSummary.dispatchedQty)}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200">
                <span className="text-slate-600">Tổng giá trị xuất kho:</span>
                <strong className="font-mono text-slate-900 font-bold">{formatVND(importSummary.totalAmount)}</strong>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Số phiếu xuất kho tạo mới:</span>
                <strong className="font-mono text-emerald-700 font-bold">{createdTransactions.length} phiếu</strong>
              </div>
            </div>

            {/* Created vouchers list */}
            <div className="max-w-md mx-auto space-y-2">
              <div className="text-xs font-bold text-slate-700 text-left">Danh sách phiếu xuất vừa lập:</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {createdTransactions.map(trans => (
                  <div
                    key={trans.id}
                    className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:border-slate-300"
                  >
                    <div className="text-left">
                      <span className="font-mono font-bold text-slate-900">{trans.code}</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-600">{trans.receiverOrSupplier}</span>
                    </div>
                    {onViewPrint && (
                      <button
                        onClick={() => onViewPrint(trans)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        <span>In phiếu</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          {step === 'UPLOAD' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={!file}
                onClick={() => file && handleFileProcess(file)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <span>Tiếp tục</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'PREVIEW' && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Chọn lại file</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={validRows.length === 0 || loading}
                  onClick={handleConfirmImport}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <span>
                    {loading ? 'Đang tạo phiếu...' : `Xác nhận xuất ${validRows.length} mặt hàng`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 'SUCCESS' && (
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Import file khác</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Hoàn tất & Về danh sách xuất kho
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

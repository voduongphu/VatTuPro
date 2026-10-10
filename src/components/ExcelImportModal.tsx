import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
  ArrowRight,
  RotateCcw,
  Printer,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  parseExcelFile,
  detectColumnMapping,
  validateAndNormalizeRows,
  downloadInboundExcelTemplate,
  ColumnMapping,
  ValidatedInboundRow,
} from '../utils/excelImport';
import { formatVND, formatNumber } from '../utils/formatters';
import {
  InboundReason,
  INBOUND_REASON_LABELS,
  InventoryTransaction,
} from '../types/inventory';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewPrint?: (transaction: InventoryTransaction) => void;
}

type ImportStep = 'UPLOAD' | 'PREVIEW' | 'SUCCESS';

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onViewPrint,
}) => {
  const { items, warehouses, suppliers, importInboundFromExcel } = useInventory();

  // Steps
  const [step, setStep] = useState<ImportStep>('UPLOAD');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Raw data & Column mapping
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [showMappingSettings, setShowMappingSettings] = useState(false);

  // Import options
  const [groupingMode, setGroupingMode] = useState<
    'SINGLE_VOUCHER' | 'BY_RECEIPT_CODE' | 'BY_PACKING_LIST'
  >('BY_PACKING_LIST');
  const [defaultWarehouse, setDefaultWarehouse] = useState(
    warehouses[0] || 'Kho Tổng A (Hà Nội)'
  );
  const [defaultDate, setDefaultDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [defaultReason, setDefaultReason] = useState<InboundReason>('PURCHASE');
  const [defaultSupplier, setDefaultSupplier] = useState(
    suppliers[0] || 'Nhà cung cấp vật tư'
  );
  const [creator, setCreator] = useState('Admin Quản lý kho');
  const [importNote, setImportNote] = useState('');

  // Preview filtering
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');

  // Outcome
  const [createdTransactions, setCreatedTransactions] = useState<InventoryTransaction[]>([]);
  const [importSummary, setImportSummary] = useState<{
    importedRows: number;
    createdItems: number;
    updatedItems: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Compute validated rows
  const validatedRows: ValidatedInboundRow[] =
    mapping && rawRows.length > 0
      ? validateAndNormalizeRows(
          rawRows,
          mapping,
          items,
          defaultWarehouse,
          defaultDate,
          defaultSupplier,
          defaultReason
        )
      : [];

  const validRows = validatedRows.filter(r => r.isValid);
  const invalidRows = validatedRows.filter(r => !r.isValid);
  const newItemsCount = validatedRows.filter(r => r.isValid && !r.isExistingItem).length;
  const existingItemsCount = validatedRows.filter(r => r.isValid && r.isExistingItem).length;
  const totalQuantity = validRows.reduce((acc, r) => acc + r.quantity, 0);
  const totalAmount = validRows.reduce((acc, r) => acc + r.calculatedTotal, 0);

  const displayedRows = validatedRows.filter(r => {
    if (previewFilter === 'VALID') return r.isValid;
    if (previewFilter === 'INVALID') return !r.isValid;
    return true;
  });

  // Handle file read
  const handleProcessFile = async (selectedFile: File) => {
    setLoading(true);
    setParseError(null);
    try {
      const { headers: detectedHeaders, rawRows: rows } = await parseExcelFile(selectedFile);
      const detectedMapping = detectColumnMapping(detectedHeaders);

      setFile(selectedFile);
      setHeaders(detectedHeaders);
      setRawRows(rows);
      setMapping(detectedMapping);
      setImportNote(`Nhập kho từ tệp ${selectedFile.name}`);
      setStep('PREVIEW');
    } catch (err: any) {
      setParseError(err.message || 'Không thể đọc nội dung tệp Excel.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      handleProcessFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const handleReset = () => {
    setStep('UPLOAD');
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setMapping(null);
    setParseError(null);
    setCreatedTransactions([]);
    setImportSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (validRows.length === 0) return;

    setLoading(true);
    try {
      const result = importInboundFromExcel(validatedRows, {
        groupingMode,
        defaultWarehouse,
        defaultDate,
        defaultReason,
        defaultSupplier,
        creator,
        notes: importNote || `Nhập từ file ${file?.name || 'Excel'}`,
      });

      if (result.success) {
        setCreatedTransactions(result.createdTransactions);
        setImportSummary({
          importedRows: result.importedRowsCount,
          createdItems: result.createdItemsCount,
          updatedItems: result.updatedItemsCount,
        });
        setStep('SUCCESS');
      } else {
        alert(result.error || 'Có lỗi xảy ra khi nhập kho.');
      }
    } catch (err: any) {
      alert(`Lỗi thực hiện nhập kho: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <span>Nhập kho vật tư & thiết bị từ file Excel</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-normal bg-emerald-50 text-emerald-700 border border-emerald-200">
                  .xlsx / .xls / .csv
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Tự động đối chiếu mã, tăng tồn kho, thêm vật tư mới và lập phiếu nhập kho chuẩn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* STEP 1: UPLOAD */}
          {step === 'UPLOAD' && (
            <div className="space-y-6">
              {/* Template Download Banner */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-md shrink-0 mt-0.5 sm:mt-0">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900">
                      Tải mẫu file Excel nhập kho chuẩn
                    </h3>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Bao gồm đầy đủ các cột: Số Packing List, Shipment, Hạng mục, Nhà sản xuất, Số kiện, Tên kiện, v.v.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadInboundExcelTemplate(warehouses, suppliers)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-300 rounded-md hover:bg-blue-50 transition-colors shadow-xs shrink-0 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Tải file mẫu (.xlsx)</span>
                </button>
              </div>

              {/* Drag and drop upload zone */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/40 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="p-4 bg-white rounded-full shadow-sm border border-slate-200 text-emerald-600">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      Nhấn vào đây để chọn tệp hoặc kéo thả file Excel vào vùng này
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Hỗ trợ định dạng Microsoft Excel (.xlsx, .xls) hoặc tệp (.csv)
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-medium rounded-md">
                    <span>Dung lượng khuyến nghị: dưới 15MB</span>
                  </div>
                </div>
              </div>

              {/* Error display */}
              {parseError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-800 text-xs">
                  <XCircle className="w-5 h-5 shrink-0 text-red-600" />
                  <div className="flex-1 font-medium">{parseError}</div>
                </div>
              )}

              {/* Tips & Instructions */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs text-slate-600">
                <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Quy tắc nhập kho thông minh của hệ thống:</span>
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-slate-600">
                  <li>
                    <strong>Mã vật tư đã có trong hệ thống:</strong> Tự động cộng dồn số lượng vào tồn kho hiện tại, đồng thời cập nhật đơn giá mới nhất.
                  </li>
                  <li>
                    <strong>Mã vật tư chưa có:</strong> Hệ thống tự động tạo mã mới vào danh mục với thông số kỹ thuật, quy cách, nhà sản xuất trong file.
                  </li>
                  <li>
                    <strong>Gom phiếu theo Packing List:</strong> Các dòng hàng thuộc cùng số Packing List hoặc số phiếu nhập có thể tự động gom chung thành 1 phiếu nhập kho chính thức.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW & MAPPING */}
          {step === 'PREVIEW' && mapping && (
            <div className="space-y-5">
              {/* Top File & Batch Configuration Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-slate-800 truncate max-w-xs">
                      {file?.name}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ({rawRows.length} dòng dữ liệu đọc được)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowMappingSettings(!showMappingSettings)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                      <span>{showMappingSettings ? 'Ẩn cấu hình ghép cột' : 'Cấu hình ghép cột'}</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMappingSettings ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded hover:bg-slate-100 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Chọn file khác</span>
                    </button>
                  </div>
                </div>

                {/* Column Mapping Panel (Collapsible) */}
                {showMappingSettings && (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-3">
                    <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                      <span>Ghép các cột trong file Excel với trường dữ liệu hệ thống:</span>
                      <span className="text-[11px] text-slate-500 font-normal">
                        (Hệ thống đã tự động nhận diện dựa trên tiêu đề)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-600 font-medium mb-1">
                          Mã VT/TB <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={mapping.itemCode}
                          onChange={e => setMapping({ ...mapping, itemCode: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Chưa chọn --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">
                          Tên VT/TB <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={mapping.itemName}
                          onChange={e => setMapping({ ...mapping, itemName: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Chưa chọn --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">
                          Số lượng nhập <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={mapping.quantity}
                          onChange={e => setMapping({ ...mapping, quantity: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Chưa chọn --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Đơn vị tính</label>
                        <select
                          value={mapping.unit}
                          onChange={e => setMapping({ ...mapping, unit: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Bỏ qua (mặc định: Cái) --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Đơn giá nhập</label>
                        <select
                          value={mapping.unitPrice}
                          onChange={e => setMapping({ ...mapping, unitPrice: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Bỏ qua --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Số Packing List</label>
                        <select
                          value={mapping.packingListNo}
                          onChange={e => setMapping({ ...mapping, packingListNo: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Bỏ qua --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Lô hàng / Shipment</label>
                        <select
                          value={mapping.shipment}
                          onChange={e => setMapping({ ...mapping, shipment: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Bỏ qua --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Nhà sản xuất</label>
                        <select
                          value={mapping.manufacturer}
                          onChange={e => setMapping({ ...mapping, manufacturer: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Bỏ qua --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Số kiện</label>
                        <select
                          value={mapping.packageNo}
                          onChange={e => setMapping({ ...mapping, packageNo: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Bỏ qua --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Tên kiện</label>
                        <select
                          value={mapping.packageName}
                          onChange={e => setMapping({ ...mapping, packageName: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Bỏ qua --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Hạng mục</label>
                        <select
                          value={mapping.projectItem}
                          onChange={e => setMapping({ ...mapping, projectItem: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Bỏ qua --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-600 font-medium mb-1">Kho tiếp nhận</label>
                        <select
                          value={mapping.warehouse}
                          onChange={e => setMapping({ ...mapping, warehouse: e.target.value })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-slate-50"
                        >
                          <option value="">-- Theo mặc định bên dưới --</option>
                          {headers.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Import Defaults & Voucher Strategy */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Cơ chế lập phiếu nhập:
                    </label>
                    <select
                      value={groupingMode}
                      onChange={e => setGroupingMode(e.target.value as any)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800 font-medium"
                    >
                      <option value="BY_PACKING_LIST">Tách phiếu theo Số Packing List</option>
                      <option value="BY_RECEIPT_CODE">Tách phiếu theo Mã phiếu trong Excel</option>
                      <option value="SINGLE_VOUCHER">Gom tất cả vào 1 phiếu nhập duy nhất</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Kho tiếp nhận mặc định:
                    </label>
                    <select
                      value={defaultWarehouse}
                      onChange={e => setDefaultWarehouse(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800"
                    >
                      {warehouses.map(w => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Lý do nhập kho:
                    </label>
                    <select
                      value={defaultReason}
                      onChange={e => setDefaultReason(e.target.value as InboundReason)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800"
                    >
                      {Object.entries(INBOUND_REASON_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Ngày nhập phiếu:
                    </label>
                    <input
                      type="date"
                      value={defaultDate}
                      onChange={e => setDefaultDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Data Summary Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] text-slate-500">Tổng số dòng</div>
                  <div className="text-lg font-bold font-mono text-slate-800">
                    {validatedRows.length}
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="text-[11px] text-emerald-700">Dòng hợp lệ</div>
                  <div className="text-lg font-bold font-mono text-emerald-800">
                    {validRows.length}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="text-[11px] text-blue-700">Vật tư mới / Có sẵn</div>
                  <div className="text-sm font-bold font-mono text-blue-900 mt-1">
                    <span className="text-emerald-700">+{newItemsCount} mới</span> · <span>{existingItemsCount} cũ</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="text-[11px] text-amber-700">Tổng số lượng nhập</div>
                  <div className="text-lg font-bold font-mono text-amber-900">
                    {formatNumber(totalQuantity)}
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 col-span-2 sm:col-span-1">
                  <div className="text-[11px] text-purple-700">Tổng giá trị ước tính</div>
                  <div className="text-sm font-bold font-mono text-purple-900 mt-1">
                    {formatVND(totalAmount)}
                  </div>
                </div>
              </div>

              {/* Preview Filter Tabs */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    onClick={() => setPreviewFilter('ALL')}
                    className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      previewFilter === 'ALL'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Tất cả ({validatedRows.length})
                  </button>
                  <button
                    onClick={() => setPreviewFilter('VALID')}
                    className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      previewFilter === 'VALID'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    Hợp lệ ({validRows.length})
                  </button>
                  {invalidRows.length > 0 && (
                    <button
                      onClick={() => setPreviewFilter('INVALID')}
                      className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                        previewFilter === 'INVALID'
                          ? 'bg-red-700 text-white'
                          : 'bg-red-50 text-red-700 hover:bg-red-100'
                      }`}
                    >
                      Dòng có lỗi ({invalidRows.length})
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-500">
                  Hiển thị {displayedRows.length} / {validatedRows.length} dòng
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 z-10 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3 whitespace-nowrap">Dòng</th>
                        <th className="py-2 px-3 whitespace-nowrap">Trạng thái</th>
                        <th className="py-2 px-3 whitespace-nowrap">Mã VT/TB</th>
                        <th className="py-2 px-3">Tên vật tư thiết bị</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">SL nhập</th>
                        <th className="py-2 px-3 whitespace-nowrap">ĐVT</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Đơn giá</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Thành tiền</th>
                        <th className="py-2 px-3 whitespace-nowrap">Packing List</th>
                        <th className="py-2 px-3 whitespace-nowrap">Shipment</th>
                        <th className="py-2 px-3 whitespace-nowrap">Số / Tên kiện</th>
                        <th className="py-2 px-3 whitespace-nowrap">Hạng mục</th>
                        <th className="py-2 px-3 whitespace-nowrap">Kho tiếp nhận</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="py-8 text-center text-slate-400">
                            Không có dòng nào phù hợp bộ lọc.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row, idx) => (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-50 transition-colors ${
                              !row.isValid ? 'bg-red-50/40' : ''
                            }`}
                          >
                            <td className="py-2 px-3 font-mono text-slate-400 text-[11px]">
                              {row.rowIndex}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {row.isValid ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Hợp lệ</span>
                                  </span>
                                  {row.isExistingItem ? (
                                    <span className="text-[10px] text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
                                      Tồn: {row.matchedItem?.currentStock}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200 font-semibold">
                                      VT Mới
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-800">
                                  <XCircle className="w-3 h-3" />
                                  <span>{row.errors[0] || 'Lỗi'}</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                              {row.itemCode || <span className="text-red-500 font-normal">[Trống]</span>}
                            </td>
                            <td className="py-2 px-3 text-slate-800 max-w-xs truncate font-medium">
                              {row.itemName || <span className="text-red-500 font-normal">[Trống]</span>}
                              {row.manufacturer && (
                                <div className="text-[10px] text-slate-500">
                                  NSX: {row.manufacturer}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                              {row.quantity > 0 ? (
                                formatNumber(row.quantity)
                              ) : (
                                <span className="text-red-500">0</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                              {row.unit}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                              {formatVND(row.unitPrice || 0)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                              {formatVND(row.calculatedTotal)}
                            </td>
                            <td className="py-2 px-3 font-mono text-blue-700 text-[11px] whitespace-nowrap">
                              {row.packingListNo || '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                              {row.shipment || '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-600 text-[11px] whitespace-nowrap">
                              {row.packageNo ? (
                                <span>
                                  <strong>{row.packageNo}</strong>
                                  {row.packageName && ` - ${row.packageName}`}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-2 px-3 text-indigo-700 text-[11px] whitespace-nowrap">
                              {row.projectItem || '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-700 text-[11px] whitespace-nowrap">
                              {row.warehouse}
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
            <div className="py-6 space-y-6 text-center">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Nhập kho từ Excel thành công!
                </h3>
                <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                  Dữ liệu đã được ghi nhận vào kho, số lượng tồn kho đã được cập nhật và phiếu nhập kho đã được tạo lập tự động.
                </p>
              </div>

              {/* Summary Badges */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <div className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-left">
                  <div className="text-[11px] text-slate-500">Số dòng đã nạp</div>
                  <div className="text-base font-bold font-mono text-slate-800">
                    {importSummary.importedRows} dòng
                  </div>
                </div>

                <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-left">
                  <div className="text-[11px] text-emerald-700">Mặt hàng tạo mới</div>
                  <div className="text-base font-bold font-mono text-emerald-800">
                    +{importSummary.createdItems} mặt hàng
                  </div>
                </div>

                <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-left">
                  <div className="text-[11px] text-blue-700">Tồn kho cập nhật</div>
                  <div className="text-base font-bold font-mono text-blue-900">
                    {importSummary.updatedItems} mặt hàng
                  </div>
                </div>

                <div className="px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-lg text-left">
                  <div className="text-[11px] text-purple-700">Phiếu nhập kho đã tạo</div>
                  <div className="text-base font-bold font-mono text-purple-900">
                    {createdTransactions.length} phiếu
                  </div>
                </div>
              </div>

              {/* Created vouchers list */}
              {createdTransactions.length > 0 && (
                <div className="max-w-2xl mx-auto text-left bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="text-xs font-semibold text-slate-800">
                    Danh sách phiếu nhập kho vừa lập:
                  </div>
                  <div className="space-y-2">
                    {createdTransactions.map(trans => (
                      <div
                        key={trans.id}
                        className="flex items-center justify-between bg-white p-3 rounded border border-slate-200 text-xs"
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-900 flex items-center gap-2">
                            <span>{trans.code}</span>
                            {trans.packingListNo && (
                              <span className="text-[11px] text-blue-700 font-normal">
                                (PL: {trans.packingListNo})
                              </span>
                            )}
                          </div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            {trans.warehouse} · {trans.items.length} mặt hàng ·{' '}
                            <span className="font-mono font-semibold text-slate-700">
                              {formatVND(trans.totalAmount)}
                            </span>
                          </div>
                        </div>

                        {onViewPrint && (
                          <button
                            type="button"
                            onClick={() => {
                              onViewPrint(trans);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>In phiếu nhập</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/70 shrink-0">
          {step === 'UPLOAD' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Đóng
              </button>
              <div className="text-xs text-slate-500">
                Hãy chọn tệp Excel hoặc CSV để bắt đầu xem trước
              </div>
            </>
          )}

          {step === 'PREVIEW' && (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Quay lại
                </button>
                {invalidRows.length > 0 && (
                  <span className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Hệ thống sẽ chỉ nhập {validRows.length} dòng hợp lệ.</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={validRows.length === 0 || loading}
                  onClick={handleConfirmImport}
                  className={`inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-md shadow-xs transition-colors cursor-pointer ${
                    validRows.length > 0 && !loading
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>Xác nhận nhập kho ({validRows.length} dòng)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {step === 'SUCCESS' && (
            <div className="w-full flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Nhập tiếp file khác
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Hoàn tất & Đóng
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

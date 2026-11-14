import React, { useState, useRef, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ArrowRight,
  Trash2,
  Building2,
  Warehouse as WarehouseIcon,
  Package
} from 'lucide-react';
import { 
  downloadInboundTemplate, 
  downloadOutboundTemplate, 
  downloadMaterialTemplate,
  parseInboundExcel, 
  parseOutboundExcel,
  parseMaterialExcel
} from '../../services/excelService';
import { Warehouse } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { PaginationBar } from './PaginationBar';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'inbound' | 'outbound' | 'materials';
  warehouses?: Warehouse[];
  onImportSuccess: (items: any[], defaultWarehouseId?: string, mode?: 'upsert' | 'skip') => void | Promise<void>;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  type,
  warehouses = [],
  onImportSuccess
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progressInfo, setProgressInfo] = useState<{ percent: number; processed: number; total: number }>({
    percent: 0,
    processed: 0,
    total: 0
  });
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'preview'>('upload');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('auto');
  const [materialImportMode, setMaterialImportMode] = useState<'upsert' | 'skip'>('upsert');

  // Phân trang cho bảng xem trước (đảm bảo mượt tuyệt đối với 100.000+ dòng)
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(50);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableWarehouses = warehouses.length > 0 ? warehouses : StorageService.getWarehouses();

  // Tính toán thống kê tổng hợp chỉ 1 lần bằng useMemo O(N)
  const summaryStats = useMemo(() => {
    if (parsedRows.length === 0) {
      return {
        totalWeight: 0,
        totalQty: 0,
        detectedSlipCount: 0,
        sampleSlips: [] as string[]
      };
    }

    let totalWeight = 0;
    let totalQty = 0;
    const slipSet = new Set<string>();
    const sampleSlips: string[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const r = parsedRows[i];
      if (type !== 'materials') {
        totalWeight += Number(r.weightKg) || 0;
        totalQty += Number(r.quantity) || 0;
        const code = type === 'inbound' ? r.receiptCode : r.issueCode;
        if (code && !slipSet.has(code)) {
          slipSet.add(code);
          if (sampleSlips.length < 8) {
            sampleSlips.push(code);
          }
        }
      }
    }

    return {
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalQty: Math.round(totalQty * 10000) / 10000,
      detectedSlipCount: slipSet.size,
      sampleSlips
    };
  }, [parsedRows, type]);

  const pagedPreviewRows = useMemo(() => {
    const start = (previewPage - 1) * previewPageSize;
    return parsedRows.slice(start, start + previewPageSize);
  }, [parsedRows, previewPage, previewPageSize]);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    if (type === 'materials') {
      downloadMaterialTemplate();
    } else if (type === 'inbound') {
      downloadInboundTemplate();
    } else {
      downloadOutboundTemplate();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setProgressInfo({ percent: 0, processed: 0, total: 0 });
    setParseErrors([]);
    setParsedRows([]);
    setPreviewPage(1);

    const onProgress = (percent: number, processed: number, total: number) => {
      setProgressInfo({ percent, processed, total });
    };

    try {
      let res;
      if (type === 'materials') {
        res = await parseMaterialExcel(file, onProgress);
      } else if (type === 'inbound') {
        res = await parseInboundExcel(file, onProgress);
      } else {
        res = await parseOutboundExcel(file, onProgress);
      }

      if (res.success && res.data.length > 0) {
        setParsedRows(res.data);
        setParseErrors(res.errors);
        setActiveTab('preview');
      } else {
        setParseErrors(res.errors.length > 0 ? res.errors : ['Không tìm thấy dữ liệu hợp lệ trong file Excel.']);
      }
    } catch (err: any) {
      setParseErrors([`Lỗi: ${err?.message || 'Không thể đọc file'}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (parsedRows.length === 0 || isSaving) return;
    setIsSaving(true);

    // Nhường 1 nhịp render để hiển thị trạng thái đang lưu khi dữ liệu >100.000 dòng
    await new Promise(resolve => setTimeout(resolve, 16));

    try {
      if (type === 'materials') {
        await onImportSuccess(parsedRows, undefined, materialImportMode);
      } else {
        await onImportSuccess(parsedRows, selectedWarehouseId);
      }

      onClose();
      setSelectedFile(null);
      setParsedRows([]);
      setParseErrors([]);
      setActiveTab('upload');
      setSelectedWarehouseId('auto');
      setPreviewPage(1);
    } finally {
      setIsSaving(false);
    }
  };

  const removeItem = (globalIndex: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== globalIndex));
  };

  const getRowWarehouseDisplay = (row: any) => {
    if (row.warehouseName) return row.warehouseName;
    if (selectedWarehouseId !== 'auto') {
      const wh = availableWarehouses.find(w => w.id === selectedWarehouseId);
      if (wh) return `${wh.name} (mặc định)`;
    }
    return availableWarehouses[0]?.name || 'Kho mặc định';
  };

  const handleClose = () => {
    if (isSaving || isProcessing) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in">
      <div className="m-auto bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-3 p-3.5 sm:p-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${
              type === 'materials' 
                ? 'bg-amber-100 text-amber-800' 
                : type === 'inbound' 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-blue-100 text-blue-800'
            }`}>
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                {type === 'materials' 
                  ? 'Import Danh Mục Vật Tư & Thiết Bị Từ File Excel'
                  : type === 'inbound' 
                    ? 'Import Dữ Liệu Nhập Kho Từ File Excel' 
                    : 'Import Dữ Liệu Xuất Kho Từ File Excel'}
              </h3>
              <p className="text-slate-500 text-[11px] sm:text-xs mt-0.5 line-clamp-2 sm:line-clamp-none">
                {type === 'materials'
                  ? 'Tự động bóc tách Mã VT, Tên vật tư thiết bị, ĐVT, Package No., Hạng mục, NSX, NCC, Khối lượng tiêu chuẩn, Quy cách & Tồn tối thiểu'
                  : type === 'inbound' 
                    ? 'Tự động nhận diện Mã phiếu, Ngày nhập, Kho tiếp nhận, Packing List, Shipment, Package No., NSX, NCC, Bản vẽ, Khối lượng & Số lượng'
                    : 'Tự động nhận diện Mã phiếu, Ngày xuất, Dự án, Đơn vị nhận, Kho xuất, Packing List, Shipment, Package No., Vật tư & Khối lượng'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Tabs / Step Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-3.5 sm:px-6 py-2.5 sm:py-3 bg-slate-100/70 border-b border-slate-200/80 text-xs font-semibold gap-2.5">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex items-center gap-1.5 py-1 px-3 rounded-lg transition ${
                activeTab === 'upload' 
                  ? 'bg-white shadow text-blue-700 font-bold' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>1. Tải lên file Excel</span>
            </button>
            <button
              onClick={() => parsedRows.length > 0 && setActiveTab('preview')}
              disabled={parsedRows.length === 0}
              className={`flex items-center gap-1.5 py-1 px-3 rounded-lg transition ${
                activeTab === 'preview' 
                  ? 'bg-white shadow text-blue-700 font-bold' 
                  : parsedRows.length > 0 ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 cursor-not-allowed'
              }`}
            >
              <span>2. Kiểm tra dữ liệu ({parsedRows.length.toLocaleString('vi-VN')} mặt hàng)</span>
            </button>
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-semibold bg-blue-50 hover:bg-blue-100 px-3 py-2 sm:py-1.5 rounded-lg border border-blue-200 transition w-full sm:w-auto min-h-[38px]"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span>Tải File Excel Mẫu ({type === 'materials' ? 'Danh mục vật tư' : type === 'inbound' ? 'Nhập kho' : 'Xuất kho'})</span>
          </button>
        </div>

        {/* Cấu hình Tuỳ theo type */}
        {type === 'materials' ? (
          <div className="px-3.5 sm:px-6 py-2.5 sm:py-3 bg-amber-50/70 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <Package className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Chế độ xử lý mã vật tư trùng:</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-800 font-medium">
                <input
                  type="radio"
                  name="matMode"
                  checked={materialImportMode === 'upsert'}
                  onChange={() => setMaterialImportMode('upsert')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Cập nhật thông tin mới nhất nếu trùng mã (Khuyên dùng)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-800 font-medium">
                <input
                  type="radio"
                  name="matMode"
                  checked={materialImportMode === 'skip'}
                  onChange={() => setMaterialImportMode('skip')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Chỉ thêm mới (Bỏ qua nếu mã đã có)</span>
              </label>
            </div>
          </div>
        ) : (
          <div className="px-3.5 sm:px-6 py-2.5 sm:py-3 bg-blue-50/70 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{type === 'inbound' ? 'Kho tiếp nhận áp dụng:' : 'Kho xuất hàng áp dụng:'}</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 sm:py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 min-h-[38px]"
              >
                <option value="auto">Tự động nhận diện từ cột "Kho" trong file Excel</option>
                {availableWarehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500 hidden md:inline">
                (Hệ thống ưu tiên tên kho ghi trong file Excel)
              </span>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto flex-1">
          {activeTab === 'upload' ? (
            <div className="space-y-6">
              {/* Drop area */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-base">
                    {selectedFile ? selectedFile.name : 'Nhấp để chọn file Excel hoặc kéo thả vào đây'}
                  </h4>
                  <p className="text-slate-500 text-xs mt-1">
                    Hỗ trợ định dạng Microsoft Excel (.xlsx, .xls) hoặc tệp CSV (UTF-8) — Tối ưu hóa dữ liệu lớn trên 100.000 dòng
                  </p>
                </div>

                {isProcessing && (
                  <div className="w-full max-w-md space-y-2 mt-2">
                    <div className="flex justify-between text-xs font-semibold text-blue-700">
                      <span>
                        {progressInfo.total > 0
                          ? `Đang bóc tách dòng ${progressInfo.processed.toLocaleString('vi-VN')} / ${progressInfo.total.toLocaleString('vi-VN')}...`
                          : 'Đang đọc và giải nén cấu trúc file Excel...'}
                      </span>
                      <span>{progressInfo.percent}%</span>
                    </div>
                    <progress
                      value={Math.max(5, progressInfo.percent)}
                      max={100}
                      className="w-full h-2 rounded-full overflow-hidden accent-blue-600 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:bg-blue-600 [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:bg-blue-600"
                    />
                  </div>
                )}
              </div>

              {/* Hướng dẫn các cột */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h5 className="font-bold text-xs uppercase tracking-wider text-slate-700 mb-2">
                  Các trường dữ liệu chuẩn được hệ thống tự động bóc tách & phân loại:
                </h5>
                {type === 'materials' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs text-slate-600">
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-blue-800 block">• Mã vật tư / Thiết bị (*)</span>
                      <span className="text-[11px] text-slate-400">TB-VAL-200H, KC-BEAM...</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• Tên vật tư thiết bị (*)</span>
                      <span className="text-[11px] text-slate-400">Van cầu áp lực cao, Thép dầm...</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• Đơn vị tính (*)</span>
                      <span className="text-[11px] text-slate-400">Bộ, Cái, Cây, Mét, Tủ, Tấn</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• Hạng mục</span>
                      <span className="text-[11px] text-slate-400">Đường ống, Kết cấu, Điện...</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-indigo-800 block">• Package No.</span>
                      <span className="text-[11px] text-slate-400">PKG-01/15, BOX-03/08, CASE-01</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• Nhà sản xuất (NSX)</span>
                      <span className="text-[11px] text-slate-400">Kitz Corp, Posco, Siemens...</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• Nhà cung cấp (NCC)</span>
                      <span className="text-[11px] text-slate-400">PetroSteel, Hòa Phát...</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• Khối lượng & Tồn tối thiểu</span>
                      <span className="text-[11px] text-slate-400">Khối lượng kg, Tồn tối thiểu</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs text-slate-600">
                    <div className="bg-blue-50/70 p-2 rounded-lg border border-blue-200">
                      <span className="font-bold text-blue-800 block">• {type === 'inbound' ? 'Số phiếu PNK (*)' : 'Số phiếu PXK (*)'}</span>
                      <span className="text-[11px] text-blue-600 font-medium">{type === 'inbound' ? 'Mẫu QN-OPR-PR11-FM05.01' : 'Mẫu QN-OPR-PR11-FM06'}</span>
                    </div>
                    <div className="bg-indigo-50/70 p-2 rounded-lg border border-indigo-200">
                      <span className="font-bold text-indigo-800 block">• {type === 'inbound' ? 'Hình thức nhập' : 'Hình thức xuất'}</span>
                      <span className="text-[11px] text-indigo-600 font-medium">{type === 'inbound' ? 'Nhập mới / Nhập trả kho' : 'Xuất mới / Xuất điều chuyển'}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-800 block">• Ngày & Kho (*)</span>
                      <span className="text-[11px] text-slate-400">2026-10-14, Kho PTSC...</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-blue-800 block">• Bộ phận & {type === 'inbound' ? 'Đơn vị giao hàng' : 'Người nhận'}</span>
                      <span className="text-[11px] text-slate-400">Bộ phận, Đơn vị/Nhà thầu...</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• {type === 'inbound' ? 'Hợp đồng & Đề xuất số' : 'Đơn vị/Tổ/Nhóm & Số PYC/PĐX'}</span>
                      <span className="text-[11px] text-slate-400">{type === 'inbound' ? 'HĐ-2026-01, ĐX-VT-008' : 'Tổ Lắp máy, PYC-015'}</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• Mã vật tư & Tên vật tư (*)</span>
                      <span className="text-[11px] text-slate-400">VT-PIPE-01, Ống thép đúc...</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-indigo-800 block">• Mã lô / Package No.</span>
                      <span className="text-[11px] text-slate-400">HEAT-8821, LOT-01, PKG-01</span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200/70">
                      <span className="font-semibold text-slate-900 block">• Số lượng, ĐVT & KL (Kg) (*)</span>
                      <span className="text-[11px] text-slate-400">Số lượng (cây/tấm), ĐVT, Kg</span>
                    </div>
                  </div>
                )}
              </div>

              {parseErrors.length > 0 && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs space-y-1 max-h-40 overflow-y-auto">
                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                    <AlertCircle className="w-4 h-4" />
                    <span>Lưu ý phát hiện khi đọc file:</span>
                  </div>
                  {parseErrors.map((err, i) => (
                    <div key={i} className="pl-5">• {err}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Thông báo số lượng phiếu tự tạo nhận diện được */}
              {type !== 'materials' && (
                <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                  summaryStats.detectedSlipCount > 0 
                    ? 'bg-blue-50/80 border-blue-200 text-blue-900' 
                    : 'bg-amber-50/80 border-amber-200 text-amber-900'
                }`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${summaryStats.detectedSlipCount > 0 ? 'text-blue-600' : 'text-amber-600'}`} />
                    <span>
                      {summaryStats.detectedSlipCount > 0 ? (
                        <>
                          Nhận diện <strong>{summaryStats.detectedSlipCount.toLocaleString('vi-VN')}</strong> số phiếu trong file:{' '}
                          <span className="font-mono font-bold text-blue-700">
                            {summaryStats.sampleSlips.join(', ')}
                            {summaryStats.detectedSlipCount > summaryStats.sampleSlips.length
                              ? ` ... (+${(summaryStats.detectedSlipCount - summaryStats.sampleSlips.length).toLocaleString('vi-VN')} phiếu khác)`
                              : ''}
                          </span>
                          . Hệ thống sẽ tự động tạo <strong>{summaryStats.detectedSlipCount.toLocaleString('vi-VN')}</strong> phiếu {type === 'inbound' ? 'nhập kho' : 'xuất kho'} tương ứng.
                        </>
                      ) : (
                        <>
                          File chưa có cột Số phiếu. Hệ thống sẽ <strong>tự động sinh mã phiếu</strong> theo kho và Packing List cho từng nhóm mặt hàng.
                        </>
                      )}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                    {summaryStats.detectedSlipCount > 0
                      ? `Tự tạo ${summaryStats.detectedSlipCount.toLocaleString('vi-VN')} phiếu`
                      : 'Tự sinh mã phiếu'}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">
                  Xem trước dữ liệu bóc tách ({parsedRows.length.toLocaleString('vi-VN')} mặt hàng)
                </span>
                {type !== 'materials' ? (
                  <span className="text-xs text-slate-500">
                    Tổng khối lượng: <strong className="text-blue-700">{summaryStats.totalWeight.toLocaleString('vi-VN')} kg</strong>
                    {' | '}
                    Tổng số lượng: <strong className="text-emerald-700">{summaryStats.totalQty.toLocaleString('vi-VN')}</strong>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">
                    Đã chuẩn bị sẵn sàng để nhập vào Danh mục vật tư & thiết bị
                  </span>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-80 overflow-x-auto overflow-y-auto">
                  {type === 'materials' ? (
                    <table className="w-full min-w-[860px] text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">STT</th>
                          <th className="p-2.5">Mã Vật Tư</th>
                          <th className="p-2.5">Tên Vật Tư Thiết Bị</th>
                          <th className="p-2.5">ĐVT</th>
                          <th className="p-2.5">Hạng Mục</th>
                          <th className="p-2.5">Package No.</th>
                          <th className="p-2.5">NSX & NCC</th>
                          <th className="p-2.5 text-right">KL Chuẩn (kg)</th>
                          <th className="p-2.5 text-right">Tồn Tối Thiểu</th>
                          <th className="p-2.5">Quy Cách & Ghi Chú</th>
                          <th className="p-2.5 text-center">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagedPreviewRows.map((r, i) => {
                          const globalIdx = (previewPage - 1) * previewPageSize + i;
                          return (
                            <tr key={r.id || globalIdx} className="hover:bg-slate-50">
                              <td className="p-2.5 font-mono text-slate-500">{(globalIdx + 1).toLocaleString('vi-VN')}</td>
                              <td className="p-2.5 font-mono font-bold text-blue-700">{r.code}</td>
                              <td className="p-2.5 font-semibold text-slate-900">{r.name}</td>
                              <td className="p-2.5 text-slate-600 font-medium">{r.unit || 'Bộ'}</td>
                              <td className="p-2.5">
                                <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-medium border border-blue-200">
                                  {r.category || 'Chung'}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono font-semibold text-indigo-700">{r.packageNo || 'N/A'}</td>
                              <td className="p-2.5">
                                <div className="text-[11px] font-medium text-slate-800">NSX: {r.manufacturer || 'N/A'}</div>
                                <div className="text-[11px] text-slate-500">NCC: {r.supplier || 'N/A'}</div>
                              </td>
                              <td className="p-2.5 text-right font-mono font-medium text-slate-800">
                                {Number(r.unitWeightKg) ? Number(r.unitWeightKg).toLocaleString('vi-VN') : 0}
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-700">
                                {r.minStockAlert || 0}
                              </td>
                              <td className="p-2.5 max-w-[200px]">
                                <div className="text-[11px] text-slate-700 truncate" title={r.specification}>{r.specification || '-'}</div>
                                <div className="text-[10px] text-slate-400 truncate" title={r.notes}>{r.notes || ''}</div>
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  onClick={() => removeItem(globalIdx)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                                  title="Xóa dòng này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full min-w-[980px] text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">STT</th>
                          <th className="p-2.5">{type === 'inbound' ? 'Số Phiếu Nhập' : 'Số Phiếu Xuất'}</th>
                          <th className="p-2.5">{type === 'inbound' ? 'Hình thức nhập' : 'Hình thức xuất'}</th>
                          <th className="p-2.5">{type === 'inbound' ? 'Kho Tiếp Nhận' : 'Kho Xuất Hàng'}</th>
                          <th className="p-2.5">Bộ phận & Chứng từ</th>
                          <th className="p-2.5">{type === 'inbound' ? 'Đơn vị giao hàng' : 'Người nhận & Đơn vị'}</th>
                          <th className="p-2.5">Mã vật tư & Tên vật tư</th>
                          <th className="p-2.5">Mã lô</th>
                          <th className="p-2.5 text-right">SL (cây/tấm)</th>
                          <th className="p-2.5 text-center">ĐVT</th>
                          <th className="p-2.5 text-right">KL (Kg)</th>
                          {type === 'inbound' && <th className="p-2.5 text-right">Thành tiền (VNĐ)</th>}
                          <th className="p-2.5">Ghi chú</th>
                          <th className="p-2.5 text-center">Xóa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagedPreviewRows.map((r, i) => {
                          const globalIdx = (previewPage - 1) * previewPageSize + i;
                          const rowAny = r as any;
                          const customCode = rowAny.receiptCode || rowAny.issueCode;
                          const batchOrPkg = rowAny.batchCode || r.packageNo || '-';
                          const isReturnInbound = type === 'inbound' && rowAny.inboundType === 'return';
                          const isTransferOutbound = type === 'outbound' && rowAny.outboundType === 'transfer';
                          const lineAmount =
                            Number(rowAny.totalPrice) ||
                            Number(rowAny.totalAmount) ||
                            (Number(r.quantity || 0) * Number(rowAny.unitPrice || 0));
                          return (
                            <tr key={r.id || globalIdx} className="hover:bg-slate-50">
                              <td className="p-2.5 font-mono text-slate-400">{(globalIdx + 1).toLocaleString('vi-VN')}</td>
                              <td className="p-2.5">
                                {customCode ? (
                                  <span className="inline-flex items-center gap-1 font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                    <FileSpreadsheet className="w-3 h-3 text-blue-600" />
                                    <span>{customCode}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">Tự sinh</span>
                                )}
                              </td>
                              <td className="p-2.5 whitespace-nowrap">
                                {type === 'inbound' ? (
                                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                    isReturnInbound
                                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}>
                                    {isReturnInbound ? 'Nhập trả kho' : 'Nhập mới'}
                                  </span>
                                ) : (
                                  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                                    isTransferOutbound
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}>
                                    {isTransferOutbound ? 'Xuất điều chuyển' : 'Xuất mới'}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <span className="inline-flex items-center gap-1 font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  <WarehouseIcon className="w-3 h-3 text-blue-600 shrink-0" />
                                  <span>{getRowWarehouseDisplay(r)}</span>
                                </span>
                              </td>
                              <td className="p-2.5">
                                <div className="font-semibold text-slate-800">{rowAny.departmentName || 'Bộ phận: —'}</div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  {type === 'inbound'
                                    ? [rowAny.contractNo && `HĐ: ${rowAny.contractNo}`, rowAny.requestNo && `ĐX: ${rowAny.requestNo}`].filter(Boolean).join(' • ') || (r.packingListNo ? `PL: ${r.packingListNo}` : '-')
                                    : [rowAny.requestNo && `PYC: ${rowAny.requestNo}`, r.packingListNo && `PL: ${r.packingListNo}`].filter(Boolean).join(' • ') || '-'}
                                </div>
                              </td>
                              <td className="p-2.5">
                                {type === 'inbound' ? (
                                  <div className="text-[11px] font-medium text-slate-800">{rowAny.delivererName || r.supplier || '-'}</div>
                                ) : (
                                  <>
                                    <div className="text-[11px] font-semibold text-slate-800">{rowAny.recipientName || rowAny.receiverName || '-'}</div>
                                    <div className="text-[10px] text-slate-500">{rowAny.recipientDepartment || rowAny.contractorName || ''}</div>
                                  </>
                                )}
                              </td>
                              <td className="p-2.5">
                                <div className="font-semibold text-slate-900">{r.materialName}</div>
                                <div className="text-[11px] font-mono text-blue-700">{r.materialCode}</div>
                              </td>
                              <td className="p-2.5 font-mono font-semibold text-indigo-700">{batchOrPkg}</td>
                              <td className="p-2.5 text-right font-bold text-slate-800">
                                {Number(r.quantity || 0).toLocaleString('vi-VN')}
                              </td>
                              <td className="p-2.5 text-center text-slate-600">{r.unit || '-'}</td>
                              <td className="p-2.5 text-right font-mono font-medium text-slate-800">
                                {Number(r.weightKg || 0).toLocaleString('vi-VN')}
                              </td>
                              {type === 'inbound' && (
                                <td className="p-2.5 text-right font-mono font-semibold text-emerald-700">
                                  {lineAmount > 0 ? lineAmount.toLocaleString('vi-VN') : '-'}
                                </td>
                              )}
                              <td className="p-2.5 max-w-[160px] truncate text-slate-500" title={rowAny.note || ''}>
                                {rowAny.note || '-'}
                              </td>
                              <td className="p-2.5 text-center">
                                <button
                                  onClick={() => removeItem(globalIdx)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                                  title="Xóa dòng này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <PaginationBar
                  currentPage={previewPage}
                  totalItems={parsedRows.length}
                  pageSize={previewPageSize}
                  onPageChange={setPreviewPage}
                  onPageSizeChange={setPreviewPageSize}
                  pageSizeOptions={[50, 100, 200]}
                  itemLabel="mặt hàng"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            onClick={handleClose}
            disabled={isSaving || isProcessing}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition disabled:opacity-50 min-h-[42px]"
          >
            Đóng
          </button>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {activeTab === 'upload' ? (
              <button
                disabled={parsedRows.length === 0 || isProcessing}
                onClick={() => setActiveTab('preview')}
                className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 text-xs font-semibold rounded-xl transition min-h-[42px] ${
                  parsedRows.length > 0 && !isProcessing
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Xem trước kết quả</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setActiveTab('upload')}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition disabled:opacity-50 min-h-[42px]"
                >
                  Chọn file khác
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={isSaving}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition active:scale-95 disabled:opacity-70 min-h-[42px]"
                >
                  {isSaving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                      <span>Đang lưu {parsedRows.length.toLocaleString('vi-VN')} dòng...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Xác Nhận Import ({parsedRows.length.toLocaleString('vi-VN')} mặt hàng)</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

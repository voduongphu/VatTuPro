import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { InboundReceipt, OutboundReceipt } from '../../types/inventory';
import { roundQty, sumInboundItems, sumOutboundItems } from '../../utils/additiveMerge';
import { formatExcelDate } from '../../services/excelService';
import { Printer, X, ChevronLeft, ChevronRight, SlidersHorizontal, Check } from 'lucide-react';

interface ReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  inbound?: InboundReceipt | null;
  outbound?: OutboundReceipt | null;
}

const PRINT_PAGE_SIZE = 200;

function formatVietnameseVoucherDate(dateStr?: string): string {
  const normalized = formatExcelDate(dateStr);
  if (!normalized) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `Ngày ${d} tháng ${m} năm ${y}`;
  }
  const ymd = normalized.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `Ngày ${d} tháng ${m} năm ${y}`;
  }
  const parsed = new Date(normalized);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const y = parsed.getFullYear();
    return `Ngày ${d} tháng ${m} năm ${y}`;
  }
  return normalized;
}

function formatWeightKg(val?: number): string {
  const num = Number(val) || 0;
  if (num <= 0) return '';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatQty(val?: number): string {
  const num = Number(val) || 0;
  if (num <= 0) return '';
  if (Number.isInteger(num)) {
    return num.toLocaleString('en-US');
  }
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatTotalQtyOrDash(val?: number): string {
  const num = Number(val) || 0;
  if (num <= 0) return '-';
  if (Number.isInteger(num)) {
    return num.toLocaleString('en-US');
  }
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatMoneyOrDash(val?: number): string {
  const num = Number(val) || 0;
  if (num <= 0) return '-';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  isOpen,
  onClose,
  inbound,
  outbound
}) => {
  const [page, setPage] = useState(1);
  const [showCustomize, setShowCustomize] = useState(false);

  // Cho phép chỉnh nhanh các trường biểu mẫu ngay trước khi in A4
  const [customDepartment, setCustomDepartment] = useState('');
  const [customDelivererOrRecipient, setCustomDelivererOrRecipient] = useState('');
  const [customSubUnitOrContract, setCustomSubUnitOrContract] = useState('');
  const [customRequestNo, setCustomRequestNo] = useState('');
  const [customReasonOrContent, setCustomReasonOrContent] = useState('');
  const [customAmountInWords, setCustomAmountInWords] = useState('');
  const [customAttachedDocs, setCustomAttachedDocs] = useState('');
  const [extraBlankRows, setExtraBlankRows] = useState(0);
  const [inboundCheck, setInboundCheck] = useState<'new' | 'return' | ''>('');
  const [outboundCheck, setOutboundCheck] = useState<'issue' | 'transfer' | ''>('');

  useEffect(() => {
    setPage(1);
    setShowCustomize(false);
    setExtraBlankRows(0);

    if (inbound) {
      const savedDept =
        inbound.departmentName && inbound.departmentName !== 'DỰ ÁN LTIA-4.9'
          ? inbound.departmentName
          : '';
      setCustomDepartment(savedDept);
      const rawDeliverer =
        inbound.delivererName && inbound.delivererName !== 'Nhập từ File Excel tự động'
          ? inbound.delivererName
          : inbound.supplier &&
              inbound.supplier !== 'Nhiều nhà cung cấp' &&
              inbound.supplier !== 'Theo phiếu nhập' &&
              inbound.supplier !== 'Đơn vị giao hàng'
            ? inbound.supplier
            : inbound.delivererName || '';
      setCustomDelivererOrRecipient(rawDeliverer);
      setCustomSubUnitOrContract(inbound.contractNo || '');
      setCustomRequestNo(inbound.requestNo || '');
      const cleanNotes =
        inbound.notes && !inbound.notes.startsWith('Import thành công ')
          ? inbound.notes
          : '';
      setCustomReasonOrContent(cleanNotes);
      setCustomAmountInWords(inbound.amountInWords || '');
      setCustomAttachedDocs(inbound.attachedDocs || '');
      setInboundCheck(inbound.inboundType || '');
    } else if (outbound) {
      const savedDept =
        outbound.departmentName && outbound.departmentName !== 'DỰ ÁN LTIA-4.9'
          ? outbound.departmentName
          : outbound.projectName &&
              outbound.projectName !== 'DỰ ÁN LTIA-4.9' &&
              !outbound.projectName.includes('(Import Excel)')
            ? outbound.projectName
            : '';
      setCustomDepartment(savedDept);
      setCustomDelivererOrRecipient(outbound.recipientName || '');
      setCustomSubUnitOrContract(outbound.recipientDepartment || '');
      setCustomRequestNo(outbound.requestNo || '');
      const cleanNotes =
        outbound.notes && !outbound.notes.startsWith('Import thành công ')
          ? outbound.notes
          : '';
      setCustomReasonOrContent(cleanNotes);
      setOutboundCheck(outbound.outboundType || '');
    }
  }, [inbound, outbound, isOpen]);

  const items = (inbound ? inbound.items : outbound?.items) || [];
  const totalPages = Math.max(1, Math.ceil(items.length / PRINT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const visibleItems = useMemo(() => {
    const start = (safePage - 1) * PRINT_PAGE_SIZE;
    return items.slice(start, start + PRINT_PAGE_SIZE);
  }, [items, safePage]);

  const blankRowsArray = useMemo(() => {
    const minFallback = visibleItems.length === 0 ? (inbound ? 7 : 2) : 0;
    const count = Math.max(minFallback, extraBlankRows);
    return Array.from({ length: count }, (_, i) => i);
  }, [visibleItems.length, inbound, extraBlankRows]);

  const totals = useMemo(() => {
    if (inbound) {
      const inItems = Array.isArray(inbound.items) ? inbound.items : [];
      if (inItems.length > 0) {
        const sums = sumInboundItems(inItems);
        return {
          totalQty: sums.totalQuantity,
          totalWeight: sums.totalWeightKg,
          totalAmount: sums.totalAmount
        };
      }
      return {
        totalQty: roundQty(inbound.totalQuantity),
        totalWeight: Number(inbound.totalWeightKg) || 0,
        totalAmount: Number(inbound.totalAmount) || 0
      };
    }
    if (outbound) {
      const outItems = Array.isArray(outbound.items) ? outbound.items : [];
      if (outItems.length > 0) {
        const sums = sumOutboundItems(outItems);
        return {
          totalQty: sums.totalQuantity,
          totalWeight: sums.totalWeightKg,
          totalAmount: 0
        };
      }
      return {
        totalQty: roundQty(outbound.totalQuantity),
        totalWeight: Number(outbound.totalWeightKg) || 0,
        totalAmount: 0
      };
    }
    return { totalQty: 0, totalWeight: 0, totalAmount: 0 };
  }, [inbound, outbound]);

  if (!isOpen || (!inbound && !outbound)) return null;

  const isReceive = Boolean(inbound);
  const formCode = isReceive ? 'QN-OPR-PR11-FM05.01' : 'QN-OPR-PR11-FM06';
  const effectiveDate = 'NHL: 02/08/2024';
  const voucherTitle = isReceive ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO';
  const code = isReceive ? inbound!.receiptCode : outbound!.issueCode;
  const rawDate = isReceive ? inbound!.receiptDate : outbound!.issueDate;
  const startRowNum = (safePage - 1) * PRINT_PAGE_SIZE;

  const trimmedDept = customDepartment.trim().toUpperCase();
  const departmentFormatted = !trimmedDept
    ? 'BỘ PHẬN:'
    : trimmedDept.startsWith('BỘ PHẬN:')
      ? trimmedDept
      : `BỘ PHẬN: ${trimmedDept}`;

  const handlePrint = () => {
    window.print();
  };

  const getItemBatchDisplay = (item: any): string => {
    if (item.batchCode && String(item.batchCode).trim()) {
      return String(item.batchCode).trim();
    }
    if (
      item.packageNo &&
      item.packageNo !== 'N/A' &&
      !String(item.packageNo).startsWith('PKG-') &&
      !String(item.packageNo).startsWith('LO-') &&
      String(item.packageNo).trim()
    ) {
      return String(item.packageNo).trim();
    }
    if (item.packageNo && item.packageNo !== 'N/A' && !String(item.packageNo).startsWith('LO-')) {
      return String(item.packageNo).trim();
    }
    if (
      item.shipment &&
      item.shipment !== 'N/A' &&
      item.shipment !== 'SHP-CHUA-RO' &&
      item.shipment !== 'SHP-EXCEL'
    ) {
      return String(item.shipment).trim();
    }
    return '';
  };

  const getInboundItemNote = (item: any): string => {
    if (item.note !== undefined) return item.note;
    if (
      item.conditionNote &&
      item.conditionNote !== 'Nhập từ file Excel' &&
      item.conditionNote !== 'Mới 100%, nguyên niêm phong'
    ) {
      return item.conditionNote;
    }
    return '';
  };

  const getOutboundItemNote = (item: any): string => {
    if (item.note !== undefined) return item.note;
    if (
      item.purpose &&
      item.purpose !== 'Xuất lắp đặt từ file Excel' &&
      item.purpose !== 'Xuất cấp lắp đặt theo tiến độ công trình'
    ) {
      return item.purpose;
    }
    return '';
  };

  const modalContent = (
    <div className="vtp-print-portal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="vtp-print-shell bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[94dvh] flex flex-col overflow-hidden">
        {/* Thanh công cụ Modal (Ẩn hoàn toàn khi in A4) */}
        <div className="border-b border-slate-200 bg-slate-50 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-bold text-slate-800 text-xs sm:text-sm">
                Xem Trước & In {isReceive ? 'Phiếu Nhập Kho' : 'Phiếu Xuất Kho'}
              </span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs font-mono font-semibold text-blue-700">{formCode}</span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs font-mono font-bold text-slate-800">{code}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              {totalPages > 1 && (
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs">
                  <button
                    type="button"
                    disabled={safePage === 1}
                    onClick={() => setPage(safePage - 1)}
                    className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono font-semibold text-slate-700 px-1">
                    Page {safePage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage === totalPages}
                    onClick={() => setPage(safePage + 1)}
                    className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-40"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowCustomize((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition min-h-[40px] ${
                  showCustomize
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Hiệu chỉnh thông tin in</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition min-h-[40px]"
              >
                <Printer className="w-4 h-4" />
                <span>In Phiếu (A4)</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-xl text-slate-500 transition min-h-[40px]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Khung hiệu chỉnh nhanh thông tin đầu phiếu trước khi in */}
          {showCustomize && (
            <div className="px-3 sm:px-4 pb-3.5 pt-2 bg-slate-100/80 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Bộ phận (để trống sẽ in "BỘ PHẬN:")
                </label>
                <input
                  type="text"
                  value={customDepartment}
                  onChange={(e) => setCustomDepartment(e.target.value)}
                  placeholder="Ví dụ: PHÒNG KỸ THUẬT / DỰ ÁN..."
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  {isReceive ? 'Đơn vị giao hàng' : 'Người nhận'}
                </label>
                <input
                  type="text"
                  value={customDelivererOrRecipient}
                  onChange={(e) => setCustomDelivererOrRecipient(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  {isReceive ? 'Hợp đồng' : 'Đơn vị/Tổ/Nhóm'}
                </label>
                <input
                  type="text"
                  value={customSubUnitOrContract}
                  onChange={(e) => setCustomSubUnitOrContract(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  {isReceive ? 'Đề xuất số' : 'Số PYC/PĐX'}
                </label>
                <input
                  type="text"
                  value={customRequestNo}
                  onChange={(e) => setCustomRequestNo(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  {isReceive ? 'Nội dung' : 'Lý do xuất kho'}
                </label>
                <input
                  type="text"
                  value={customReasonOrContent}
                  onChange={(e) => setCustomReasonOrContent(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Số dòng trống bổ sung cuối bảng
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={extraBlankRows}
                  onChange={(e) =>
                    setExtraBlankRows(Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)))
                  }
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                />
              </div>

              {isReceive && (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Viết bằng chữ
                    </label>
                    <input
                      type="text"
                      value={customAmountInWords}
                      onChange={(e) => setCustomAmountInWords(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                      Số chứng từ gốc kèm theo
                    </label>
                    <input
                      type="text"
                      value={customAttachedDocs}
                      onChange={(e) => setCustomAttachedDocs(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Vùng trang giấy A4 theo đúng 2 mẫu PDF QN-OPR-PR11-FM05.01 & QN-OPR-PR11-FM06 */}
        <div className="vtp-print-paper p-4 sm:p-8 overflow-y-auto flex-1 bg-slate-100/60 print:bg-white">
          <div className="bg-white mx-auto max-w-[210mm] min-h-[275mm] p-5 sm:p-8 print:p-0 print:min-h-0 shadow-sm print:shadow-none border border-slate-200 print:border-none text-black font-['Times_New_Roman',Times,serif] flex flex-col justify-between">
            <div>
              {/* 1. Mã biểu mẫu góc trên bên phải */}
              <div className="text-right text-[11.5px] leading-snug mb-3">
                <div>{formCode}</div>
                <div>{effectiveDate}</div>
              </div>

              {/* 2. Khối Tên công ty + BỘ PHẬN: bên trái (không có logo theo đúng mẫu mới) */}
              <div className="w-full sm:w-[58%] print:w-[58%] text-center pl-1 sm:pl-4 print:pl-4">
                <div className="text-[12.5px] sm:text-[13px] uppercase leading-snug whitespace-nowrap">
                  CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC
                </div>
                <div className="text-[13px] font-bold underline uppercase mt-1 leading-snug">
                  {departmentFormatted}
                </div>
              </div>

              {/* 3. Ô SỐ PHIẾU kẻ khung bên phải */}
              <div className="flex justify-end mt-1.5">
                <table className="border-collapse border-[1.5px] border-black text-[11.5px]">
                  <tbody>
                    <tr>
                      <td className="border border-black px-3 py-1.5 font-bold uppercase text-center whitespace-nowrap min-w-[82px]">
                        SỐ PHIẾU:
                      </td>
                      <td className="border border-black px-3 py-1.5 font-bold text-center min-w-[88px] whitespace-nowrap">
                        {code}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 4. Tiêu đề chính PHIẾU NHẬP KHO / PHIẾU XUẤT KHO */}
              <div className="text-center mt-3 mb-4">
                <h1 className="text-[19px] sm:text-[20px] font-bold uppercase tracking-normal text-black leading-tight">
                  {voucherTitle}
                </h1>
                <div className="text-[12.5px] italic mt-1">
                  {formatVietnameseVoucherDate(rawDate)}
                </div>
              </div>

              {/* 5. 4 dòng thông tin đầu phiếu với đường kẻ ngang nét liền màu đen */}
              {isReceive ? (
                <div className="space-y-1 text-[13px] mb-2">
                  <div className="flex items-end">
                    <span className="w-[130px] sm:w-[140px] shrink-0 leading-snug">
                      Đơn vị giao hàng:
                    </span>
                    <div className="flex-1 sm:mr-[68px] print:mr-[68px] border-b border-black px-1 pb-0.5 min-h-[20px] leading-snug">
                      {customDelivererOrRecipient}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <span className="w-[130px] sm:w-[140px] shrink-0 leading-snug">Hợp đồng:</span>
                    <div className="flex-1 sm:mr-[68px] print:mr-[68px] border-b border-black px-1 pb-0.5 min-h-[20px] leading-snug">
                      {customSubUnitOrContract}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <span className="w-[130px] sm:w-[140px] shrink-0 leading-snug">Đề xuất số:</span>
                    <div className="flex-1 sm:mr-[68px] print:mr-[68px] border-b border-black px-1 pb-0.5 min-h-[20px] leading-snug">
                      {customRequestNo}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <span className="w-[130px] sm:w-[140px] shrink-0 leading-snug">Nội dung:</span>
                    <div className="flex-1 sm:mr-[68px] print:mr-[68px] border-b border-black px-1 pb-0.5 min-h-[20px] leading-snug">
                      {customReasonOrContent}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-[13px] mb-2">
                  <div className="flex items-end">
                    <span className="w-[130px] sm:w-[145px] shrink-0 leading-snug">Người nhận:</span>
                    <div className="flex-1 sm:mr-[78px] print:mr-[78px] border-b border-black px-1 pb-0.5 min-h-[20px] leading-snug">
                      {customDelivererOrRecipient}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <span className="w-[130px] sm:w-[145px] shrink-0 leading-snug">
                      Đơn vị/Tổ/Nhóm:
                    </span>
                    <div className="flex-1 sm:mr-[78px] print:mr-[78px] border-b border-black px-1 pb-0.5 min-h-[20px] leading-snug">
                      {customSubUnitOrContract}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <span className="w-[130px] sm:w-[145px] shrink-0 leading-snug">Số PYC/PĐX:</span>
                    <div className="flex-1 sm:mr-[78px] print:mr-[78px] border-b border-black px-1 pb-0.5 min-h-[20px] leading-snug">
                      {customRequestNo}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <span className="w-[130px] sm:w-[145px] shrink-0 leading-snug">
                      Lý do xuất kho:
                    </span>
                    <div className="flex-1 sm:mr-[78px] print:mr-[78px] border-b border-black px-1 pb-0.5 min-h-[20px] leading-snug">
                      {customReasonOrContent}
                    </div>
                  </div>
                </div>
              )}

              {/* 6. Hàng Checkbox phân loại phiếu (nhấp trực tiếp để tick/bỏ tick trước khi in) */}
              {isReceive ? (
                <div className="flex items-center justify-center gap-12 sm:gap-24 text-[12.5px] my-2 select-none">
                  <button
                    type="button"
                    onClick={() => setInboundCheck((prev) => (prev === 'new' ? '' : 'new'))}
                    className="inline-flex items-center gap-1.5 cursor-pointer text-black"
                    title="Nhấp để chọn / bỏ chọn Nhập mới"
                  >
                    <span className="w-[11px] h-[11px] border border-slate-500 print:border-black inline-flex items-center justify-center">
                      {inboundCheck === 'new' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                    <span>Nhập mới</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInboundCheck((prev) => (prev === 'return' ? '' : 'return'))}
                    className="inline-flex items-center gap-1.5 cursor-pointer text-black"
                    title="Nhấp để chọn / bỏ chọn Nhập trả kho"
                  >
                    <span className="w-[11px] h-[11px] border border-slate-500 print:border-black inline-flex items-center justify-center">
                      {inboundCheck === 'return' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                    <span>Nhập trả kho</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-10 sm:gap-20 text-[12.5px] my-2 select-none">
                  <button
                    type="button"
                    onClick={() => setOutboundCheck((prev) => (prev === 'issue' ? '' : 'issue'))}
                    className="inline-flex items-center gap-1.5 cursor-pointer text-black"
                    title="Nhấp để chọn / bỏ chọn Phiếu xuất kho"
                  >
                    <span className="w-[11px] h-[11px] border border-slate-500 print:border-black inline-flex items-center justify-center">
                      {outboundCheck === 'issue' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                    <span>Phiếu xuất kho</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOutboundCheck((prev) => (prev === 'transfer' ? '' : 'transfer'))}
                    className="inline-flex items-center gap-1.5 cursor-pointer text-black"
                    title="Nhấp để chọn / bỏ chọn Phiếu xuất điều chuyển"
                  >
                    <span className="w-[11px] h-[11px] border border-slate-500 print:border-black inline-flex items-center justify-center">
                      {outboundCheck === 'transfer' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                    <span>Phiếu xuất điều chuyển</span>
                  </button>
                </div>
              )}

              {/* 7. Bảng chi tiết vật tư chuẩn theo từng mẫu */}
              <div className="overflow-x-auto print:overflow-visible">
                {isReceive ? (
                  /* BẢNG PHIẾU NHẬP KHO (10 CỘT - QN-OPR-PR11-FM05.01) */
                  <table className="vtp-voucher-table w-full min-w-[680px] print:min-w-0 border-collapse border-[1.5px] border-black text-[11.5px] leading-snug">
                    <thead>
                      <tr className="font-bold text-center border-b-[1.5px] border-black h-[36px]">
                        <th className="border border-black px-1 py-1 w-[34px]">STT</th>
                        <th className="border border-black px-1.5 py-1 w-[86px]">Mã vật tư</th>
                        <th className="border border-black px-2 py-1">Tên vật tư</th>
                        <th className="border border-black px-1.5 py-1 w-[82px]">Mã lô</th>
                        <th className="border border-black px-1 py-1 w-[66px]">
                          Số lượng
                          <br />
                          (cây/tấm)
                        </th>
                        <th className="border border-black px-1 py-1 w-[40px]">ĐVT</th>
                        <th className="border border-black px-1 py-1 w-[74px]">
                          Khối lượng
                          <br />
                          (Kg)
                        </th>
                        <th className="border border-black px-1 py-1 w-[64px]">
                          Đơn giá
                          <br />
                          (VNĐ)
                        </th>
                        <th className="border border-black px-1 py-1 w-[72px]">
                          Thành tiền
                          <br />
                          (VNĐ)
                        </th>
                        <th className="border border-black px-1.5 py-1 w-[68px]">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((item: any, idx: number) => {
                        const qty = Number(item.quantity) || 0;
                        const uPrice = Number(item.unitPrice) || 0;
                        const tPrice =
                          item.totalPrice !== undefined && Number(item.totalPrice) > 0
                            ? Number(item.totalPrice)
                            : qty * uPrice;

                        return (
                          <tr key={item.id || idx} className="min-h-[22px]">
                            <td className="border border-black px-1 py-1 text-center align-middle">
                              {startRowNum + idx + 1}
                            </td>
                            <td className="border border-black px-1.5 py-1 text-center align-middle break-all">
                              {item.materialCode}
                            </td>
                            <td className="border border-black px-2 py-1 text-left align-middle">
                              {item.materialName}
                            </td>
                            <td className="border border-black px-1.5 py-1 text-center align-middle break-words">
                              {getItemBatchDisplay(item)}
                            </td>
                            <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                              {formatQty(qty)}
                            </td>
                            <td className="border border-black px-1 py-1 text-center align-middle">
                              {item.unit}
                            </td>
                            <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                              {formatWeightKg(item.weightKg)}
                            </td>
                            <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                              {formatMoneyOrDash(uPrice)}
                            </td>
                            <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                              {formatMoneyOrDash(tPrice)}
                            </td>
                            <td className="border border-black px-1.5 py-1 text-left align-middle">
                              {getInboundItemNote(item)}
                            </td>
                          </tr>
                        );
                      })}
                      {blankRowsArray.map((bIdx) => (
                        <tr key={`blank-in-${bIdx}`} className="h-[21px]">
                          <td className="border border-black px-1 py-0.5 text-center align-middle">
                            {startRowNum + visibleItems.length + bIdx + 1}
                          </td>
                          <td className="border border-black px-1.5 py-0.5" />
                          <td className="border border-black px-2 py-0.5" />
                          <td className="border border-black px-1.5 py-0.5" />
                          <td className="border border-black px-1.5 py-0.5" />
                          <td className="border border-black px-1 py-0.5" />
                          <td className="border border-black px-1.5 py-0.5" />
                          <td className="border border-black px-1.5 py-0.5 text-right align-middle">-</td>
                          <td className="border border-black px-1.5 py-0.5 text-right align-middle">-</td>
                          <td className="border border-black px-1.5 py-0.5" />
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold border-t-[1.5px] border-black h-[34px]">
                        <td className="border border-black px-1 py-1.5" />
                        <td className="border border-black px-1 py-1.5 text-center uppercase whitespace-nowrap align-middle">
                          TỔNG CỘNG
                        </td>
                        <td className="border border-black px-2 py-1.5" />
                        <td className="border border-black px-1.5 py-1.5" />
                        <td className="border border-black px-1.5 py-1.5 text-right tabular-nums align-middle">
                          {formatTotalQtyOrDash(totals.totalQty)}
                        </td>
                        <td className="border border-black px-1 py-1.5" />
                        <td className="border border-black px-1.5 py-1.5 text-right tabular-nums align-middle">
                          {formatWeightKg(totals.totalWeight)}
                        </td>
                        <td className="border border-black px-1.5 py-1.5" />
                        <td className="border border-black px-1.5 py-1.5 text-right tabular-nums align-middle">
                          {formatMoneyOrDash(totals.totalAmount)}
                        </td>
                        <td className="border border-black px-1.5 py-1.5" />
                      </tr>
                    </tfoot>
                  </table>
                ) : (
                  /* BẢNG PHIẾU XUẤT KHO (8 CỘT - QN-OPR-PR11-FM06) */
                  <table className="vtp-voucher-table w-full min-w-[640px] print:min-w-0 border-collapse border-[1.5px] border-black text-[11.5px] leading-snug">
                    <thead>
                      <tr className="font-bold text-center border-b-[1.5px] border-black h-[36px]">
                        <th className="border border-black px-1 py-1 w-[36px]">STT</th>
                        <th className="border border-black px-1.5 py-1 w-[98px]">Mã vật tư</th>
                        <th className="border border-black px-2 py-1">Tên vật tư</th>
                        <th className="border border-black px-1.5 py-1 w-[94px]">Mã lô</th>
                        <th className="border border-black px-1.5 py-1 w-[74px]">
                          Số lượng
                          <br />
                          (cây/tấm)
                        </th>
                        <th className="border border-black px-1 py-1 w-[46px]">ĐVT</th>
                        <th className="border border-black px-1.5 py-1 w-[86px]">
                          Khối lượng
                          <br />
                          (Kg)
                        </th>
                        <th className="border border-black px-1.5 py-1 w-[78px]">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((item: any, idx: number) => (
                        <tr key={item.id || idx} className="min-h-[22px]">
                          <td className="border border-black px-1 py-1 text-center align-middle">
                            {startRowNum + idx + 1}
                          </td>
                          <td className="border border-black px-1.5 py-1 text-center align-middle break-all">
                            {item.materialCode}
                          </td>
                          <td className="border border-black px-2 py-1 text-left align-middle">
                            {item.materialName}
                          </td>
                          <td className="border border-black px-1.5 py-1 text-center align-middle break-words">
                            {getItemBatchDisplay(item)}
                          </td>
                          <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                            {formatQty(item.quantity)}
                          </td>
                          <td className="border border-black px-1 py-1 text-center align-middle">
                            {item.unit}
                          </td>
                          <td className="border border-black px-1.5 py-1 text-right align-middle tabular-nums">
                            {formatWeightKg(item.weightKg)}
                          </td>
                          <td className="border border-black px-1.5 py-1 text-left align-middle">
                            {getOutboundItemNote(item)}
                          </td>
                        </tr>
                      ))}
                      {blankRowsArray.map((bIdx) => (
                        <tr key={`blank-out-${bIdx}`} className="h-[21px]">
                          <td className="border border-black px-1 py-0.5 text-center align-middle">
                            {startRowNum + visibleItems.length + bIdx + 1}
                          </td>
                          <td className="border border-black px-1.5 py-0.5" />
                          <td className="border border-black px-2 py-0.5" />
                          <td className="border border-black px-1.5 py-0.5" />
                          <td className="border border-black px-1.5 py-0.5" />
                          <td className="border border-black px-1 py-0.5" />
                          <td className="border border-black px-1.5 py-0.5" />
                          <td className="border border-black px-1.5 py-0.5" />
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold border-t-[1.5px] border-black h-[34px]">
                        <td className="border border-black px-1 py-1.5" />
                        <td className="border border-black px-1.5 py-1.5 text-center uppercase whitespace-nowrap align-middle">
                          TỔNG CỘNG
                        </td>
                        <td className="border border-black px-2 py-1.5" />
                        <td className="border border-black px-1.5 py-1.5" />
                        <td className="border border-black px-1.5 py-1.5 text-right tabular-nums align-middle">
                          {formatTotalQtyOrDash(totals.totalQty)}
                        </td>
                        <td className="border border-black px-1 py-1.5" />
                        <td className="border border-black px-1.5 py-1.5 text-right tabular-nums align-middle">
                          {formatWeightKg(totals.totalWeight)}
                        </td>
                        <td className="border border-black px-1.5 py-1.5" />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* 8. Phần ghi chú dưới bảng (chỉ có trên Phiếu Nhập Kho FM05.01) */}
              {isReceive && (
                <div className="mt-2.5 space-y-0.5 text-[11.5px] leading-relaxed">
                  <div>
                    <span>Viết bằng chữ : </span>
                    <span className="italic">{customAmountInWords}</span>
                  </div>
                  <div>
                    <span>Số chứng từ gốc kèm theo: </span>
                    <span>{customAttachedDocs}</span>
                  </div>
                  <div className="italic underline">
                    Note: Cột số lượng (cây/tấm), mã lô, chiều rộng, chiều dài chỉ áp dụng đối với vật tư chính.
                  </div>
                </div>
              )}

              {/* 9. Khối 4 chữ ký xác nhận */}
              <div className="vtp-signature-block grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-3 text-center text-[12.5px] mt-4 pb-20">
                <div>
                  <div className="font-bold">
                    {isReceive ? 'Người giao hàng' : 'Người nhận'}
                  </div>
                  <div className="italic text-[11.5px]">(Ký, ghi rõ họ tên)</div>
                </div>

                <div>
                  <div className="font-bold">
                    {isReceive ? 'Thủ kho/NV QLVT' : 'Thủ kho'}
                  </div>
                  <div className="italic text-[11.5px]">(Ký, ghi rõ họ tên)</div>
                </div>

                <div>
                  <div className="font-bold underline">P.TCKT</div>
                  <div className="italic text-[11.5px]">(Ký, ghi rõ họ tên)</div>
                </div>

                <div>
                  <div className="font-bold underline">Phê duyệt</div>
                  <div className="italic text-[11.5px]">(Ký, ghi rõ họ tên)</div>
                </div>
              </div>
            </div>

            {/* 10. Số trang ở chân trang chuẩn theo mẫu */}
            <div className="text-center text-[11.5px] pt-6">
              Page {safePage} of {totalPages}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

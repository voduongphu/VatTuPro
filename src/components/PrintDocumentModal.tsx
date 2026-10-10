import React from 'react';
import { InventoryTransaction, INBOUND_REASON_LABELS, OUTBOUND_REASON_LABELS, InboundReason, OutboundReason } from '../types/inventory';
import { formatVND, formatNumber, formatDate } from '../utils/formatters';
import { X, Printer } from 'lucide-react';

interface PrintDocumentModalProps {
  transaction: InventoryTransaction | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintDocumentModal: React.FC<PrintDocumentModalProps> = ({
  transaction,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !transaction) return null;

  const isInbound = transaction.type === 'INBOUND';
  const isAudit = transaction.type === 'AUDIT_ADJUSTMENT';

  const title = isInbound
    ? 'PHIẾU NHẬP KHO'
    : isAudit
    ? 'BIÊN BẢN ĐIỀU CHỈNH KIỂM KÊ KHO'
    : 'PHIẾU XUẤT KHO';

  const formCode = isInbound ? 'Mẫu số 01 - VT' : isAudit ? 'Mẫu số 05 - VT' : 'Mẫu số 02 - VT';

  const dateObj = new Date(transaction.date);
  const day = dateObj.getDate();
  const month = dateObj.getMonth() + 1;
  const year = dateObj.getFullYear();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden print-card">
        {/* Actions bar (hidden in print) */}
        <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 no-print">
          <span className="text-xs font-bold text-slate-800">
            Xem trước bản in: {transaction.code}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In chứng từ (A4)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Voucher Paper */}
        <div className="p-8 overflow-y-auto space-y-6 flex-1 bg-white text-slate-900">
          {/* Header & Standard Legal Form Marker */}
          <div className="flex justify-between items-start text-xs border-b border-slate-100 pb-4">
            <div>
              <p className="font-bold uppercase tracking-wider text-slate-900 text-sm">
                CÔNG TY CỔ PHẦN KỸ THUẬT & CÔNG NGHỆ
              </p>
              <p className="text-slate-600">Bộ phận: Phòng Quản lý Thiết bị & Vật tư</p>
              <p className="text-slate-600">Kho hàng: {transaction.warehouse}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-800">{formCode}</p>
              <p className="text-[11px] text-slate-500 italic">
                (Ban hành theo Thông tư số 200/2014/TT-BTC)
              </p>
              <p className="font-mono font-bold text-slate-900 mt-1">Số: {transaction.code}</p>
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold tracking-wide uppercase text-slate-900">
              {title}
            </h1>
            <p className="text-xs text-slate-600 italic">
              Ngày {day} tháng {month} năm {year}
            </p>
          </div>

          {/* Metadata lines */}
          <div className="text-xs space-y-1.5 text-slate-800">
            <div className="flex">
              <span className="w-48 text-slate-600">
                {isInbound ? 'Họ và tên người giao hàng:' : 'Họ và tên người nhận hàng:'}
              </span>
              <strong className="flex-1 font-semibold">{transaction.receiverOrSupplier}</strong>
            </div>

            <div className="flex">
              <span className="w-48 text-slate-600">Lý do / Mục đích:</span>
              <span className="flex-1 font-medium">
                {isInbound
                  ? INBOUND_REASON_LABELS[transaction.subReason as InboundReason] || transaction.subReason
                  : OUTBOUND_REASON_LABELS[transaction.subReason as OutboundReason] || transaction.subReason}
              </span>
            </div>

            {transaction.departmentOrProject && (
              <div className="flex">
                <span className="w-48 text-slate-600">Thuộc Dự án / Công trình:</span>
                <span className="flex-1 font-semibold text-slate-900">
                  {transaction.departmentOrProject}
                </span>
              </div>
            )}

            {transaction.projectItem && (
              <div className="flex">
                <span className="w-48 text-slate-600">Hạng mục công trình / Gói thầu:</span>
                <span className="flex-1 font-semibold text-indigo-900">
                  {transaction.projectItem}
                </span>
              </div>
            )}

            {transaction.packingListNo && (
              <div className="flex">
                <span className="w-48 text-slate-600">Số Packing List (P/L):</span>
                <span className="flex-1 font-mono font-bold text-blue-800">
                  {transaction.packingListNo}
                </span>
              </div>
            )}

            {transaction.shipment && (
              <div className="flex">
                <span className="w-48 text-slate-600">Lô hàng / Shipment / Chuyến tàu-xe:</span>
                <span className="flex-1 font-mono text-slate-800">
                  {transaction.shipment}
                </span>
              </div>
            )}

            <div className="flex">
              <span className="w-48 text-slate-600">
                {isInbound ? 'Nhập tại kho:' : 'Xuất tại kho:'}
              </span>
              <span className="flex-1 font-medium">{transaction.warehouse}</span>
            </div>

            {transaction.note && (
              <div className="flex">
                <span className="w-48 text-slate-600">Ghi chú / Căn cứ:</span>
                <span className="flex-1 italic">{transaction.note}</span>
              </div>
            )}
          </div>

          {/* Line items Table */}
          <div className="border border-slate-300 rounded overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-bold">
                  <th className="py-2.5 px-2.5 text-center w-8 border-r border-slate-300">STT</th>
                  <th className="py-2.5 px-3 border-r border-slate-300">
                    Tên, nhãn hiệu, quy cách vật tư & kiện hàng
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-300 whitespace-nowrap text-center">
                    Mã số
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-300 text-center w-14">
                    ĐVT
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-300 text-right w-20">
                    Số lượng
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-300 text-right w-28">
                    Đơn giá (VNĐ)
                  </th>
                  <th className="py-2.5 px-3 text-right w-32">Thành tiền (VNĐ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {transaction.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2 px-2.5 text-center text-slate-500 border-r border-slate-200">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 font-sans font-medium text-slate-900 border-r border-slate-200">
                      <div className="font-semibold">{item.itemName}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-600 mt-0.5 font-sans">
                        {item.manufacturer && <span>Hãng: {item.manufacturer}</span>}
                        {item.packageNo && <span className="font-mono">Kiện: {item.packageNo} {item.packageName ? `(${item.packageName})` : ''}</span>}
                        {item.packingListNo && <span className="font-mono text-blue-700">PL: {item.packingListNo}</span>}
                        {item.serialNumber && <span className="font-mono">SN: {item.serialNumber}</span>}
                        {item.lotNumber && <span className="font-mono">Lô: {item.lotNumber}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center border-r border-slate-200 font-bold text-slate-800">
                      {item.itemCode}
                    </td>
                    <td className="py-2 px-2.5 text-center font-sans text-slate-700 border-r border-slate-200">
                      {item.unit}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900 border-r border-slate-200">
                      {formatNumber(item.quantity)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-700 border-r border-slate-200">
                      {formatVND(item.unitPrice)}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">
                      {formatVND(item.totalPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-mono font-bold text-slate-900 border-t border-slate-300">
                  <td colSpan={4} className="py-2.5 px-3 font-sans text-right">
                    Tổng cộng:
                  </td>
                  <td className="py-2.5 px-3 text-right border-r border-slate-200">
                    {formatNumber(transaction.items.reduce((s, it) => s + it.quantity, 0))}
                  </td>
                  <td className="py-2.5 px-3 border-r border-slate-200" />
                  <td className="py-2.5 px-3 text-right text-base text-slate-950">
                    {formatVND(transaction.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Amount In Words */}
          <div className="text-xs text-slate-700">
            <span>Tổng số tiền (viết bằng chữ): </span>
            <span className="font-semibold italic">
              {transaction.totalAmount > 0
                ? `${formatVND(transaction.totalAmount)} (Đồng Việt Nam)`
                : 'Không đồng'}
            </span>
          </div>

          {/* Signatures Block */}
          <div className="grid grid-cols-4 gap-4 pt-6 text-center text-xs text-slate-800">
            <div>
              <p className="font-bold">Người lập phiếu</p>
              <p className="text-[10px] text-slate-400 italic">(Ký, họ tên)</p>
              <div className="h-16 flex items-end justify-center">
                <span className="font-medium text-slate-700">{transaction.creator}</span>
              </div>
            </div>

            <div>
              <p className="font-bold">
                {isInbound ? 'Người giao hàng' : 'Người nhận hàng'}
              </p>
              <p className="text-[10px] text-slate-400 italic">(Ký, họ tên)</p>
              <div className="h-16 flex items-end justify-center">
                <span className="font-medium text-slate-700">{transaction.receiverOrSupplier}</span>
              </div>
            </div>

            <div>
              <p className="font-bold">Thủ kho</p>
              <p className="text-[10px] text-slate-400 italic">(Ký, họ tên)</p>
              <div className="h-16 flex items-end justify-center">
                <span className="font-medium text-slate-700">Nguyễn Văn Hùng</span>
              </div>
            </div>

            <div>
              <p className="font-bold">Kế toán trưởng / Phụ trách</p>
              <p className="text-[10px] text-slate-400 italic">(Ký, họ tên)</p>
              <div className="h-16 flex items-end justify-center">
                <span className="font-medium text-slate-700">Trần Thị Mai</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

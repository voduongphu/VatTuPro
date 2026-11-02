import React, { useState, useEffect, useMemo } from 'react';
import { InboundReceipt, OutboundReceipt } from '../../types/inventory';
import { Printer, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ReceiptPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  inbound?: InboundReceipt | null;
  outbound?: OutboundReceipt | null;
}

const PRINT_PAGE_SIZE = 200;

export const ReceiptPrintModal: React.FC<ReceiptPrintModalProps> = ({
  isOpen,
  onClose,
  inbound,
  outbound
}) => {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [inbound?.id, outbound?.id, isOpen]);

  const items = (inbound ? inbound.items : outbound?.items) || [];
  const totalPages = Math.max(1, Math.ceil(items.length / PRINT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const visibleItems = useMemo(() => {
    const start = (safePage - 1) * PRINT_PAGE_SIZE;
    return items.slice(start, start + PRINT_PAGE_SIZE);
  }, [items, safePage]);

  if (!isOpen || (!inbound && !outbound)) return null;

  const isReceive = Boolean(inbound);
  const title = isReceive ? 'PHIẾU NHẬP KHO VẬT TƯ THIẾT BỊ' : 'PHIẾU XUẤT KHO VẬT TƯ THIẾT BỊ';
  const code = isReceive ? inbound!.receiptCode : outbound!.issueCode;
  const date = isReceive ? inbound!.receiptDate : outbound!.issueDate;
  const warehouse = isReceive ? inbound!.warehouseName : outbound!.warehouseName;
  const startRowNum = (safePage - 1) * PRINT_PAGE_SIZE;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden">
        {/* Modal Toolbar (hidden when printing) */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 border-b border-slate-200 bg-slate-50 print:hidden">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
            <span className="font-bold text-slate-800 text-xs sm:text-sm">Xem Trước & In Phiếu</span>
            <span className="text-xs font-mono bg-slate-200 px-2 py-0.5 rounded text-slate-700">{code}</span>
            <span className="text-xs text-slate-500">
              ({items.length.toLocaleString('vi-VN')} mặt hàng)
            </span>
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
                  Phần {safePage}/{totalPages}
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
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition min-h-[40px]"
            >
              <Printer className="w-4 h-4" />
              <span>In Phiếu</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 rounded-xl text-slate-500 transition min-h-[40px]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-white font-sans text-slate-900 print:p-0">
          {/* Header of Voucher */}
          <div className="flex flex-col sm:flex-row print:flex-row justify-between items-start gap-2 border-b-2 border-slate-900 pb-4 mb-5 sm:mb-6">
            <div>
              <h2 className="font-extrabold text-sm sm:text-base tracking-wide text-slate-900 uppercase">
                CÔNG TY CỔ PHẦN QUẢN LÝ DỰ ÁN & KHO VẬN CÔNG NGHIỆP
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">Địa chỉ: KCN Cát Lái 2, TP. Thủ Đức, TP. Hồ Chí Minh</p>
              <p className="text-xs text-slate-600">Hotline: (028) 3888 9999 | Email: logistics@kho-vattu.vn</p>
            </div>
            <div className="sm:text-right print:text-right text-xs">
              <div className="font-bold text-slate-800">Mẫu số: 01-VT/KT</div>
              <div className="text-slate-500 text-[11px]">(Ban hành theo TT 200/2014/TT-BTC)</div>
              <div className="mt-1 font-mono font-bold text-slate-900 text-sm">Số: {code}</div>
            </div>
          </div>

          <div className="text-center my-4">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-wider uppercase">{title}</h1>
            <p className="text-xs text-slate-600 mt-1 italic">
              Ngày lập phiếu: {new Date(date).toLocaleDateString('vi-VN')}
              {totalPages > 1 ? ` — Phần ${safePage}/${totalPages}` : ''}
            </p>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-x-8 gap-y-2 text-xs mb-6 bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-slate-500">Kho lưu trữ / xuất:</span>{' '}
              <strong className="text-slate-900">{warehouse}</strong>
            </div>
            <div>
              <span className="text-slate-500">{isReceive ? 'Người giao hàng:' : 'Người nhận hàng:'}</span>{' '}
              <strong className="text-slate-900">{isReceive ? inbound?.delivererName : outbound?.recipientName}</strong>
            </div>

            {isReceive ? (
              <>
                <div>
                  <span className="text-slate-500">Nhà cung cấp:</span>{' '}
                  <strong className="text-slate-900">{inbound?.supplier}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Nhà sản xuất:</span>{' '}
                  <strong className="text-slate-900">{inbound?.manufacturer || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Số Packing List:</span>{' '}
                  <strong className="text-blue-700 font-mono">{inbound?.packingListNo}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Shipment / Vận đơn:</span>{' '}
                  <strong className="text-indigo-700 font-mono">{inbound?.shipment}</strong>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-slate-500">Dự án / Công trình:</span>{' '}
                  <strong className="text-slate-900">{outbound?.projectName || 'Dự án chính'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Đơn vị / Đội thi công nhận:</span>{' '}
                  <strong className="text-slate-900">{outbound?.recipientDepartment}</strong>
                </div>
              </>
            )}

            <div className="sm:col-span-2 print:col-span-2">
              <span className="text-slate-500">Ghi chú:</span>{' '}
              <span className="text-slate-800 italic">{isReceive ? inbound?.notes : outbound?.notes || 'Không'}</span>
            </div>
          </div>

          {/* Detail Items Table */}
          <div className="overflow-x-auto print:overflow-visible mb-6">
            <table className="w-full min-w-[720px] print:min-w-0 text-xs text-left border-collapse border border-slate-300">
            <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <tr>
                <th className="border border-slate-300 p-2 text-center w-8">STT</th>
                <th className="border border-slate-300 p-2">Số Packing List</th>
                <th className="border border-slate-300 p-2">Shipment</th>
                <th className="border border-slate-300 p-2">Số kiện / Tên kiện</th>
                <th className="border border-slate-300 p-2">Mã & Tên Vật Tư Thiết Bị</th>
                <th className="border border-slate-300 p-2">Hạng mục / Bản vẽ</th>
                <th className="border border-slate-300 p-2 text-center">ĐVT</th>
                <th className="border border-slate-300 p-2 text-right">Số Lượng</th>
                <th className="border border-slate-300 p-2 text-right">Khối Lượng (kg)</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, idx) => (
                <tr key={item.id || idx} className="border-b border-slate-200">
                  <td className="border border-slate-300 p-2 text-center">{(startRowNum + idx + 1).toLocaleString('vi-VN')}</td>
                  <td className="border border-slate-300 p-2 font-mono font-medium">{item.packingListNo}</td>
                  <td className="border border-slate-300 p-2 font-mono">{item.shipment}</td>
                  <td className="border border-slate-300 p-2">
                    <span className="font-semibold block">{item.packageNo}</span>
                    <span className="text-[11px] text-slate-500">{item.packageName}</span>
                  </td>
                  <td className="border border-slate-300 p-2">
                    <span className="font-semibold block text-slate-900">{item.materialName}</span>
                    <span className="text-[11px] font-mono text-slate-500">{item.materialCode}</span>
                  </td>
                  <td className="border border-slate-300 p-2">
                    <div>{item.category}</div>
                    <div className="font-mono text-indigo-700 text-[11px]">{item.drawingNo}</div>
                  </td>
                  <td className="border border-slate-300 p-2 text-center">{item.unit}</td>
                  <td className="border border-slate-300 p-2 text-right font-bold">
                    {Number(item.quantity)?.toLocaleString('vi-VN')}
                  </td>
                  <td className="border border-slate-300 p-2 text-right font-mono font-medium">
                    {Number(item.weightKg)?.toLocaleString('vi-VN')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-300">
              <tr>
                <td colSpan={7} className="border border-slate-300 p-2 text-right uppercase">
                  Tổng Cộng Toàn Phiếu ({items.length.toLocaleString('vi-VN')} dòng):
                </td>
                <td className="border border-slate-300 p-2 text-right font-mono text-blue-700">
                  {((isReceive ? inbound?.totalQuantity : outbound?.totalQuantity) || 0).toLocaleString('vi-VN')}
                </td>
                <td className="border border-slate-300 p-2 text-right font-mono text-blue-700">
                  {((isReceive ? inbound?.totalWeightKg : outbound?.totalWeightKg) || 0).toLocaleString('vi-VN')} kg
                </td>
              </tr>
            </tfoot>
          </table>
          </div>

          {/* Signature Sign-offs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 print:grid-cols-4 gap-4 text-center text-xs mt-8 sm:mt-10 pt-4">
            <div>
              <div className="font-bold text-slate-800">Người Lập Phiếu</div>
              <div className="text-[11px] text-slate-400 italic">(Ký, họ tên)</div>
              <div className="h-14 sm:h-16"></div>
              <div className="font-semibold text-slate-900">{isReceive ? inbound?.createdBy : outbound?.createdBy}</div>
            </div>
            <div>
              <div className="font-bold text-slate-800">{isReceive ? 'Người Giao Hàng' : 'Người Nhận Hàng'}</div>
              <div className="text-[11px] text-slate-400 italic">(Ký, họ tên)</div>
              <div className="h-14 sm:h-16"></div>
              <div className="font-semibold text-slate-900">{isReceive ? inbound?.delivererName : outbound?.recipientName}</div>
            </div>
            <div>
              <div className="font-bold text-slate-800">Thủ Kho Quản Lý</div>
              <div className="text-[11px] text-slate-400 italic">(Ký, họ tên)</div>
              <div className="h-14 sm:h-16"></div>
              <div className="font-semibold text-slate-900">Võ Dương Phú</div>
            </div>
            <div>
              <div className="font-bold text-slate-800">Giám Đốc / Ban Quản Lý</div>
              <div className="text-[11px] text-slate-400 italic">(Ký, đóng dấu)</div>
              <div className="h-14 sm:h-16"></div>
              <div className="font-semibold text-slate-900">Đã Duyệt</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

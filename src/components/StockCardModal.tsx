import React from 'react';
import {
  X,
  FileSpreadsheet,
  Download,
  Warehouse as WarehouseIcon,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  exportToCSV,
  formatCurrency,
  formatDateTime,
  formatNumber,
  getItemTypeLabel,
  getStockStatus,
  getStockStatusLabel,
  getSubtypeLabel,
} from '../utils/formatters';

interface StockCardModalProps {
  itemId: string | null;
  onClose: () => void;
}

export const StockCardModal: React.FC<StockCardModalProps> = ({ itemId, onClose }) => {
  const { items, warehouses, getItemLedger } = useInventory();

  if (!itemId) return null;

  const item = items.find(i => i.id === itemId);
  if (!item) return null;

  const wh = warehouses.find(w => w.id === item.warehouseId);
  const ledger = getItemLedger(item.id);
  const status = getStockStatus(item);

  const handleExportCard = () => {
    const headers = [
      'Ngày Giao Dịch',
      'Số Phiếu Chứng Từ',
      'Loại Nghiệp Vụ',
      'Đối Tác / Người Nhận / Dự Án',
      'Số Lượng Nhập',
      'Số Lượng Xuất',
      'Tồn Lũy Kế',
      'Đơn Giá (VNĐ)',
      'Ghi Chú',
    ];

    const rows = ledger.map(l => [
      formatDateTime(l.date),
      l.transactionCode,
      getSubtypeLabel(l.subtype),
      `${l.partner} (${l.departmentOrProject})`,
      l.inQty || '',
      l.outQty || '',
      l.balanceQty,
      l.unitPrice,
      l.notes,
    ]);

    exportToCSV(`The_Kho_${item.code}_${new Date().toISOString().substring(0, 10)}`, headers, rows);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                {item.code}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {getItemTypeLabel(item.type)} &bull; {item.category}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">{item.name}</h2>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
              <WarehouseIcon className="w-3.5 h-3.5 text-slate-400" />
              <span>{wh?.name}</span>
              <span aria-hidden="true">&bull;</span>
              <span>Vị trí: {item.location || 'Chưa định vị'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Thẻ Kho</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stock Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-white border-b border-slate-100 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block mb-0.5">Tồn kho hiện tại</span>
            <div className="text-base font-bold text-slate-900 tabular-nums">
              {formatNumber(item.currentStock)} {item.unit}
            </div>
            <span className="text-[11px] text-slate-500">{getStockStatusLabel(status)}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block mb-0.5">Định mức an toàn</span>
            <div className="text-base font-bold text-slate-800 tabular-nums">
              {item.minStock} - {item.maxStock} {item.unit}
            </div>
            <span className="text-[11px] text-slate-500">Mức min - max</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block mb-0.5">Đơn giá vốn bình quân</span>
            <div className="text-base font-bold text-slate-800 tabular-nums">
              {formatCurrency(item.unitPrice)}
            </div>
            <span className="text-[11px] text-slate-500">Trên 1 {item.unit}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-slate-400 block mb-0.5">Tổng giá trị tồn kho</span>
            <div className="text-base font-bold text-indigo-700 tabular-nums">
              {formatCurrency(item.currentStock * item.unitPrice)}
            </div>
            <span className="text-[11px] text-slate-500">Vốn hàng hóa</span>
          </div>
        </div>

        {/* Chronological Ledger Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-2 text-xs font-semibold text-slate-700">
            Nhật Ký Biến Động Nhập - Xuất - Tồn Lũy Kế ({ledger.length} giao dịch)
          </div>

          {ledger.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Chưa có giao dịch nhập xuất nào được ghi nhận cho mặt hàng này.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <th className="py-2.5 px-3">Thời gian</th>
                    <th className="py-2.5 px-3">Số chứng từ</th>
                    <th className="py-2.5 px-3">Nghiệp vụ</th>
                    <th className="py-2.5 px-3">Đối tác / Dự án</th>
                    <th className="py-2.5 px-3 text-right text-emerald-700">Nhập (+)</th>
                    <th className="py-2.5 px-3 text-right text-amber-700">Xuất (-)</th>
                    <th className="py-2.5 px-3 text-right font-bold text-slate-900">Tồn sau GD</th>
                    <th className="py-2.5 px-3">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap tabular-nums">
                        {formatDateTime(entry.date)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            entry.type === 'NHAP_KHO' ? 'text-emerald-700' : 'text-amber-800'
                          }
                        >
                          {entry.transactionCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {getSubtypeLabel(entry.subtype)}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate" title={`${entry.partner} - ${entry.departmentOrProject}`}>
                        <span className="font-medium text-slate-800">{entry.partner}</span>
                        <span className="text-slate-400 block text-[11px] truncate">
                          {entry.departmentOrProject}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-emerald-700">
                        {entry.inQty > 0 ? `+${formatNumber(entry.inQty)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-amber-700">
                        {entry.outQty > 0 ? `-${formatNumber(entry.outQty)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-50/60">
                        {formatNumber(entry.balanceQty)} {item.unit}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-[160px] truncate" title={entry.notes}>
                        {entry.notes || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
          >
            Đóng thẻ kho
          </button>
        </div>
      </div>
    </div>
  );
};

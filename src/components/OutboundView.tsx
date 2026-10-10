import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import {
  InventoryTransaction,
  OUTBOUND_REASON_LABELS,
  OutboundReason,
} from '../types/inventory';
import { formatVND, formatDate, exportToCSV } from '../utils/formatters';
import {
  Plus,
  Search,
  Printer,
  Download,
  ArrowUpRight,
} from 'lucide-react';

interface OutboundViewProps {
  onOpenCreateModal: () => void;
  onViewPrint: (transaction: InventoryTransaction) => void;
}

export const OutboundView: React.FC<OutboundViewProps> = ({
  onOpenCreateModal,
  onViewPrint,
}) => {
  const { transactions, warehouses } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWh, setSelectedWh] = useState('ALL');
  const [selectedReason, setSelectedReason] = useState('ALL');

  const outboundTransactions = transactions.filter(t => t.type === 'OUTBOUND');

  const filteredTransactions = outboundTransactions.filter(t => {
    if (selectedWh !== 'ALL' && t.warehouse !== selectedWh) return false;
    if (selectedReason !== 'ALL' && t.subReason !== selectedReason) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const match = `${t.code} ${t.receiverOrSupplier} ${t.departmentOrProject} ${t.creator} ${t.note}`.toLowerCase();
      const hasItem = t.items.some(
        it => it.itemName.toLowerCase().includes(q) || it.itemCode.toLowerCase().includes(q)
      );
      if (!match.includes(q) && !hasItem) return false;
    }
    return true;
  });

  const handleExportCSV = () => {
    const headers = [
      'Mã phiếu xuất',
      'Ngày xuất',
      'Mục đích / Lý do',
      'Số Packing List',
      'Lô hàng / Shipment',
      'Hạng mục công trình',
      'Kho xuất',
      'Đơn vị / Người nhận',
      'Dự án / Phòng ban',
      'Người lập phiếu',
      'Tổng tiền (VNĐ)',
      'Ghi chú',
    ];
    const rows = filteredTransactions.map(t => [
      t.code,
      t.date,
      OUTBOUND_REASON_LABELS[t.subReason as OutboundReason] || t.subReason,
      t.packingListNo || '',
      t.shipment || '',
      t.projectItem || '',
      t.warehouse,
      t.receiverOrSupplier,
      t.departmentOrProject,
      t.creator,
      t.totalAmount,
      t.note,
    ]);
    exportToCSV(`Danh_sach_Phieu_Xuat_Kho_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const totalAmountSum = filteredTransactions.reduce((acc, t) => acc + t.totalAmount, 0);

  return (
    <div className="space-y-4">
      {/* Header and Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo số phiếu, người nhận, dự án..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
            />
          </div>

          <select
            value={selectedWh}
            onChange={e => setSelectedWh(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-slate-800"
          >
            <option value="ALL">Tất cả kho xuất</option>
            {warehouses.map(w => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>

          <select
            value={selectedReason}
            onChange={e => setSelectedReason(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-slate-800"
          >
            <option value="ALL">Tất cả lý do xuất</option>
            {Object.entries(OUTBOUND_REASON_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Lập phiếu xuất kho</span>
          </button>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-3 whitespace-nowrap">Mã phiếu</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Ngày xuất</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Lý do xuất</th>
                <th className="py-2.5 px-3">Người / Đơn vị tiếp nhận</th>
                <th className="py-2.5 px-3">Dự án / Phòng ban</th>
                <th className="py-2.5 px-3">Chi tiết vật tư xuất</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Tổng giá trị</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">In / Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Chưa có phiếu xuất kho nào thỏa mãn điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(trans => (
                  <tr key={trans.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                      <div className="font-bold text-slate-900">{trans.code}</div>
                      {trans.packingListNo && (
                        <div className="text-[10px] text-blue-700 font-medium">PL: {trans.packingListNo}</div>
                      )}
                      {trans.shipment && (
                        <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{trans.shipment}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-600">
                      {formatDate(trans.date)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-700">
                      <div>{OUTBOUND_REASON_LABELS[trans.subReason as OutboundReason] || trans.subReason}</div>
                      {trans.projectItem && (
                        <div className="text-[11px] text-indigo-700 font-medium truncate max-w-[140px]">
                          {trans.projectItem}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800">
                      <div className="font-medium">{trans.receiverOrSupplier}</div>
                      <div className="text-[11px] text-slate-400">Người lập: {trans.creator}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {trans.departmentOrProject || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div className="space-y-0.5">
                        {trans.items.map((line, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-mono text-slate-800 font-semibold">
                              {line.itemCode}
                            </span>
                            <span>·</span>
                            <span className="truncate max-w-xs">{line.itemName}</span>
                            <span className="font-mono text-slate-900 font-bold">
                              x{line.quantity} {line.unit}
                            </span>
                            {line.packageNo && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                ({line.packageNo})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                      {formatVND(trans.totalAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => onViewPrint(trans)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>In phiếu</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="py-2.5 px-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div>
            Tổng số phiếu: <strong className="text-slate-900 font-mono">{filteredTransactions.length}</strong>
          </div>
          <div className="font-mono">
            Tổng giá trị xuất:{' '}
            <strong className="text-slate-900 text-sm">{formatVND(totalAmountSum)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

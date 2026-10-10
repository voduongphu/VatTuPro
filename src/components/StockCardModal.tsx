import React from 'react';
import { InventoryItem } from '../types/inventory';
import { useInventory } from '../context/InventoryContext';
import {
  formatVND,
  formatNumber,
  formatDate,
  exportToCSV,
} from '../utils/formatters';
import { X, Printer, Download, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface StockCardModalProps {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const StockCardModal: React.FC<StockCardModalProps> = ({
  item,
  isOpen,
  onClose,
}) => {
  const { transactions } = useInventory();

  if (!isOpen || !item) return null;

  // Filter all transactions containing this item, sorted chronologically ascending
  const itemTransactions = transactions
    .filter(t => t.items.some(line => line.itemId === item.id))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Compute running balance
  // We can calculate backwards from current stock, or forward
  // Let's compute delta forward
  let runningBalance = item.currentStock;
  // Calculate total in & out in historical list
  const totalInHistorical = itemTransactions
    .filter(t => t.type === 'INBOUND' || (t.type === 'AUDIT_ADJUSTMENT' && t.subReason === 'AUDIT_SURPLUS'))
    .reduce((sum, t) => {
      const line = t.items.find(l => l.itemId === item.id);
      return sum + (line?.quantity || 0);
    }, 0);

  const totalOutHistorical = itemTransactions
    .filter(t => t.type === 'OUTBOUND' || (t.type === 'AUDIT_ADJUSTMENT' && t.subReason === 'AUDIT_DEFICIT'))
    .reduce((sum, t) => {
      const line = t.items.find(l => l.itemId === item.id);
      return sum + (line?.quantity || 0);
    }, 0);

  // Initial balance before these recorded transactions
  const openingStock = Math.max(0, item.currentStock - totalInHistorical + totalOutHistorical);

  // Build rows with running balance
  let currentBalance = openingStock;
  const historyRows = itemTransactions.map(trans => {
    const line = trans.items.find(l => l.itemId === item.id);
    const qty = line?.quantity || 0;
    const isIn = trans.type === 'INBOUND' || trans.subReason === 'AUDIT_SURPLUS';

    if (isIn) {
      currentBalance += qty;
    } else {
      currentBalance -= qty;
    }

    return {
      date: trans.date,
      code: trans.code,
      type: trans.type,
      explanation: trans.note || (isIn ? 'Nhập kho hàng hóa' : 'Xuất kho sử dụng'),
      party: trans.receiverOrSupplier,
      inQty: isIn ? qty : 0,
      outQty: !isIn ? qty : 0,
      balance: currentBalance,
      unitPrice: line?.unitPrice || item.unitPrice,
    };
  });

  const handleExportCSV = () => {
    const headers = [
      'Ngày chứng từ',
      'Số hiệu chứng từ',
      'Diễn giải',
      'Đơn vị giao/nhận',
      'Số lượng Nhập',
      'Số lượng Xuất',
      'Tồn lũy kế',
      'Đơn vị tính',
    ];
    const rows = [
      [item.createdAt, 'SDDK', 'Số dư ban đầu', 'Kho vật tư', 0, 0, openingStock, item.unit],
      ...historyRows.map(r => [
        r.date,
        r.code,
        r.explanation,
        r.party,
        r.inQty,
        r.outQty,
        r.balance,
        item.unit,
      ]),
    ];
    exportToCSV(`The_Kho_${item.code}_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden print-card">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 no-print">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Thẻ Kho Chi Tiết (Stock Card)
            </h3>
            <p className="text-xs text-slate-500">
              Lịch sử biến động nhập xuất tồn chi tiết của mặt hàng theo chứng từ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In thẻ kho</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200 ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Card Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Card Meta */}
          <div className="text-center pb-2 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide">
              THẺ KHO VẬT TƯ - THIẾT BỊ
            </h2>
            <div className="text-xs text-slate-500 mt-1">
              Kho hàng: <strong className="text-slate-800">{item.warehouse}</strong> · Vị trí:{' '}
              <strong className="text-slate-800">{item.locationBin || 'Chưa định vị'}</strong>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Mã vật tư:</span>
              <strong className="font-mono text-slate-900 text-sm">{item.code}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Tên vật tư thiết bị:</span>
              <strong className="text-slate-900">{item.name}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Đơn vị tính:</span>
              <strong className="text-slate-900">{item.unit}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Tồn kho hiện thời:</span>
              <strong className="text-slate-900 font-mono text-sm">
                {formatNumber(item.currentStock)} {item.unit}
              </strong>
            </div>
            {item.manufacturer && (
              <div>
                <span className="text-slate-500 block">Nhà sản xuất (Hãng SX):</span>
                <strong className="text-slate-800">{item.manufacturer}</strong>
              </div>
            )}
            {item.projectItem && (
              <div>
                <span className="text-slate-500 block">Hạng mục công trình:</span>
                <strong className="text-indigo-800">{item.projectItem}</strong>
              </div>
            )}
            {item.packingListNo && (
              <div>
                <span className="text-slate-500 block">Số Packing List (P/L):</span>
                <strong className="text-blue-700 font-mono">{item.packingListNo}</strong>
              </div>
            )}
            {item.shipment && (
              <div>
                <span className="text-slate-500 block">Lô hàng / Shipment:</span>
                <strong className="text-slate-700 font-mono">{item.shipment}</strong>
              </div>
            )}
            {item.packageNo && (
              <div className="col-span-2">
                <span className="text-slate-500 block">Kiện hàng (Số & Tên kiện):</span>
                <strong className="text-slate-800 font-mono">
                  {item.packageNo} {item.packageName ? `· ${item.packageName}` : ''}
                </strong>
              </div>
            )}
          </div>

          {/* Ledger Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 whitespace-nowrap">Ngày tháng</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Số chứng từ</th>
                  <th className="py-2.5 px-3">Diễn giải nội dung</th>
                  <th className="py-2.5 px-3">Đối tác / Đơn vị</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Nhập (+)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Xuất (-)</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Tồn cuối</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {/* Initial Balance */}
                <tr className="bg-slate-50/60 text-slate-600">
                  <td className="py-2 px-3 font-sans text-slate-400">{formatDate(item.createdAt)}</td>
                  <td className="py-2 px-3 text-slate-500">DK-DAU-KY</td>
                  <td className="py-2 px-3 font-sans italic">Số dư đầu kỳ</td>
                  <td className="py-2 px-3 font-sans text-slate-400">—</td>
                  <td className="py-2 px-3 text-right text-slate-400">—</td>
                  <td className="py-2 px-3 text-right text-slate-400">—</td>
                  <td className="py-2 px-3 text-right font-bold text-slate-900">
                    {formatNumber(openingStock)}
                  </td>
                </tr>

                {historyRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                      Chưa phát sinh giao dịch nhập xuất nào trong kỳ đối với mặt hàng này.
                    </td>
                  </tr>
                ) : (
                  historyRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-3 whitespace-nowrap text-slate-600">
                        {formatDate(row.date)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap font-bold text-slate-900">
                        {row.code}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-700 max-w-xs truncate">
                        {row.explanation}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-600 max-w-[150px] truncate">
                        {row.party}
                      </td>
                      <td className="py-2 px-3 text-right text-emerald-700 font-semibold">
                        {row.inQty > 0 ? `+${formatNumber(row.inQty)}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-700 font-semibold">
                        {row.outQty > 0 ? `-${formatNumber(row.outQty)}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {formatNumber(row.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Signatures for Print */}
          <div className="grid grid-cols-3 gap-6 pt-8 text-center text-xs text-slate-700 print-only">
            <div>
              <p className="font-bold">Người lập thẻ</p>
              <p className="text-[10px] text-slate-400 italic">(Ký và ghi rõ họ tên)</p>
              <div className="h-16" />
            </div>
            <div>
              <p className="font-bold">Thủ kho</p>
              <p className="text-[10px] text-slate-400 italic">(Ký và ghi rõ họ tên)</p>
              <div className="h-16" />
            </div>
            <div>
              <p className="font-bold">Kế toán trưởng / Phụ trách</p>
              <p className="text-[10px] text-slate-400 italic">(Ký và ghi rõ họ tên)</p>
              <div className="h-16" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

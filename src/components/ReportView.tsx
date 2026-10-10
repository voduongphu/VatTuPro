import React, { useState, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import { formatVND, formatNumber, exportToCSV } from '../utils/formatters';
import { getItemStockStatus } from '../utils/filterEngine';
import {
  Download,
  Printer,
  Search,
  FileSpreadsheet,
  Calendar,
} from 'lucide-react';

export const ReportView: React.FC = () => {
  const { items, transactions, warehouses, categories, projectItems } = useInventory();

  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedProjectItem, setSelectedProjectItem] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Date range filters for periodic ledger
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // 1st of current month
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Compute Inbound & Outbound for each item within selected date window
  const reportRows = useMemo(() => {
    return items
      .filter(item => {
        if (selectedWarehouse !== 'ALL' && item.warehouse !== selectedWarehouse) return false;
        if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
        if (selectedProjectItem !== 'ALL' && item.projectItem !== selectedProjectItem) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const str = `${item.code} ${item.name} ${item.modelSpecs} ${item.packingListNo || ''} ${item.shipment || ''} ${item.manufacturer || ''} ${item.projectItem || ''} ${item.locationBin}`.toLowerCase();
          if (!str.includes(q)) return false;
        }
        return true;
      })
      .map(item => {
        // Transactions within date range
        const periodTransactions = transactions.filter(t => {
          if (!t.date) return false;
          return t.date >= startDate && t.date <= endDate;
        });

        // Transactions AFTER end date (to deduce end of period stock if viewing past dates)
        const afterTransactions = transactions.filter(t => t.date && t.date > endDate);

        // Sum In & Out within period
        let periodInQty = 0;
        let periodInAmount = 0;
        let periodOutQty = 0;
        let periodOutAmount = 0;

        periodTransactions.forEach(t => {
          const line = t.items.find(l => l.itemId === item.id);
          if (line) {
            if (t.type === 'INBOUND' || t.subReason === 'AUDIT_SURPLUS') {
              periodInQty += line.quantity;
              periodInAmount += line.totalPrice;
            } else {
              periodOutQty += line.quantity;
              periodOutAmount += line.totalPrice;
            }
          }
        });

        // Sum In & Out AFTER period
        let afterInQty = 0;
        let afterOutQty = 0;
        afterTransactions.forEach(t => {
          const line = t.items.find(l => l.itemId === item.id);
          if (line) {
            if (t.type === 'INBOUND' || t.subReason === 'AUDIT_SURPLUS') {
              afterInQty += line.quantity;
            } else {
              afterOutQty += line.quantity;
            }
          }
        });

        // Stock at end of chosen period
        const closingStock = item.currentStock - afterInQty + afterOutQty;
        // Stock at start of chosen period
        const openingStock = closingStock - periodInQty + periodOutQty;

        const openingAmount = openingStock * item.unitPrice;
        const closingAmount = closingStock * item.unitPrice;

        return {
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.category,
          unit: item.unit,
          unitPrice: item.unitPrice,
          warehouse: item.warehouse,
          minStock: item.minStock,
          maxStock: item.maxStock,
          manufacturer: item.manufacturer,
          projectItem: item.projectItem,
          packingListNo: item.packingListNo,
          openingStock: Math.max(0, openingStock),
          openingAmount: Math.max(0, openingAmount),
          inQty: periodInQty,
          inAmount: periodInAmount,
          outQty: periodOutQty,
          outAmount: periodOutAmount,
          closingStock: Math.max(0, closingStock),
          closingAmount: Math.max(0, closingAmount),
          stockStatus: getItemStockStatus(item),
        };
      });
  }, [items, transactions, selectedWarehouse, selectedCategory, selectedProjectItem, searchQuery, startDate, endDate]);

  // Aggregated Totals
  const totalOpeningValue = reportRows.reduce((sum, r) => sum + r.openingAmount, 0);
  const totalInValue = reportRows.reduce((sum, r) => sum + r.inAmount, 0);
  const totalOutValue = reportRows.reduce((sum, r) => sum + r.outAmount, 0);
  const totalClosingValue = reportRows.reduce((sum, r) => sum + r.closingAmount, 0);

  const handleExportCSV = () => {
    const headers = [
      'Mã vật tư',
      'Tên vật tư thiết bị',
      'Nhà sản xuất (Hãng SX)',
      'Hạng mục công trình',
      'Số Packing List',
      'Đơn vị tính',
      'Đơn giá vốn',
      'Tồn đầu kỳ (SL)',
      'Tồn đầu kỳ (Thành tiền)',
      'Nhập trong kỳ (SL)',
      'Nhập trong kỳ (Thành tiền)',
      'Xuất trong kỳ (SL)',
      'Xuất trong kỳ (Thành tiền)',
      'Tồn cuối kỳ (SL)',
      'Tồn cuối kỳ (Thành tiền)',
      'Kho lưu trữ',
    ];

    const rows = reportRows.map(r => [
      r.code,
      r.name,
      r.manufacturer || '',
      r.projectItem || '',
      r.packingListNo || '',
      r.unit,
      r.unitPrice,
      r.openingStock,
      r.openingAmount,
      r.inQty,
      r.inAmount,
      r.outQty,
      r.outAmount,
      r.closingStock,
      r.closingAmount,
      r.warehouse,
    ]);

    exportToCSV(`Bao_Cao_Nhap_Xuat_Ton_${startDate}_den_${endDate}`, headers, rows);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Filters & Actions Bar */}
      <div className="bg-white p-4 border border-slate-200 rounded-lg no-print space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Báo Cáo Tổng Hợp Nhập - Xuất - Tồn
            </h2>
            <p className="text-xs text-slate-500">
              Kiểm soát số dư đầu kỳ, biến động luân chuyển và tồn kho cuối kỳ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel / CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In báo cáo A4</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Từ ngày
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Đến ngày
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Kho hàng
            </label>
            <select
              value={selectedWarehouse}
              onChange={e => setSelectedWarehouse(e.target.value)}
              className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800"
            >
              <option value="ALL">Tất cả kho hàng</option>
              {warehouses.map(w => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Nhóm danh mục
            </label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800"
            >
              <option value="ALL">Tất cả nhóm</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Hạng mục công trình
            </label>
            <select
              value={selectedProjectItem}
              onChange={e => setSelectedProjectItem(e.target.value)}
              className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800"
            >
              <option value="ALL">Tất cả hạng mục</option>
              {projectItems.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Tìm kiếm
            </label>
            <input
              type="text"
              placeholder="Mã, tên, P/L, hãng..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards for the report */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 p-3.5 rounded-lg">
          <div className="text-[11px] text-slate-500 font-medium">Giá trị Tồn đầu kỳ</div>
          <div className="text-lg font-bold text-slate-900 font-mono mt-1">
            {formatVND(totalOpeningValue)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-3.5 rounded-lg">
          <div className="text-[11px] text-emerald-600 font-medium">Tổng giá trị Nhập (+)</div>
          <div className="text-lg font-bold text-emerald-800 font-mono mt-1">
            {formatVND(totalInValue)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-3.5 rounded-lg">
          <div className="text-[11px] text-amber-600 font-medium">Tổng giá trị Xuất (-)</div>
          <div className="text-lg font-bold text-amber-800 font-mono mt-1">
            {formatVND(totalOutValue)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-3.5 rounded-lg">
          <div className="text-[11px] text-slate-500 font-medium">Giá trị Tồn cuối kỳ</div>
          <div className="text-lg font-bold text-slate-900 font-mono mt-1">
            {formatVND(totalClosingValue)}
          </div>
        </div>
      </div>

      {/* Full Movement Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs print-card">
        {/* Printable Header */}
        <div className="p-4 text-center border-b border-slate-200 hidden print:block">
          <h2 className="text-lg font-bold text-slate-900 uppercase">
            BẢNG TỔNG HỢP NHẬP - XUẤT - TỒN VẬT TƯ THIẾT BỊ
          </h2>
          <div className="text-xs text-slate-600 mt-1">
            Kỳ báo cáo: Từ ngày {startDate} đến ngày {endDate}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 text-center w-10">
                  STT
                </th>
                <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 whitespace-nowrap">
                  Mã VT
                </th>
                <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 min-w-[200px]">
                  Tên vật tư & quy cách
                </th>
                <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 text-center w-14">
                  ĐVT
                </th>
                <th rowSpan={2} className="py-2.5 px-3 border-r border-slate-200 text-right whitespace-nowrap">
                  Đơn giá
                </th>
                <th colSpan={2} className="py-1.5 px-3 border-r border-slate-200 text-center bg-slate-200/50">
                  Tồn đầu kỳ
                </th>
                <th colSpan={2} className="py-1.5 px-3 border-r border-slate-200 text-center bg-emerald-50 text-emerald-900">
                  Nhập trong kỳ
                </th>
                <th colSpan={2} className="py-1.5 px-3 border-r border-slate-200 text-center bg-amber-50 text-amber-900">
                  Xuất trong kỳ
                </th>
                <th colSpan={2} className="py-1.5 px-3 text-center bg-slate-200/50">
                  Tồn cuối kỳ
                </th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-semibold">
                <th className="py-1.5 px-2 text-right border-r border-slate-200">SL</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">Thành tiền</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200 bg-emerald-50/50 text-emerald-800">
                  SL
                </th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200 bg-emerald-50/50 text-emerald-800">
                  Thành tiền
                </th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200 bg-amber-50/50 text-amber-800">
                  SL
                </th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200 bg-amber-50/50 text-amber-800">
                  Thành tiền
                </th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200 font-bold">SL</th>
                <th className="py-1.5 px-2 text-right font-bold">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {reportRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400 font-sans">
                    Không có vật tư nào trong kỳ báo cáo đã chọn.
                  </td>
                </tr>
              ) : (
                reportRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="py-2 px-2 text-center text-slate-400 border-r border-slate-100">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-2.5 font-bold text-slate-900 border-r border-slate-100 whitespace-nowrap">
                      {row.code}
                    </td>
                    <td className="py-2 px-2.5 font-sans border-r border-slate-100">
                      <div className="font-semibold text-slate-800">{row.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500 mt-0.5">
                        <span>{row.warehouse}</span>
                        {row.manufacturer && <span>· Hãng: {row.manufacturer}</span>}
                        {row.projectItem && <span className="text-indigo-700">· {row.projectItem}</span>}
                        {row.packingListNo && <span className="text-blue-700 font-mono">· PL: {row.packingListNo}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center font-sans text-slate-600 border-r border-slate-100">
                      {row.unit}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-700 border-r border-slate-100">
                      {formatVND(row.unitPrice)}
                    </td>

                    {/* Opening */}
                    <td className="py-2 px-2 text-right border-r border-slate-100">
                      {formatNumber(row.openingStock)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-600 border-r border-slate-100">
                      {formatVND(row.openingAmount)}
                    </td>

                    {/* In */}
                    <td className="py-2 px-2 text-right border-r border-slate-100 text-emerald-700 font-semibold bg-emerald-50/20">
                      {row.inQty > 0 ? formatNumber(row.inQty) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right border-r border-slate-100 text-emerald-700 bg-emerald-50/20">
                      {row.inAmount > 0 ? formatVND(row.inAmount) : '—'}
                    </td>

                    {/* Out */}
                    <td className="py-2 px-2 text-right border-r border-slate-100 text-amber-700 font-semibold bg-amber-50/20">
                      {row.outQty > 0 ? formatNumber(row.outQty) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right border-r border-slate-100 text-amber-700 bg-amber-50/20">
                      {row.outAmount > 0 ? formatVND(row.outAmount) : '—'}
                    </td>

                    {/* Closing */}
                    <td className="py-2 px-2 text-right border-r border-slate-100 font-bold text-slate-900">
                      {formatNumber(row.closingStock)}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-slate-900">
                      {formatVND(row.closingAmount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {/* Grand Total Row */}
            <tfoot>
              <tr className="bg-slate-100 font-mono font-bold text-slate-900 border-t-2 border-slate-300">
                <td colSpan={5} className="py-3 px-3 font-sans text-right">
                  TỔNG CỘNG TOÀN KHO:
                </td>
                <td className="py-3 px-2 text-right">
                  {formatNumber(reportRows.reduce((s, r) => s + r.openingStock, 0))}
                </td>
                <td className="py-3 px-2 text-right text-slate-800">
                  {formatVND(totalOpeningValue)}
                </td>
                <td className="py-3 px-2 text-right text-emerald-800">
                  {formatNumber(reportRows.reduce((s, r) => s + r.inQty, 0))}
                </td>
                <td className="py-3 px-2 text-right text-emerald-800">
                  {formatVND(totalInValue)}
                </td>
                <td className="py-3 px-2 text-right text-amber-800">
                  {formatNumber(reportRows.reduce((s, r) => s + r.outQty, 0))}
                </td>
                <td className="py-3 px-2 text-right text-amber-800">
                  {formatVND(totalOutValue)}
                </td>
                <td className="py-3 px-2 text-right">
                  {formatNumber(reportRows.reduce((s, r) => s + r.closingStock, 0))}
                </td>
                <td className="py-3 px-2 text-right text-slate-950">
                  {formatVND(totalClosingValue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Printable Signatures */}
        <div className="grid grid-cols-3 gap-6 pt-10 pb-6 px-6 text-center text-xs text-slate-700 hidden print:grid">
          <div>
            <p className="font-bold">Người lập biểu</p>
            <p className="text-[10px] text-slate-400 italic">(Ký, họ tên)</p>
            <div className="h-20" />
          </div>
          <div>
            <p className="font-bold">Thủ kho</p>
            <p className="text-[10px] text-slate-400 italic">(Ký, họ tên)</p>
            <div className="h-20" />
          </div>
          <div>
            <p className="font-bold">Kế toán trưởng / Ban giám đốc</p>
            <p className="text-[10px] text-slate-400 italic">(Ký, đóng dấu)</p>
            <div className="h-20" />
          </div>
        </div>
      </div>
    </div>
  );
};

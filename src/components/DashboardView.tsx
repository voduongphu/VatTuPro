import React, { useMemo, useState } from 'react';
import {
  Boxes,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Download,
  Warehouse as WarehouseIcon,
  PieChart,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  exportToCSV,
  formatCurrency,
  formatNumber,
  getItemTypeLabel,
  getStockStatus,
  getStockStatusLabel,
} from '../utils/formatters';

interface DashboardViewProps {
  onSelectStockCard: (itemId: string) => void;
  onOpenCreateTransaction: (type: 'NHAP_KHO' | 'XUAT_KHO') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectStockCard,
  onOpenCreateTransaction,
}) => {
  const { items, transactions, warehouses } = useInventory();
  const [selectedReportWarehouse, setSelectedReportWarehouse] = useState<string>('ALL');

  // KPI Calculations
  const totalItemsCount = items.length;
  const totalInventoryValue = items.reduce((acc, i) => acc + i.currentStock * i.unitPrice, 0);

  const lowStockItems = items.filter(i => {
    const st = getStockStatus(i);
    return st === 'CANH_BAO_THAP' || st === 'HET_HANG';
  });

  const equipmentOnLoan = items.filter(
    i => (i.type === 'THIET_BI' || i.type === 'CONG_CU') && i.condition === 'DANG_MUON'
  );

  const totalReceipts = transactions.filter(t => t.type === 'NHAP_KHO');
  const totalIssues = transactions.filter(t => t.type === 'XUAT_KHO');

  const totalReceiptValue = totalReceipts.reduce((acc, t) => acc + t.totalAmount, 0);
  const totalIssueValue = totalIssues.reduce((acc, t) => acc + t.totalAmount, 0);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    items.forEach(item => {
      const existing = map.get(item.category) || { count: 0, value: 0 };
      map.set(item.category, {
        count: existing.count + 1,
        value: existing.value + item.currentStock * item.unitPrice,
      });
    });

    const list = Array.from(map.entries()).map(([cat, val]) => ({
      category: cat,
      count: val.count,
      value: val.value,
      percentage: totalInventoryValue > 0 ? (val.value / totalInventoryValue) * 100 : 0,
    }));

    return list.sort((a, b) => b.value - a.value);
  }, [items, totalInventoryValue]);

  // Warehouse breakdown
  const warehouseBreakdown = useMemo(() => {
    return warehouses.map(wh => {
      const whItems = items.filter(i => i.warehouseId === wh.id);
      const whValue = whItems.reduce((acc, i) => acc + i.currentStock * i.unitPrice, 0);
      return {
        id: wh.id,
        name: wh.name,
        itemCount: whItems.length,
        totalValue: whValue,
        percentage: totalInventoryValue > 0 ? (whValue / totalInventoryValue) * 100 : 0,
      };
    });
  }, [warehouses, items, totalInventoryValue]);

  // Comprehensive In-Out-Stock (NXT) Report Data
  const nxtReportRows = useMemo(() => {
    return items
      .filter(item => (selectedReportWarehouse === 'ALL' ? true : item.warehouseId === selectedReportWarehouse))
      .map(item => {
        // Compute in and out from transactions
        let totalIn = 0;
        let totalOut = 0;

        transactions.forEach(trx => {
          const line = trx.items.find(l => l.itemId === item.id);
          if (line) {
            if (trx.type === 'NHAP_KHO') totalIn += line.quantity;
            if (trx.type === 'XUAT_KHO') totalOut += line.quantity;
          }
        });

        // Opening balance approximation
        const closingStock = item.currentStock;
        const openingStock = Math.max(0, closingStock - totalIn + totalOut);
        const closingValue = closingStock * item.unitPrice;
        const wh = warehouses.find(w => w.id === item.warehouseId);

        return {
          id: item.id,
          code: item.code,
          name: item.name,
          type: item.type,
          unit: item.unit,
          warehouseName: wh?.name || item.warehouseId,
          openingStock,
          totalIn,
          totalOut,
          closingStock,
          unitPrice: item.unitPrice,
          closingValue,
          status: getStockStatus(item),
        };
      });
  }, [items, transactions, selectedReportWarehouse, warehouses]);

  // Export report to CSV
  const handleExportNXT = () => {
    const headers = [
      'Mã Vật Tư/Thiết Bị',
      'Tên Vật Tư Thiết Bị',
      'Phân Loại',
      'ĐVT',
      'Kho Lưu Trữ',
      'Tồn Đầu Kỳ',
      'Nhập Trong Kỳ',
      'Xuất Trong Kỳ',
      'Tồn Cuối Kỳ',
      'Đơn Giá Vốn (VNĐ)',
      'Thành Tiền Tồn (VNĐ)',
      'Tình Trạng Tồn Kho',
    ];

    const rows = nxtReportRows.map(row => [
      row.code,
      row.name,
      getItemTypeLabel(row.type),
      row.unit,
      row.warehouseName,
      row.openingStock,
      row.totalIn,
      row.totalOut,
      row.closingStock,
      row.unitPrice,
      row.closingValue,
      getStockStatusLabel(row.status),
    ]);

    exportToCSV(`Bao_Cao_Nhap_Xuat_Ton_${new Date().toISOString().substring(0, 10)}`, headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Tổng giá trị tồn kho</span>
            <Boxes className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatCurrency(totalInventoryValue)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <span className="font-semibold text-slate-700 tabular-nums">{totalItemsCount}</span>
            <span>danh mục vật tư thiết bị</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Cảnh báo thiếu hụt</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 tabular-nums">
            {lowStockItems.length}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <span>Dưới định mức min hoặc hết tồn kho</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Thiết bị đang thi công/mượn</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {equipmentOnLoan.length}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <span>Máy móc, công cụ tại các công trường</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Lưu chuyển trong kỳ</span>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="w-2 h-2 rounded-full bg-amber-500" />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <span className="text-xs text-emerald-700 block">Nhập ({totalReceipts.length})</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">
                {formatCurrency(totalReceiptValue)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-amber-700 block">Xuất ({totalIssues.length})</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">
                {formatCurrency(totalIssueValue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Distribution Section: Categories & Warehouses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Breakdown (2 columns) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Phân bổ giá trị theo danh mục vật tư
              </h3>
              <p className="text-xs text-slate-500">Tỷ trọng vốn lưu động tại kho</p>
            </div>
            <PieChart className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-3.5">
            {categoryBreakdown.map(cat => (
              <div key={cat.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 truncate pr-2">
                    {cat.category}
                  </span>
                  <div className="flex items-center gap-3 shrink-0 tabular-nums">
                    <span className="text-slate-500">{cat.count} mặt hàng</span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(cat.value)}
                    </span>
                    <span className="w-12 text-right text-slate-400">
                      {cat.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Warehouse Breakdown (1 column) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Tồn kho theo Chi nhánh & Dự án
              </h3>
              <p className="text-xs text-slate-500">Tổng quan từng địa điểm</p>
            </div>
            <WarehouseIcon className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-4">
            {warehouseBreakdown.map(wh => (
              <div
                key={wh.id}
                className="p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 truncate" title={wh.name}>
                    {wh.name}
                  </span>
                  <span className="text-xs font-bold text-slate-900 tabular-nums">
                    {wh.percentage.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{wh.itemCount} danh mục lưu trữ</span>
                  <span className="font-medium text-indigo-700 tabular-nums">
                    {formatCurrency(wh.totalValue)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{ width: `${Math.max(wh.percentage, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comprehensive In-Out-Stock (NXT) Ledger Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Báo cáo Tổng hợp Nhập - Xuất - Tồn (NXT)
            </h3>
            <p className="text-xs text-slate-500">
              Chi tiết luân chuyển đầu kỳ, nhập, xuất và số dư cuối kỳ theo từng mặt hàng
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Warehouse Filter */}
            <select
              value={selectedReportWarehouse}
              onChange={e => setSelectedReportWarehouse(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 outline-none text-slate-700 font-medium"
            >
              <option value="ALL">Tất cả kho ({warehouses.length})</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            {/* Export CSV button */}
            <button
              onClick={handleExportNXT}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel/CSV</span>
            </button>
          </div>
        </div>

        {/* The Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Mã SKU</th>
                <th className="py-3 px-4">Tên vật tư / thiết bị</th>
                <th className="py-3 px-3">ĐVT</th>
                <th className="py-3 px-3">Kho lưu</th>
                <th className="py-3 px-3 text-right">Tồn đầu</th>
                <th className="py-3 px-3 text-right text-emerald-700">Nhập kỳ</th>
                <th className="py-3 px-3 text-right text-amber-700">Xuất kỳ</th>
                <th className="py-3 px-3 text-right font-bold text-slate-900">Tồn cuối</th>
                <th className="py-3 px-3 text-right">Đơn giá vốn</th>
                <th className="py-3 px-4 text-right">Thành tiền tồn</th>
                <th className="py-3 px-4 text-center">Thẻ kho</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {nxtReportRows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                    {row.code}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900 min-w-[200px]">
                    <div className="line-clamp-1">{row.name}</div>
                    <div className="text-[11px] text-slate-400 font-normal">
                      {getItemTypeLabel(row.type)}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{row.unit}</td>
                  <td className="py-3 px-3 text-slate-600 whitespace-nowrap max-w-[140px] truncate" title={row.warehouseName}>
                    {row.warehouseName}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-600">
                    {formatNumber(row.openingStock)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium text-emerald-700 bg-emerald-50/30">
                    {row.totalIn > 0 ? `+${formatNumber(row.totalIn)}` : '-'}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium text-amber-700 bg-amber-50/30">
                    {row.totalOut > 0 ? `-${formatNumber(row.totalOut)}` : '-'}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-50/50">
                    {formatNumber(row.closingStock)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums text-slate-600 whitespace-nowrap">
                    {formatCurrency(row.unitPrice)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                    {formatCurrency(row.closingValue)}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <button
                      onClick={() => onSelectStockCard(row.id)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 hover:bg-indigo-50 px-2 py-1 rounded"
                    >
                      Xem thẻ kho
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/75 border-t-2 border-slate-300 font-semibold text-slate-900 text-xs">
                <td colSpan={4} className="py-3 px-4 uppercase">
                  Tổng cộng báo cáo ({nxtReportRows.length} mặt hàng)
                </td>
                <td className="py-3 px-3 text-right tabular-nums">
                  {formatNumber(nxtReportRows.reduce((a, b) => a + b.openingStock, 0))}
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-emerald-800">
                  +{formatNumber(nxtReportRows.reduce((a, b) => a + b.totalIn, 0))}
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-amber-800">
                  -{formatNumber(nxtReportRows.reduce((a, b) => a + b.totalOut, 0))}
                </td>
                <td className="py-3 px-3 text-right tabular-nums font-bold">
                  {formatNumber(nxtReportRows.reduce((a, b) => a + b.closingStock, 0))}
                </td>
                <td className="py-3 px-3 text-right text-slate-400">-</td>
                <td className="py-3 px-4 text-right tabular-nums font-bold text-indigo-700">
                  {formatCurrency(nxtReportRows.reduce((a, b) => a + b.closingValue, 0))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

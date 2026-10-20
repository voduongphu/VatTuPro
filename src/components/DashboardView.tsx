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
  TableProperties,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import * as XLSX from 'xlsx';
import {
  calculateItemWarehouseStocks,
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
  const [reportViewMode, setReportViewMode] = useState<'matrix' | 'nxt'>('matrix');

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

  // Warehouse breakdown with exact totalStock quantity and value per warehouse
  const warehouseBreakdown = useMemo(() => {
    return warehouses.map(wh => {
      let whTotalStock = 0;
      let whTotalValue = 0;
      let whItemCount = 0;

      items.forEach(item => {
        const stocks = calculateItemWarehouseStocks(item, warehouses, transactions);
        const qty = stocks[wh.id] || 0;
        if (qty > 0) {
          whTotalStock += qty;
          whTotalValue += qty * item.unitPrice;
          whItemCount += 1;
        }
      });

      return {
        id: wh.id,
        name: wh.name,
        code: wh.code,
        itemCount: whItemCount,
        totalStock: whTotalStock,
        totalValue: whTotalValue,
        percentage: totalInventoryValue > 0 ? (whTotalValue / totalInventoryValue) * 100 : 0,
      };
    });
  }, [warehouses, items, transactions, totalInventoryValue]);

  // 1. Multi-Warehouse Stock Matrix (Bảng phân bổ số lượng tồn chia theo từng kho)
  const warehouseMatrixRows = useMemo(() => {
    return items.map(item => {
      const stocks = calculateItemWarehouseStocks(item, warehouses, transactions);
      const totalStock = Object.values(stocks).reduce((a, b) => a + b, 0);
      const totalValue = totalStock * item.unitPrice;
      const status = getStockStatus({
        currentStock: totalStock,
        minStock: item.minStock,
        maxStock: item.maxStock,
      });

      return {
        id: item.id,
        code: item.code,
        name: item.name,
        type: item.type,
        category: item.category,
        unit: item.unit,
        location: item.location || 'Chưa xếp kệ',
        stocks,
        totalStock,
        unitPrice: item.unitPrice,
        totalValue,
        status,
      };
    }).filter(row => {
      if (selectedReportWarehouse === 'ALL') return true;
      return (row.stocks[selectedReportWarehouse] || 0) > 0;
    });
  }, [items, warehouses, transactions, selectedReportWarehouse]);

  // 2. Comprehensive In-Out-Stock (NXT) Report Data - Strictly Scoped by Kho
  const nxtReportRows = useMemo(() => {
    const rows: Array<{
      id: string;
      itemId: string;
      code: string;
      name: string;
      type: string;
      unit: string;
      location: string;
      warehouseId: string;
      warehouseName: string;
      openingStock: number;
      totalIn: number;
      totalOut: number;
      closingStock: number;
      unitPrice: number;
      closingValue: number;
      status: any;
    }> = [];

    const targetWarehouses =
      selectedReportWarehouse === 'ALL'
        ? warehouses
        : warehouses.filter(w => w.id === selectedReportWarehouse);

    targetWarehouses.forEach(wh => {
      items.forEach(item => {
        const stocks = calculateItemWarehouseStocks(item, warehouses, transactions);
        const closingStock = stocks[wh.id] || 0;

        let totalIn = 0;
        let totalOut = 0;

        transactions.forEach(trx => {
          if (trx.status === 'DA_HUY') return;
          if (trx.warehouseId !== wh.id) return;

          const matchingLines = trx.items.filter(
            l =>
              l.itemId === item.id ||
              (l.itemCode &&
                item.code &&
                l.itemCode.trim().toUpperCase() === item.code.trim().toUpperCase())
          );

          matchingLines.forEach(line => {
            if (trx.type === 'NHAP_KHO') totalIn += line.quantity;
            if (trx.type === 'XUAT_KHO') totalOut += line.quantity;
          });
        });

        // Only include in NXT report if this item has stock or activity in this warehouse
        if (closingStock > 0 || totalIn > 0 || totalOut > 0) {
          const openingStock = Math.max(0, closingStock - totalIn + totalOut);
          const closingValue = closingStock * item.unitPrice;

          rows.push({
            id: `${item.id}-${wh.id}`,
            itemId: item.id,
            code: item.code,
            name: item.name,
            type: item.type,
            unit: item.unit,
            location: item.location || 'Chưa xếp kệ',
            warehouseId: wh.id,
            warehouseName: wh.name,
            openingStock,
            totalIn,
            totalOut,
            closingStock,
            unitPrice: item.unitPrice,
            closingValue,
            status: getStockStatus({
              currentStock: closingStock,
              minStock: item.minStock,
              maxStock: item.maxStock,
            }),
          });
        }
      });
    });

    return rows;
  }, [items, transactions, selectedReportWarehouse, warehouses]);

  // Export report to genuine Excel (.xlsx) file with full multi-warehouse stock breakdown
  const handleExportExcel = () => {
    const selectedWhName =
      selectedReportWarehouse === 'ALL'
        ? 'Tat_Ca_Cac_Kho'
        : warehouses.find(w => w.id === selectedReportWarehouse)?.name?.replace(/\s+/g, '_') ||
          selectedReportWarehouse;

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Bảng tổng hợp số lượng tồn chia theo từng kho
    const matrixSheetData = warehouseMatrixRows.map((row, idx) => {
      const rowObj: Record<string, any> = {
        STT: idx + 1,
        'Mã SKU': row.code,
        'Tên Vật Tư Thiết Bị': row.name,
        'Phân Loại': getItemTypeLabel(row.type as any),
        'Nhóm Ngành': row.category,
        'ĐVT': row.unit,
        'Vị Trí Kệ / Ngăn': row.location,
      };

      // Thêm cột cho từng kho
      warehouses.forEach(wh => {
        rowObj[`Tồn tại: ${wh.name}`] = row.stocks[wh.id] || 0;
      });

      rowObj['Tổng Tồn Kho (Các Kho)'] = row.totalStock;
      rowObj['Đơn Giá Vốn (VNĐ)'] = row.unitPrice;
      rowObj['Tổng Thành Tiền (VNĐ)'] = row.totalValue;
      rowObj['Tình Trạng Tồn'] = getStockStatusLabel(row.status);

      return rowObj;
    });

    // Summary row for Matrix
    const summaryMatrixRow: Record<string, any> = {
      STT: 'TỔNG CỘNG',
      'Mã SKU': '',
      'Tên Vật Tư Thiết Bị': `Tổng ${warehouseMatrixRows.length} mặt hàng`,
      'Phân Loại': '',
      'Nhóm Ngành': '',
      'ĐVT': '',
      'Vị Trí Kệ / Ngăn': '',
    };
    warehouses.forEach(wh => {
      summaryMatrixRow[`Tồn tại: ${wh.name}`] = warehouseMatrixRows.reduce(
        (sum, r) => sum + (r.stocks[wh.id] || 0),
        0
      );
    });
    summaryMatrixRow['Tổng Tồn Kho (Các Kho)'] = warehouseMatrixRows.reduce(
      (sum, r) => sum + r.totalStock,
      0
    );
    summaryMatrixRow['Đơn Giá Vốn (VNĐ)'] = '';
    summaryMatrixRow['Tổng Thành Tiền (VNĐ)'] = warehouseMatrixRows.reduce(
      (sum, r) => sum + r.totalValue,
      0
    );
    summaryMatrixRow['Tình Trạng Tồn'] = '';
    matrixSheetData.push(summaryMatrixRow);

    const matrixWorksheet = XLSX.utils.json_to_sheet(matrixSheetData);
    XLSX.utils.book_append_sheet(workbook, matrixWorksheet, 'Ton_Kho_Tung_Kho');

    // Sheet 2: Sổ NXT chi tiết
    const nxtSheetData = nxtReportRows.map((row, idx) => ({
      STT: idx + 1,
      'Mã SKU': row.code,
      'Tên Vật Tư Thiết Bị': row.name,
      'Phân Loại': getItemTypeLabel(row.type as any),
      'ĐVT': row.unit,
      'Kho Lưu Trữ': row.warehouseName,
      'Vị Trí Kệ / Ngăn': row.location,
      'Tồn Đầu Kỳ': row.openingStock,
      'Nhập Trong Kỳ': row.totalIn,
      'Xuất Trong Kỳ': row.totalOut,
      'Tồn Cuối Kỳ': row.closingStock,
      'Đơn Giá Vốn (VNĐ)': row.unitPrice,
      'Thành Tiền Tồn (VNĐ)': row.closingValue,
      'Tình Trạng': getStockStatusLabel(row.status),
    }));

    if (nxtSheetData.length > 0) {
      nxtSheetData.push({
        STT: 'TỔNG CỘNG' as any,
        'Mã SKU': '',
        'Tên Vật Tư Thiết Bị': `Tổng ${nxtReportRows.length} dòng dữ liệu`,
        'Phân Loại': '',
        'ĐVT': '',
        'Kho Lưu Trữ': '',
        'Vị Trí Kệ / Ngăn': '',
        'Tồn Đầu Kỳ': nxtReportRows.reduce((a, b) => a + b.openingStock, 0),
        'Nhập Trong Kỳ': nxtReportRows.reduce((a, b) => a + b.totalIn, 0),
        'Xuất Trong Kỳ': nxtReportRows.reduce((a, b) => a + b.totalOut, 0),
        'Tồn Cuối Kỳ': nxtReportRows.reduce((a, b) => a + b.closingStock, 0),
        'Đơn Giá Vốn (VNĐ)': '' as any,
        'Thành Tiền Tồn (VNĐ)': nxtReportRows.reduce((a, b) => a + b.closingValue, 0),
        'Tình Trạng': '',
      });
      const nxtWorksheet = XLSX.utils.json_to_sheet(nxtSheetData);
      XLSX.utils.book_append_sheet(workbook, nxtWorksheet, 'Chi_Tiet_NXT');
    }

    XLSX.writeFile(
      workbook,
      `Bao_Cao_Ton_Kho_Phan_Bo_${selectedWhName}_${new Date().toISOString().substring(0, 10)}.xlsx`
    );
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
              <p className="text-xs text-slate-500">Tỷ trọng vốn lưu động tại các kho</p>
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

        {/* Warehouse Breakdown (1 column) with both Total Stock Quantity and Total Value */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Số lượng tồn theo Kho &amp; Dự án
              </h3>
              <p className="text-xs text-slate-500">Chi tiết số lượng và giá trị từng địa điểm</p>
            </div>
            <WarehouseIcon className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {warehouseBreakdown.map(wh => (
              <div
                key={wh.id}
                className="p-3.5 bg-slate-50/80 hover:bg-slate-50 rounded-lg border border-slate-200/80 transition-all space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 truncate block" title={wh.name}>
                      {wh.name}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Mã kho: {wh.code}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-indigo-700 tabular-nums bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    {wh.percentage.toFixed(0)}% vốn
                  </span>
                </div>

                {/* Stock Quantity Highlight */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-500 block">Số lượng tồn:</span>
                    <span className="font-bold text-slate-900 text-sm tabular-nums">
                      {formatNumber(wh.totalStock)}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">đơn vị</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-500 block">Giá trị tồn kho:</span>
                    <span className="font-bold text-indigo-700 tabular-nums">
                      {formatCurrency(wh.totalValue)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                  <span>{wh.itemCount} danh mục lưu trữ</span>
                </div>

                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(wh.percentage, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Stock Report Section: Multi-Warehouse Stock Matrix & Detailed NXT */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <TableProperties className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">
                Báo Cáo Phân Bổ Tồn Kho &amp; Nhập - Xuất - Tồn
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {reportViewMode === 'matrix'
                ? 'Bảng ma trận chia chi tiết số lượng tồn của từng mặt hàng theo từng kho lưu trữ'
                : 'Báo cáo chi tiết số dư đầu kỳ, phát sinh nhập/xuất và tồn cuối kỳ theo kho'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* View Mode Switcher */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-white shadow-2xs">
              <button
                type="button"
                onClick={() => setReportViewMode('matrix')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  reportViewMode === 'matrix'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <TableProperties className="w-3.5 h-3.5" />
                <span>Chia tồn theo các kho</span>
              </button>

              <button
                type="button"
                onClick={() => setReportViewMode('nxt')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  reportViewMode === 'nxt'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Báo cáo NXT chi tiết</span>
              </button>
            </div>

            {/* Warehouse Filter */}
            <select
              value={selectedReportWarehouse}
              onChange={e => setSelectedReportWarehouse(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white hover:border-indigo-500 outline-none text-slate-800 font-semibold shadow-2xs"
            >
              <option value="ALL">Tất cả kho lưu trữ ({warehouses.length} kho)</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            {/* Export Excel (.xlsx) button */}
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-2xs whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* VIEW MODE 1: MATRIX TABLE (CHIA SỐ LƯỢNG TỒN THEO TỪNG KHO) */}
        {reportViewMode === 'matrix' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 w-10 text-center">STT</th>
                  <th className="py-3 px-3 whitespace-nowrap">Mã SKU</th>
                  <th className="py-3 px-4 min-w-[220px]">Tên vật tư / thiết bị</th>
                  <th className="py-3 px-2 text-center whitespace-nowrap">ĐVT</th>
                  <th className="py-3 px-3 min-w-[120px] whitespace-nowrap">Vị trí kệ/ngăn</th>

                  {/* CỘT PHÂN BỔ SỐ LƯỢNG TỒN CHO TỪNG KHO */}
                  {warehouses
                    .filter(w => selectedReportWarehouse === 'ALL' || w.id === selectedReportWarehouse)
                    .map(w => (
                      <th
                        key={w.id}
                        className="py-3 px-3 text-right min-w-[130px] bg-indigo-50/50 text-indigo-950 font-bold border-x border-slate-200"
                        title={w.name}
                      >
                        <div className="truncate">{w.name}</div>
                        <div className="text-[10px] text-indigo-600 font-normal mt-0.5">SL Tồn</div>
                      </th>
                    ))}

                  <th className="py-3 px-3 text-right min-w-[110px] bg-slate-200/80 font-bold text-slate-900 whitespace-nowrap">
                    Tổng tồn kho
                  </th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Đơn giá vốn</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Tổng thành tiền</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Tình trạng</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Thẻ kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {warehouseMatrixRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9 + warehouses.length}
                      className="py-8 text-center text-slate-400 italic text-xs"
                    >
                      Không có mặt hàng nào có số lượng tồn tại kho đã chọn.
                    </td>
                  </tr>
                ) : (
                  warehouseMatrixRows.map((row, idx) => {
                    const isLow = row.status === 'CANH_BAO_THAP' || row.status === 'HET_HANG';

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {row.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 line-clamp-1" title={row.name}>
                            {row.name}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>{getItemTypeLabel(row.type as any)}</span>
                            <span>&bull;</span>
                            <span className="text-slate-400">{row.category}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center text-slate-600 whitespace-nowrap font-medium">
                          {row.unit}
                        </td>
                        <td className="py-3 px-3 text-slate-700 whitespace-nowrap font-medium">
                          <span className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] border border-slate-200">
                            {row.location}
                          </span>
                        </td>

                        {/* GIÁ TRỊ TỒN TẠI TỪNG KHO */}
                        {warehouses
                          .filter(
                            w =>
                              selectedReportWarehouse === 'ALL' || w.id === selectedReportWarehouse
                          )
                          .map(w => {
                            const whStock = row.stocks[w.id] || 0;
                            return (
                              <td
                                key={w.id}
                                className="py-3 px-3 text-right tabular-nums border-x border-slate-100 whitespace-nowrap"
                              >
                                {whStock > 0 ? (
                                  <span className="font-bold text-indigo-900 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-100/80">
                                    {formatNumber(whStock)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 font-mono">-</span>
                                )}
                              </td>
                            );
                          })}

                        {/* TỔNG TỒN */}
                        <td className="py-3 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-50/60 whitespace-nowrap">
                          <span
                            className={
                              row.totalStock === 0
                                ? 'text-rose-600'
                                : isLow
                                ? 'text-amber-600'
                                : 'text-slate-900'
                            }
                          >
                            {formatNumber(row.totalStock)}
                          </span>
                        </td>

                        {/* ĐƠN GIÁ */}
                        <td className="py-3 px-3 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          {formatCurrency(row.unitPrice)}
                        </td>

                        {/* THÀNH TIỀN */}
                        <td className="py-3 px-4 text-right tabular-nums font-bold text-indigo-700 whitespace-nowrap">
                          {formatCurrency(row.totalValue)}
                        </td>

                        {/* TÌNH TRẠNG */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              row.status === 'HET_HANG'
                                ? 'bg-rose-100 text-rose-700'
                                : row.status === 'CANH_BAO_THAP'
                                ? 'bg-amber-100 text-amber-700'
                                : row.status === 'VUOT_DINH_MUC'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {getStockStatusLabel(row.status)}
                          </span>
                        </td>

                        {/* THAO TÁC */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => onSelectStockCard(row.id)}
                            className="text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 hover:bg-indigo-50 px-2 py-1 rounded text-xs"
                          >
                            Xem thẻ kho
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                  <td colSpan={5} className="py-3.5 px-4 uppercase tracking-wider">
                    Tổng cộng tồn kho ({warehouseMatrixRows.length} mặt hàng)
                  </td>

                  {/* TỔNG TỒN CỘNG CHO TỪNG KHO */}
                  {warehouses
                    .filter(
                      w => selectedReportWarehouse === 'ALL' || w.id === selectedReportWarehouse
                    )
                    .map(w => {
                      const colTotal = warehouseMatrixRows.reduce(
                        (sum, r) => sum + (r.stocks[w.id] || 0),
                        0
                      );
                      return (
                        <td
                          key={w.id}
                          className="py-3.5 px-3 text-right tabular-nums text-indigo-950 font-bold bg-indigo-100/50 border-x border-slate-200 whitespace-nowrap"
                        >
                          {formatNumber(colTotal)}
                        </td>
                      );
                    })}

                  {/* TỔNG CỘNG TOÀN BỘ */}
                  <td className="py-3.5 px-3 text-right tabular-nums font-bold text-slate-900 bg-slate-200/60 whitespace-nowrap">
                    {formatNumber(
                      warehouseMatrixRows.reduce((sum, r) => sum + r.totalStock, 0)
                    )}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-400">-</td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-bold text-indigo-700 whitespace-nowrap">
                    {formatCurrency(
                      warehouseMatrixRows.reduce((sum, r) => sum + r.totalValue, 0)
                    )}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* VIEW MODE 2: SỔ NHẬP - XUẤT - TỒN CHI TIẾT (NXT LEDGER) */}
        {reportViewMode === 'nxt' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 w-10 text-center">STT</th>
                  <th className="py-3 px-3 whitespace-nowrap">Mã SKU</th>
                  <th className="py-3 px-4 min-w-[200px]">Tên vật tư / thiết bị</th>
                  <th className="py-3 px-2 text-center whitespace-nowrap">ĐVT</th>
                  <th className="py-3 px-3 whitespace-nowrap">Kho lưu trữ</th>
                  <th className="py-3 px-3 whitespace-nowrap">Vị trí kệ/ngăn</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Tồn đầu kỳ</th>
                  <th className="py-3 px-3 text-right text-emerald-700 whitespace-nowrap">Nhập kỳ</th>
                  <th className="py-3 px-3 text-right text-amber-700 whitespace-nowrap">Xuất kỳ</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-900 whitespace-nowrap">Tồn cuối</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Đơn giá vốn</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Thành tiền tồn</th>
                  <th className="py-3 px-3 text-center whitespace-nowrap">Thẻ kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nxtReportRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-8 text-center text-slate-400 italic text-xs">
                      Không có phát sinh giao dịch hoặc số dư tại kho này.
                    </td>
                  </tr>
                ) : (
                  nxtReportRows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-center font-mono text-slate-400 text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {row.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 min-w-[200px]">
                        <div className="line-clamp-1">{row.name}</div>
                        <div className="text-[11px] text-slate-400 font-normal">
                          {getItemTypeLabel(row.type as any)}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center text-slate-600 whitespace-nowrap">{row.unit}</td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap font-medium max-w-[150px] truncate" title={row.warehouseName}>
                        <span className="inline-block bg-indigo-50 text-indigo-900 px-2 py-0.5 rounded text-[11px] border border-indigo-100 font-semibold">
                          {row.warehouseName}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {row.location}
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
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <button
                          onClick={() => onSelectStockCard(row.itemId)}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 hover:bg-indigo-50 px-2 py-1 rounded"
                        >
                          Xem thẻ kho
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900 text-xs">
                  <td colSpan={6} className="py-3.5 px-4 uppercase tracking-wider">
                    Tổng cộng báo cáo ({nxtReportRows.length} dòng dữ liệu)
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums">
                    {formatNumber(nxtReportRows.reduce((a, b) => a + b.openingStock, 0))}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-emerald-800">
                    +{formatNumber(nxtReportRows.reduce((a, b) => a + b.totalIn, 0))}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-amber-800">
                    -{formatNumber(nxtReportRows.reduce((a, b) => a + b.totalOut, 0))}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums font-bold">
                    {formatNumber(nxtReportRows.reduce((a, b) => a + b.closingStock, 0))}
                  </td>
                  <td className="py-3.5 px-3 text-right text-slate-400">-</td>
                  <td className="py-3.5 px-4 text-right tabular-nums font-bold text-indigo-700">
                    {formatCurrency(nxtReportRows.reduce((a, b) => a + b.closingValue, 0))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

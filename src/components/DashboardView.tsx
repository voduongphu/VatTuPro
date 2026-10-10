import React from 'react';
import { useInventory } from '../context/InventoryContext';
import { formatVND, formatNumber, formatDate } from '../utils/formatters';
import { getItemStockStatus, getItemMaintenanceStatus } from '../utils/filterEngine';
import {
  Boxes,
  AlertTriangle,
  Wrench,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  PackageCheck,
  ChevronRight,
  Warehouse,
  Edit2,
} from 'lucide-react';
import { ActiveTab } from './Header';

interface DashboardViewProps {
  onNavigateTab: (tab: ActiveTab) => void;
  onFilterPreset: (presetId: string) => void;
  onViewTransaction: (transId: string) => void;
  onOpenWarehouseManager?: () => void;
  onOpenCategoryManager?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateTab,
  onFilterPreset,
  onViewTransaction,
  onOpenWarehouseManager,
  onOpenCategoryManager,
}) => {
  const { items, transactions, warehouses } = useInventory();

  // Metrics calculation
  const totalValue = items.reduce((sum, item) => sum + item.currentStock * item.unitPrice, 0);
  const totalItemCount = items.length;
  
  const shortageItems = items.filter(it => getItemStockStatus(it) === 'THIEU_HUT' || getItemStockStatus(it) === 'HET_HANG');
  const maintenanceItems = items.filter(it => {
    const status = getItemMaintenanceStatus(it);
    return it.condition === 'NEED_MAINTENANCE' || it.condition === 'UNDER_REPAIR' || status === 'OVERDUE' || status === 'DUE_SOON';
  });

  const overstockedItems = items.filter(it => getItemStockStatus(it) === 'VUOT_DINH_MUC');

  // Breakdown by warehouse
  const warehouseStats = warehouses.map(wh => {
    const whItems = items.filter(it => it.warehouse === wh);
    const whValue = whItems.reduce((sum, it) => sum + it.currentStock * it.unitPrice, 0);
    const whCount = whItems.length;
    return {
      name: wh,
      count: whCount,
      value: whValue,
    };
  });

  // Breakdown by item type
  const typeStats = [
    { label: 'Vật tư tiêu hao', type: 'VAT_TU' },
    { label: 'Thiết bị máy móc', type: 'THIET_BI' },
    { label: 'Công cụ dụng cụ', type: 'CONG_CU' },
    { label: 'Phụ tùng linh kiện', type: 'PHU_TUNG' },
  ].map(t => {
    const tItems = items.filter(it => it.type === t.type);
    const tValue = tItems.reduce((sum, it) => sum + it.currentStock * it.unitPrice, 0);
    return {
      label: t.label,
      count: tItems.length,
      value: tValue,
      pct: totalValue > 0 ? (tValue / totalValue) * 100 : 0,
    };
  });

  // Recent transactions (latest 5)
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Value */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Tổng giá trị tồn kho</span>
            <TrendingUp className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {formatVND(totalValue)}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Ước tính theo đơn giá vốn danh mục
          </div>
        </div>

        {/* Card 2: Total Items */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium">Danh mục quản lý</span>
            <Boxes className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
            {formatNumber(totalItemCount)}{' '}
            <span className="text-sm font-normal text-slate-500">mặt hàng</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Phân bổ trên {warehouses.length} kho lưu trữ
          </div>
        </div>

        {/* Card 3: Shortage Alert */}
        <div
          onClick={() => {
            onFilterPreset('preset-shortage');
            onNavigateTab('inventory');
          }}
          className="bg-white border border-amber-200 rounded-lg p-5 cursor-pointer hover:border-amber-400 transition-colors"
        >
          <div className="flex items-center justify-between text-amber-700 mb-2">
            <span className="text-xs font-semibold">Cảnh báo thiếu hụt</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-900 font-mono tracking-tight">
            {formatNumber(shortageItems.length)}{' '}
            <span className="text-sm font-normal text-amber-700">mặt hàng</span>
          </div>
          <div className="text-xs text-amber-800 mt-2 flex items-center justify-between">
            <span>Tồn dưới định mức tối thiểu</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Card 4: Maintenance Alert */}
        <div
          onClick={() => {
            onFilterPreset('preset-maintenance');
            onNavigateTab('inventory');
          }}
          className="bg-white border border-rose-200 rounded-lg p-5 cursor-pointer hover:border-rose-400 transition-colors"
        >
          <div className="flex items-center justify-between text-rose-700 mb-2">
            <span className="text-xs font-semibold">Thiết bị cần bảo trì</span>
            <Wrench className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-900 font-mono tracking-tight">
            {formatNumber(maintenanceItems.length)}{' '}
            <span className="text-sm font-normal text-rose-700">thiết bị</span>
          </div>
          <div className="text-xs text-rose-800 mt-2 flex items-center justify-between">
            <span>Quá hạn hoặc cần bảo dưỡng</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Critical Conditions Action Row */}
      <div className="bg-slate-900 text-white rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Bộ điều kiện kiểm soát rủi ro tồn kho
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Truy xuất nhanh các nhóm vật tư thiết bị vi phạm điều kiện an toàn kho
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              onFilterPreset('preset-shortage');
              onNavigateTab('inventory');
            }}
            className="px-3 py-1.5 text-xs font-medium bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded-md hover:bg-amber-500/30 transition-colors whitespace-nowrap cursor-pointer"
          >
            Lọc {shortageItems.length} mục thiếu hụt
          </button>
          <button
            onClick={() => {
              onFilterPreset('preset-maintenance');
              onNavigateTab('inventory');
            }}
            className="px-3 py-1.5 text-xs font-medium bg-rose-500/20 text-rose-200 border border-rose-500/30 rounded-md hover:bg-rose-500/30 transition-colors whitespace-nowrap cursor-pointer"
          >
            Lọc {maintenanceItems.length} thiết bị bảo dưỡng
          </button>
          <button
            onClick={() => {
              onFilterPreset('preset-overstocked');
              onNavigateTab('inventory');
            }}
            className="px-3 py-1.5 text-xs font-medium bg-blue-500/20 text-blue-200 border border-blue-500/30 rounded-md hover:bg-blue-500/30 transition-colors whitespace-nowrap cursor-pointer"
          >
            Lọc {overstockedItems.length} mục vượt Max
          </button>
          <button
            onClick={() => {
              onFilterPreset('preset-active-projects');
              onNavigateTab('inventory');
            }}
            className="px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 rounded-md hover:bg-emerald-500/30 transition-colors whitespace-nowrap cursor-pointer"
          >
            Thiết bị tại dự án
          </button>
        </div>
      </div>

      {/* 2-Column Split: Inventory Breakdown & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Distribution by Warehouse & Type */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-slate-900">
                Phân bổ giá trị theo Kho lưu trữ
              </h3>
              {onOpenWarehouseManager && (
                <button
                  type="button"
                  onClick={onOpenWarehouseManager}
                  className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:text-indigo-900 font-semibold cursor-pointer"
                  title="Đổi tên kho hoặc thêm kho mới"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Đổi tên & Quản lý kho</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Quy mô hàng hóa và vốn tồn trữ theo từng vị trí kho
            </p>
            <div className="space-y-3">
              {warehouseStats.map(wh => {
                const pct = totalValue > 0 ? (wh.value / totalValue) * 100 : 0;
                return (
                  <div key={wh.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{wh.name}</span>
                      <span className="font-mono text-slate-900 font-semibold">
                        {formatVND(wh.value)} ({formatNumber(wh.count)} mục)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-slate-700 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(3, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-slate-900">
                Cơ cấu danh mục vật tư
              </h3>
              {onOpenCategoryManager && (
                <button
                  type="button"
                  onClick={onOpenCategoryManager}
                  className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:text-indigo-900 font-semibold cursor-pointer"
                  title="Quản lý & Xóa nhóm danh mục vật tư"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Quản lý & Xóa danh mục</span>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {typeStats.map(t => (
                <div key={t.label} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-xs text-slate-500">{t.label}</div>
                  <div className="text-sm font-bold text-slate-900 mt-1 font-mono">
                    {formatNumber(t.count)} mặt hàng
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-0.5">
                    {formatVND(t.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Recent Transactions Log */}
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Giao dịch nhập xuất gần nhất
              </h3>
              <p className="text-xs text-slate-500">
                Các phiếu giao dịch mới hoàn tất
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('report')}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium underline cursor-pointer"
            >
              Xem báo cáo NXT
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              Chưa có giao dịch nhập xuất nào
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentTransactions.map(trans => {
                const isInbound = trans.type === 'INBOUND';
                const isAudit = trans.type === 'AUDIT_ADJUSTMENT';

                return (
                  <div
                    key={trans.id}
                    onClick={() => onViewTransaction(trans.id)}
                    className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-md transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                          isInbound
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isAudit
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {isInbound ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : isAudit ? (
                          <PackageCheck className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-900">
                            {trans.code}
                          </span>
                          <span className="text-xs text-slate-500">·</span>
                          <span className="text-xs text-slate-600">
                            {formatDate(trans.date)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[200px] sm:max-w-xs">
                          {trans.receiverOrSupplier} · {trans.warehouse}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-bold font-mono text-slate-900">
                        {formatVND(trans.totalAmount)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {trans.items.length} mặt hàng
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

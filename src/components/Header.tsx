import React from 'react';
import { Plus, Boxes, Warehouse, Layers } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'inventory' | 'inbound' | 'outbound' | 'report' | 'audit';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenNewTransaction: () => void;
  onOpenWarehouseManager: () => void;
  onOpenCategoryManager: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenNewTransaction,
  onOpenWarehouseManager,
  onOpenCategoryManager,
}) => {
  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200 sticky top-0 z-30 no-print">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-xs">
          VT
        </div>
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
          VatTuPro Enterprise
        </span>
      </div>

      {/* Zone 2: 4-5 clean single-line text navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
            activeTab === 'dashboard'
              ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
              : ''
          }`}
        >
          Tổng quan
        </button>
        <button
          onClick={() => onSelectTab('inventory')}
          className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
            activeTab === 'inventory'
              ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
              : ''
          }`}
        >
          Danh mục & Tồn kho
        </button>
        <button
          onClick={() => onSelectTab('inbound')}
          className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
            activeTab === 'inbound'
              ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
              : ''
          }`}
        >
          Nhập kho
        </button>
        <button
          onClick={() => onSelectTab('outbound')}
          className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
            activeTab === 'outbound'
              ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
              : ''
          }`}
        >
          Xuất kho
        </button>
        <button
          onClick={() => onSelectTab('report')}
          className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
            activeTab === 'report'
              ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
              : ''
          }`}
        >
          Báo cáo NXT
        </button>
        <button
          onClick={() => onSelectTab('audit')}
          className={`hover:text-slate-900 transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
            activeTab === 'audit'
              ? 'text-slate-900 font-semibold border-b-2 border-slate-900'
              : ''
          }`}
        >
          Kiểm kê kho
        </button>
      </nav>

      {/* Zone 3: Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onOpenCategoryManager}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
          title="Quản lý & Xóa nhóm danh mục vật tư"
        >
          <Layers className="w-3.5 h-3.5 text-slate-600" />
          <span>Danh mục</span>
        </button>

        <button
          onClick={onOpenWarehouseManager}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
          title="Quản lý & Đổi tên kho lưu trữ"
        >
          <Warehouse className="w-3.5 h-3.5 text-slate-600" />
          <span>Kho bãi</span>
        </button>

        <button
          onClick={onOpenNewTransaction}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo phiếu</span>
        </button>
      </div>
    </header>
  );
};

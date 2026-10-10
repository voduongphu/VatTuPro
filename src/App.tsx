/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { Header, ActiveTab } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { InboundView } from './components/InboundView';
import { OutboundView } from './components/OutboundView';
import { ReportView } from './components/ReportView';
import { AuditView } from './components/AuditView';
import { ItemModal } from './components/ItemModal';
import { TransactionModal } from './components/TransactionModal';
import { StockCardModal } from './components/StockCardModal';
import { PrintDocumentModal } from './components/PrintDocumentModal';
import { ExcelImportModal } from './components/ExcelImportModal';
import { WarehouseManagerModal } from './components/WarehouseManagerModal';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { InventoryItem, InventoryTransaction, TransactionType } from './types/inventory';

const MainAppContent: React.FC = () => {
  const { applyPreset, transactions } = useInventory();

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<InventoryItem | null>(null);

  const [isTransModalOpen, setIsTransModalOpen] = useState(false);
  const [transModalType, setTransModalType] = useState<TransactionType>('INBOUND');

  const [stockCardItem, setStockCardItem] = useState<InventoryItem | null>(null);
  const [isStockCardOpen, setIsStockCardOpen] = useState(false);

  const [printTransaction, setPrintTransaction] = useState<InventoryTransaction | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Handlers
  const handleAddNewItem = () => {
    setItemToEdit(null);
    setIsItemModalOpen(true);
  };

  const handleEditItem = (item: InventoryItem) => {
    setItemToEdit(item);
    setIsItemModalOpen(true);
  };

  const handleViewStockCard = (item: InventoryItem) => {
    setStockCardItem(item);
    setIsStockCardOpen(true);
  };

  const handleOpenTransactionModal = (type: TransactionType = 'INBOUND') => {
    setTransModalType(type);
    setIsTransModalOpen(true);
  };

  const handleViewPrint = (transaction: InventoryTransaction) => {
    setPrintTransaction(transaction);
    setIsPrintModalOpen(true);
  };

  const handleDashboardFilterPreset = (presetId: string) => {
    applyPreset(presetId);
  };

  const handleDashboardViewTransaction = (transId: string) => {
    const trans = transactions.find(t => t.id === transId);
    if (trans) {
      handleViewPrint(trans);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 3-Zone Header Contract */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenNewTransaction={() => handleOpenTransactionModal('INBOUND')}
        onOpenWarehouseManager={() => setIsWarehouseModalOpen(true)}
        onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Workspace Breadcrumb & Tab Header Bar on Mobile */}
        <div className="flex md:hidden items-center justify-between pb-4 border-b border-slate-200 mb-4 overflow-x-auto no-print gap-2">
          {(
            [
              ['dashboard', 'Tổng quan'],
              ['inventory', 'Danh mục'],
              ['inbound', 'Nhập kho'],
              ['outbound', 'Xuất kho'],
              ['report', 'Báo cáo'],
              ['audit', 'Kiểm kê'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap ${
                activeTab === key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* View Routing */}
        {activeTab === 'dashboard' && (
          <DashboardView
            onNavigateTab={setActiveTab}
            onFilterPreset={handleDashboardFilterPreset}
            onViewTransaction={handleDashboardViewTransaction}
            onOpenWarehouseManager={() => setIsWarehouseModalOpen(true)}
            onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            onAddNewItem={handleAddNewItem}
            onEditItem={handleEditItem}
            onViewStockCard={handleViewStockCard}
            onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
          />
        )}

        {activeTab === 'inbound' && (
          <InboundView
            onOpenCreateModal={() => handleOpenTransactionModal('INBOUND')}
            onOpenExcelImport={() => setIsExcelImportOpen(true)}
            onViewPrint={handleViewPrint}
          />
        )}

        {activeTab === 'outbound' && (
          <OutboundView
            onOpenCreateModal={() => handleOpenTransactionModal('OUTBOUND')}
            onViewPrint={handleViewPrint}
          />
        )}

        {activeTab === 'report' && <ReportView />}

        {activeTab === 'audit' && <AuditView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-3 px-6 text-center text-xs text-slate-500 no-print flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>VatTuPro Enterprise</span>
          <span aria-hidden="true">·</span>
          <span>Quản lý Nhập Xuất Tồn Vật tư & Thiết bị</span>
        </div>
        <div className="text-slate-400">
          Hỗ trợ lọc đa điều kiện (AND/OR), định mức cảnh báo Min/Max & thẻ kho tiêu chuẩn
        </div>
      </footer>

      {/* Modals */}
      <ItemModal
        itemToEdit={itemToEdit}
        isOpen={isItemModalOpen}
        onClose={() => {
          setIsItemModalOpen(false);
          setItemToEdit(null);
        }}
      />

      <TransactionModal
        initialType={transModalType}
        isOpen={isTransModalOpen}
        onClose={() => setIsTransModalOpen(false)}
        onOpenExcelImport={() => setIsExcelImportOpen(true)}
      />

      <StockCardModal
        item={stockCardItem}
        isOpen={isStockCardOpen}
        onClose={() => {
          setIsStockCardOpen(false);
          setStockCardItem(null);
        }}
      />

      <PrintDocumentModal
        transaction={printTransaction}
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setPrintTransaction(null);
        }}
      />

      <ExcelImportModal
        isOpen={isExcelImportOpen}
        onClose={() => setIsExcelImportOpen(false)}
        onViewPrint={handleViewPrint}
      />

      <WarehouseManagerModal
        isOpen={isWarehouseModalOpen}
        onClose={() => setIsWarehouseModalOpen(false)}
      />

      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <InventoryProvider>
      <MainAppContent />
    </InventoryProvider>
  );
}

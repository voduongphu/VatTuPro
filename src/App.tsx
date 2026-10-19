import React, { useState } from 'react';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { InventoryTableView } from './components/InventoryTableView';
import { TransactionListView } from './components/TransactionListView';
import { AlertsView } from './components/AlertsView';
import { UserManagementView } from './components/UserManagementView';
import { WarehouseManagementView } from './components/WarehouseManagementView';
import { StockCardModal } from './components/StockCardModal';
import { CreateTransactionModal } from './components/CreateTransactionModal';
import { CreateItemModal } from './components/CreateItemModal';
import { TransactionPrintModal } from './components/TransactionPrintModal';
import { ExcelImportModal } from './components/ExcelImportModal';
import { ImportItemsExcelModal } from './components/ImportItemsExcelModal';
import { EditTransactionModal } from './components/EditTransactionModal';
import { SyncStatusModal } from './components/SyncStatusModal';
import { LoginView } from './components/LoginView';
import { InventoryItem, Transaction, TransactionType } from './types/inventory';
import { ActiveTabType } from './components/Header';

function InventoryApp() {
  const { currentUser } = useInventory();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<ActiveTabType>('dashboard');

  // Modals state
  const [stockCardItemId, setStockCardItemId] = useState<string | null>(null);
  const [printTransaction, setPrintTransaction] = useState<Transaction | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [isItemsExcelImportOpen, setIsItemsExcelImportOpen] = useState(false);

  const [createTransactionState, setCreateTransactionState] = useState<{
    isOpen: boolean;
    type: TransactionType;
    item?: InventoryItem;
  }>({
    isOpen: false,
    type: 'NHAP_KHO',
  });

  const [createItemState, setCreateItemState] = useState<{
    isOpen: boolean;
    itemToEdit?: InventoryItem | null;
  }>({
    isOpen: false,
    itemToEdit: null,
  });

  // Handlers
  const handleOpenCreateTransaction = (type: TransactionType, item?: InventoryItem) => {
    setCreateTransactionState({
      isOpen: true,
      type,
      item,
    });
  };

  const handleOpenCreateItem = (itemToEdit?: InventoryItem) => {
    setCreateItemState({
      isOpen: true,
      itemToEdit: itemToEdit || null,
    });
  };

  const handleQuickReorder = (item: InventoryItem, suggestedQty: number) => {
    setCreateTransactionState({
      isOpen: true,
      type: 'NHAP_KHO',
      item: {
        ...item,
        currentStock: suggestedQty,
      },
    });
  };

  // If not logged in, render the login screen with username & password and quick demo logins
  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Header Contract */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCreateItem={() => handleOpenCreateItem()}
        onOpenCreateTransaction={type => handleOpenCreateTransaction(type)}
        onOpenImportExcel={() => setIsExcelImportOpen(true)}
      />

      {/* Main Viewport Content - Full screen fit without restrictive 1280px bottleneck */}
      <main className="flex-1 w-full px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            onSelectStockCard={id => setStockCardItemId(id)}
            onOpenCreateTransaction={type => handleOpenCreateTransaction(type)}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryTableView
            onSelectStockCard={id => setStockCardItemId(id)}
            onEditItem={item => handleOpenCreateItem(item)}
            onOpenCreateItem={() => handleOpenCreateItem()}
            onQuickGoodsIn={item => handleOpenCreateTransaction('NHAP_KHO', item)}
            onOpenImportItems={() => setIsItemsExcelImportOpen(true)}
          />
        )}

        {activeTab === 'warehouses' && (
          <WarehouseManagementView
            onNavigateToInventoryWithWarehouse={() => setActiveTab('inventory')}
          />
        )}

        {activeTab === 'receipts' && (
          <TransactionListView
            initialType="NHAP_KHO"
            onOpenCreateTransaction={type => handleOpenCreateTransaction(type)}
            onPrintTransaction={trx => setPrintTransaction(trx)}
            onOpenImportExcel={() => setIsExcelImportOpen(true)}
            onEditTransaction={trx => setEditingTransaction(trx)}
          />
        )}

        {activeTab === 'issues' && (
          <TransactionListView
            initialType="XUAT_KHO"
            onOpenCreateTransaction={type => handleOpenCreateTransaction(type)}
            onPrintTransaction={trx => setPrintTransaction(trx)}
            onOpenImportExcel={() => setIsExcelImportOpen(true)}
            onEditTransaction={trx => setEditingTransaction(trx)}
          />
        )}

        {activeTab === 'alerts' && (
          <AlertsView
            onQuickReorder={(item, suggestedQty) => handleQuickReorder(item, suggestedQty)}
            onEditItem={item => handleOpenCreateItem(item)}
          />
        )}

        {activeTab === 'users' && <UserManagementView />}
      </main>

      {/* Clean quiet footer - Full screen width matching header */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="w-full px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Hệ Thống Quản Lý Kho Vật Tư &amp; Thiết Bị</span>
            <span aria-hidden="true">&bull;</span>
            <span>KhoVatTu Pro &bull; Phiên bản Kế toán &amp; Kỹ thuật</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Đang đăng nhập: <strong className="text-slate-800">{currentUser.fullName}</strong> ({currentUser.role})</span>
            <span aria-hidden="true">&bull;</span>
            <span>Hỗ trợ Import / Export Excel UTF-8</span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {stockCardItemId && (
        <StockCardModal
          itemId={stockCardItemId}
          onClose={() => setStockCardItemId(null)}
        />
      )}

      {createTransactionState.isOpen && (
        <CreateTransactionModal
          initialType={createTransactionState.type}
          initialItem={createTransactionState.item}
          onClose={() =>
            setCreateTransactionState({
              isOpen: false,
              type: 'NHAP_KHO',
            })
          }
          onSuccess={() => {
            setCreateTransactionState({
              isOpen: false,
              type: 'NHAP_KHO',
            });
          }}
        />
      )}

      {createItemState.isOpen && (
        <CreateItemModal
          itemToEdit={createItemState.itemToEdit}
          onClose={() => setCreateItemState({ isOpen: false, itemToEdit: null })}
          onSuccess={() => setCreateItemState({ isOpen: false, itemToEdit: null })}
        />
      )}

      {printTransaction && (
        <TransactionPrintModal
          transaction={printTransaction}
          onClose={() => setPrintTransaction(null)}
        />
      )}

      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSuccess={() => setEditingTransaction(null)}
        />
      )}

      {isExcelImportOpen && (
        <ExcelImportModal
          onClose={() => setIsExcelImportOpen(false)}
          onSuccess={() => setIsExcelImportOpen(false)}
        />
      )}

      {isItemsExcelImportOpen && (
        <ImportItemsExcelModal
          onClose={() => setIsItemsExcelImportOpen(false)}
          onSuccess={() => setIsItemsExcelImportOpen(false)}
        />
      )}

      {/* Real-time Central Cloud Sync Modal */}
      <SyncStatusModal />
    </div>
  );
}

export default function App() {
  return (
    <InventoryProvider>
      <InventoryApp />
    </InventoryProvider>
  );
}

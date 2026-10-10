import React, { useState, useMemo } from 'react';
import { useInventory } from '../context/InventoryContext';
import { InventoryItem, ITEM_TYPE_LABELS, ITEM_CONDITION_LABELS } from '../types/inventory';
import { ConditionBuilder } from './ConditionBuilder';
import { matchItemWithRules, getItemStockStatus, getItemMaintenanceStatus, getItemExpiryStatus } from '../utils/filterEngine';
import { formatVND, formatNumber, formatDate, exportToCSV } from '../utils/formatters';
import {
  Plus,
  Download,
  Search,
  Eye,
  Edit2,
  Trash2,
  Wrench,
  AlertTriangle,
  Clock,
  Layers,
  FileSpreadsheet,
  CheckSquare,
  Square,
  AlertCircle,
  X,
  Package,
} from 'lucide-react';

interface InventoryViewProps {
  onAddNewItem: () => void;
  onEditItem: (item: InventoryItem) => void;
  onViewStockCard: (item: InventoryItem) => void;
  onOpenCategoryManager?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  onAddNewItem,
  onEditItem,
  onViewStockCard,
  onOpenCategoryManager,
}) => {
  const {
    items,
    categories,
    warehouses,
    activeRules,
    activeLogic,
    deleteItem,
    deleteMultipleItems,
    clearConditionRules,
  } = useInventory();

  const [quickSearch, setQuickSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Deletion confirmation modal states
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Filter items through multi-condition rules + quick table filters
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 1. Multi-condition rules
      const ruleMatch = matchItemWithRules(item, activeRules, activeLogic);
      if (!ruleMatch) return false;

      // 2. Quick dropdown filters
      if (selectedWarehouse !== 'ALL' && item.warehouse !== selectedWarehouse) {
        return false;
      }
      if (selectedType !== 'ALL' && item.type !== selectedType) {
        return false;
      }
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      // 3. Quick instant search bar
      if (quickSearch.trim()) {
        const query = quickSearch.toLowerCase();
        const str = `${item.code} ${item.name} ${item.modelSpecs} ${item.serialNumber || ''} ${item.lotNumber || ''} ${item.packingListNo || ''} ${item.shipment || ''} ${item.manufacturer || ''} ${item.packageNo || ''} ${item.packageName || ''} ${item.projectItem || ''} ${item.locationBin}`.toLowerCase();
        if (!str.includes(query)) return false;
      }

      return true;
    });
  }, [items, activeRules, activeLogic, selectedWarehouse, selectedType, selectedCategory, quickSearch]);

  // Check selection status
  const isAllSelected =
    filteredItems.length > 0 &&
    filteredItems.every(it => selectedIds.includes(it.id));
  const isSomeSelected = selectedIds.length > 0 && !isAllSelected;

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(it => it.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  // Export current filtered list to CSV
  const handleExportCSV = () => {
    const headers = [
      'Mã vật tư',
      'Tên vật tư thiết bị',
      'Phân loại',
      'Nhóm danh mục',
      'Đơn vị tính',
      'Kho lưu trữ',
      'Vị trí kệ ngăn',
      'Quy cách kỹ thuật',
      'Số Serial',
      'Số Lô',
      'Số Packing List',
      'Shipment / Lô vận chuyển',
      'Nhà sản xuất (Hãng SX)',
      'Số kiện',
      'Tên kiện hàng',
      'Hạng mục công trình',
      'Tồn tối thiểu (Min)',
      'Tồn tối đa (Max)',
      'Tồn hiện tại',
      'Đơn giá (VNĐ)',
      'Thành tiền tồn (VNĐ)',
      'Tình trạng',
      'Lịch bảo dưỡng',
      'Dự án đang dùng',
      'Nhà cung cấp',
    ];

    const rows = filteredItems.map(it => [
      it.code,
      it.name,
      ITEM_TYPE_LABELS[it.type] || it.type,
      it.category,
      it.unit,
      it.warehouse,
      it.locationBin,
      it.modelSpecs,
      it.serialNumber || '',
      it.lotNumber || '',
      it.packingListNo || '',
      it.shipment || '',
      it.manufacturer || '',
      it.packageNo || '',
      it.packageName || '',
      it.projectItem || '',
      it.minStock,
      it.maxStock,
      it.currentStock,
      it.unitPrice,
      it.currentStock * it.unitPrice,
      ITEM_CONDITION_LABELS[it.condition] || it.condition,
      it.nextMaintenanceDate || '',
      it.allocatedProject || '',
      it.supplier,
    ]);

    exportToCSV(`Danh_muc_Vat_Tu_Ton_Kho_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  // Single item delete
  const handleConfirmSingleDelete = () => {
    if (itemToDelete) {
      deleteItem(itemToDelete.id);
      setSelectedIds(prev => prev.filter(id => id !== itemToDelete.id));
      setItemToDelete(null);
    }
  };

  // Bulk items delete
  const handleConfirmBulkDelete = () => {
    if (selectedIds.length > 0) {
      deleteMultipleItems(selectedIds);
      setSelectedIds([]);
      setIsBulkDeleteModalOpen(false);
    }
  };

  // Computed selected items stats
  const selectedItemsData = useMemo(() => {
    return items.filter(it => selectedIds.includes(it.id));
  }, [items, selectedIds]);

  const selectedTotalStock = selectedItemsData.reduce((acc, it) => acc + it.currentStock, 0);
  const selectedTotalValue = selectedItemsData.reduce((acc, it) => acc + it.currentStock * it.unitPrice, 0);

  return (
    <div className="space-y-4">
      {/* 1. Multi-Condition Engine */}
      <ConditionBuilder
        matchedCount={filteredItems.length}
        totalCount={items.length}
      />

      {/* 2. Bulk Selection Action Banner */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white px-4 py-2.5 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded">
              Đã chọn: {selectedIds.length} vật tư
            </span>
            <span className="text-xs text-slate-300 font-mono hidden md:inline">
              Tổng tồn: <strong>{formatNumber(selectedTotalStock)}</strong> | Giá trị:{' '}
              <strong>{formatVND(selectedTotalValue)}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa {selectedIds.length} mục đã chọn</span>
            </button>
            <button
              onClick={handleClearSelection}
              className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* 3. Table Action & Quick Filtering Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-3 border border-slate-200 rounded-lg">
        {/* Quick Filters */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm nhanh mã, tên, serial..."
              value={quickSearch}
              onChange={e => setQuickSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
            />
          </div>

          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-slate-800"
          >
            <option value="ALL">Tất cả phân loại</option>
            {Object.entries(ITEM_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-slate-800 max-w-[180px] truncate"
          >
            <option value="ALL">Tất cả nhóm danh mục</option>
            {categories.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={selectedWarehouse}
            onChange={e => setSelectedWarehouse(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:border-slate-800 max-w-[180px] truncate"
          >
            <option value="ALL">Tất cả kho</option>
            {warehouses.map(w => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onOpenCategoryManager && (
            <button
              onClick={onOpenCategoryManager}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
              title="Quản lý & Xóa nhóm danh mục"
            >
              <Layers className="w-3.5 h-3.5 text-slate-600" />
              <span>Quản lý danh mục</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất CSV</span>
          </button>

          <button
            onClick={onAddNewItem}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm vật tư</span>
          </button>
        </div>
      </div>

      {/* 4. High-Density Master Data Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-3 w-8 text-center">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={input => {
                      if (input) input.indeterminate = isSomeSelected;
                    }}
                    onChange={handleSelectAll}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                    title={isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  />
                </th>
                <th className="py-2.5 px-3 whitespace-nowrap">Mã VT/TB</th>
                <th className="py-2.5 px-3 min-w-[200px]">Tên & Quy cách kỹ thuật</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Phân loại / Nhóm</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Kho & Kệ</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">ĐVT</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Tồn hiện tại</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Định mức [Min-Max]</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Đơn giá vốn</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Thành tiền tồn</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Tình trạng / Bảo dưỡng</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-medium mb-1">
                      Không tìm thấy vật tư hoặc thiết bị nào phù hợp với các điều kiện lọc.
                    </p>
                    <p className="text-xs text-slate-400 mb-3">
                      Hãy thử giảm bớt điều kiện lọc hoặc đổi toán tử kết hợp sang OR (HOẶC).
                    </p>
                    <button
                      onClick={clearConditionRules}
                      className="px-3 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                    >
                      Xóa toàn bộ điều kiện lọc
                    </button>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const isSelected = selectedIds.includes(item.id);
                  const stockStatus = getItemStockStatus(item);
                  const maintStatus = getItemMaintenanceStatus(item);
                  const expStatus = getItemExpiryStatus(item);
                  const totalItemValue = item.currentStock * item.unitPrice;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors group ${
                        isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Code & Serial */}
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono">
                        <div className="font-bold text-slate-900">{item.code}</div>
                        {item.serialNumber && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            SN: {item.serialNumber}
                          </div>
                        )}
                        {item.lotNumber && (
                          <div className="text-[11px] text-slate-500 font-mono">
                            Lô: {item.lotNumber}
                          </div>
                        )}
                        {item.packingListNo && (
                          <div className="text-[10px] text-blue-700 font-mono font-medium">
                            PL: {item.packingListNo}
                          </div>
                        )}
                        {item.shipment && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            {item.shipment}
                          </div>
                        )}
                      </td>

                      {/* Name & Specs */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 leading-tight">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">
                          {item.modelSpecs}
                        </div>
                        {/* Logistics & Project Badges */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px]">
                          {item.manufacturer && (
                            <span className="text-slate-600 font-medium">
                              Hãng: <strong className="text-slate-800">{item.manufacturer}</strong>
                            </span>
                          )}
                          {item.projectItem && (
                            <span className="text-indigo-700 font-medium">
                              Hạng mục: {item.projectItem}
                            </span>
                          )}
                          {item.packageNo && (
                            <span className="text-emerald-700 font-medium">
                              Kiện: {item.packageNo}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type & Category */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-800">
                          {ITEM_TYPE_LABELS[item.type] || item.type}
                        </div>
                        <div className="text-[11px] text-slate-500">{item.category}</div>
                      </td>

                      {/* Warehouse & Location */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{item.warehouse}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{item.locationBin}</div>
                      </td>

                      {/* Unit */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap text-slate-600">
                        {item.unit}
                      </td>

                      {/* Current Stock */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-bold">
                        <span
                          className={
                            stockStatus === 'HET_HANG'
                              ? 'text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded'
                              : stockStatus === 'THIEU_HUT'
                              ? 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded'
                              : stockStatus === 'VUOT_DINH_MUC'
                              ? 'text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded'
                              : 'text-slate-900'
                          }
                        >
                          {formatNumber(item.currentStock)}
                        </span>
                      </td>

                      {/* Min - Max Level */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-[11px] text-slate-500">
                        <span>{formatNumber(item.minStock)}</span>
                        <span className="mx-1">/</span>
                        <span>{formatNumber(item.maxStock)}</span>
                      </td>

                      {/* Unit Price */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono text-slate-700">
                        {formatVND(item.unitPrice)}
                      </td>

                      {/* Total Value */}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono font-semibold text-slate-900">
                        {formatVND(totalItemValue)}
                      </td>

                      {/* Condition & Maintenance Status */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-700 font-medium">
                            {ITEM_CONDITION_LABELS[item.condition]}
                          </span>
                        </div>
                        {item.nextMaintenanceDate && (
                          <div
                            className={`flex items-center gap-1 mt-0.5 font-mono ${
                              maintStatus === 'OVERDUE'
                                ? 'text-rose-600 font-bold'
                                : maintStatus === 'DUE_SOON'
                                ? 'text-amber-600'
                                : 'text-slate-400'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>BD: {formatDate(item.nextMaintenanceDate)}</span>
                            {maintStatus === 'OVERDUE' && <span>(Quá hạn)</span>}
                          </div>
                        )}
                        {item.expiryDate && (
                          <div
                            className={`flex items-center gap-1 mt-0.5 font-mono ${
                              expStatus === 'EXPIRED'
                                ? 'text-rose-600 font-bold'
                                : expStatus === 'EXPIRING_SOON'
                                ? 'text-amber-600'
                                : 'text-slate-400'
                            }`}
                          >
                            <span>HSD: {formatDate(item.expiryDate)}</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onViewStockCard(item)}
                            title="Xem Thẻ kho chi tiết"
                            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onEditItem(item)}
                            title="Sửa thông tin"
                            className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setItemToDelete(item)}
                            title="Xóa vật tư này"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer of Table */}
        <div className="py-2.5 px-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Hiển thị <span className="font-semibold text-slate-800">{filteredItems.length}</span>{' '}
            / {items.length} mặt hàng
            {selectedIds.length > 0 && (
              <span className="ml-2 font-medium text-blue-700">
                (Đang chọn {selectedIds.length} mặt hàng)
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 font-mono">
            <span>
              Tổng lượng tồn:{' '}
              <strong className="text-slate-800">
                {formatNumber(filteredItems.reduce((acc, it) => acc + it.currentStock, 0))}
              </strong>
            </span>
            <span>
              Tổng thành tiền:{' '}
              <strong className="text-slate-900">
                {formatVND(
                  filteredItems.reduce((acc, it) => acc + it.currentStock * it.unitPrice, 0)
                )}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 5. Custom Single Item Delete Confirmation Modal (In-App) */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-full shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Xác nhận xóa vật tư khỏi hệ thống
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hành động này sẽ xóa hoàn toàn mặt hàng này khỏi danh mục tồn kho.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs space-y-1.5 font-mono">
              <div>
                <span className="text-slate-500">Mã vật tư: </span>
                <strong className="text-slate-900">{itemToDelete.code}</strong>
              </div>
              <div className="font-sans">
                <span className="text-slate-500">Tên: </span>
                <strong className="text-slate-900">{itemToDelete.name}</strong>
              </div>
              <div>
                <span className="text-slate-500">Kho lưu: </span>
                <span className="text-slate-700">{itemToDelete.warehouse}</span>
              </div>
              <div>
                <span className="text-slate-500">Tồn hiện tại: </span>
                <span className="text-rose-700 font-bold">
                  {formatNumber(itemToDelete.currentStock)} {itemToDelete.unit}
                </span>
                <span className="text-slate-500 ml-2">
                  (Trị giá: {formatVND(itemToDelete.currentStock * itemToDelete.unitPrice)})
                </span>
              </div>
            </div>

            {itemToDelete.currentStock > 0 && (
              <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-[11px]">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Lưu ý: Mặt hàng này đang có lượng tồn trong kho ({formatNumber(itemToDelete.currentStock)}). Khi xóa, số lượng này sẽ không còn trong báo cáo.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3.5 py-2 text-xs bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmSingleDelete}
                className="px-4 py-2 text-xs bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa vật tư</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Custom Bulk Delete Confirmation Modal (In-App) */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-full shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Xác nhận xóa hàng loạt ({selectedIds.length} mặt hàng)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bạn đang chuẩn bị xóa cùng lúc nhiều vật tư thiết bị khỏi danh mục.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Số lượng mặt hàng chọn:</span>
                <strong className="text-slate-900">{selectedIds.length} mục</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tổng lượng tồn bị xóa:</span>
                <strong className="text-rose-700">{formatNumber(selectedTotalStock)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tổng thành tiền ảnh hưởng:</span>
                <strong className="text-rose-700">{formatVND(selectedTotalValue)}</strong>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Hành động này không thể hoàn tác trực tiếp. Dữ liệu các mặt hàng đã chọn sẽ bị xóa khỏi danh mục tồn kho.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-3.5 py-2 text-xs bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 text-xs bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa {selectedIds.length} mặt hàng</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  Plus,
  Download,
  Eye,
  Edit2,
  Trash2,
  AlertTriangle,
  Clock,
  ArrowDownLeft,
  Warehouse as WarehouseIcon,
  CheckSquare,
  Square,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { InventoryItem } from '../types/inventory';
import {
  exportToCSV,
  formatCurrency,
  formatDate,
  formatNumber,
  getConditionLabel,
  getItemTypeLabel,
  getStockStatus,
  getStockStatusLabel,
  calculateItemWarehouseStocks,
} from '../utils/formatters';
import { MultiFilterBar } from './MultiFilterBar';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface InventoryTableViewProps {
  onSelectStockCard: (itemId: string) => void;
  onEditItem: (item: InventoryItem) => void;
  onOpenCreateItem: () => void;
  onQuickGoodsIn: (item: InventoryItem) => void;
  onOpenImportItems?: () => void;
}

export const InventoryTableView: React.FC<InventoryTableViewProps> = ({
  onSelectStockCard,
  onEditItem,
  onOpenCreateItem,
  onQuickGoodsIn,
  onOpenImportItems,
}) => {
  const {
    filteredItems,
    items,
    warehouses,
    transactions,
    deleteItem,
    deleteItemsBatch,
    currentUser,
  } = useInventory();

  const isAdmin = currentUser?.role === 'ADMIN';
  const canManage = currentUser?.role === 'ADMIN' || currentUser?.role === 'THU_KHO';

  // Multi-select state
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  // Checkbox helpers
  const isAllSelected =
    filteredItems.length > 0 &&
    filteredItems.every(i => selectedItemIds.includes(i.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map(i => i.id));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Delete Handlers
  const handleConfirmSingleDelete = () => {
    if (!itemToDelete) return;
    deleteItem(itemToDelete.id);
    setSelectedItemIds(prev => prev.filter(id => id !== itemToDelete.id));
    setItemToDelete(null);
  };

  const handleConfirmBulkDelete = () => {
    if (selectedItemIds.length === 0) return;
    deleteItemsBatch(selectedItemIds);
    setSelectedItemIds([]);
    setIsBulkDeleteOpen(false);
  };

  // Total value of currently filtered items
  const filteredTotalValue = filteredItems.reduce(
    (acc, i) => acc + i.currentStock * i.unitPrice,
    0
  );

  const handleExportCSV = () => {
    const headers = [
      'Mã SKU',
      'Tên Vật tư / Thiết bị',
      'Phân loại',
      'Nhóm ngành',
      'ĐVT',
      'Kho lưu trữ',
      'Vị trí kệ',
      'Số lượng tồn',
      'Định mức Min',
      'Định mức Max',
      'Đơn giá vốn (VNĐ)',
      'Tổng giá trị tồn (VNĐ)',
      'Số Serial / Lô',
      'Tình trạng thiết bị',
      'Hạn kiểm định',
      'Nhà cung cấp',
      'Quy cách kỹ thuật',
    ];

    const rows = filteredItems.map(item => {
      const wh = warehouses.find(w => w.id === item.warehouseId);
      return [
        item.code,
        item.name,
        getItemTypeLabel(item.type),
        item.category,
        item.unit,
        wh?.name || item.warehouseId || '',
        item.location,
        item.currentStock,
        item.minStock,
        item.maxStock,
        item.unitPrice,
        item.currentStock * item.unitPrice,
        item.serialOrLot || '',
        getConditionLabel(item.condition) || '',
        formatDate(item.inspectionDueDate),
        item.supplierDefault || '',
        item.spec || '',
      ];
    });

    exportToCSV(`Danh_Muc_Ton_Kho_${new Date().toISOString().substring(0, 10)}`, headers, rows);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner with Stats & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Danh Mục Vật Tư &amp; Thiết Bị Tồn Kho
          </h2>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
            <span>
              Hiển thị <strong className="text-slate-800 tabular-nums">{filteredItems.length}</strong> / {items.length} mặt hàng
            </span>
            <span aria-hidden="true">&bull;</span>
            <span>
              Tổng giá trị lọc:{' '}
              <strong className="text-indigo-600 tabular-nums font-semibold">
                {formatCurrency(filteredTotalValue)}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel/CSV</span>
          </button>

          {canManage && (
            <>
              <button
                type="button"
                onClick={onOpenImportItems}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap shadow-2xs"
                title="Import danh mục vật tư từ file Excel (.xlsx / .csv)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Import Excel</span>
              </button>

              <button
                onClick={onOpenCreateItem}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm vật tư / TB</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Multi-Criteria Filter Bar */}
      <MultiFilterBar />

      {/* Bulk Action Strip if items selected */}
      {selectedItemIds.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 px-4 flex items-center justify-between flex-wrap gap-2 text-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-indigo-900 font-medium">
            <CheckSquare className="w-4 h-4 text-indigo-600" />
            <span>
              Đã chọn <strong className="font-bold">{selectedItemIds.length}</strong> / {filteredItems.length} mặt hàng
            </span>
            <button
              onClick={() => setSelectedItemIds([])}
              className="text-slate-500 hover:text-slate-700 underline ml-2"
            >
              Bỏ chọn tất cả
            </button>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa {selectedItemIds.length} mục đã chọn</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-800">
              Không tìm thấy vật tư / thiết bị phù hợp
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Thử xóa bớt các điều kiện lọc hoặc đặt lại bộ lọc để xem toàn bộ danh mục kho.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  {/* Select All Checkbox */}
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      title={isAllSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả mặt hàng đang hiển thị'}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">Mã SKU</th>
                  <th className="py-3 px-4 min-w-[200px]">Tên vật tư / thiết bị</th>
                  <th className="py-3 px-3 min-w-[130px]">Số Serial / Lô</th>
                  <th className="py-3 px-3">Phân loại</th>
                  <th className="py-3 px-3">Kho &amp; Vị trí</th>
                  <th className="py-3 px-3 text-right">Tồn kho hiện tại</th>
                  <th className="py-3 px-3 text-right">Định mức (Min-Max)</th>
                  <th className="py-3 px-3 text-right">Đơn giá vốn</th>
                  <th className="py-3 px-4 text-right">Tổng thành tiền</th>
                  <th className="py-3 px-3 text-center">Tình trạng</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map(item => {
                  const wh = warehouses.find(w => w.id === item.warehouseId);
                  const status = getStockStatus(item);
                  const isLow = status === 'CANH_BAO_THAP' || status === 'HET_HANG';
                  const isOver = status === 'VUOT_DINH_MUC';
                  const totalVal = item.currentStock * item.unitPrice;
                  const isSelected = selectedItemIds.includes(item.id);

                  // Check inspection date
                  const isInspectionExpired =
                    item.inspectionDueDate && new Date(item.inspectionDueDate) < new Date();
                  const isInspectionDueSoon =
                    item.inspectionDueDate &&
                    !isInspectionExpired &&
                    new Date(item.inspectionDueDate).getTime() - new Date().getTime() <
                      30 * 24 * 60 * 60 * 1000;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/40'
                          : status === 'HET_HANG'
                          ? 'bg-rose-50/20'
                          : ''
                      }`}
                    >
                      {/* Item Checkbox */}
                      <td className="py-3.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.id)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Code */}
                      <td className="py-3.5 px-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {item.code}
                      </td>

                      {/* Name & specs */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 line-clamp-1" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{item.category}</span>
                          {item.spec && (
                            <>
                              <span aria-hidden="true">&bull;</span>
                              <span className="text-slate-400 truncate max-w-[150px]">{item.spec}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Serial / Lot Number Column */}
                      <td className="py-3.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {item.serialOrLot ? (
                          <span
                            className="inline-block bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-mono text-[11px] font-semibold border border-slate-200"
                            title={`Số serial / số lô: ${item.serialOrLot}`}
                          >
                            {item.serialOrLot}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-[11px]">—</span>
                        )}
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                          {getItemTypeLabel(item.type)}
                        </span>
                      </td>

                      {/* Warehouse & Shelf */}
                      <td className="py-3.5 px-3 whitespace-nowrap max-w-[180px]">
                        {(() => {
                          const stocks = calculateItemWarehouseStocks(item, warehouses, transactions);
                          const whWithStock = warehouses.filter(w => (stocks[w.id] || 0) > 0);
                          const tooltip =
                            whWithStock.length > 0
                              ? whWithStock
                                  .map(w => `${w.name}: ${formatNumber(stocks[w.id])} ${item.unit}`)
                                  .join('\n')
                              : wh?.name || 'Kho hệ thống';

                          return (
                            <>
                              <div
                                className="text-slate-800 font-semibold truncate flex items-center gap-1.5"
                                title={tooltip}
                              >
                                {whWithStock.length > 1 ? (
                                  <span className="bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded text-[11px] font-bold border border-indigo-100">
                                    Đa kho ({whWithStock.length})
                                  </span>
                                ) : whWithStock.length === 1 ? (
                                  <span className="truncate">{whWithStock[0].name}</span>
                                ) : (
                                  <span className="truncate text-slate-500">
                                    {wh?.name || 'Chưa phân kho'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                                Kệ: <span className="text-slate-800 font-semibold">{item.location || 'Chưa xếp kệ'}</span>
                              </div>
                            </>
                          );
                        })()}
                      </td>

                      {/* Current Stock */}
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <span
                            className={`text-sm font-bold tabular-nums ${
                              item.currentStock === 0
                                ? 'text-rose-600'
                                : item.currentStock < item.minStock
                                ? 'text-amber-600'
                                : 'text-slate-900'
                            }`}
                          >
                            {formatNumber(item.currentStock)}
                          </span>
                          <span className="text-[11px] text-slate-500">{item.unit}</span>
                        </div>
                        {isLow && (
                          <span className="text-[10px] text-rose-600 font-medium block">
                            {status === 'HET_HANG' ? 'Hết hàng' : 'Dưới định mức'}
                          </span>
                        )}
                        {isOver && (
                          <span className="text-[10px] text-amber-600 font-medium block">
                            Vượt max ({item.maxStock})
                          </span>
                        )}
                      </td>

                      {/* Min-Max threshold */}
                      <td className="py-3.5 px-3 text-right tabular-nums text-slate-500 whitespace-nowrap">
                        <span>{formatNumber(item.minStock)}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span>{formatNumber(item.maxStock)}</span>
                      </td>

                      {/* Unit Price */}
                      <td className="py-3.5 px-3 text-right tabular-nums text-slate-600 whitespace-nowrap">
                        {formatCurrency(item.unitPrice)}
                      </td>

                      {/* Total Value */}
                      <td className="py-3.5 px-4 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {formatCurrency(totalVal)}
                      </td>

                      {/* Status & Condition */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {item.type === 'THIET_BI' || item.type === 'CONG_CU' ? (
                          <div className="space-y-1">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                                item.condition === 'SAN_SANG'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : item.condition === 'DANG_MUON'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : item.condition === 'BAO_DUONG'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {getConditionLabel(item.condition)}
                            </span>

                            {item.inspectionDueDate && (
                              <div
                                className={`text-[10px] flex items-center justify-center gap-1 ${
                                  isInspectionExpired
                                    ? 'text-rose-600 font-bold'
                                    : isInspectionDueSoon
                                    ? 'text-amber-600 font-semibold'
                                    : 'text-slate-400'
                                }`}
                                title={`Hạn kiểm định: ${formatDate(item.inspectionDueDate)}`}
                              >
                                <Clock className="w-3 h-3" />
                                <span>{formatDate(item.inspectionDueDate)}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                              status === 'BINH_THUONG'
                                ? 'bg-slate-100 text-slate-700'
                                : status === 'CANH_BAO_THAP'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : status === 'HET_HANG'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200 font-semibold'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {getStockStatusLabel(status)}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => onSelectStockCard(item.id)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Xem thẻ kho chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {canManage && (
                            <>
                              <button
                                onClick={() => onQuickGoodsIn(item)}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Lập phiếu nhập thêm cho vật tư này"
                              >
                                <ArrowDownLeft className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => onEditItem(item)}
                                className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Chỉnh sửa thông tin"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {isAdmin && (
                            <button
                              onClick={() => setItemToDelete(item)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Xóa vật tư (Quản trị viên)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* In-App Single Delete Modal */}
      {itemToDelete && (
        <ConfirmDeleteModal
          isOpen={Boolean(itemToDelete)}
          title={`Xác nhận xóa vật tư "${itemToDelete.name}"`}
          message="Bạn có chắc chắn muốn xóa mặt hàng này khỏi danh mục quản lý kho?"
          itemDetails={[
            { label: 'Mã SKU', value: itemToDelete.code },
            { label: 'Tên vật tư', value: itemToDelete.name },
            { label: 'Tồn hiện tại', value: `${formatNumber(itemToDelete.currentStock)} ${itemToDelete.unit}` },
            { label: 'Tổng giá trị', value: formatCurrency(itemToDelete.currentStock * itemToDelete.unitPrice) },
          ]}
          warningNote={
            itemToDelete.currentStock > 0
              ? `Cảnh báo: Mặt hàng này hiện còn tồn ${formatNumber(itemToDelete.currentStock)} ${itemToDelete.unit}. Xóa danh mục sẽ xóa toàn bộ số dư tồn kho của mặt hàng này.`
              : undefined
          }
          confirmLabel="Xác nhận xóa"
          onConfirm={handleConfirmSingleDelete}
          onClose={() => setItemToDelete(null)}
        />
      )}

      {/* In-App Bulk Delete Modal */}
      {isBulkDeleteOpen && (
        <ConfirmDeleteModal
          isOpen={isBulkDeleteOpen}
          title={`Xác nhận xóa ${selectedItemIds.length} mặt hàng đã chọn`}
          message={`Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedItemIds.length} vật tư / thiết bị đang được chọn khỏi danh mục kho?`}
          warningNote="Cảnh báo: Thao tác này sẽ xóa đồng loạt các mặt hàng đã chọn. Dữ liệu sau khi xóa sẽ không thể khôi phục."
          confirmLabel={`Xác nhận xóa ${selectedItemIds.length} mục`}
          onConfirm={handleConfirmBulkDelete}
          onClose={() => setIsBulkDeleteOpen(false)}
        />
      )}
    </div>
  );
};

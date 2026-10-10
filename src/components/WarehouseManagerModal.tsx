import React, { useState } from 'react';
import {
  X,
  Warehouse,
  Edit2,
  Trash2,
  Plus,
  Check,
  AlertCircle,
  CheckCircle2,
  Info,
  Package,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { formatVND, formatNumber } from '../utils/formatters';

interface WarehouseManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WarehouseManagerModal: React.FC<WarehouseManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    warehouses,
    items,
    transactions,
    addWarehouse,
    renameWarehouse,
    deleteWarehouse,
  } = useInventory();

  // State for adding
  const [newWhName, setNewWhName] = useState('');
  
  // State for renaming
  const [editingWh, setEditingWh] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Alerts
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  // Compute stats per warehouse
  const warehouseStats = warehouses.map(wh => {
    const whItems = items.filter(it => it.warehouse === wh);
    const totalCount = whItems.length;
    const totalQty = whItems.reduce((acc, it) => acc + it.currentStock, 0);
    const totalValue = whItems.reduce((acc, it) => acc + it.currentStock * it.unitPrice, 0);
    const transCount = transactions.filter(t => t.warehouse === wh).length;

    return {
      name: wh,
      itemsCount: totalCount,
      totalQuantity: totalQty,
      totalValue,
      transactionsCount: transCount,
    };
  });

  const handleStartRename = (wh: string) => {
    setEditingWh(wh);
    setEditingName(wh);
    setMessage(null);
  };

  const handleCancelRename = () => {
    setEditingWh(null);
    setEditingName('');
  };

  const handleSaveRename = (oldName: string) => {
    if (!editingName.trim()) {
      setMessage({ type: 'error', text: 'Tên kho mới không được để trống.' });
      return;
    }

    const result = renameWarehouse(oldName, editingName.trim());
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      setEditingWh(null);
      setEditingName('');
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handleAddWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName.trim()) return;

    const result = addWarehouse(newWhName.trim());
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      setNewWhName('');
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handleDelete = (wh: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa kho "${wh}" không?`)) {
      const result = deleteWarehouse(wh);
      if (result.success) {
        setMessage({ type: 'success', text: result.message });
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 text-indigo-800 rounded-lg">
              <Warehouse className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Quản lý & Đổi tên kho lưu trữ
              </h2>
              <p className="text-xs text-slate-500">
                Thay đổi tên kho bãi và tự động đồng bộ tất cả vật tư, thiết bị & chứng từ liên quan
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Feedback message banner */}
          {message && (
            <div
              className={`p-3.5 rounded-lg border flex items-center gap-3 text-xs ${
                message.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              )}
              <div className="flex-1 font-medium">{message.text}</div>
              <button
                onClick={() => setMessage(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Explanatory notice */}
          <div className="bg-blue-50/70 border border-blue-200/80 rounded-lg p-3.5 flex items-start gap-3 text-xs text-blue-800">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong>Cơ chế đồng bộ tự động khi đổi tên kho:</strong>
              <p className="mt-0.5 text-blue-700">
                Khi bạn đổi tên một kho, toàn bộ danh mục vật tư/thiết bị đang nằm trong kho đó cùng với lịch sử các phiếu nhập, xuất, kiểm kê kho sẽ tự động được cập nhật sang tên mới mà không làm gián đoạn hay mất dữ liệu tồn kho.
              </p>
            </div>
          </div>

          {/* Form to add a new warehouse */}
          <form
            onSubmit={handleAddWarehouse}
            className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
          >
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Thêm địa điểm / Kho lưu trữ mới:
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Kho Trung tâm Cầu Giấy, Kho Chi nhánh Bình Dương..."
                value={newWhName}
                onChange={e => setNewWhName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>
            <button
              type="submit"
              disabled={!newWhName.trim()}
              className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md shadow-xs transition-colors shrink-0 sm:self-end cursor-pointer ${
                newWhName.trim()
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm kho mới</span>
            </button>
          </form>

          {/* Warehouse list table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-900">
                Danh sách kho bãi hiện có ({warehouses.length} kho):
              </span>
              <span>Bấm nút "Đổi tên" để chỉnh sửa tên kho</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs divide-y divide-slate-100">
              {warehouseStats.map((wh, idx) => {
                const isEditing = editingWh === wh.name;

                return (
                  <div
                    key={wh.name}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="text-xs text-slate-500 font-medium">
                            Đổi tên cho kho: <span className="font-bold text-slate-700">{wh.name}</span>
                          </div>
                          <div className="flex items-center gap-2 max-w-md">
                            <input
                              type="text"
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              autoFocus
                              className="flex-1 px-3 py-1.5 text-xs bg-white border border-indigo-400 rounded-md text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveRename(wh.name)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Lưu</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelRename}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 rounded-md transition-colors cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                          <div className="text-[11px] text-amber-700">
                            Lưu ý: Sẽ tự động đổi tên cho {wh.itemsCount} mặt hàng và {wh.transactionsCount} phiếu trong kho này.
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{wh.name}</span>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                              Kho #{idx + 1}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500 mt-1 flex-wrap">
                            <span className="flex items-center gap-1 text-slate-700">
                              <Package className="w-3.5 h-3.5 text-slate-400" />
                              <strong>{formatNumber(wh.itemsCount)}</strong> mặt hàng
                            </span>
                            <span>·</span>
                            <span>
                              Tổng số lượng: <strong className="text-slate-800">{formatNumber(wh.totalQuantity)}</strong>
                            </span>
                            <span>·</span>
                            <span>
                              Tổng giá trị: <strong className="text-slate-900 font-mono">{formatVND(wh.totalValue)}</strong>
                            </span>
                            <span>·</span>
                            <span>
                              Chứng từ liên quan: <strong>{wh.transactionsCount}</strong>
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleStartRename(wh.name)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 transition-colors shadow-xs cursor-pointer"
                          title="Đổi tên kho này"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                          <span>Đổi tên</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(wh.name)}
                          disabled={wh.itemsCount > 0}
                          className={`inline-flex items-center gap-1 p-1.5 text-xs rounded-md transition-colors ${
                            wh.itemsCount > 0
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-rose-600 hover:text-rose-800 hover:bg-rose-50 cursor-pointer'
                          }`}
                          title={
                            wh.itemsCount > 0
                              ? `Không thể xóa vì còn ${wh.itemsCount} mặt hàng trong kho`
                              : 'Xóa kho này'
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50 shrink-0">
          <div className="text-xs text-slate-500">
            Dữ liệu kho được lưu trữ an toàn trong trình duyệt
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};

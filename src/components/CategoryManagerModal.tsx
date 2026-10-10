import React, { useState } from 'react';
import {
  X,
  Layers,
  Edit2,
  Trash2,
  Plus,
  Check,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowRight,
  Package,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { formatVND, formatNumber } from '../utils/formatters';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    categories,
    items,
    addCategory,
    renameCategory,
    deleteCategory,
  } = useInventory();

  // State for adding new category
  const [newCatName, setNewCatName] = useState('');

  // State for editing category
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // State for deleting with migration
  const [deletingCat, setDeletingCat] = useState<string | null>(null);
  const [migrateTargetCat, setMigrateTargetCat] = useState<string>('');

  // Alert message
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  // Calculate statistics per category
  const categoryStats = categories.map(cat => {
    const catItems = items.filter(it => it.category === cat);
    const totalCount = catItems.length;
    const totalQty = catItems.reduce((acc, it) => acc + it.currentStock, 0);
    const totalValue = catItems.reduce((acc, it) => acc + it.currentStock * it.unitPrice, 0);

    return {
      name: cat,
      itemsCount: totalCount,
      totalQuantity: totalQty,
      totalValue,
    };
  });

  const handleStartRename = (cat: string) => {
    setEditingCat(cat);
    setEditingName(cat);
    setDeletingCat(null);
    setMessage(null);
  };

  const handleCancelRename = () => {
    setEditingCat(null);
    setEditingName('');
  };

  const handleSaveRename = (oldName: string) => {
    if (!editingName.trim()) {
      setMessage({ type: 'error', text: 'Tên danh mục mới không được để trống.' });
      return;
    }

    const result = renameCategory(oldName, editingName.trim());
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      setEditingCat(null);
      setEditingName('');
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const result = addCategory(newCatName.trim());
    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      setNewCatName('');
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handleStartDelete = (cat: string) => {
    setEditingCat(null);
    setMessage(null);

    const count = items.filter(it => it.category === cat).length;
    if (count === 0) {
      // Empty category - can be deleted directly with confirmation
      setDeletingCat(cat);
      setMigrateTargetCat('');
    } else {
      // Non-empty category - prompt migration
      setDeletingCat(cat);
      const remainingCats = categories.filter(c => c !== cat);
      setMigrateTargetCat(remainingCats[0] || '');
    }
  };

  const handleConfirmDelete = (cat: string) => {
    const count = items.filter(it => it.category === cat).length;
    let result;

    if (count === 0) {
      result = deleteCategory(cat);
    } else {
      if (!migrateTargetCat) {
        setMessage({
          type: 'error',
          text: 'Vui lòng chọn danh mục đích để chuyển các mặt hàng sang trước khi xóa.',
        });
        return;
      }
      result = deleteCategory(cat, migrateTargetCat);
    }

    if (result.success) {
      setMessage({ type: 'success', text: result.message });
      setDeletingCat(null);
      setMigrateTargetCat('');
    } else {
      setMessage({ type: 'error', text: result.message });
    }
  };

  const handleCancelDelete = () => {
    setDeletingCat(null);
    setMigrateTargetCat('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-900 text-white rounded-lg">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Quản lý & Xóa nhóm Danh mục Vật tư
              </h2>
              <p className="text-xs text-slate-500">
                Thêm mới, đổi tên hoặc xóa các nhóm danh mục vật tư trong hệ thống
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message banner */}
        {message && (
          <div
            className={`px-6 py-3 border-b flex items-center justify-between text-xs ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-medium">{message.text}</span>
            </div>
            <button
              onClick={() => setMessage(null)}
              className="text-slate-400 hover:text-slate-600 font-bold ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Quick Add New Category Form */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-slate-600" />
              <span>Thêm nhóm danh mục mới</span>
            </h3>
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input
                type="text"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Nhập tên nhóm danh mục mới (ví dụ: Vật tư viễn thông, Phụ tùng máy kéo...)"
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-800 text-slate-800"
              />
              <button
                type="submit"
                disabled={!newCatName.trim()}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </form>
          </div>

          {/* Categories List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Danh sách nhóm danh mục ({categories.length})
              </h3>
              <span className="text-[11px] text-slate-500">
                Nhấn biểu tượng cây bút để sửa tên, biểu tượng thùng rác để xóa
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
              {categoryStats.map(cat => {
                const isEditing = editingCat === cat.name;
                const isDeleting = deletingCat === cat.name;
                const remainingCats = categories.filter(c => c !== cat.name);

                return (
                  <div
                    key={cat.name}
                    className={`p-3.5 transition-colors ${
                      isEditing || isDeleting ? 'bg-amber-50/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    {isEditing ? (
                      /* Editing In-Place */
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-slate-800 font-semibold text-slate-900"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveRename(cat.name);
                              if (e.key === 'Escape') handleCancelRename();
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(cat.name)}
                            className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Lưu</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-md hover:bg-slate-100 cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Info className="w-3 h-3 text-slate-400" />
                          Khi đổi tên, toàn bộ {cat.itemsCount} mặt hàng thuộc danh mục này sẽ được tự động đồng bộ sang tên mới.
                        </p>
                      </div>
                    ) : isDeleting ? (
                      /* Deleting Confirmation Box */
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-3">
                        <div className="flex items-start gap-2 text-rose-800 text-xs">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">
                              Xác nhận xóa danh mục "{cat.name}"?
                            </span>
                            {cat.itemsCount === 0 ? (
                              <p className="text-slate-600 mt-1">
                                Danh mục này hiện không có mặt hàng nào. Bạn có thể xóa an toàn ngay bây giờ.
                              </p>
                            ) : (
                              <div className="text-slate-700 mt-1 space-y-2">
                                <p>
                                  Danh mục này đang có <strong className="text-rose-700">{cat.itemsCount} mặt hàng</strong> (Tổng tồn: {formatNumber(cat.totalQuantity)}, Giá trị: {formatVND(cat.totalValue)}).
                                </p>
                                <div>
                                  <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                                    Chuyển {cat.itemsCount} mặt hàng sang danh mục:
                                  </label>
                                  <select
                                    value={migrateTargetCat}
                                    onChange={e => setMigrateTargetCat(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
                                  >
                                    {remainingCats.map(c => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-rose-200">
                          <button
                            type="button"
                            onClick={handleCancelDelete}
                            className="px-3 py-1.5 text-xs bg-white border border-slate-300 text-slate-700 font-medium rounded-md hover:bg-slate-100 cursor-pointer"
                          >
                            Hủy bỏ
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(cat.name)}
                            className="px-3.5 py-1.5 text-xs bg-rose-600 text-white font-semibold rounded-md hover:bg-rose-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xác nhận xóa</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal Row Display */
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-slate-900">
                              {cat.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 font-mono">
                            <span className="flex items-center gap-1">
                              <Package className="w-3 h-3 text-slate-400" />
                              <strong className="text-slate-700">{cat.itemsCount}</strong> mặt hàng
                            </span>
                            <span>•</span>
                            <span>
                              Tổng tồn: <strong className="text-slate-700">{formatNumber(cat.totalQuantity)}</strong>
                            </span>
                            <span>•</span>
                            <span>
                              Trị giá: <strong className="text-slate-800">{formatVND(cat.totalValue)}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartRename(cat.name)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                            title="Sửa tên danh mục"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartDelete(cat.name)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title="Xóa danh mục này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Usage Guide */}
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-600" />
              <span>Lưu ý khi xóa danh mục:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 pl-1">
              <li>
                Nếu danh mục đang chứa mặt hàng, hệ thống sẽ hỗ trợ bạn chuyển toàn bộ các mặt hàng đó sang danh mục khác để tránh mất dữ liệu hàng hóa.
              </li>
              <li>
                Nếu bạn muốn <strong>xóa các mặt hàng cụ thể</strong> trong danh mục, hãy sang tab <strong>"Danh mục & Tồn kho"</strong>, chọn các mặt hàng và nhấn nút <strong>Xóa vật tư</strong>.
              </li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

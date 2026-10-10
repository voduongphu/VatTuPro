import React, { useState } from 'react';
import { InventoryTransaction } from '../types/inventory';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { formatVND, formatDate } from '../utils/formatters';
import {
  AlertTriangle,
  Trash2,
  X,
  Package,
  RotateCcw,
  ShieldAlert,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

interface DeleteTransactionModalProps {
  transaction: InventoryTransaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export const DeleteTransactionModal: React.FC<DeleteTransactionModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { deleteTransaction, items } = useInventory();
  const { hasPermission, user } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !transaction) return null;

  const isInbound = transaction.type === 'INBOUND';
  const requiredPermission = isInbound ? 'canDeleteInbound' : 'canDeleteOutbound';
  const isAllowed = hasPermission(requiredPermission);

  const handleDelete = () => {
    if (!isAllowed) return;

    setIsDeleting(true);
    try {
      const result = deleteTransaction(transaction.id);
      if (result.success) {
        if (onSuccess) {
          onSuccess(result.message || 'Xóa phiếu thành công.');
        }
        onClose();
      } else {
        alert(result.error || 'Có lỗi xảy ra khi xóa phiếu.');
      }
    } catch (e: any) {
      alert(`Lỗi: ${e.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-rose-100 bg-rose-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-xl text-rose-600 border border-rose-200">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-950">
                {isInbound ? 'Xác nhận Xóa Phiếu Nhập Kho' : 'Xác nhận Xóa Phiếu Xuất Kho'}
              </h3>
              <p className="text-xs text-rose-700 font-mono mt-0.5 font-semibold">
                Mã phiếu: {transaction.code}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {/* Permission check banner if not allowed */}
          {!isAllowed && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Từ chối thao tác:</strong>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Tài khoản của bạn ({user?.name || 'Khách'} - vai trò {user?.role}) không có quyền{' '}
                  <strong>{isInbound ? 'xóa phiếu nhập kho' : 'xóa phiếu xuất kho'}</strong>. Cần quyền Quản trị viên hoặc Thủ kho trưởng.
                </p>
              </div>
            </div>
          )}

          {/* Details Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
              <span>Ngày chứng từ:</span>
              <strong className="font-mono text-slate-900">{formatDate(transaction.date)}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
              <span>{isInbound ? 'Nhà cung cấp / Nguồn giao:' : 'Đơn vị / Người nhận:'}</span>
              <strong className="text-slate-900">{transaction.receiverOrSupplier}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200 text-slate-600">
              <span>Kho lưu trữ:</span>
              <strong className="text-slate-900">{transaction.warehouse}</strong>
            </div>
            <div className="flex justify-between py-1 text-slate-600">
              <span>Tổng giá trị chứng từ:</span>
              <strong className="font-mono text-slate-900 font-bold">{formatVND(transaction.totalAmount)}</strong>
            </div>
          </div>

          {/* Stock impact explanation */}
          <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl text-rose-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-rose-950">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              Tác động hoàn tác tồn kho thực tế:
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              {isInbound ? (
                <>
                  Hành động này sẽ <strong>TRỪ BỚT</strong> số lượng của {transaction.items.length} mặt hàng khỏi tồn kho
                  để hoàn tác đợt nhập này.
                </>
              ) : (
                <>
                  Hành động này sẽ <strong>HOÀN TRẢ LẠI</strong> số lượng của {transaction.items.length} mặt hàng vào tồn kho
                  (khôi phục lại số lượng như trước khi xuất).
                </>
              )}
            </p>
          </div>

          {/* Items Preview */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-700">
              Danh sách {transaction.items.length} mặt hàng sẽ được điều chỉnh tồn kho:
            </div>
            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
              {transaction.items.map((line, idx) => {
                const currentItem = items.find(it => it.id === line.itemId);
                const currentStock = currentItem?.currentStock || 0;
                const nextStock = isInbound
                  ? Math.max(0, currentStock - line.quantity)
                  : currentStock + line.quantity;

                return (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-900 truncate">
                        <span className="font-mono text-blue-700">{line.itemCode}</span> · {line.itemName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Số lượng trong phiếu: <strong>{line.quantity} {line.unit}</strong>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[11px]">
                      <div className="text-slate-400">
                        {currentStock} → <strong className={isInbound ? 'text-rose-600' : 'text-emerald-600'}>{nextStock}</strong> {line.unit}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Hủy bỏ
          </button>

          <button
            type="button"
            disabled={!isAllowed || isDeleting}
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {isDeleting ? 'Đang hoàn tác tồn & xóa...' : 'Xác nhận Xóa Vĩnh Viễn'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

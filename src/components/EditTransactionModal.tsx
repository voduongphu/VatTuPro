import React, { useState } from 'react';
import { X, Edit2, AlertCircle } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { Transaction } from '../types/inventory';
import {
  formatCurrency,
  formatDateTime,
  getSubtypeLabel,
  getTransactionTypeLabel,
} from '../utils/formatters';

interface EditTransactionModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  onClose,
  onSuccess,
}) => {
  const { updateTransaction, warehouses } = useInventory();

  if (!transaction) return null;

  const [date, setDate] = useState(transaction.date);
  const [partnerName, setPartnerName] = useState(transaction.partnerName);
  const [departmentOrProject, setDepartmentOrProject] = useState(
    transaction.departmentOrProject
  );
  const [creatorName, setCreatorName] = useState(transaction.creatorName);
  const [approverName, setApproverName] = useState(
    transaction.approverName || ''
  );
  const [notes, setNotes] = useState(transaction.notes);
  const [error, setError] = useState('');

  const wh = warehouses.find(w => w.id === transaction.warehouseId);
  const isReceipt = transaction.type === 'NHAP_KHO';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!partnerName.trim()) {
      setError('Vui lòng nhập đối tác / nhà cung cấp / người nhận.');
      return;
    }

    const res = updateTransaction(transaction.id, {
      date,
      partnerName: partnerName.trim(),
      departmentOrProject: departmentOrProject.trim(),
      creatorName: creatorName.trim(),
      approverName: approverName.trim(),
      notes: notes.trim(),
    });

    if (!res.success) {
      setError(res.error || 'Lỗi khi cập nhật phiếu.');
      return;
    }

    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <Edit2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Chỉnh Sửa Thông Tin Phiếu: {transaction.code}
              </h2>
              <p className="text-xs text-slate-500">
                {getTransactionTypeLabel(transaction.type)} &bull; {getSubtypeLabel(transaction.subtype)} &bull; Kho: {wh?.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Thời gian lập phiếu
              </label>
              <input
                type="text"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none font-mono"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {isReceipt ? 'Nhà cung cấp / Đơn vị giao *' : 'Người nhận / Đơn vị nhận *'}
              </label>
              <input
                type="text"
                value={partnerName}
                onChange={e => setPartnerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Dự án / Phòng ban
              </label>
              <input
                type="text"
                value={departmentOrProject}
                onChange={e => setDepartmentOrProject(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Người phê duyệt
              </label>
              <input
                type="text"
                value={approverName}
                onChange={e => setApproverName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Ghi chú nghiệp vụ
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none"
            />
          </div>

          {/* Readonly Summary of items */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="font-semibold text-slate-700 block mb-1.5">
              Danh sách {transaction.items.length} mặt hàng trong phiếu (Tổng giá trị: {formatCurrency(transaction.totalAmount)})
            </span>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {transaction.items.map((line, idx) => (
                <div key={idx} className="flex justify-between text-slate-600">
                  <span>
                    [{line.itemCode}] {line.itemName}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {line.quantity} {line.unit} &bull; {formatCurrency(line.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs"
            >
              Lưu thay đổi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  X,
  Edit2,
  AlertCircle,
  ShieldCheck,
  Plus,
  Trash2,
  Package,
  Layers,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { Transaction, TransactionLineItem, TransactionSubtype } from '../types/inventory';
import {
  formatCurrency,
  formatNumber,
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
  const { updateTransaction, warehouses, items: inventoryItems, currentUser } = useInventory();

  if (!transaction) return null;

  const isAdmin = currentUser?.role === 'ADMIN';
  const isReceipt = transaction.type === 'NHAP_KHO';

  // Header State
  const [code, setCode] = useState(transaction.code);
  const [date, setDate] = useState(transaction.date);
  const [warehouseId, setWarehouseId] = useState(transaction.warehouseId);
  const [subtype, setSubtype] = useState<TransactionSubtype>(transaction.subtype);
  const [partnerName, setPartnerName] = useState(transaction.partnerName);
  const [departmentOrProject, setDepartmentOrProject] = useState(transaction.departmentOrProject);
  const [creatorName, setCreatorName] = useState(transaction.creatorName);
  const [approverName, setApproverName] = useState(transaction.approverName || '');
  const [notes, setNotes] = useState(transaction.notes || '');
  const [status, setStatus] = useState(transaction.status);

  // Editable Items State (Admin only has full rights to edit details and quantities)
  const [lineItems, setLineItems] = useState<TransactionLineItem[]>(() =>
    transaction.items.map(it => ({
      ...it,
      quantity: it.quantity ?? 1,
      unitPrice: it.unitPrice ?? 0,
      amount: it.amount ?? (it.quantity ?? 1) * (it.unitPrice ?? 0),
    }))
  );

  const [error, setError] = useState('');
  const [selectedAddItemId, setSelectedAddItemId] = useState('');

  // Available inventory items for quick addition
  const availableItemsInWarehouse = inventoryItems.filter(
    i => i.warehouseId === warehouseId
  );

  // Calculate live totals
  const totalQuantity = lineItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const totalAmount = lineItems.reduce(
    (acc, it) => acc + (Number(it.amount) || (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
    0
  );

  // Item row change handler
  const handleItemFieldChange = (
    index: number,
    field: keyof TransactionLineItem,
    value: any
  ) => {
    setLineItems(prev => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };

      if (field === 'quantity' || field === 'unitPrice') {
        const q = field === 'quantity' ? Math.max(0, Number(value) || 0) : target.quantity;
        const p = field === 'unitPrice' ? Math.max(0, Number(value) || 0) : target.unitPrice;
        target.quantity = q;
        target.unitPrice = p;
        target.amount = q * p;
      }

      updated[index] = target;
      return updated;
    });
  };

  // Add line item from catalog
  const handleAddCatalogItem = () => {
    if (!selectedAddItemId) return;

    if (selectedAddItemId === '__CUSTOM__') {
      const newLine: TransactionLineItem = {
        itemId: `TEMP-EDIT-${Date.now()}`,
        itemCode: `VT-${Date.now().toString().slice(-4)}`,
        itemName: 'Vật tư bổ sung mới',
        unit: 'Cái',
        quantity: 1,
        unitPrice: 0,
        amount: 0,
        spec: '',
        serialNumber: '',
        note: '',
      };
      setLineItems(prev => [...prev, newLine]);
      setSelectedAddItemId('');
      return;
    }

    const item = inventoryItems.find(i => i.id === selectedAddItemId);
    if (!item) return;

    const newLine: TransactionLineItem = {
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      quantity: 1,
      unitPrice: item.unitPrice,
      amount: item.unitPrice * 1,
      spec: item.spec || '',
      serialNumber: item.serialOrLot || '',
      note: '',
    };

    setLineItems(prev => [...prev, newLine]);
    setSelectedAddItemId('');
  };

  // Remove line item
  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length <= 1) {
      setError('Phiếu phải có ít nhất 1 dòng vật tư.');
      return;
    }
    setLineItems(prev => prev.filter((_, idx) => idx !== index));
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!code.trim()) {
      setError('Vui lòng nhập số phiếu.');
      return;
    }
    if (!partnerName.trim()) {
      setError('Vui lòng nhập đối tác / nhà cung cấp / người nhận.');
      return;
    }
    if (lineItems.length === 0) {
      setError('Phiếu phải có ít nhất 1 mặt hàng.');
      return;
    }

    for (let i = 0; i < lineItems.length; i++) {
      const it = lineItems[i];
      if (!it.itemName.trim()) {
        setError(`Dòng ${i + 1}: Vui lòng nhập tên vật tư.`);
        return;
      }
      if (it.quantity <= 0) {
        setError(`Dòng ${i + 1} (${it.itemName}): Số lượng vật tư phải lớn hơn 0.`);
        return;
      }
    }

    const res = updateTransaction(transaction.id, {
      code: code.trim(),
      date,
      warehouseId,
      subtype,
      partnerName: partnerName.trim(),
      departmentOrProject: departmentOrProject.trim(),
      creatorName: creatorName.trim(),
      approverName: approverName.trim(),
      notes: notes.trim(),
      status,
      items: lineItems,
      totalAmount,
    });

    if (!res.success) {
      setError(res.error || 'Lỗi khi cập nhật phiếu.');
      return;
    }

    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Edit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Chỉnh Sửa Chi Tiết Phiếu: {transaction.code}
                </h2>
                {isAdmin ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Quyền Admin</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">
                    Thủ kho
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {getTransactionTypeLabel(transaction.type)} &bull; {getSubtypeLabel(transaction.subtype)}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {isAdmin && (
            <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-emerald-900 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Quyền Quản trị viên (Admin):</strong> Bạn có toàn quyền sửa đổi chi tiết tất cả các nội dung trong phiếu, bao gồm số phiếu, ngày lập, kho lưu trữ, đối tác và <strong>danh mục từng dòng vật tư, số lượng, đơn giá</strong>. Số dư tồn kho sẽ được hệ thống tự động cân đối tương ứng.
              </div>
            </div>
          )}

          {/* Section 1: General Info */}
          <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 space-y-3.5">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <span>Thông tin chứng từ</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mã số phiếu *
                </label>
                <input
                  type="text"
                  value={code}
                  disabled={!isAdmin}
                  onChange={e => setCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none font-mono font-bold text-indigo-700 bg-white disabled:bg-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Thời gian lập phiếu *
                </label>
                <input
                  type="text"
                  value={date}
                  disabled={!isAdmin}
                  onChange={e => setDate(e.target.value)}
                  placeholder="YYYY-MM-DD HH:mm"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none font-mono bg-white disabled:bg-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Kho lưu trữ (Kho hàng) *
                </label>
                <select
                  value={warehouseId}
                  disabled={!isAdmin}
                  onChange={e => setWarehouseId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white font-medium disabled:bg-slate-100"
                  required
                >
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {isReceipt ? 'Đơn vị giao / Nhà cung cấp *' : 'Người nhận / Đơn vị nhận *'}
                </label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={e => setPartnerName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Dự án / Phòng ban thi công *
                </label>
                <input
                  type="text"
                  value={departmentOrProject}
                  onChange={e => setDepartmentOrProject(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Hình thức nghiệp vụ
                </label>
                <select
                  value={subtype}
                  disabled={!isAdmin}
                  onChange={e => setSubtype(e.target.value as TransactionSubtype)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white disabled:bg-slate-100"
                >
                  {isReceipt ? (
                    <>
                      <option value="NHAP_MUA_MOI">Nhập mua mới</option>
                      <option value="NHAP_THU_HOI_DU_AN">Nhập thu hồi dự án</option>
                      <option value="NHAP_TRA_SAU_MUON">Nhập trả lại sau mượn</option>
                      <option value="NHAP_CHUYEN_KHO">Nhập điều chuyển kho</option>
                      <option value="NHAP_DIEU_CHINH">Nhập điều chỉnh kiểm kê</option>
                    </>
                  ) : (
                    <>
                      <option value="XUAT_THI_CONG">Xuất phục vụ thi công</option>
                      <option value="XUAT_PHONG_BAN">Xuất nội bộ phòng ban</option>
                      <option value="XUAT_CHO_MUON">Xuất cho mượn tạm thời</option>
                      <option value="XUAT_BAO_DUONG">Xuất đi bảo dưỡng/sửa chữa</option>
                      <option value="XUAT_CHUYEN_KHO">Xuất điều chuyển kho</option>
                      <option value="XUAT_THANH_LY">Xuất thanh lý tài sản</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Người lập phiếu
                </label>
                <input
                  type="text"
                  value={creatorName}
                  disabled={!isAdmin}
                  onChange={e => setCreatorName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white disabled:bg-slate-100"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Trạng thái phiếu
                </label>
                <select
                  value={status}
                  disabled={!isAdmin}
                  onChange={e => setStatus(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white disabled:bg-slate-100"
                >
                  <option value="HOAN_THANH">Đã lưu sổ (Hoàn thành)</option>
                  <option value="CHO_DUYET">Chờ phê duyệt</option>
                  <option value="DA_HUY">Đã hủy</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ghi chú / Diễn giải nghiệp vụ
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Nhập ghi chú hoặc lý do nhập/xuất..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white"
              />
            </div>
          </div>

          {/* Section 2: Items Table - Detail Editing */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-indigo-600" />
                  <span>Chi tiết danh mục vật tư trong phiếu</span>
                  <span className="text-slate-500 font-normal">({lineItems.length} mặt hàng)</span>
                </h3>
                <p className="text-slate-500 text-[11px]">
                  {isAdmin
                    ? 'Quản trị viên có quyền sửa đổi mã, tên, số lượng, đơn giá, số lô và ghi chú từng dòng'
                    : 'Chỉ Quản trị viên mới có quyền thay đổi danh mục và số lượng vật tư trong phiếu'}
                </p>
              </div>

              {/* Add item control for Admin */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedAddItemId}
                    onChange={e => setSelectedAddItemId(e.target.value)}
                    className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white outline-none max-w-[200px]"
                  >
                    <option value="">-- Thêm vật tư vào phiếu --</option>
                    {availableItemsInWarehouse.map(it => (
                      <option key={it.id} value={it.id}>
                        [{it.code}] {it.name}
                      </option>
                    ))}
                    <option value="__CUSTOM__">+ Nhập tên vật tư mới tự do</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddCatalogItem}
                    disabled={!selectedAddItemId}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm dòng</span>
                  </button>
                </div>
              )}
            </div>

            {/* Table of Line Items */}
            <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-xs bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <th className="py-2.5 px-3 w-10 text-center">STT</th>
                    <th className="py-2.5 px-3 min-w-[130px]">Mã SKU</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Tên vật tư / Thiết bị</th>
                    <th className="py-2.5 px-2 w-20">ĐVT</th>
                    <th className="py-2.5 px-3 w-28 text-right bg-indigo-50/60 text-indigo-900">
                      Số lượng *
                    </th>
                    <th className="py-2.5 px-3 w-32 text-right">Đơn giá (VNĐ)</th>
                    <th className="py-2.5 px-3 w-32 text-right">Thành tiền (VNĐ)</th>
                    <th className="py-2.5 px-2 min-w-[120px]">Số lô / Serial</th>
                    <th className="py-2.5 px-2 min-w-[120px]">Ghi chú dòng</th>
                    {isAdmin && <th className="py-2.5 px-2 w-10 text-center">Xóa</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lineItems.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                      {/* STT */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-semibold font-mono">
                        {idx + 1}
                      </td>

                      {/* Code */}
                      <td className="py-2 px-3">
                        {isAdmin ? (
                          <input
                            type="text"
                            value={line.itemCode}
                            onChange={e => handleItemFieldChange(idx, 'itemCode', e.target.value.toUpperCase())}
                            className="w-full px-2 py-1 border border-slate-200 rounded font-mono text-[11px] font-semibold text-slate-800 bg-white focus:border-indigo-500 outline-none"
                            placeholder="Mã SKU"
                          />
                        ) : (
                          <span className="font-mono text-[11px] font-semibold text-slate-700">
                            {line.itemCode}
                          </span>
                        )}
                      </td>

                      {/* Name */}
                      <td className="py-2 px-3">
                        {isAdmin ? (
                          <input
                            type="text"
                            value={line.itemName}
                            onChange={e => handleItemFieldChange(idx, 'itemName', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-slate-800 bg-white focus:border-indigo-500 outline-none"
                            placeholder="Tên vật tư"
                            required
                          />
                        ) : (
                          <span className="font-medium text-slate-900">{line.itemName}</span>
                        )}
                      </td>

                      {/* Unit */}
                      <td className="py-2 px-2">
                        {isAdmin ? (
                          <input
                            type="text"
                            value={line.unit}
                            onChange={e => handleItemFieldChange(idx, 'unit', e.target.value)}
                            className="w-full px-1.5 py-1 border border-slate-200 rounded text-center text-slate-700 bg-white focus:border-indigo-500 outline-none"
                          />
                        ) : (
                          <span className="text-slate-600">{line.unit}</span>
                        )}
                      </td>

                      {/* Quantity (Cột Số Lượng Vật Tư - Crucial) */}
                      <td className="py-2 px-3 bg-indigo-50/30">
                        {isAdmin ? (
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={line.quantity}
                            onChange={e => handleItemFieldChange(idx, 'quantity', e.target.value)}
                            className="w-full px-2 py-1 border-2 border-indigo-300 rounded font-bold text-right text-indigo-900 bg-white focus:border-indigo-600 outline-none tabular-nums"
                            required
                          />
                        ) : (
                          <div className="text-right font-bold text-slate-900 tabular-nums">
                            {formatNumber(line.quantity)}
                          </div>
                        )}
                      </td>

                      {/* Unit Price */}
                      <td className="py-2 px-3">
                        {isAdmin ? (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.unitPrice}
                            onChange={e => handleItemFieldChange(idx, 'unitPrice', e.target.value)}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-right text-slate-800 bg-white focus:border-indigo-500 outline-none tabular-nums"
                          />
                        ) : (
                          <div className="text-right text-slate-700 tabular-nums">
                            {formatCurrency(line.unitPrice)}
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                        {formatCurrency(line.amount || line.quantity * line.unitPrice)}
                      </td>

                      {/* Serial / Lot */}
                      <td className="py-2 px-2">
                        {isAdmin ? (
                          <input
                            type="text"
                            value={line.serialNumber || ''}
                            onChange={e => handleItemFieldChange(idx, 'serialNumber', e.target.value)}
                            placeholder="Số lô / Serial"
                            className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] text-slate-700 bg-white outline-none"
                          />
                        ) : (
                          <span className="text-slate-500 text-[11px]">{line.serialNumber || '-'}</span>
                        )}
                      </td>

                      {/* Note */}
                      <td className="py-2 px-2">
                        {isAdmin ? (
                          <input
                            type="text"
                            value={line.note || ''}
                            onChange={e => handleItemFieldChange(idx, 'note', e.target.value)}
                            placeholder="Ghi chú dòng"
                            className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] text-slate-700 bg-white outline-none"
                          />
                        ) : (
                          <span className="text-slate-500 text-[11px]">{line.note || '-'}</span>
                        )}
                      </td>

                      {/* Delete Line */}
                      {isAdmin && (
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Xóa dòng vật tư này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                    <td colSpan={4} className="py-3 px-3 uppercase text-[11px]">
                      Tổng cộng chứng từ ({lineItems.length} mặt hàng)
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-indigo-700 text-sm bg-indigo-50/50">
                      {formatNumber(totalQuantity)}
                    </td>
                    <td className="py-3 px-3 text-right text-slate-400">-</td>
                    <td className="py-3 px-3 text-right tabular-nums text-indigo-900 text-sm">
                      {formatCurrency(totalAmount)}
                    </td>
                    <td colSpan={isAdmin ? 3 : 2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Tổng số lượng: <strong className="text-slate-900">{formatNumber(totalQuantity)}</strong> &bull; Tổng tiền: <strong className="text-indigo-700">{formatCurrency(totalAmount)}</strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 font-medium transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Lưu thay đổi chi tiết</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useInventory } from '../context/InventoryContext';
import {
  TransactionType,
  InboundReason,
  OutboundReason,
  INBOUND_REASON_LABELS,
  OUTBOUND_REASON_LABELS,
  TransactionLineItem,
  InventoryTransaction,
} from '../types/inventory';
import { formatVND, formatNumber } from '../utils/formatters';
import { X, Plus, Trash2, AlertCircle, FileSpreadsheet, Edit3 } from 'lucide-react';

interface TransactionModalProps {
  initialType?: TransactionType;
  transactionToEdit?: InventoryTransaction | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenExcelImport?: () => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  initialType = 'INBOUND',
  transactionToEdit = null,
  isOpen,
  onClose,
  onOpenExcelImport,
}) => {
  const { items, warehouses, projects, suppliers, createTransaction, updateTransaction } = useInventory();

  const [type, setType] = useState<TransactionType>(initialType);
  const [warehouse, setWarehouse] = useState(warehouses[0] || 'Kho Tổng A (Hà Nội)');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inboundReason, setInboundReason] = useState<InboundReason>('PURCHASE');
  const [outboundReason, setOutboundReason] = useState<OutboundReason>('PROJECT_DISPATCH');
  const [creator, setCreator] = useState('Thủ kho');
  const [receiverOrSupplier, setReceiverOrSupplier] = useState('');
  const [departmentOrProject, setDepartmentOrProject] = useState('');
  const [projectItem, setProjectItem] = useState('');
  const [packingListNo, setPackingListNo] = useState('');
  const [shipment, setShipment] = useState('');
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isEditing = !!transactionToEdit;

  useEffect(() => {
    if (transactionToEdit) {
      setType(transactionToEdit.type);
      setWarehouse(transactionToEdit.warehouse);
      setDate(transactionToEdit.date);
      if (transactionToEdit.type === 'INBOUND') {
        setInboundReason((transactionToEdit.subReason as InboundReason) || 'PURCHASE');
      } else {
        setOutboundReason((transactionToEdit.subReason as OutboundReason) || 'PROJECT_DISPATCH');
      }
      setCreator(transactionToEdit.creator || 'Thủ kho');
      setReceiverOrSupplier(transactionToEdit.receiverOrSupplier || '');
      setDepartmentOrProject(transactionToEdit.departmentOrProject || '');
      setProjectItem(transactionToEdit.projectItem || '');
      setPackingListNo(transactionToEdit.packingListNo || '');
      setShipment(transactionToEdit.shipment || '');
      setNote(transactionToEdit.note || '');
      setLines(
        transactionToEdit.items.length > 0
          ? transactionToEdit.items.map(it => ({
              itemId: it.itemId,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              lotNumber: it.lotNumber,
              serialNumber: it.serialNumber,
              packageNo: it.packageNo,
              packageName: it.packageName,
              manufacturer: it.manufacturer,
              notes: it.notes,
            }))
          : [
              {
                itemId: items[0]?.id || '',
                quantity: 1,
                unitPrice: items[0]?.unitPrice || 0,
                packageNo: items[0]?.packageNo || '',
                packageName: items[0]?.packageName || '',
                manufacturer: items[0]?.manufacturer || '',
              },
            ]
      );
    } else {
      setType(initialType);
      setWarehouse(warehouses[0] || 'Kho Tổng A (Hà Nội)');
      setDate(new Date().toISOString().slice(0, 10));
      setInboundReason('PURCHASE');
      setOutboundReason('PROJECT_DISPATCH');
      setCreator('Thủ kho');
      setReceiverOrSupplier('');
      setDepartmentOrProject('');
      setProjectItem('');
      setPackingListNo('');
      setShipment('');
      setNote('');
      setLines([
        {
          itemId: items[0]?.id || '',
          quantity: 1,
          unitPrice: items[0]?.unitPrice || 0,
          packageNo: items[0]?.packageNo || '',
          packageName: items[0]?.packageName || '',
          manufacturer: items[0]?.manufacturer || '',
        },
      ]);
    }
    setErrorMessage('');
  }, [isOpen, transactionToEdit, initialType]);

  // Line items state
  const [lines, setLines] = useState<
    Array<{
      itemId: string;
      quantity: number;
      unitPrice: number;
      lotNumber?: string;
      serialNumber?: string;
      packageNo?: string;
      packageName?: string;
      manufacturer?: string;
      notes?: string;
    }>
  >([
    {
      itemId: items[0]?.id || '',
      quantity: 1,
      unitPrice: items[0]?.unitPrice || 0,
      packageNo: items[0]?.packageNo || '',
      packageName: items[0]?.packageName || '',
      manufacturer: items[0]?.manufacturer || '',
    },
  ]);

  if (!isOpen) return null;

  // Auto-generate code
  const codePrefix = type === 'INBOUND' ? 'PNK' : 'PXK';
  const autoCode = transactionToEdit ? transactionToEdit.code : `${codePrefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

  const handleAddLine = () => {
    const defaultItem = items[0];
    setLines(prev => [
      ...prev,
      {
        itemId: defaultItem ? defaultItem.id : '',
        quantity: 1,
        unitPrice: defaultItem ? defaultItem.unitPrice : 0,
        packageNo: defaultItem ? defaultItem.packageNo : '',
        packageName: defaultItem ? defaultItem.packageName : '',
        manufacturer: defaultItem ? defaultItem.manufacturer : '',
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setLines(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleItemSelect = (index: number, itemId: string) => {
    const selectedItem = items.find(it => it.id === itemId);
    setLines(prev =>
      prev.map((l, idx) => {
        if (idx !== index) return l;
        return {
          ...l,
          itemId,
          unitPrice: selectedItem ? selectedItem.unitPrice : 0,
          packageNo: selectedItem?.packageNo || l.packageNo,
          packageName: selectedItem?.packageName || l.packageName,
          manufacturer: selectedItem?.manufacturer || l.manufacturer,
        };
      })
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setLines(prev =>
      prev.map((l, idx) => (idx === index ? { ...l, quantity: Math.max(1, qty) } : l))
    );
  };

  const handlePriceChange = (index: number, price: number) => {
    setLines(prev =>
      prev.map((l, idx) => (idx === index ? { ...l, unitPrice: Math.max(0, price) } : l))
    );
  };

  // Calculate totals
  const totalAmount = lines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (lines.length === 0) {
      setErrorMessage('Vui lòng thêm ít nhất một mặt hàng.');
      return;
    }

    if (!receiverOrSupplier.trim()) {
      setErrorMessage(
        type === 'INBOUND'
          ? 'Vui lòng nhập Nhà cung cấp hoặc Nguồn giao hàng.'
          : 'Vui lòng nhập Người hoặc Đơn vị nhận hàng.'
      );
      return;
    }

    // Prepare line items
    const preparedItems: TransactionLineItem[] = [];
    for (const line of lines) {
      const item = items.find(it => it.id === line.itemId);
      if (!item) {
        setErrorMessage('Có mặt hàng chưa được chọn đúng.');
        return;
      }
      if (line.quantity <= 0) {
        setErrorMessage(`Số lượng cho mặt hàng [${item.code}] phải lớn hơn 0.`);
        return;
      }
      if (type === 'OUTBOUND' && !isEditing && line.quantity > item.currentStock) {
        setErrorMessage(
          `Vật tư [${item.code} - ${item.name}] chỉ còn tồn ${item.currentStock} ${item.unit}, không thể xuất ${line.quantity} ${item.unit}!`
        );
        return;
      }

      preparedItems.push({
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.quantity * line.unitPrice,
        lotNumber: line.lotNumber || item.lotNumber,
        serialNumber: line.serialNumber || item.serialNumber,
        packageNo: line.packageNo || item.packageNo,
        packageName: line.packageName || item.packageName,
        manufacturer: line.manufacturer || item.manufacturer,
        packingListNo: packingListNo || item.packingListNo,
        warehouse,
        notes: line.notes,
      });
    }

    if (isEditing && transactionToEdit) {
      const result = updateTransaction(transactionToEdit.id, {
        subReason: type === 'INBOUND' ? inboundReason : outboundReason,
        date,
        creator,
        receiverOrSupplier: receiverOrSupplier.trim(),
        departmentOrProject: departmentOrProject.trim(),
        projectItem: projectItem.trim() || undefined,
        packingListNo: packingListNo.trim() || undefined,
        shipment: shipment.trim() || undefined,
        warehouse,
        items: preparedItems,
        totalAmount,
        note: note.trim(),
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Có lỗi xảy ra khi lưu phiếu.');
        return;
      }
    } else {
      const result = createTransaction({
        code: autoCode,
        type,
        subReason: type === 'INBOUND' ? inboundReason : outboundReason,
        date,
        creator,
        receiverOrSupplier: receiverOrSupplier.trim(),
        departmentOrProject: departmentOrProject.trim(),
        projectItem: projectItem.trim() || undefined,
        packingListNo: packingListNo.trim() || undefined,
        shipment: shipment.trim() || undefined,
        warehouse,
        status: 'COMPLETED',
        items: preparedItems,
        totalAmount,
        note: note.trim(),
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Có lỗi xảy ra khi lưu phiếu.');
        return;
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              {isEditing ? (
                <>
                  <Edit3 className="w-4 h-4 text-blue-600" />
                  <span>Chỉnh sửa Phiếu {type === 'INBOUND' ? 'Nhập kho' : 'Xuất kho'}</span>
                </>
              ) : (
                <span>{type === 'INBOUND' ? 'Lập Phiếu Nhập Kho Vật Tư' : 'Lập Phiếu Xuất Kho Vật Tư'}</span>
              )}
            </h3>
            <p className="text-xs text-slate-500">
              {isEditing ? (
                <>
                  Mã phiếu: <span className="font-mono font-bold text-blue-700">{transactionToEdit.code}</span>
                </>
              ) : (
                <>
                  Mã phiếu dự kiến:{' '}
                  <span className="font-mono font-semibold text-slate-800">{autoCode}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <div className="flex items-center bg-slate-200 p-0.5 rounded-md">
                <button
                  type="button"
                  onClick={() => setType('INBOUND')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    type === 'INBOUND'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Nhập kho
                </button>
                <button
                  type="button"
                  onClick={() => setType('OUTBOUND')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    type === 'OUTBOUND'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Xuất kho
                </button>
              </div>
            )}
                onClick={() => setType('OUTBOUND')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  type === 'OUTBOUND'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Xuất kho
              </button>
            </div>

            {type === 'INBOUND' && onOpenExcelImport && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenExcelImport();
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded transition-colors cursor-pointer"
                title="Nhập hàng loạt từ tệp Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Nhập từ Excel</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* General Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Ngày ghi sổ *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Kho {type === 'INBOUND' ? 'tiếp nhận' : 'xuất hàng'} *
              </label>
              <select
                value={warehouse}
                onChange={e => setWarehouse(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              >
                {warehouses.map(w => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Lý do / Mục đích *
              </label>
              {type === 'INBOUND' ? (
                <select
                  value={inboundReason}
                  onChange={e => setInboundReason(e.target.value as InboundReason)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
                >
                  {Object.entries(INBOUND_REASON_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={outboundReason}
                  onChange={e => setOutboundReason(e.target.value as OutboundReason)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
                >
                  {Object.entries(OUTBOUND_REASON_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {type === 'INBOUND' ? 'Nhà cung cấp / Nguồn giao *' : 'Người / Đơn vị nhận hàng *'}
              </label>
              <input
                type="text"
                required
                placeholder={
                  type === 'INBOUND'
                    ? 'Ví dụ: Tập đoàn Thép Hòa Phát...'
                    : 'Ví dụ: Đội thi công Cơ điện số 1...'
                }
                value={receiverOrSupplier}
                onChange={e => setReceiverOrSupplier(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Dự án / Phòng ban liên quan
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Dự án Nhà máy Viglacera..."
                value={departmentOrProject}
                onChange={e => setDepartmentOrProject(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Hạng mục công trình / Gói thầu
              </label>
              <input
                type="text"
                placeholder="Ví dụ: Hạng mục Cơ điện M&E..."
                value={projectItem}
                onChange={e => setProjectItem(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Số Packing List (P/L)
              </label>
              <input
                type="text"
                placeholder="Ví dụ: PL-2026-EU-084..."
                value={packingListNo}
                onChange={e => setPackingListNo(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Lô hàng / Shipment / Chuyến xe-tàu
              </label>
              <input
                type="text"
                placeholder="Ví dụ: SHP-2026-VN02, Cont MSKU-9182..."
                value={shipment}
                onChange={e => setShipment(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Người lập phiếu
              </label>
              <input
                type="text"
                value={creator}
                onChange={e => setCreator(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Ghi chú chứng từ
            </label>
            <input
              type="text"
              placeholder="Ví dụ: Cấp theo kế hoạch số 12/TB-BCH, kèm hóa đơn VAT..."
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
            />
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                Danh sách chi tiết vật tư ({lines.length} mặt hàng)
              </span>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm dòng vật tư
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3 w-8 text-center">STT</th>
                    <th className="py-2 px-3 min-w-[200px]">Vật tư / Thiết bị</th>
                    <th className="py-2 px-2 min-w-[130px]">Kiện hàng (Số & Tên)</th>
                    <th className="py-2 px-2 min-w-[110px]">Hãng SX</th>
                    <th className="py-2 px-3 text-right w-20">Tồn kho</th>
                    <th className="py-2 px-3 text-right w-24">Số lượng</th>
                    <th className="py-2 px-3 text-right w-28">Đơn giá (VNĐ)</th>
                    <th className="py-2 px-3 text-right w-32">Thành tiền</th>
                    <th className="py-2 px-2 w-8 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, idx) => {
                    const currentItem = items.find(it => it.id === line.itemId);
                    const availableStock = currentItem ? currentItem.currentStock : 0;
                    const isExceeding = type === 'OUTBOUND' && line.quantity > availableStock;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 text-center font-mono text-slate-400">
                          {idx + 1}
                        </td>

                        {/* Item selector */}
                        <td className="py-2 px-3">
                          <select
                            value={line.itemId}
                            onChange={e => handleItemSelect(idx, e.target.value)}
                            className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-slate-800"
                          >
                            {items.map(it => (
                              <option key={it.id} value={it.id}>
                                [{it.code}] {it.name} ({it.unit})
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Package No & Name */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            placeholder="Số/Tên kiện..."
                            value={line.packageNo || ''}
                            onChange={e =>
                              setLines(prev =>
                                prev.map((l, i) => (i === idx ? { ...l, packageNo: e.target.value } : l))
                              )
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded text-slate-800 font-mono"
                          />
                        </td>

                        {/* Manufacturer */}
                        <td className="py-2 px-2">
                          <input
                            type="text"
                            placeholder="Hãng SX..."
                            value={line.manufacturer || ''}
                            onChange={e =>
                              setLines(prev =>
                                prev.map((l, i) => (i === idx ? { ...l, manufacturer: e.target.value } : l))
                              )
                            }
                            className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded text-slate-800"
                          />
                        </td>

                        {/* Available Stock */}
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {formatNumber(availableStock)} {currentItem?.unit}
                        </td>

                        {/* Quantity */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={line.quantity}
                            onChange={e => handleQuantityChange(idx, Number(e.target.value))}
                            className={`w-full px-2 py-1.5 text-xs text-right font-mono rounded border ${
                              isExceeding
                                ? 'border-red-500 bg-red-50 text-red-700 font-bold'
                                : 'border-slate-300 bg-white text-slate-800 focus:border-slate-800'
                            }`}
                          />
                          {isExceeding && (
                            <div className="text-[10px] text-red-600 mt-0.5">
                              Vượt tồn ({availableStock})
                            </div>
                          )}
                        </td>

                        {/* Unit Price */}
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.unitPrice}
                            onChange={e => handlePriceChange(idx, Number(e.target.value))}
                            className="w-full px-2 py-1.5 text-xs text-right font-mono bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-slate-800"
                          />
                        </td>

                        {/* Line Total */}
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {formatVND(line.quantity * line.unitPrice)}
                        </td>

                        {/* Remove */}
                        <td className="py-2 px-3 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Row */}
            <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Tổng cộng thành tiền chứng từ:</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {formatVND(totalAmount)}
              </span>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors shadow-xs"
            >
              {type === 'INBOUND' ? 'Hoàn tất Nhập Kho' : 'Hoàn tất Xuất Kho'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import {
  InventoryItem,
  ItemType,
  ItemCondition,
  ITEM_TYPE_LABELS,
  ITEM_CONDITION_LABELS,
} from '../types/inventory';
import { X, Save, AlertCircle } from 'lucide-react';

interface ItemModalProps {
  itemToEdit?: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({
  itemToEdit,
  isOpen,
  onClose,
}) => {
  const { warehouses, categories, suppliers, addItem, updateItem } = useInventory();

  const isEditing = Boolean(itemToEdit);

  const [code, setCode] = useState(itemToEdit?.code || '');
  const [name, setName] = useState(itemToEdit?.name || '');
  const [type, setType] = useState<ItemType>(itemToEdit?.type || 'VAT_TU');
  const [category, setCategory] = useState(itemToEdit?.category || categories[0] || 'Cơ khí & Kim khí');
  const [unit, setUnit] = useState(itemToEdit?.unit || 'Cái');
  const [warehouse, setWarehouse] = useState(itemToEdit?.warehouse || warehouses[0] || 'Kho Tổng A (Hà Nội)');
  const [locationBin, setLocationBin] = useState(itemToEdit?.locationBin || '');
  const [modelSpecs, setModelSpecs] = useState(itemToEdit?.modelSpecs || '');
  const [serialNumber, setSerialNumber] = useState(itemToEdit?.serialNumber || '');
  const [lotNumber, setLotNumber] = useState(itemToEdit?.lotNumber || '');
  const [minStock, setMinStock] = useState(itemToEdit?.minStock ?? 5);
  const [maxStock, setMaxStock] = useState(itemToEdit?.maxStock ?? 50);
  const [reorderPoint, setReorderPoint] = useState(itemToEdit?.reorderPoint ?? 10);
  const [currentStock, setCurrentStock] = useState(itemToEdit?.currentStock ?? 0);
  const [unitPrice, setUnitPrice] = useState(itemToEdit?.unitPrice ?? 100000);
  const [condition, setCondition] = useState<ItemCondition>(itemToEdit?.condition || 'NEW');
  const [lastMaintenanceDate, setLastMaintenanceDate] = useState(itemToEdit?.lastMaintenanceDate || '');
  const [nextMaintenanceDate, setNextMaintenanceDate] = useState(itemToEdit?.nextMaintenanceDate || '');
  const [expiryDate, setExpiryDate] = useState(itemToEdit?.expiryDate || '');
  const [allocatedProject, setAllocatedProject] = useState(itemToEdit?.allocatedProject || '');
  const [supplier, setSupplier] = useState(itemToEdit?.supplier || suppliers[0] || '');
  
  // Logistics, Packaging & Project Item states
  const [packingListNo, setPackingListNo] = useState(itemToEdit?.packingListNo || '');
  const [shipment, setShipment] = useState(itemToEdit?.shipment || '');
  const [manufacturer, setManufacturer] = useState(itemToEdit?.manufacturer || '');
  const [packageNo, setPackageNo] = useState(itemToEdit?.packageNo || '');
  const [packageName, setPackageName] = useState(itemToEdit?.packageName || '');
  const [projectItem, setProjectItem] = useState(itemToEdit?.projectItem || '');

  const [notes, setNotes] = useState(itemToEdit?.notes || '');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!code.trim() || !name.trim()) {
      setError('Vui lòng nhập Mã và Tên vật tư thiết bị.');
      return;
    }

    if (minStock > maxStock && maxStock > 0) {
      setError('Tồn tối thiểu (Min) không được lớn hơn tồn tối đa (Max).');
      return;
    }

    if (isEditing && itemToEdit) {
      updateItem(itemToEdit.id, {
        code: code.trim(),
        name: name.trim(),
        type,
        category,
        unit: unit.trim(),
        warehouse,
        locationBin: locationBin.trim(),
        modelSpecs: modelSpecs.trim(),
        serialNumber: serialNumber.trim() || undefined,
        lotNumber: lotNumber.trim() || undefined,
        minStock: Number(minStock),
        maxStock: Number(maxStock),
        reorderPoint: Number(reorderPoint),
        currentStock: Number(currentStock),
        unitPrice: Number(unitPrice),
        condition,
        lastMaintenanceDate: lastMaintenanceDate || undefined,
        nextMaintenanceDate: nextMaintenanceDate || undefined,
        expiryDate: expiryDate || undefined,
        allocatedProject: allocatedProject.trim() || undefined,
        supplier: supplier.trim(),
        packingListNo: packingListNo.trim() || undefined,
        shipment: shipment.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        packageNo: packageNo.trim() || undefined,
        packageName: packageName.trim() || undefined,
        projectItem: projectItem.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      addItem({
        code: code.trim(),
        name: name.trim(),
        type,
        category,
        unit: unit.trim(),
        warehouse,
        locationBin: locationBin.trim(),
        modelSpecs: modelSpecs.trim(),
        serialNumber: serialNumber.trim() || undefined,
        lotNumber: lotNumber.trim() || undefined,
        minStock: Number(minStock),
        maxStock: Number(maxStock),
        reorderPoint: Number(reorderPoint),
        currentStock: Number(currentStock),
        unitPrice: Number(unitPrice),
        condition,
        lastMaintenanceDate: lastMaintenanceDate || undefined,
        nextMaintenanceDate: nextMaintenanceDate || undefined,
        expiryDate: expiryDate || undefined,
        allocatedProject: allocatedProject.trim() || undefined,
        supplier: supplier.trim(),
        packingListNo: packingListNo.trim() || undefined,
        shipment: shipment.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        packageNo: packageNo.trim() || undefined,
        packageName: packageName.trim() || undefined,
        projectItem: projectItem.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditing ? `Chỉnh sửa vật tư: ${itemToEdit?.code}` : 'Thêm mới vật tư / thiết bị'}
            </h3>
            <p className="text-xs text-slate-500">
              Khai báo đầy đủ quy cách, vị trí lưu kho và định mức kiểm soát
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Row 1: Code, Name, Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã VT / TB *
              </label>
              <input
                type="text"
                required
                placeholder="VD: VT-101, TB-202"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên vật tư thiết bị *
              </label>
              <input
                type="text"
                required
                placeholder="VD: Máy hàn TIG Jasic 200A, Bu lông Inox 304..."
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-slate-800"
              />
            </div>
          </div>

          {/* Row 2: Type, Category, Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phân loại *
              </label>
              <select
                value={type}
                onChange={e => setType(e.target.value as ItemType)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              >
                {Object.entries(ITEM_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhóm danh mục
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              >
                {categories.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Đơn vị tính (ĐVT) *
              </label>
              <input
                type="text"
                required
                placeholder="Cái, Bộ, Mét, Kg, Thùng..."
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>
          </div>

          {/* Row 3: Warehouse & Location Bin */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kho lưu trữ *
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vị trí Kệ / Ngăn
              </label>
              <input
                type="text"
                placeholder="VD: Kệ A1-Ngăn 03, Bãi vật tư B..."
                value={locationBin}
                onChange={e => setLocationBin(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>
          </div>

          {/* Row 4: Specs, Serial / Lot */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Quy cách / Model kỹ thuật
              </label>
              <input
                type="text"
                placeholder="Công suất, kích thước, chuẩn DIN..."
                value={modelSpecs}
                onChange={e => setModelSpecs(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số Serial (Thiết bị)
              </label>
              <input
                type="text"
                placeholder="VD: SN-2026-998..."
                value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Số Lô sản xuất (Vật tư)
              </label>
              <input
                type="text"
                placeholder="VD: LOT-0926-A..."
                value={lotNumber}
                onChange={e => setLotNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800 font-mono"
              />
            </div>
          </div>

          {/* Row 5: Stock Levels & Price */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-md border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tồn tối thiểu (Min)
              </label>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={e => setMinStock(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tồn tối đa (Max)
              </label>
              <input
                type="number"
                min="0"
                value={maxStock}
                onChange={e => setMaxStock(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tồn kho ban đầu
              </label>
              <input
                type="number"
                min="0"
                value={currentStock}
                onChange={e => setCurrentStock(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Đơn giá vốn (VNĐ)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={unitPrice}
                onChange={e => setUnitPrice(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-mono"
              />
            </div>
          </div>

          {/* Row 6: Condition & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tình trạng hiện thời
              </label>
              <select
                value={condition}
                onChange={e => setCondition(e.target.value as ItemCondition)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
              >
                {Object.entries(ITEM_CONDITION_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lịch bảo dưỡng kế tiếp
              </label>
              <input
                type="date"
                value={nextMaintenanceDate}
                onChange={e => setNextMaintenanceDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Hạn sử dụng (nếu có)
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-mono"
              />
            </div>
          </div>

          {/* Row 7: Allocated Project & Supplier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dự án / Phòng ban đang sử dụng (nếu có)
              </label>
              <input
                type="text"
                placeholder="VD: Dự án Nhà máy Viglacera..."
                value={allocatedProject}
                onChange={e => setAllocatedProject(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhà cung cấp chính
              </label>
              <input
                type="text"
                placeholder="Tên nhà cung cấp..."
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
              />
            </div>
          </div>

          {/* Row 8: Logistics & Packaging Specifications (Số Packing List, Shipment, Nhà sản xuất, Kiện hàng, Hạng mục) */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-900">
                Thông tin Vận chuyển, Kiện hàng & Hạng mục công trình
              </span>
              <span className="text-[11px] text-slate-500">
                Theo dõi lô hàng, packing list & quy cách kiện
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nhà sản xuất (Hãng SX)
                </label>
                <input
                  type="text"
                  placeholder="VD: Siemens, Bosch, CADIVI..."
                  value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số Packing List (P/L)
                </label>
                <input
                  type="text"
                  placeholder="VD: PL-2026-EU-084..."
                  value={packingListNo}
                  onChange={e => setPackingListNo(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-white border border-slate-300 rounded-md text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lô hàng / Shipment
                </label>
                <input
                  type="text"
                  placeholder="VD: SHP-2026-VN02, Cont MSKU-9182..."
                  value={shipment}
                  onChange={e => setShipment(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-800"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hạng mục công trình / Gói thầu
                </label>
                <input
                  type="text"
                  placeholder="VD: Hạng mục Cơ điện M&E, Kết cấu thép..."
                  value={projectItem}
                  onChange={e => setProjectItem(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số kiện / Mã kiện hàng
                </label>
                <input
                  type="text"
                  placeholder="VD: Kiện 01/10, PK-04..."
                  value={packageNo}
                  onChange={e => setPackageNo(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên kiện / Quy cách đóng gói
                </label>
                <input
                  type="text"
                  placeholder="VD: Kiện Pallet gỗ, Thùng carton #3..."
                  value={packageName}
                  onChange={e => setPackageName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Ghi chú thêm
            </label>
            <textarea
              rows={2}
              placeholder="Yêu cầu bảo quản đặc biệt, phụ kiện đi kèm..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Lưu thay đổi' : 'Thêm vào danh mục'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

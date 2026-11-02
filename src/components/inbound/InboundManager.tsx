import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useAuth } from '../../context/AuthContext';
import { InboundReceipt, InboundItemDetail, Warehouse, MaterialItem } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { ReceiptPrintModal } from '../common/ReceiptPrintModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { PaginationBar } from '../common/PaginationBar';
import { downloadInboundTemplate } from '../../services/excelService';
import { 
  ArrowDownLeft, 
  Plus, 
  FileSpreadsheet, 
  Download,
  Search, 
  Calendar, 
  Eye, 
  Printer, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  X
} from 'lucide-react';

export const InboundManager: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const [receipts, setReceipts] = useState<InboundReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination cho bảng danh sách phiếu
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<InboundReceipt | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<InboundReceipt | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const deferredDetailSearch = useDeferredValue(detailSearch);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(100);

  const [receiptToDelete, setReceiptToDelete] = useState<InboundReceipt | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form New Inbound State
  const [receiptCode, setReceiptCode] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formManufacturer, setFormManufacturer] = useState('');
  const [formShipment, setFormShipment] = useState('');
  const [formPackingListNo, setFormPackingListNo] = useState('');
  const [formDeliverer, setFormDeliverer] = useState('');
  const [formDriverVehicle, setFormDriverVehicle] = useState('');
  const [formNotes, setFormNotes] = useState('');
  
  // Danh sách dòng vật tư trong phiếu
  const [formItems, setFormItems] = useState<InboundItemDetail[]>([]);
  const [formError, setFormError] = useState('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = () => {
    setReceipts(StorageService.getInboundReceipts());
    setWarehouses(StorageService.getWarehouses());
  };

  useEffect(() => {
    loadData();
    return StorageService.subscribe(loadData);
  }, []);

  // Reset trang khi thay đổi điều kiện lọc
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, filterWarehouse, startDate, endDate]);

  // Map tra cứu nhanh danh mục vật tư O(1) khi mở form lập phiếu
  const materialMap = useMemo(() => {
    const map = new Map<string, MaterialItem>();
    for (let i = 0; i < materials.length; i++) {
      map.set(materials[i].code.toLowerCase(), materials[i]);
    }
    return map;
  }, [materials]);

  const openCreateModal = () => {
    setMaterials(StorageService.getMaterials());
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomNum = Math.floor(100 + Math.random() * 900);
    setReceiptCode(`PN-${todayStr}-${randomNum}`);
    setReceiptDate(new Date().toISOString().slice(0, 10));
    const whList = StorageService.getWarehouses();
    setSelectedWarehouseId(whList[0]?.id || '');
    setFormSupplier('Công ty CP Kỹ thuật PetroSteel');
    setFormManufacturer('Kitz Corporation (Japan)');
    setFormShipment('SHP-PACIFIC-V04');
    setFormPackingListNo('PL-2026-OCT-001');
    setFormDeliverer('Đội vận tải biển Pacific Line');
    setFormDriverVehicle('Cont 40HC - TGHU123456');
    setFormNotes('');
    setFormError('');

    setFormItems([
      {
        id: `item-${Date.now()}`,
        materialCode: 'TB-VAL-200H',
        materialName: 'Van cầu áp lực cao Class 600 DN200',
        unit: 'Bộ',
        packingListNo: 'PL-2026-OCT-001',
        shipment: 'SHP-PACIFIC-V04',
        packageNo: 'PKG-01/15',
        packageName: 'Kiện cụm van áp lực cao DN200',
        category: 'Đường ống công nghệ P&ID',
        drawingNo: 'DWG-PID-PIPE-04 Rev.C',
        manufacturer: 'Kitz Corporation (Japan)',
        supplier: 'Công ty CP Kỹ thuật PetroSteel',
        weightKg: 1250,
        quantity: 4,
        unitPrice: 45000000,
        totalPrice: 180000000,
        storageLocation: 'Khu A - Kệ 01',
        conditionNote: 'Mới 100%, nguyên niêm phong'
      }
    ]);

    setIsCreateModalOpen(true);
  };

  const addNewItemRow = () => {
    setFormItems(prev => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        materialCode: '',
        materialName: '',
        unit: 'Bộ',
        packingListNo: formPackingListNo || 'PL-01',
        shipment: formShipment || 'SHP-01',
        packageNo: `PKG-0${prev.length + 1}/10`,
        packageName: '',
        category: 'Cơ khí / Kết cấu',
        drawingNo: '',
        manufacturer: formManufacturer || '',
        supplier: formSupplier || '',
        weightKg: 0,
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        storageLocation: '',
        conditionNote: ''
      }
    ]);
  };

  const removeItemRow = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx: number, field: keyof InboundItemDetail, val: any) => {
    setFormItems(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };

      if (field === 'materialCode') {
        const found = materialMap.get(String(val).trim().toLowerCase());
        if (found) {
          copy[idx].materialName = found.name;
          copy[idx].unit = found.unit;
          if (found.packageNo) copy[idx].packageNo = found.packageNo;
          if (found.category) copy[idx].category = found.category;
          if (found.drawingNo) copy[idx].drawingNo = found.drawingNo;
          if (found.manufacturer) copy[idx].manufacturer = found.manufacturer;
          if (found.supplier) copy[idx].supplier = found.supplier;
          if (found.unitWeightKg && copy[idx].quantity) {
            copy[idx].weightKg = found.unitWeightKg * copy[idx].quantity;
          }
        }
      }

      if (field === 'quantity' || field === 'unitPrice') {
        const qty = Number(field === 'quantity' ? val : copy[idx].quantity) || 0;
        const price = Number(field === 'unitPrice' ? val : copy[idx].unitPrice) || 0;
        copy[idx].totalPrice = qty * price;
      }

      return copy;
    });
  };

  // Xử lý import từ file Excel tối ưu O(N) cho trên 100.000 dòng
  const handleExcelImportSuccess = async (importedItems: Partial<InboundItemDetail>[], defaultWhId?: string) => {
    if (importedItems.length === 0) return;

    const allWh = StorageService.getWarehouses();
    const fallbackWh: Warehouse = allWh[0] || {
      id: 'wh-01',
      name: 'Kho Tổng Trung Tâm Cát Lái',
      code: 'WH-CL',
      location: 'Cát Lái, TP.HCM',
      type: 'covered',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const selectedDefaultWh = defaultWhId && defaultWhId !== 'auto'
      ? (allWh.find(w => w.id === defaultWhId) || fallbackWh)
      : fallbackWh;

    // Cache kết quả tìm kho O(1) thay vì lặp tìm chuỗi 100.000 lần
    const whResolveCache = new Map<string, Warehouse>();
    const resolveWarehouse = (itemWhName?: string): Warehouse => {
      if (!itemWhName) return selectedDefaultWh;
      const trimmed = itemWhName.trim().toLowerCase();
      if (!trimmed) return selectedDefaultWh;

      const cached = whResolveCache.get(trimmed);
      if (cached) return cached;

      const matched = allWh.find(w => {
        const wName = w.name.toLowerCase();
        const wCode = w.code.toLowerCase();
        return wName === trimmed || wCode === trimmed || wName.includes(trimmed) || trimmed.includes(wName);
      }) || selectedDefaultWh;

      whResolveCache.set(trimmed, matched);
      return matched;
    };

    const groups = new Map<string, { 
      warehouse: Warehouse; 
      receiptCode?: string; 
      receiptDate?: string; 
      delivererName?: string;
      driverVehicleNo?: string;
      items: Partial<InboundItemDetail>[] 
    }>();

    for (let i = 0; i < importedItems.length; i++) {
      const item = importedItems[i];
      const wh = resolveWarehouse(item.warehouseName);
      const rawCode = ((item as any).receiptCode || '').trim();
      const customCode = rawCode || (item.packingListNo ? `PN-${item.packingListNo.trim()}` : '');
      const groupKey = rawCode 
        ? `RECEIPT_${rawCode.toUpperCase()}` 
        : `${wh.id}__${customCode || 'AUTO'}`;

      let currentGroup = groups.get(groupKey);
      if (!currentGroup) {
        currentGroup = {
          warehouse: wh,
          receiptCode: rawCode || customCode,
          receiptDate: (item as any).receiptDate,
          delivererName: (item as any).delivererName,
          driverVehicleNo: (item as any).driverVehicleNo,
          items: []
        };
        groups.set(groupKey, currentGroup);
      } else {
        if (!currentGroup.receiptDate && (item as any).receiptDate) {
          currentGroup.receiptDate = (item as any).receiptDate;
        }
        if (!currentGroup.delivererName && (item as any).delivererName) {
          currentGroup.delivererName = (item as any).delivererName;
        }
        if (!currentGroup.driverVehicleNo && (item as any).driverVehicleNo) {
          currentGroup.driverVehicleNo = (item as any).driverVehicleNo;
        }
      }
      currentGroup.items.push(item);
    }

    const todayIso = new Date().toISOString();
    const todayDate = todayIso.slice(0, 10);
    const todayStr = todayDate.replace(/-/g, '');
    const baseTs = Date.now();
    const batchSalt = Math.random().toString(36).slice(2, 6);
    const userFullName = currentUser?.fullName || 'Võ Dương Phú';
    let createdCount = 0;
    const newReceipts: InboundReceipt[] = [];

    groups.forEach(({ warehouse: targetWh, receiptCode: customRcpCode, receiptDate: customRcpDate, delivererName: customDeliverer, driverVehicleNo: customVehicle, items: whItems }) => {
      const first = whItems[0];
      const randomNum = Math.floor(100 + Math.random() * 900);
      const generatedCode = customRcpCode?.trim() 
        ? customRcpCode.trim() 
        : (first.packingListNo ? `PN-${first.packingListNo.replace(/[^a-zA-Z0-9]/g, '')}-${todayStr}` : `PN-EXCEL-${todayStr}-${randomNum + createdCount}`);

      const len = whItems.length;
      const fullItems: InboundItemDetail[] = new Array(len);
      let totalQty = 0;
      let totalWeight = 0;
      let totalAmount = 0;
      let pkgCount = 0;

      for (let idx = 0; idx < len; idx++) {
        const item = whItems[idx];
        const qty = Number(item.quantity) || 1;
        const weight = Number(item.weightKg) || 0;
        const uPrice = Number(item.unitPrice) || 0;
        const tPrice = qty * uPrice;
        const pkgNo = item.packageNo || `PKG-${idx + 1}`;
        if (pkgNo) pkgCount++;

        totalQty += qty;
        totalWeight += weight;
        totalAmount += tPrice;

        fullItems[idx] = {
          id: item.id || `in-item-${baseTs}-${batchSalt}-${createdCount}-${idx}`,
          materialCode: item.materialCode || `VT-AUTO-${idx + 1}`,
          materialName: item.materialName || 'Vật tư nhập Excel',
          unit: item.unit || 'Bộ',
          packingListNo: item.packingListNo || first?.packingListNo || 'PL-EXCEL-01',
          shipment: item.shipment || first?.shipment || 'SHP-EXCEL',
          packageNo: pkgNo,
          packageName: item.packageName || `Kiện ${pkgNo}`,
          category: item.category || 'Hạng mục dự án',
          drawingNo: item.drawingNo || 'N/A',
          manufacturer: item.manufacturer || first?.manufacturer || 'N/A',
          supplier: item.supplier || first?.supplier || 'N/A',
          weightKg: weight,
          quantity: qty,
          unitPrice: uPrice,
          totalPrice: tPrice,
          storageLocation: item.storageLocation || 'Kho tổng',
          warehouseName: targetWh.name,
          conditionNote: item.conditionNote || 'Nhập từ file Excel'
        };
      }

      newReceipts.push({
        id: `in-rcp-${baseTs}-${batchSalt}-${createdCount}`,
        receiptCode: generatedCode,
        receiptDate: customRcpDate || todayDate,
        warehouseId: targetWh.id,
        warehouseName: targetWh.name,
        supplier: first.supplier || 'Nhiều nhà cung cấp',
        manufacturer: first.manufacturer || 'Nhiều NSX',
        shipment: first.shipment || 'Shipment Excel',
        packingListNo: first.packingListNo || 'PL-EXCEL',
        delivererName: customDeliverer || (first as any).delivererName || 'Nhập từ File Excel tự động',
        receiverName: userFullName,
        driverVehicleNo: customVehicle || (first as any).driverVehicleNo || 'Container / Vận chuyển',
        notes: `Import thành công ${len.toLocaleString('vi-VN')} mặt hàng nhập vào ${targetWh.name}.`,
        items: fullItems,
        packageCount: pkgCount,
        totalQuantity: totalQty,
        totalWeightKg: Math.round(totalWeight * 100) / 100,
        totalAmount: totalAmount,
        createdAt: todayIso,
        createdBy: userFullName
      });
      createdCount++;
    });

    const result = StorageService.addInboundReceipts(newReceipts);

    // Xóa bộ lọc tìm kiếm và về trang 1 để người dùng thấy ngay các phiếu vừa import
    setSearchTerm('');
    setFilterWarehouse('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);

    loadData();
    showToast(`Đã import thành công ${newReceipts.length.toLocaleString('vi-VN')} phiếu nhập kho (${importedItems.length.toLocaleString('vi-VN')} mặt hàng)! Tự động cập nhật ${result.newMaterialsCount.toLocaleString('vi-VN')} vật tư mới.`);
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptCode.trim()) {
      setFormError('Mã phiếu nhập không được để trống.');
      return;
    }
    if (formItems.length === 0) {
      setFormError('Vui lòng thêm ít nhất một dòng vật tư thiết bị vào phiếu.');
      return;
    }

    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      if (!it.materialName.trim()) {
        setFormError(`Dòng số ${i + 1}: Vui lòng nhập tên vật tư thiết bị.`);
        return;
      }
      if (!it.packingListNo.trim()) {
        setFormError(`Dòng số ${i + 1}: Vui lòng nhập Số Packing List.`);
        return;
      }
      if (!it.packageNo.trim()) {
        setFormError(`Dòng số ${i + 1}: Vui lòng nhập Số kiện.`);
        return;
      }
      if (!it.quantity || it.quantity <= 0) {
        setFormError(`Dòng số ${i + 1}: Số lượng phải lớn hơn 0.`);
        return;
      }
    }

    const wh = warehouses.find(w => w.id === selectedWarehouseId) || warehouses[0];
    const totalQty = formItems.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
    const totalWeight = formItems.reduce((sum, it) => sum + (Number(it.weightKg) || 0), 0);
    const totalAmount = formItems.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);
    const pkgCount = formItems.reduce((sum, it) => sum + (it.packageNo ? 1 : 0), 0);

    const newReceipt: InboundReceipt = {
      id: `in-rcp-${Date.now()}`,
      receiptCode: receiptCode.trim(),
      receiptDate,
      warehouseId: wh.id,
      warehouseName: wh.name,
      supplier: formSupplier.trim(),
      manufacturer: formManufacturer.trim(),
      shipment: formShipment.trim(),
      packingListNo: formPackingListNo.trim(),
      delivererName: formDeliverer.trim(),
      receiverName: currentUser?.fullName || 'Võ Dương Phú',
      driverVehicleNo: formDriverVehicle.trim(),
      notes: formNotes.trim(),
      items: formItems,
      packageCount: pkgCount,
      totalQuantity: totalQty,
      totalWeightKg: Math.round(totalWeight * 100) / 100,
      totalAmount: totalAmount,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.fullName || 'Võ Dương Phú'
    };

    StorageService.addInboundReceipt(newReceipt);
    loadData();
    setIsCreateModalOpen(false);
    showToast(`Đã tạo phiếu nhập kho "${receiptCode}" thành công!`);
  };

  const handleDeleteReceipt = (rcp: InboundReceipt) => {
    if (!isAdmin) {
      showToast('Chỉ tài khoản Quản trị viên (Admin) mới có quyền xóa phiếu nhập kho.', 'error');
      return;
    }
    setReceiptToDelete(rcp);
  };

  const confirmDeleteInbound = () => {
    if (!receiptToDelete) return;
    const targetId = receiptToDelete.id;
    const targetCode = receiptToDelete.receiptCode;

    StorageService.deleteInboundReceipt(targetId);
    setReceipts(prev => prev.filter(r => r.id !== targetId));
    loadData();
    showToast(`Đã xóa phiếu nhập "${targetCode}" thành công!`);
    setReceiptToDelete(null);

    if (viewingReceipt?.id === targetId) {
      setViewingReceipt(null);
    }
  };

  const openDetailModal = (rcp: InboundReceipt) => {
    setDetailSearch('');
    setDetailPage(1);
    setViewingReceipt(rcp);
  };

  // Lọc danh sách phiếu tối ưu O(N) - không quét mảng con khi ô tìm kiếm trống
  const filteredReceipts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const checkWh = filterWarehouse !== 'all';

    if (!q && !checkWh && !startDate && !endDate) {
      return receipts;
    }

    return receipts.filter(r => {
      if (checkWh && r.warehouseId !== filterWarehouse) return false;
      if (startDate && r.receiptDate < startDate) return false;
      if (endDate && r.receiptDate > endDate) return false;

      if (q) {
        const headerMatch =
          r.receiptCode.toLowerCase().includes(q) ||
          r.packingListNo.toLowerCase().includes(q) ||
          r.shipment.toLowerCase().includes(q) ||
          r.supplier.toLowerCase().includes(q) ||
          (r.manufacturer && r.manufacturer.toLowerCase().includes(q));

        if (headerMatch) return true;

        const items = r.items;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (
            it.materialName.toLowerCase().includes(q) ||
            it.materialCode.toLowerCase().includes(q) ||
            it.packageNo.toLowerCase().includes(q) ||
            it.packageName.toLowerCase().includes(q) ||
            it.drawingNo.toLowerCase().includes(q)
          ) {
            return true;
          }
        }
        return false;
      }

      return true;
    });
  }, [receipts, deferredSearch, filterWarehouse, startDate, endDate]);

  // Danh sách phiếu của trang hiện tại
  const pagedReceipts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReceipts.slice(start, start + pageSize);
  }, [filteredReceipts, currentPage, pageSize]);

  // Lọc & phân trang các mặt hàng trong Modal Xem Chi Tiết Phiếu Nhập (hỗ trợ 100.000+ dòng/phiếu)
  const filteredDetailItems = useMemo(() => {
    if (!viewingReceipt) return [];
    const q = deferredDetailSearch.trim().toLowerCase();
    if (!q) return viewingReceipt.items;
    return viewingReceipt.items.filter(it =>
      it.materialName.toLowerCase().includes(q) ||
      it.materialCode.toLowerCase().includes(q) ||
      it.packageNo.toLowerCase().includes(q) ||
      it.packageName.toLowerCase().includes(q) ||
      it.packingListNo.toLowerCase().includes(q) ||
      it.drawingNo.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  }, [viewingReceipt, deferredDetailSearch]);

  const pagedDetailItems = useMemo(() => {
    const start = (detailPage - 1) * detailPageSize;
    return filteredDetailItems.slice(start, start + detailPageSize);
  }, [filteredDetailItems, detailPage, detailPageSize]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border shadow-md animate-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Banner & Actions */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Quản Lý Nhập Kho Vật Tư Thiết Bị</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Nhập kho theo Packing List, Shipment, Bản vẽ, Kiện hàng, NSX, NCC, Khối lượng & Số lượng
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2 sm:gap-2.5 sm:flex-wrap w-full md:w-auto">
          <button
            onClick={downloadInboundTemplate}
            title="Tải tệp Excel mẫu chuẩn để chuẩn bị nhập kho"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition min-h-[42px]"
          >
            <Download className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Tải Mẫu Excel Nhập Kho</span>
          </button>

          <button
            onClick={() => setIsExcelModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold text-xs shadow-md shadow-emerald-700/20 transition active:scale-95 min-h-[42px]"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Import Từ File Excel</span>
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-blue-500/20 transition active:scale-95 min-h-[42px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Lập Phiếu Nhập Mới</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo mã phiếu, Packing List, Shipment, Kiện hàng, Bản vẽ, Mã/Tên vật tư..."
            className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-3" />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <select
            value={filterWarehouse}
            onChange={(e) => setFilterWarehouse(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[40px]"
          >
            <option value="all">Tất cả kho bãi</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>

          <div className="flex-1 sm:flex-initial flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs min-h-[40px]">
            <span className="text-slate-400 shrink-0">Từ:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-transparent text-slate-700 outline-none text-xs"
            />
          </div>

          <div className="flex-1 sm:flex-initial flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs min-h-[40px]">
            <span className="text-slate-400 shrink-0">Đến:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-transparent text-slate-700 outline-none text-xs"
            />
          </div>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Mã Phiếu & Ngày</th>
                <th className="px-5 py-3.5">Số Packing List & Shipment</th>
                <th className="px-5 py-3.5">Kho Lưu Trữ</th>
                <th className="px-5 py-3.5">Nhà Cung Cấp & NSX</th>
                <th className="px-5 py-3.5 text-right">Tổng Số Kiện / SL</th>
                <th className="px-5 py-3.5 text-right">Tổng Khối Lượng (kg)</th>
                <th className="px-5 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedReceipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Không có phiếu nhập kho nào phù hợp điều kiện lọc.
                  </td>
                </tr>
              ) : (
                pagedReceipts.map(r => {
                  const pkgCount = r.packageCount !== undefined ? r.packageCount : r.items.length;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4">
                        <div>
                          <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block mb-1">
                            {r.receiptCode}
                          </span>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{new Date(r.receiptDate).toLocaleDateString('vi-VN')}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div>
                          <div className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1">
                            <span className="text-slate-400 font-sans font-normal text-[11px]">PL:</span> {r.packingListNo}
                          </div>
                          <div className="font-mono text-[11px] text-slate-600">
                            <span className="text-slate-400 font-sans font-normal">Lô:</span> {r.shipment}
                          </div>
                          <div className="text-[11px] text-indigo-700 font-medium">
                            ({r.items.length.toLocaleString('vi-VN')} mặt hàng / dòng)
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-xs font-semibold text-slate-800">{r.warehouseName}</div>
                        <div className="text-[11px] text-slate-500">Người nhận: {r.receiverName}</div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-xs text-slate-700 line-clamp-1 font-medium">{r.supplier}</div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">NSX: {r.manufacturer || 'Đang cập nhật'}</div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="font-bold text-slate-900 font-mono text-sm">
                          {r.totalQuantity.toLocaleString('vi-VN')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {pkgCount.toLocaleString('vi-VN')} kiện
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-emerald-700">
                        {r.totalWeightKg.toLocaleString('vi-VN')} kg
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDetailModal(r)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                            title="Xem chi tiết các kiện và vật tư"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedReceiptForPrint(r)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
                            title="In phiếu nhập kho"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteReceipt(r)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition"
                              title="Xóa phiếu nhập kho"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          currentPage={currentPage}
          totalItems={filteredReceipts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
          itemLabel="phiếu nhập"
        />
      </div>

      {/* Modal Lập Phiếu Nhập Mới */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">Lập Phiếu Nhập Kho Vật Tư Thiết Bị</h3>
                  <p className="text-xs text-slate-500 line-clamp-1">Nhập chi tiết theo Packing List, Shipment, Kiện hàng, Bản vẽ, Hạng mục</p>
                </div>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCreate} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Thông tin đầu phiếu */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Mã phiếu nhập (*)</label>
                  <input
                    type="text"
                    value={receiptCode}
                    onChange={(e) => setReceiptCode(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-blue-700 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Ngày nhập kho (*)</label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Kho tiếp nhận (*)</label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none"
                  >
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Người nhận / Thủ kho</label>
                  <input
                    type="text"
                    value={currentUser?.fullName || 'Võ Dương Phú'}
                    readOnly
                    className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-slate-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Số Packing List (*)</label>
                  <input
                    type="text"
                    value={formPackingListNo}
                    onChange={(e) => {
                      setFormPackingListNo(e.target.value);
                      setFormItems(prev => prev.map(it => it.packingListNo === '' ? { ...it, packingListNo: e.target.value } : it));
                    }}
                    placeholder="ví dụ: PL-2026-OCT-001"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Shipment / Vận đơn (*)</label>
                  <input
                    type="text"
                    value={formShipment}
                    onChange={(e) => {
                      setFormShipment(e.target.value);
                      setFormItems(prev => prev.map(it => it.shipment === '' ? { ...it, shipment: e.target.value } : it));
                    }}
                    placeholder="SHP-PACIFIC-V04"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Nhà cung cấp (*)</label>
                  <input
                    type="text"
                    value={formSupplier}
                    onChange={(e) => setFormSupplier(e.target.value)}
                    placeholder="Công ty CP Kỹ thuật PetroSteel"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Nhà sản xuất</label>
                  <input
                    type="text"
                    value={formManufacturer}
                    onChange={(e) => setFormManufacturer(e.target.value)}
                    placeholder="Kitz Corp, Posco, Siemens..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none"
                  />
                </div>
              </div>

              {/* Danh sách các dòng vật tư & kiện hàng */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-800">
                    Danh Sách Kiện Hàng & Vật Tư Thiết Bị ({formItems.length} dòng)
                  </h4>
                  <button
                    type="button"
                    onClick={addNewItemRow}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold border border-blue-200 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm Dòng Vật Tư</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[950px]">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-8 text-center">STT</th>
                        <th className="p-2 w-32">Số Packing List (*)</th>
                        <th className="p-2 w-28">Shipment (*)</th>
                        <th className="p-2 w-28">Số kiện (*)</th>
                        <th className="p-2 w-36">Tên kiện</th>
                        <th className="p-2 w-44">Tên vật tư thiết bị (*)</th>
                        <th className="p-2 w-24">Mã VT</th>
                        <th className="p-2 w-16">ĐVT</th>
                        <th className="p-2 w-20 text-right">Số Lượng (*)</th>
                        <th className="p-2 w-24 text-right">Khối Lượng (kg) (*)</th>
                        <th className="p-2 w-32">Hạng mục</th>
                        <th className="p-2 w-32">Bản vẽ (DWG)</th>
                        <th className="p-2 w-10 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="p-2 text-center text-slate-400">{idx + 1}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.packingListNo}
                              onChange={(e) => updateItemRow(idx, 'packingListNo', e.target.value)}
                              placeholder="PL-01"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono outline-none text-xs"
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.shipment}
                              onChange={(e) => updateItemRow(idx, 'shipment', e.target.value)}
                              placeholder="SHP-01"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono outline-none text-xs"
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.packageNo}
                              onChange={(e) => updateItemRow(idx, 'packageNo', e.target.value)}
                              placeholder="PKG-01"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-semibold outline-none text-xs"
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.packageName}
                              onChange={(e) => updateItemRow(idx, 'packageName', e.target.value)}
                              placeholder="Tên kiện..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded outline-none text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.materialName}
                              onChange={(e) => updateItemRow(idx, 'materialName', e.target.value)}
                              placeholder="Tên thiết bị / vật tư..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-medium outline-none text-xs"
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.materialCode}
                              onChange={(e) => updateItemRow(idx, 'materialCode', e.target.value)}
                              placeholder="VT-01"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono outline-none text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => updateItemRow(idx, 'unit', e.target.value)}
                              placeholder="Bộ"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-center outline-none text-xs"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItemRow(idx, 'quantity', Number(e.target.value))}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-bold outline-none text-xs"
                              required
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={item.weightKg}
                              onChange={(e) => updateItemRow(idx, 'weightKg', Number(e.target.value))}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-mono font-medium outline-none text-xs"
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.category}
                              onChange={(e) => updateItemRow(idx, 'category', e.target.value)}
                              placeholder="Hạng mục..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded outline-none text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.drawingNo}
                              onChange={(e) => updateItemRow(idx, 'drawingNo', e.target.value)}
                              placeholder="DWG-..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono text-indigo-700 outline-none text-xs"
                            />
                          </td>
                          <td className="p-2 text-center">
                            {formItems.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Tóm tắt khối lượng & số lượng */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs font-semibold">
                  <span>Tổng số mặt hàng: {formItems.length}</span>
                  <div className="flex flex-wrap gap-3 sm:gap-4">
                    <span>
                      Tổng số lượng:{' '}
                      <strong className="text-blue-700 tabular-nums">
                        {formItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0).toLocaleString('vi-VN')}
                      </strong>
                    </span>
                    <span>
                      Tổng khối lượng:{' '}
                      <strong className="text-emerald-700 tabular-nums">
                        {formItems.reduce((s, it) => s + (Number(it.weightKg) || 0), 0).toLocaleString('vi-VN')} kg
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Ghi chú phiếu nhập</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ghi chú về chứng từ hải quan, tình trạng kẹp chì, niêm phong..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Xác Nhận Nhập Kho
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xem Chi Tiết Phiếu Nhập (Phân trang mượt cho phiếu >100.000 dòng) */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">Chi Tiết Phiếu Nhập: {viewingReceipt.receiptCode}</h3>
                  <p className="text-xs text-slate-500 line-clamp-1">
                    Ngày: {new Date(viewingReceipt.receiptDate).toLocaleDateString('vi-VN')} | Kho: {viewingReceipt.warehouseName} | {viewingReceipt.items.length.toLocaleString('vi-VN')} dòng
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => {
                    setSelectedReceiptForPrint(viewingReceipt);
                    setViewingReceipt(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition min-h-[36px]"
                >
                  <Printer className="w-4 h-4" />
                  <span>In Phiếu</span>
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      const toDelete = viewingReceipt;
                      setViewingReceipt(null);
                      setReceiptToDelete(toDelete);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition min-h-[36px]"
                    title="Xóa phiếu nhập kho này"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Xóa Phiếu</span>
                  </button>
                )}
                <button onClick={() => setViewingReceipt(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block">Số Packing List:</span>
                  <span className="font-mono font-bold text-blue-700 break-all">{viewingReceipt.packingListNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Shipment / Vận đơn:</span>
                  <span className="font-mono font-bold text-indigo-700 break-all">{viewingReceipt.shipment}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Nhà cung cấp:</span>
                  <span className="font-semibold text-slate-900">{viewingReceipt.supplier}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Nhà sản xuất:</span>
                  <span className="font-semibold text-slate-900">{viewingReceipt.manufacturer || 'N/A'}</span>
                </div>
              </div>

              {/* Tìm kiếm nhanh trong chi tiết phiếu */}
              <div className="relative">
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => {
                    setDetailSearch(e.target.value);
                    setDetailPage(1);
                  }}
                  placeholder="Tìm nhanh mặt hàng, mã VT, số kiện, bản vẽ trong phiếu..."
                  className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 sm:top-2.5" />
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-96 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[740px] text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2.5 w-12 text-center">STT</th>
                        <th className="p-2.5">Kiện Hàng</th>
                        <th className="p-2.5">Vật Tư Thiết Bị</th>
                        <th className="p-2.5">Hạng Mục & Bản Vẽ</th>
                        <th className="p-2.5 text-center">ĐVT</th>
                        <th className="p-2.5 text-right">Số Lượng</th>
                        <th className="p-2.5 text-right">Khối Lượng (kg)</th>
                        <th className="p-2.5">Vị Trí / Tình Trạng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedDetailItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            Không tìm thấy mặt hàng phù hợp từ khóa.
                          </td>
                        </tr>
                      ) : (
                        pagedDetailItems.map((it, idx) => {
                          const globalIdx = (detailPage - 1) * detailPageSize + idx;
                          return (
                            <tr key={it.id || globalIdx} className="hover:bg-slate-50">
                              <td className="p-2.5 text-center font-mono text-slate-400">{(globalIdx + 1).toLocaleString('vi-VN')}</td>
                              <td className="p-2.5">
                                <span className="font-bold text-slate-900 block">{it.packageNo}</span>
                                <span className="text-[11px] text-slate-500">{it.packageName}</span>
                              </td>
                              <td className="p-2.5">
                                <span className="font-semibold text-slate-900 block">{it.materialName}</span>
                                <span className="font-mono text-[11px] text-blue-600">{it.materialCode}</span>
                              </td>
                              <td className="p-2.5">
                                <div className="text-slate-700">{it.category}</div>
                                <div className="font-mono text-indigo-700 text-[11px]">{it.drawingNo}</div>
                              </td>
                              <td className="p-2.5 text-center">{it.unit}</td>
                              <td className="p-2.5 text-right font-bold font-mono text-slate-900">
                                {Number(it.quantity)?.toLocaleString('vi-VN')}
                              </td>
                              <td className="p-2.5 text-right font-bold font-mono text-emerald-700">
                                {Number(it.weightKg)?.toLocaleString('vi-VN')}
                              </td>
                              <td className="p-2.5 text-[11px] text-slate-500">
                                <div>{it.storageLocation || 'Kho chung'}</div>
                                <div className="italic text-slate-400">{it.conditionNote}</div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                      <tr>
                        <td colSpan={5} className="p-2.5 text-right uppercase">
                          Tổng cộng toàn phiếu ({viewingReceipt.items.length.toLocaleString('vi-VN')} dòng):
                        </td>
                        <td className="p-2.5 text-right text-blue-700 font-mono">
                          {viewingReceipt.totalQuantity.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-2.5 text-right text-emerald-700 font-mono">
                          {viewingReceipt.totalWeightKg.toLocaleString('vi-VN')} kg
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <PaginationBar
                  currentPage={detailPage}
                  totalItems={filteredDetailItems.length}
                  pageSize={detailPageSize}
                  onPageChange={setDetailPage}
                  onPageSizeChange={setDetailPageSize}
                  pageSizeOptions={[50, 100, 200]}
                  itemLabel="mặt hàng"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import Excel */}
      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        type="inbound"
        warehouses={warehouses}
        onImportSuccess={handleExcelImportSuccess}
      />

      {/* Modal In Phiếu */}
      <ReceiptPrintModal
        isOpen={Boolean(selectedReceiptForPrint)}
        onClose={() => setSelectedReceiptForPrint(null)}
        inbound={selectedReceiptForPrint}
      />

      {/* Modal Xác Nhận Xóa Phiếu Nhập */}
      <ConfirmDeleteModal
        isOpen={Boolean(receiptToDelete)}
        onClose={() => setReceiptToDelete(null)}
        onConfirm={confirmDeleteInbound}
        title="Xác Nhận Xóa Phiếu Nhập Kho"
        itemName={receiptToDelete ? `Phiếu ${receiptToDelete.receiptCode} (PL: ${receiptToDelete.packingListNo})` : ''}
        itemType="phiếu nhập kho"
        warningText="Xóa phiếu nhập kho sẽ tự động trừ lại số lượng và khối lượng tồn kho tương ứng. Bạn có chắc chắn muốn xóa không?"
      />
    </div>
  );
};

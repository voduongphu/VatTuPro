import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useAuth } from '../../context/AuthContext';
import { InboundReceipt, InboundItemDetail, Warehouse, MaterialItem } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { ReceiptPrintModal } from '../common/ReceiptPrintModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { PaginationBar } from '../common/PaginationBar';
import {
  downloadInboundTemplate,
  formatExcelDate,
  formatVoucherDateVi
} from '../../services/excelService';
import {
  roundQty,
  sumInboundItems,
  buildDeterministicItemId
} from '../../utils/additiveMerge';
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

  // Form New Inbound State (Theo mẫu QN-OPR-PR11-FM05.01 + Logistics)
  const [receiptCode, setReceiptCode] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [formDepartmentName, setFormDepartmentName] = useState('');
  const [formDeliverer, setFormDeliverer] = useState('');
  const [formContractNo, setFormContractNo] = useState('');
  const [formRequestNo, setFormRequestNo] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formInboundType, setFormInboundType] = useState<'new' | 'return'>('new');
  const [formAmountInWords, setFormAmountInWords] = useState('');
  const [formAttachedDocs, setFormAttachedDocs] = useState('');

  // Trường Logistics bổ sung
  const [formSupplier, setFormSupplier] = useState('');
  const [formManufacturer, setFormManufacturer] = useState('');
  const [formShipment, setFormShipment] = useState('');
  const [formPackingListNo, setFormPackingListNo] = useState('');
  const [formDriverVehicle, setFormDriverVehicle] = useState('');

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

  const generateNextPnkCode = (existingList: InboundReceipt[]): string => {
    const yy = String(new Date().getFullYear()).slice(-2);
    const prefix = `PNK${yy}-`;
    let maxSeq = 0;
    for (let i = 0; i < existingList.length; i++) {
      const c = (existingList[i].receiptCode || '').toUpperCase();
      if (c.startsWith(prefix)) {
        const num = parseInt(c.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  };

  const openCreateModal = () => {
    const mats = StorageService.getMaterials();
    const currentReceipts = StorageService.getInboundReceipts();
    setMaterials(mats);
    setReceiptCode(generateNextPnkCode(currentReceipts));
    setReceiptDate(new Date().toISOString().slice(0, 10));
    const whList = StorageService.getWarehouses();
    setSelectedWarehouseId(whList[0]?.id || '');

    setFormDepartmentName('');
    setFormDeliverer('');
    setFormContractNo('');
    setFormRequestNo('');
    setFormNotes('');
    setFormInboundType('new');
    setFormAmountInWords('');
    setFormAttachedDocs('');

    setFormSupplier('');
    setFormManufacturer('');
    setFormShipment('');
    setFormPackingListNo('');
    setFormDriverVehicle('');
    setFormError('');

    setFormItems([
      {
        id: `item-${Date.now()}`,
        materialCode: '',
        materialName: '',
        unit: 'Ống',
        batchCode: '',
        packingListNo: '',
        shipment: '',
        packageNo: '',
        packageName: '',
        category: '',
        drawingNo: '',
        manufacturer: '',
        supplier: '',
        weightKg: 0,
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        storageLocation: '',
        conditionNote: '',
        note: ''
      }
    ]);

    setIsCreateModalOpen(true);
  };

  const addNewItemRow = () => {
    setFormItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        materialCode: '',
        materialName: '',
        unit: 'Ống',
        batchCode: '',
        packingListNo: formPackingListNo || '',
        shipment: formShipment || '',
        packageNo: '',
        packageName: '',
        category: '',
        drawingNo: '',
        manufacturer: formManufacturer || '',
        supplier: formSupplier || '',
        weightKg: 0,
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        storageLocation: '',
        conditionNote: '',
        note: ''
      }
    ]);
  };

  const removeItemRow = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx: number, field: keyof InboundItemDetail, val: any) => {
    setFormItems((prev) => {
      const copy = [...prev];
      const prevRow = prev[idx];
      copy[idx] = { ...prevRow, [field]: val };

      if (field === 'materialCode') {
        const found = materialMap.get(String(val).trim().toLowerCase());
        if (found) {
          copy[idx].materialName = found.name;
          copy[idx].unit = found.unit;
          if (found.packageNo && !copy[idx].batchCode) {
            copy[idx].batchCode = found.packageNo;
            copy[idx].packageNo = found.packageNo;
          }
          if (found.category) copy[idx].category = found.category;
          if (found.drawingNo) copy[idx].drawingNo = found.drawingNo;
          if (found.manufacturer) copy[idx].manufacturer = found.manufacturer;
          if (found.supplier) copy[idx].supplier = found.supplier;
          if (found.unitWeightKg && copy[idx].quantity) {
            copy[idx].weightKg = Math.round(found.unitWeightKg * roundQty(copy[idx].quantity) * 100) / 100;
          }
        }
      }

      if (field === 'batchCode') {
        copy[idx].packageNo = String(val);
      }

      if (field === 'quantity') {
        const nextQty = Math.max(0, roundQty(val));
        const found = materialMap.get(String(copy[idx].materialCode || '').trim().toLowerCase());
        if (found && found.unitWeightKg && found.unitWeightKg > 0) {
          const prevAutoW = Math.round(found.unitWeightKg * roundQty(prevRow.quantity) * 100) / 100;
          const currW = Number(prevRow.weightKg) || 0;
          if (currW === 0 || Math.abs(currW - prevAutoW) < 0.05) {
            copy[idx].weightKg = Math.round(found.unitWeightKg * nextQty * 100) / 100;
          }
        }
      }

      if (field === 'quantity' || field === 'unitPrice') {
        const qty = Math.max(0, roundQty(field === 'quantity' ? val : copy[idx].quantity));
        const price = Math.max(0, Number(field === 'unitPrice' ? val : copy[idx].unitPrice) || 0);
        copy[idx].totalPrice = Math.round(qty * price * 100) / 100;
      }

      return copy;
    });
  };

  // Xử lý import từ file Excel tối ưu O(N) cho trên 100.000 dòng
  const handleExcelImportSuccess = async (
    importedItems: Partial<InboundItemDetail>[],
    defaultWhId?: string
  ) => {
    if (importedItems.length === 0) return;

    const allWh = StorageService.getWarehouses();
    const fallbackWh: Warehouse = allWh[0] || {
      id: 'wh-01',
      name: 'Kho Tổng Trung Tâm',
      code: 'WH-01',
      location: 'Khu dự án',
      type: 'covered',
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const selectedDefaultWh =
      defaultWhId && defaultWhId !== 'auto'
        ? allWh.find((w) => w.id === defaultWhId) || fallbackWh
        : fallbackWh;

    const whResolveCache = new Map<string, Warehouse>();
    const resolveWarehouse = (itemWhName?: string): Warehouse => {
      if (!itemWhName) return selectedDefaultWh;
      const trimmed = itemWhName.trim().toLowerCase();
      if (!trimmed) return selectedDefaultWh;

      const cached = whResolveCache.get(trimmed);
      if (cached) return cached;

      const matched =
        allWh.find((w) => {
          const wName = w.name.toLowerCase();
          const wCode = w.code.toLowerCase();
          return (
            wName === trimmed ||
            wCode === trimmed ||
            wName.includes(trimmed) ||
            trimmed.includes(wName)
          );
        }) || selectedDefaultWh;

      whResolveCache.set(trimmed, matched);
      return matched;
    };

    const groups = new Map<
      string,
      {
        warehouse: Warehouse;
        receiptCode?: string;
        receiptDate?: string;
        departmentName?: string;
        delivererName?: string;
        contractNo?: string;
        requestNo?: string;
        notes?: string;
        driverVehicleNo?: string;
        items: Partial<InboundItemDetail>[];
      }
    >();

    for (let i = 0; i < importedItems.length; i++) {
      const item = importedItems[i] as any;
      const wh = resolveWarehouse(item.warehouseName);
      const rawCode = (item.receiptCode || '').trim();
      const customCode = rawCode || (item.packingListNo && item.packingListNo !== 'PL-CHUA-RO' ? `PNK-${item.packingListNo.trim()}` : '');
      const groupKey = rawCode
        ? `RECEIPT_${rawCode.toUpperCase()}`
        : `${wh.id}__${customCode || 'AUTO'}`;

      let currentGroup = groups.get(groupKey);
      if (!currentGroup) {
        currentGroup = {
          warehouse: wh,
          receiptCode: rawCode || customCode,
          receiptDate: item.receiptDate,
          departmentName: item.departmentName,
          delivererName: item.delivererName,
          contractNo: item.contractNo,
          requestNo: item.requestNo,
          notes: item.receiptNotes,
          driverVehicleNo: item.driverVehicleNo,
          items: []
        };
        groups.set(groupKey, currentGroup);
      } else {
        if (!currentGroup.receiptDate && item.receiptDate) currentGroup.receiptDate = item.receiptDate;
        if (!currentGroup.departmentName && item.departmentName) currentGroup.departmentName = item.departmentName;
        if (!currentGroup.delivererName && item.delivererName) currentGroup.delivererName = item.delivererName;
        if (!currentGroup.contractNo && item.contractNo) currentGroup.contractNo = item.contractNo;
        if (!currentGroup.requestNo && item.requestNo) currentGroup.requestNo = item.requestNo;
        if (!currentGroup.notes && item.receiptNotes) currentGroup.notes = item.receiptNotes;
        if (!currentGroup.driverVehicleNo && item.driverVehicleNo) currentGroup.driverVehicleNo = item.driverVehicleNo;
      }
      currentGroup.items.push(item);
    }

    const todayIso = new Date().toISOString();
    const todayDate = todayIso.slice(0, 10);
    const yy = todayDate.slice(2, 4);
    const baseTs = Date.now();
    const batchSalt = Math.random().toString(36).slice(2, 6);
    const userFullName = currentUser?.fullName || 'Võ Dương Phú';
    let createdCount = 0;
    const newReceipts: InboundReceipt[] = [];

    groups.forEach(
      ({
        warehouse: targetWh,
        receiptCode: customRcpCode,
        receiptDate: customRcpDate,
        departmentName: customDept,
        delivererName: customDeliverer,
        contractNo: customContract,
        requestNo: customReqNo,
        notes: customNotes,
        driverVehicleNo: customVehicle,
        items: whItems
      }) => {
        const first = whItems[0] as any;
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const generatedCode = customRcpCode?.trim()
          ? customRcpCode.trim()
          : `PNK${yy}-${randomNum + createdCount}`;

        const len = whItems.length;
        const fullItems: InboundItemDetail[] = new Array(len);
        const occurrenceMap = new Map<string, number>();

        for (let idx = 0; idx < len; idx++) {
          const item = whItems[idx] as any;
          const qty = Math.max(0, roundQty(item.quantity));
          const weight = Math.max(0, Math.round((Number(item.weightKg) || 0) * 100) / 100);
          const uPrice = Math.max(0, Number(item.unitPrice) || 0);
          const tPrice =
            Number(item.totalPrice) > 0
              ? Math.round(Number(item.totalPrice) * 100) / 100
              : Math.round(qty * uPrice * 100) / 100;
          const batchVal = String(item.batchCode || item.packageNo || '').trim();
          const pkgNo = String(item.packageNo || batchVal || `PKG-${idx + 1}`).trim();
          const matCode = String(item.materialCode || `VT-AUTO-${idx + 1}`).trim().toUpperCase();
          const plNo = String(item.packingListNo || first?.packingListNo || 'PL-EXCEL-01').trim();
          const dwgNo = String(item.drawingNo || 'N/A').trim();

          const sigSeed = `${matCode}|${batchVal}|${plNo}|${pkgNo}|${dwgNo}|${qty}|${weight}`;
          const occ = (occurrenceMap.get(sigSeed) || 0) + 1;
          occurrenceMap.set(sigSeed, occ);

          fullItems[idx] = {
            id: buildDeterministicItemId('in', generatedCode, sigSeed, occ),
            materialCode: matCode,
            materialName: item.materialName || 'Vật tư nhập Excel',
            unit: item.unit || 'Ống',
            batchCode: batchVal,
            packingListNo: plNo,
            shipment: item.shipment || first?.shipment || 'SHP-EXCEL',
            packageNo: pkgNo,
            packageName: item.packageName || `Kiện ${pkgNo}`,
            category: item.category || 'Hạng mục dự án',
            drawingNo: dwgNo,
            manufacturer: item.manufacturer || first?.manufacturer || 'N/A',
            supplier: item.supplier || first?.supplier || 'N/A',
            weightKg: weight,
            quantity: qty,
            unitPrice: uPrice,
            totalPrice: tPrice,
            storageLocation: item.storageLocation || 'Kho tổng',
            warehouseName: targetWh.name,
            conditionNote: item.conditionNote || '',
            note: item.note ?? item.conditionNote ?? ''
          };
        }

        const sums = sumInboundItems(fullItems);
        const normalizedRcpDate = formatExcelDate(customRcpDate) || todayDate;

        const effectiveSupplier =
          first.supplier && first.supplier !== 'Đang cập nhật' ? first.supplier : '';
        const effectiveDeliverer =
          customDeliverer || first.delivererName || effectiveSupplier || '';

        newReceipts.push({
          id: `in-rcp-${baseTs}-${batchSalt}-${createdCount}`,
          receiptCode: generatedCode,
          receiptDate: normalizedRcpDate,
          warehouseId: targetWh.id,
          warehouseName: targetWh.name,
          departmentName: customDept || '',
          contractNo: customContract || '',
          requestNo: customReqNo || '',
          inboundType: 'new',
          supplier: effectiveSupplier || effectiveDeliverer || 'Theo phiếu nhập',
          manufacturer: first.manufacturer && first.manufacturer !== 'Đang cập nhật' ? first.manufacturer : '',
          shipment: first.shipment || 'SHP-EXCEL',
          packingListNo: first.packingListNo || 'PL-EXCEL',
          delivererName: effectiveDeliverer,
          receiverName: userFullName,
          driverVehicleNo: customVehicle || first.driverVehicleNo || '',
          notes: customNotes || '',
          items: fullItems,
          packageCount: sums.packageCount,
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg,
          totalAmount: sums.totalAmount,
          createdAt: todayIso,
          createdBy: userFullName
        });
        createdCount++;
      }
    );

    const result = StorageService.addInboundReceipts(newReceipts);

    setSearchTerm('');
    setFilterWarehouse('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);

    loadData();
    showToast(
      `Đã import thành công ${newReceipts.length.toLocaleString('vi-VN')} phiếu nhập kho (${importedItems.length.toLocaleString('vi-VN')} mục hàng)! Tự động cập nhật ${result.newMaterialsCount.toLocaleString('vi-VN')} vật tư mới.`
    );
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptCode.trim()) {
      setFormError('Số phiếu nhập không được để trống.');
      return;
    }
    if (formItems.length === 0) {
      setFormError('Vui lòng thêm ít nhất một dòng vật tư vào phiếu nhập kho.');
      return;
    }

    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      if (!it.materialName.trim()) {
        setFormError(`Dòng số ${i + 1}: Vui lòng nhập Tên vật tư.`);
        return;
      }
      const q = roundQty(it.quantity);
      const w = Number(it.weightKg) || 0;
      if (q < 0 || w < 0) {
        setFormError(`Dòng số ${i + 1}: Số lượng và Khối lượng không được là số âm.`);
        return;
      }
      if (q <= 0 && w <= 0) {
        setFormError(`Dòng số ${i + 1}: Vui lòng nhập Số lượng (> 0) hoặc Khối lượng (> 0).`);
        return;
      }
    }

    const wh = warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0];
    const headerPl = formPackingListNo.trim() || receiptCode.trim();
    const headerShp = formShipment.trim() || 'N/A';
    const headerSup = formSupplier.trim() || formDeliverer.trim() || 'N/A';
    const headerMaker = formManufacturer.trim() || 'N/A';

    const normalizedItems: InboundItemDetail[] = formItems.map((it, idx) => {
      const batch = (it.batchCode || it.packageNo || '').trim();
      const pkg = (it.packageNo || batch || `LO-${idx + 1}`).trim();
      const qty = Math.max(0, roundQty(it.quantity));
      const uPrice = Math.max(0, Number(it.unitPrice) || 0);
      const tPrice =
        Number(it.totalPrice) > 0
          ? Math.round(Number(it.totalPrice) * 100) / 100
          : Math.round(qty * uPrice * 100) / 100;
      const noteText = (it.note ?? it.conditionNote ?? '').trim();

      return {
        ...it,
        materialCode:
          it.materialCode.trim() ||
          `VT-${it.materialName.trim().slice(0, 6).toUpperCase().replace(/\s+/g, '')}-${idx + 1}`,
        materialName: it.materialName.trim(),
        unit: it.unit.trim() || 'Ống',
        batchCode: batch,
        packageNo: pkg,
        packageName: it.packageName?.trim() || (batch ? `Lô ${batch}` : `Kiện ${pkg}`),
        packingListNo: it.packingListNo?.trim() || headerPl,
        shipment: it.shipment?.trim() || headerShp,
        supplier: it.supplier?.trim() || headerSup,
        manufacturer: it.manufacturer?.trim() || headerMaker,
        category: it.category?.trim() || formNotes.trim() || 'Vật tư dự án',
        drawingNo: it.drawingNo?.trim() || 'N/A',
        quantity: qty,
        weightKg: Math.max(0, Math.round((Number(it.weightKg) || 0) * 100) / 100),
        unitPrice: uPrice,
        totalPrice: tPrice,
        conditionNote: noteText,
        note: noteText
      };
    });

    const sums = sumInboundItems(normalizedItems);

    const newReceipt: InboundReceipt = {
      id: `in-rcp-${Date.now()}`,
      receiptCode: receiptCode.trim(),
      receiptDate,
      warehouseId: wh?.id || 'wh-01',
      warehouseName: wh?.name || 'Kho Dự Án',
      departmentName: formDepartmentName.trim(),
      contractNo: formContractNo.trim(),
      requestNo: formRequestNo.trim(),
      inboundType: formInboundType,
      amountInWords: formAmountInWords.trim(),
      attachedDocs: formAttachedDocs.trim(),
      supplier: formSupplier.trim() || formDeliverer.trim() || 'Đơn vị giao hàng',
      manufacturer: formManufacturer.trim(),
      shipment: headerShp,
      packingListNo: headerPl,
      delivererName: formDeliverer.trim() || formSupplier.trim(),
      receiverName: currentUser?.fullName || 'Võ Dương Phú',
      driverVehicleNo: formDriverVehicle.trim(),
      notes: formNotes.trim(),
      items: normalizedItems,
      packageCount: sums.packageCount,
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      totalAmount: sums.totalAmount,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.fullName || 'Võ Dương Phú'
    };

    StorageService.addInboundReceipt(newReceipt);
    loadData();
    setIsCreateModalOpen(false);
    showToast(`Đã lập phiếu nhập kho "${receiptCode}" thành công!`);
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
    setReceipts((prev) => prev.filter((r) => r.id !== targetId));
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

  // Lọc danh sách phiếu tối ưu O(N)
  const filteredReceipts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const checkWh = filterWarehouse !== 'all';

    if (!q && !checkWh && !startDate && !endDate) {
      return receipts;
    }

    return receipts.filter((r) => {
      if (checkWh && r.warehouseId !== filterWarehouse) return false;
      const normDate = formatExcelDate(r.receiptDate);
      if (startDate && normDate < startDate) return false;
      if (endDate && normDate > endDate) return false;

      if (q) {
        const headerMatch =
          r.receiptCode.toLowerCase().includes(q) ||
          (r.delivererName && r.delivererName.toLowerCase().includes(q)) ||
          (r.contractNo && r.contractNo.toLowerCase().includes(q)) ||
          (r.requestNo && r.requestNo.toLowerCase().includes(q)) ||
          (r.departmentName && r.departmentName.toLowerCase().includes(q)) ||
          (r.notes && r.notes.toLowerCase().includes(q)) ||
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
            (it.batchCode && it.batchCode.toLowerCase().includes(q)) ||
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

  const pagedReceipts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReceipts.slice(start, start + pageSize);
  }, [filteredReceipts, currentPage, pageSize]);

  const filteredDetailItems = useMemo(() => {
    if (!viewingReceipt) return [];
    const q = deferredDetailSearch.trim().toLowerCase();
    if (!q) return viewingReceipt.items;
    return viewingReceipt.items.filter(
      (it) =>
        it.materialName.toLowerCase().includes(q) ||
        it.materialCode.toLowerCase().includes(q) ||
        (it.batchCode && it.batchCode.toLowerCase().includes(q)) ||
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

  const detailTotals = useMemo(
    () => sumInboundItems(filteredDetailItems),
    [filteredDetailItems]
  );

  const viewingReceiptTotals = useMemo(
    () =>
      viewingReceipt
        ? sumInboundItems(viewingReceipt.items)
        : { totalQuantity: 0, totalWeightKg: 0, totalAmount: 0, packageCount: 0 },
    [viewingReceipt]
  );

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 border shadow-md animate-in slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
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
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Quản Lý Phiếu Nhập Kho (QN-OPR-PR11-FM05.01)
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Lập & in Phiếu Nhập Kho chuẩn PTSC Quảng Ngãi QLVT theo Mã vật tư, Mã lô, Số lượng, Khối lượng (Kg), Đơn vị giao hàng & Hợp đồng
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
            <span>Lập Phiếu Nhập Kho Mới</span>
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
            placeholder="Tìm theo Số phiếu (PNK...), Đơn vị giao hàng, Hợp đồng, Đề xuất số, Mã lô, Mã/Tên vật tư..."
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
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
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
                <th className="px-5 py-3.5">Số Phiếu & Ngày</th>
                <th className="px-5 py-3.5">Đơn Vị Giao Hàng & Hợp Đồng</th>
                <th className="px-5 py-3.5">Bộ Phận & Kho Lưu Trữ</th>
                <th className="px-5 py-3.5">Nội Dung / Lô Hàng</th>
                <th className="px-5 py-3.5 text-right">Tổng Số Lượng</th>
                <th className="px-5 py-3.5 text-right">Tổng Khối Lượng (Kg)</th>
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
                pagedReceipts.map((r) => {
                  const delivererDisplay =
                    r.delivererName && r.delivererName !== 'Nhập từ File Excel tự động'
                      ? r.delivererName
                      : r.supplier;
                  const rowSums = sumInboundItems(r.items);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4">
                        <div>
                          <span className="font-mono font-bold text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block mb-1">
                            {r.receiptCode}
                          </span>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{formatVoucherDateVi(r.receiptDate)}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-xs font-bold text-slate-900 line-clamp-1">
                          {delivererDisplay || 'Đang cập nhật'}
                        </div>
                        {r.contractNo ? (
                          <div className="text-[11px] text-slate-600 font-mono">HĐ: {r.contractNo}</div>
                        ) : (
                          <div className="text-[11px] text-slate-500 font-mono">PL: {r.packingListNo}</div>
                        )}
                        {r.requestNo && (
                          <div className="text-[11px] text-indigo-700 font-mono">ĐX: {r.requestNo}</div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {r.departmentName && r.departmentName !== 'DỰ ÁN LTIA-4.9' ? (
                          <div className="text-xs font-semibold text-slate-800">{r.departmentName}</div>
                        ) : (
                          <div className="text-xs font-medium text-slate-500">Bộ phận: —</div>
                        )}
                        <div className="text-[11px] text-slate-500">Kho: {r.warehouseName}</div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="text-xs text-slate-700 line-clamp-2">
                          {r.notes && !r.notes.startsWith('Import thành công ')
                            ? r.notes
                            : `Shipment: ${r.shipment}`}
                        </div>
                        <div className="text-[11px] text-indigo-700 font-medium mt-0.5">
                          ({r.items.length.toLocaleString('vi-VN')} mục hàng)
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="font-bold text-slate-900 font-mono text-sm tabular-nums">
                          {rowSums.totalQuantity.toLocaleString('vi-VN')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.inboundType === 'return' ? 'Nhập trả kho' : 'Nhập mới'}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                        {rowSums.totalWeightKg.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}{' '}
                        Kg
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openDetailModal(r)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                            title="Xem chi tiết phiếu nhập kho"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedReceiptForPrint(r)}
                            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
                            title="In Phiếu Nhập Kho (Mẫu QN-OPR-PR11-FM05.01)"
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

      {/* Modal Lập Phiếu Nhập Kho Mới (Chuẩn QN-OPR-PR11-FM05.01) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shrink-0">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                    Lập Phiếu Nhập Kho (Mẫu QN-OPR-PR11-FM05.01)
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1">
                    CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC — Nhập đầy đủ thông tin để in phiếu A4 chuẩn
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0"
              >
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

              {/* Thông tin đầu phiếu theo mẫu QN-OPR-PR11-FM05.01 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Số phiếu (*)
                    </label>
                    <input
                      type="text"
                      value={receiptCode}
                      onChange={(e) => setReceiptCode(e.target.value)}
                      placeholder="PNK25-0019"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-blue-700 outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Ngày lập phiếu (*)
                    </label>
                    <input
                      type="date"
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Bộ phận
                    </label>
                    <input
                      type="text"
                      value={formDepartmentName}
                      onChange={(e) => setFormDepartmentName(e.target.value)}
                      placeholder="Để trống sẽ in BỘ PHẬN:"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Kho tiếp nhận (*)
                    </label>
                    <select
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    >
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Đơn vị giao hàng (*)
                    </label>
                    <input
                      type="text"
                      value={formDeliverer}
                      onChange={(e) => setFormDeliverer(e.target.value)}
                      placeholder="Ví dụ: Việt Xuân Mới"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Hợp đồng
                    </label>
                    <input
                      type="text"
                      value={formContractNo}
                      onChange={(e) => setFormContractNo(e.target.value)}
                      placeholder="Số hợp đồng..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Đề xuất số
                    </label>
                    <input
                      type="text"
                      value={formRequestNo}
                      onChange={(e) => setFormRequestNo(e.target.value)}
                      placeholder="Số đề xuất..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Nội dung nhập kho
                    </label>
                    <input
                      type="text"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Ví dụ: Phục vụ thi công hạng mục PIPING"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-5 py-1.5 px-3 bg-white rounded-lg border border-slate-300">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="radio"
                        name="inboundType"
                        checked={formInboundType === 'new'}
                        onChange={() => setFormInboundType('new')}
                        className="text-blue-600"
                      />
                      <span>Nhập mới</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="radio"
                        name="inboundType"
                        checked={formInboundType === 'return'}
                        onChange={() => setFormInboundType('return')}
                        className="text-blue-600"
                      />
                      <span>Nhập trả kho</span>
                    </label>
                  </div>
                </div>

                {/* Thông tin chứng từ & Logistics bổ trợ (tùy chọn) */}
                <div className="pt-2 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-medium text-slate-500 mb-1">
                      Số Packing List (nếu có)
                    </label>
                    <input
                      type="text"
                      value={formPackingListNo}
                      onChange={(e) => setFormPackingListNo(e.target.value)}
                      placeholder="PL-..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-500 mb-1">
                      Shipment / Lô tàu (nếu có)
                    </label>
                    <input
                      type="text"
                      value={formShipment}
                      onChange={(e) => setFormShipment(e.target.value)}
                      placeholder="SHP-..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-500 mb-1">
                      Viết bằng chữ (trên phiếu in)
                    </label>
                    <input
                      type="text"
                      value={formAmountInWords}
                      onChange={(e) => setFormAmountInWords(e.target.value)}
                      placeholder="Số tiền bằng chữ..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-500 mb-1">
                      Số chứng từ gốc kèm theo
                    </label>
                    <input
                      type="text"
                      value={formAttachedDocs}
                      onChange={(e) => setFormAttachedDocs(e.target.value)}
                      placeholder="BBBG, CO/CQ..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Danh sách 10 cột vật tư chuẩn theo mẫu PNK QLVT */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-800">
                    Chi Tiết Vật Tư Nhập Kho ({formItems.length} mục hàng)
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
                  <table className="w-full text-left text-xs min-w-[980px]">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-10 text-center">STT</th>
                        <th className="p-2 w-36">Mã vật tư</th>
                        <th className="p-2 min-w-[220px]">Tên vật tư (*)</th>
                        <th className="p-2 w-32">Mã lô</th>
                        <th className="p-2 w-24 text-right">Số lượng (cây/tấm)</th>
                        <th className="p-2 w-20 text-center">ĐVT</th>
                        <th className="p-2 w-28 text-right">Khối lượng (Kg)</th>
                        <th className="p-2 w-28 text-right">Đơn giá (VNĐ)</th>
                        <th className="p-2 w-28 text-right">Thành tiền (VNĐ)</th>
                        <th className="p-2 w-36">Ghi chú</th>
                        <th className="p-2 w-10 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="p-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.materialCode}
                              onChange={(e) => updateItemRow(idx, 'materialCode', e.target.value)}
                              placeholder="PI-P.AA.S..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono outline-none text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.materialName}
                              onChange={(e) => updateItemRow(idx, 'materialName', e.target.value)}
                              placeholder='20"x12m PIPE, API 5L B...'
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-medium outline-none text-xs"
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.batchCode ?? item.packageNo ?? ''}
                              onChange={(e) => updateItemRow(idx, 'batchCode', e.target.value)}
                              placeholder="183A0108"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono outline-none text-xs"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.quantity === 0 ? '' : item.quantity}
                              placeholder="0"
                              onChange={(e) =>
                                updateItemRow(
                                  idx,
                                  'quantity',
                                  e.target.value === '' ? 0 : roundQty(e.target.value)
                                )
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-bold outline-none text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => updateItemRow(idx, 'unit', e.target.value)}
                              placeholder="Ống"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-center outline-none text-xs"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.weightKg === 0 ? '' : item.weightKg}
                              placeholder="0"
                              onChange={(e) =>
                                updateItemRow(
                                  idx,
                                  'weightKg',
                                  e.target.value === '' ? 0 : Number(e.target.value)
                                )
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-mono font-medium outline-none text-xs"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.unitPrice || ''}
                              onChange={(e) => updateItemRow(idx, 'unitPrice', Number(e.target.value))}
                              placeholder="-"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-mono outline-none text-xs"
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-semibold text-slate-700">
                            {Number(item.totalPrice) > 0
                              ? Number(item.totalPrice).toLocaleString('en-US')
                              : '-'}
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={item.note ?? ''}
                              onChange={(e) => updateItemRow(idx, 'note', e.target.value)}
                              placeholder="Ghi chú..."
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded outline-none text-xs"
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

                {/* Tóm tắt TỔNG CỘNG */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs font-semibold">
                  <span>TỔNG CỘNG: {formItems.length} mục hàng</span>
                  <div className="flex flex-wrap gap-4">
                    <span>
                      Tổng số lượng:{' '}
                      <strong className="text-blue-700 tabular-nums">
                        {roundQty(
                          formItems.reduce((s, it) => s + roundQty(it.quantity), 0)
                        ).toLocaleString('vi-VN')}
                      </strong>
                    </span>
                    <span>
                      Tổng khối lượng:{' '}
                      <strong className="text-emerald-700 tabular-nums">
                        {formItems
                          .reduce((s, it) => s + (Number(it.weightKg) || 0), 0)
                          .toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}{' '}
                        Kg
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu Phiếu Nhập Kho
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
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
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                    Phiếu Nhập Kho: {viewingReceipt.receiptCode}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1">
                    Ngày: {formatVoucherDateVi(viewingReceipt.receiptDate)} | Kho:{' '}
                    {viewingReceipt.warehouseName} | {viewingReceipt.items.length.toLocaleString('vi-VN')}{' '}
                    mục hàng | Tổng SL:{' '}
                    <strong className="text-blue-700 font-mono">
                      {viewingReceiptTotals.totalQuantity.toLocaleString('vi-VN')}
                    </strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => {
                    setSelectedReceiptForPrint(viewingReceipt);
                    setViewingReceipt(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition min-h-[36px]"
                >
                  <Printer className="w-4 h-4" />
                  <span>Xem & In Phiếu (FM05.01)</span>
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
                <button
                  onClick={() => setViewingReceipt(null)}
                  className="p-2 hover:bg-slate-200 rounded-lg text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block">Bộ phận:</span>
                  <span className="font-bold text-slate-900">
                    {viewingReceipt.departmentName && viewingReceipt.departmentName !== 'DỰ ÁN LTIA-4.9'
                      ? viewingReceipt.departmentName
                      : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Đơn vị giao hàng:</span>
                  <span className="font-bold text-slate-900">
                    {viewingReceipt.delivererName || viewingReceipt.supplier}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Hợp đồng:</span>
                  <span className="font-semibold text-slate-900">
                    {viewingReceipt.contractNo || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Đề xuất số:</span>
                  <span className="font-semibold text-slate-900">
                    {viewingReceipt.requestNo || '-'}
                  </span>
                </div>
                <div className="col-span-2 md:col-span-3">
                  <span className="text-slate-400 block">Nội dung:</span>
                  <span className="font-medium text-slate-800">
                    {viewingReceipt.notes || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Loại nhập:</span>
                  <span className="font-semibold text-emerald-700">
                    {viewingReceipt.inboundType === 'return' ? 'Nhập trả kho' : 'Nhập mới'}
                  </span>
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
                  placeholder="Tìm nhanh Mã vật tư, Tên vật tư, Mã lô trong phiếu..."
                  className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 sm:top-2.5" />
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-96 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2.5 w-12 text-center">STT</th>
                        <th className="p-2.5">Mã Vật Tư</th>
                        <th className="p-2.5">Tên Vật Tư</th>
                        <th className="p-2.5 text-center">Mã Lô</th>
                        <th className="p-2.5 text-right">Số Lượng</th>
                        <th className="p-2.5 text-center">ĐVT</th>
                        <th className="p-2.5 text-right">Khối Lượng (Kg)</th>
                        <th className="p-2.5 text-right">Thành Tiền (VNĐ)</th>
                        <th className="p-2.5">Ghi Chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedDetailItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            Không tìm thấy mặt hàng phù hợp từ khóa.
                          </td>
                        </tr>
                      ) : (
                        pagedDetailItems.map((it, idx) => {
                          const globalIdx = (detailPage - 1) * detailPageSize + idx;
                          const batchText = it.batchCode || it.packageNo || '';
                          const lineTotal =
                            it.totalPrice && it.totalPrice > 0
                              ? it.totalPrice
                              : (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
                          return (
                            <tr key={it.id || globalIdx} className="hover:bg-slate-50">
                              <td className="p-2.5 text-center font-mono text-slate-400">
                                {(globalIdx + 1).toLocaleString('vi-VN')}
                              </td>
                              <td className="p-2.5 font-mono font-semibold text-blue-700">
                                {it.materialCode}
                              </td>
                              <td className="p-2.5 font-medium text-slate-900">
                                {it.materialName}
                              </td>
                              <td className="p-2.5 text-center font-mono text-slate-800">
                                {batchText}
                              </td>
                              <td className="p-2.5 text-right font-bold font-mono text-slate-900 tabular-nums">
                                {roundQty(it.quantity) > 0
                                  ? roundQty(it.quantity).toLocaleString('vi-VN')
                                  : '-'}
                              </td>
                              <td className="p-2.5 text-center">{it.unit}</td>
                              <td className="p-2.5 text-right font-bold font-mono text-emerald-700 tabular-nums">
                                {Number(it.weightKg || 0).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </td>
                              <td className="p-2.5 text-right font-mono text-slate-700 tabular-nums">
                                {lineTotal > 0 ? lineTotal.toLocaleString('en-US') : '-'}
                              </td>
                              <td className="p-2.5 text-[11px] text-slate-600">
                                {it.note ?? it.conditionNote ?? ''}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                      <tr>
                        <td></td>
                        <td className="p-2.5 text-center uppercase whitespace-nowrap">
                          {deferredDetailSearch.trim() ? 'TỔNG CỘNG (LỌC)' : 'TỔNG CỘNG'}
                        </td>
                        <td></td>
                        <td></td>
                        <td className="p-2.5 text-right text-blue-700 font-mono tabular-nums">
                          {detailTotals.totalQuantity > 0
                            ? detailTotals.totalQuantity.toLocaleString('vi-VN')
                            : '-'}
                        </td>
                        <td></td>
                        <td className="p-2.5 text-right text-emerald-700 font-mono tabular-nums">
                          {detailTotals.totalWeightKg.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums">
                          {detailTotals.totalAmount > 0
                            ? detailTotals.totalAmount.toLocaleString('en-US')
                            : '-'}
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
                  itemLabel="mục hàng"
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
        itemName={
          receiptToDelete
            ? `Phiếu ${receiptToDelete.receiptCode} (${receiptToDelete.delivererName || receiptToDelete.supplier})`
            : ''
        }
        itemType="phiếu nhập kho"
        warningText="Xóa phiếu nhập kho sẽ tự động trừ lại số lượng và khối lượng tồn kho tương ứng. Bạn có chắc chắn muốn xóa không?"
      />
    </div>
  );
};

import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useAuth } from '../../context/AuthContext';
import { InboundReceipt, InboundItemDetail, Warehouse, MaterialItem } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { SyncService } from '../../services/syncService';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { ReceiptPrintModal } from '../common/ReceiptPrintModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { PaginationBar } from '../common/PaginationBar';
import {
  downloadInboundTemplate,
  exportInboundReceiptToExcel,
  formatExcelDate,
  formatVoucherDateVi
} from '../../services/excelService';
import {
  normKey,
  foldVietnameseAscii,
  roundQty,
  sumInboundItems,
  buildDeterministicItemId,
  generateNextInboundVoucherCode
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
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  PackageSearch,
  ChevronDown,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';

const FORM_ITEM_PAGE_SIZE = 100;

export type ReceiptSortField = 'date' | 'code';
export type SortOrder = 'asc' | 'desc';

export const InboundManager: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const [receipts, setReceipts] = useState<InboundReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);

  // Search, Filters & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortField, setSortField] = useState<ReceiptSortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form New Inbound State (Theo mẫu QN-OPR-PR11-FM05.01 + Logistics)
  const [receiptCode, setReceiptCode] = useState('');
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState(false);
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

  // Chế độ chỉnh sửa phiếu nhập kho (chỉ dành cho Admin; null = lập phiếu mới)
  const [editingReceipt, setEditingReceipt] = useState<InboundReceipt | null>(null);

  // Danh sách dòng vật tư trong phiếu + tìm kiếm/phân trang cho phiếu lớn
  const [formItems, setFormItems] = useState<InboundItemDetail[]>([]);
  const [formItemSearch, setFormItemSearch] = useState('');
  const [formItemPage, setFormItemPage] = useState(1);
  const [formError, setFormError] = useState('');

  // Trường chọn nhanh & hộp thoại chọn nhiều từ Danh mục vật tư có sẵn
  const [quickCatalogQuery, setQuickCatalogQuery] = useState('');
  const [isQuickCatalogOpen, setIsQuickCatalogOpen] = useState(false);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogTargetRowIdx, setCatalogTargetRowIdx] = useState<number | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const deferredCatalogSearch = useDeferredValue(catalogSearch);
  const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('all');
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(50);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = () => {
    setReceipts(StorageService.getInboundReceipts());
    setWarehouses(StorageService.getWarehouses());
    setMaterials(StorageService.getMaterials());
  };

  useEffect(() => {
    loadData();
    return StorageService.subscribe(loadData);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, filterWarehouse, startDate, endDate]);

  // Đồng bộ làm sạch danh sách checkbox nếu có phiếu vừa bị xóa hoặc đổi quyền user
  useEffect(() => {
    if (!isAdmin) {
      setSelectedIds((prev) => (prev.size > 0 ? new Set() : prev));
      return;
    }
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const validIds = new Set(receipts.map((r) => r.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [receipts, isAdmin]);

  // Map tra cứu nhanh danh mục vật tư O(1) khi mở form lập phiếu
  const materialMap = useMemo(() => {
    const map = new Map<string, MaterialItem>();
    for (let i = 0; i < materials.length; i++) {
      map.set(materials[i].code.toLowerCase(), materials[i]);
    }
    return map;
  }, [materials]);

  const createBlankInboundItem = (idxOffset = 0): InboundItemDetail => ({
    id: `item-${Date.now()}-${idxOffset}-${Math.random().toString(36).substring(2, 6)}`,
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
  });

  const buildInboundItemFromMaterial = (
    mat: MaterialItem,
    idxOffset = 0
  ): InboundItemDetail => {
    const defaultQty = 1;
    const unitW = Number(mat.unitWeightKg) || 0;
    const defaultWeight = unitW > 0 ? Math.round(unitW * defaultQty * 100) / 100 : 0;
    const batch = (mat.packageNo && mat.packageNo !== 'N/A' ? mat.packageNo : '').trim();

    return {
      id: `item-${Date.now()}-${idxOffset}-${Math.random().toString(36).substring(2, 6)}`,
      materialCode: mat.code || '',
      materialName: mat.name || '',
      unit: mat.unit || 'Ống',
      batchCode: batch,
      packingListNo: mat.packingListNo || formPackingListNo || '',
      shipment: mat.shipment || formShipment || '',
      packageNo: batch,
      packageName: batch ? `Kiện ${batch}` : '',
      category: mat.category && mat.category !== 'Chung' ? mat.category : '',
      drawingNo: mat.drawingNo && mat.drawingNo !== 'N/A' ? mat.drawingNo : '',
      manufacturer:
        (mat.manufacturer && mat.manufacturer !== 'N/A' ? mat.manufacturer : '') ||
        formManufacturer ||
        '',
      supplier:
        (mat.supplier && mat.supplier !== 'N/A' ? mat.supplier : '') ||
        formSupplier ||
        '',
      weightKg: defaultWeight,
      quantity: defaultQty,
      unitPrice: 0,
      totalPrice: 0,
      storageLocation: '',
      conditionNote: '',
      note: ''
    };
  };

  const applyMaterialToRow = (targetIdx: number, mat: MaterialItem) => {
    setFormItems((prev) => {
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const existing = copy[targetIdx];
      const qty = existing.quantity > 0 ? roundQty(existing.quantity) : 1;
      const uPrice = Math.max(0, Number(existing.unitPrice) || 0);
      const unitW = Number(mat.unitWeightKg) || 0;
      const batch =
        (existing.batchCode || '').trim() ||
        (mat.packageNo && mat.packageNo !== 'N/A' ? mat.packageNo.trim() : '');

      copy[targetIdx] = {
        ...existing,
        materialCode: mat.code || '',
        materialName: mat.name || '',
        unit: mat.unit || existing.unit || 'Ống',
        batchCode: batch,
        packingListNo: existing.packingListNo || mat.packingListNo || formPackingListNo || '',
        shipment: existing.shipment || mat.shipment || formShipment || '',
        packageNo: batch || existing.packageNo || '',
        category:
          (mat.category && mat.category !== 'Chung' ? mat.category : '') ||
          existing.category ||
          '',
        drawingNo:
          (mat.drawingNo && mat.drawingNo !== 'N/A' ? mat.drawingNo : '') ||
          existing.drawingNo ||
          '',
        manufacturer:
          (mat.manufacturer && mat.manufacturer !== 'N/A' ? mat.manufacturer : '') ||
          existing.manufacturer ||
          formManufacturer ||
          '',
        supplier:
          (mat.supplier && mat.supplier !== 'N/A' ? mat.supplier : '') ||
          existing.supplier ||
          formSupplier ||
          '',
        quantity: qty,
        weightKg:
          unitW > 0
            ? Math.round(unitW * qty * 100) / 100
            : Number(existing.weightKg) || 0,
        totalPrice: Math.round(qty * uPrice * 100) / 100
      };
      return copy;
    });
    setFormError('');
  };

  const handleQuickPickMaterial = (mat: MaterialItem) => {
    setFormItemSearch('');
    setFormItems((prev) => {
      const blankIdx = prev.findIndex(
        (it) => !it.materialCode.trim() && !it.materialName.trim()
      );
      if (blankIdx !== -1) {
        const copy = [...prev];
        copy[blankIdx] = buildInboundItemFromMaterial(mat, blankIdx);
        setFormItemPage(Math.max(1, Math.ceil((blankIdx + 1) / FORM_ITEM_PAGE_SIZE)));
        return copy;
      }
      const next = [...prev, buildInboundItemFromMaterial(mat, prev.length)];
      setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
      return next;
    });
    setQuickCatalogQuery('');
    setIsQuickCatalogOpen(false);
    setFormError('');
  };

  const openCatalogPicker = (rowIdx: number | null = null) => {
    StorageService.syncMaterialsFromReceipts();
    setMaterials(StorageService.getMaterials());
    setCatalogTargetRowIdx(rowIdx);
    setCatalogSearch('');
    setCatalogCategoryFilter('all');
    setCatalogPage(1);
    setIsQuickCatalogOpen(false);
    setIsCatalogModalOpen(true);
  };

  const toggleCatalogMaterialSelection = (mat: MaterialItem) => {
    if (catalogTargetRowIdx !== null) {
      applyMaterialToRow(catalogTargetRowIdx, mat);
      setIsCatalogModalOpen(false);
      setCatalogTargetRowIdx(null);
      return;
    }

    const codeKey = normKey(mat.code);
    setFormItemSearch('');
    setFormItems((prev) => {
      const exists = prev.some((it) => normKey(it.materialCode) === codeKey);
      if (exists) {
        const filtered = prev.filter((it) => normKey(it.materialCode) !== codeKey);
        return filtered.length > 0 ? filtered : [createBlankInboundItem(0)];
      }
      const nonBlank = prev.filter(
        (it) => it.materialCode.trim() || it.materialName.trim()
      );
      const next = [...nonBlank, buildInboundItemFromMaterial(mat, nonBlank.length)];
      setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
      return next;
    });
    setFormError('');
  };

  const generateNextPnkCode = (
    existingList: InboundReceipt[],
    targetDateStr?: string
  ): string => {
    return generateNextInboundVoucherCode(existingList, targetDateStr);
  };

  // Tự động nhảy sang số phiếu kế tiếp nếu có phiếu mới đồng bộ về khi đang mở form lập mới (chưa sửa tay số phiếu)
  useEffect(() => {
    if (!isCreateModalOpen || editingReceipt || isCodeManuallyEdited) return;
    const nextCode = generateNextPnkCode(receipts, receiptDate);
    setReceiptCode((prev) => (prev !== nextCode ? nextCode : prev));
  }, [receipts, isCreateModalOpen, editingReceipt, isCodeManuallyEdited, receiptDate]);

  const openCreateModal = () => {
    StorageService.syncMaterialsFromReceipts();
    const mats = StorageService.getMaterials();
    const currentReceipts = StorageService.getInboundReceipts();
    const todayDate = new Date().toISOString().slice(0, 10);
    setReceipts(currentReceipts);
    setEditingReceipt(null);
    setMaterials(mats);
    setIsCodeManuallyEdited(false);
    setReceiptDate(todayDate);
    setReceiptCode(generateNextPnkCode(currentReceipts, todayDate));
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
    setFormItemSearch('');
    setFormItemPage(1);
    setQuickCatalogQuery('');
    setIsQuickCatalogOpen(false);

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

  const openEditModal = (rcp: InboundReceipt) => {
    if (!isAdmin) {
      showToast('Chỉ tài khoản Quản trị viên (Admin) mới có quyền sửa phiếu nhập kho.', 'error');
      return;
    }

    StorageService.syncMaterialsFromReceipts();
    const mats = StorageService.getMaterials();
    const whList = StorageService.getWarehouses();
    setMaterials(mats);
    setEditingReceipt(rcp);
    setIsCodeManuallyEdited(true);
    setReceiptCode(rcp.receiptCode || '');
    setReceiptDate(formatExcelDate(rcp.receiptDate) || new Date().toISOString().slice(0, 10));
    setSelectedWarehouseId(rcp.warehouseId || whList[0]?.id || '');

    setFormDepartmentName(
      rcp.departmentName && rcp.departmentName !== 'DỰ ÁN LTIA-4.9' ? rcp.departmentName : ''
    );
    const rawDeliverer =
      rcp.delivererName && rcp.delivererName !== 'Nhập từ File Excel tự động'
        ? rcp.delivererName
        : rcp.supplier &&
            rcp.supplier !== 'Nhiều nhà cung cấp' &&
            rcp.supplier !== 'Theo phiếu nhập' &&
            rcp.supplier !== 'Đơn vị giao hàng'
          ? rcp.supplier
          : rcp.delivererName || '';
    setFormDeliverer(rawDeliverer);
    setFormContractNo(rcp.contractNo || '');
    setFormRequestNo(rcp.requestNo || '');
    setFormNotes(rcp.notes && !rcp.notes.startsWith('Import thành công ') ? rcp.notes : '');
    setFormInboundType(rcp.inboundType || 'new');
    setFormAmountInWords(rcp.amountInWords || '');
    setFormAttachedDocs(rcp.attachedDocs || '');

    setFormSupplier(
      rcp.supplier && rcp.supplier !== 'Đơn vị giao hàng' && rcp.supplier !== 'Theo phiếu nhập'
        ? rcp.supplier
        : ''
    );
    setFormManufacturer(rcp.manufacturer && rcp.manufacturer !== 'N/A' ? rcp.manufacturer : '');
    setFormShipment(
      rcp.shipment && rcp.shipment !== 'N/A' && rcp.shipment !== 'SHP-EXCEL' ? rcp.shipment : ''
    );
    setFormPackingListNo(
      rcp.packingListNo && rcp.packingListNo !== 'PL-EXCEL' ? rcp.packingListNo : ''
    );
    setFormDriverVehicle(rcp.driverVehicleNo || '');
    setFormError('');
    setFormItemSearch('');
    setFormItemPage(1);
    setQuickCatalogQuery('');
    setIsQuickCatalogOpen(false);

    const clonedItems: InboundItemDetail[] = (rcp.items || []).map((it, idx) => ({
      ...it,
      id: it.id || `item-edit-${Date.now()}-${idx}`,
      note: it.note ?? it.conditionNote ?? ''
    }));
    setFormItems(
      clonedItems.length > 0
        ? clonedItems
        : [
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
          ]
    );

    setIsCreateModalOpen(true);
  };

  const handleExportReceiptExcel = (rcp: InboundReceipt) => {
    try {
      exportInboundReceiptToExcel(rcp);
      showToast(`Đã xuất file Excel cho phiếu nhập "${rcp.receiptCode}"!`);
    } catch (err) {
      console.error('Export Inbound Excel error:', err);
      showToast('Không thể xuất file Excel. Vui lòng thử lại.', 'error');
    }
  };

  const addNewItemRow = () => {
    setFormItemSearch('');
    setFormItems((prev) => {
      const next: InboundItemDetail[] = [...prev, createBlankInboundItem(prev.length)];
      setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
      return next;
    });
  };

  const removeItemRow = (idx: number) => {
    setFormItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [createBlankInboundItem(0)];
    });
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
        inboundType?: 'new' | 'return';
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
      const rowType: 'new' | 'return' = item.inboundType === 'return' ? 'return' : 'new';
      const groupKey = rawCode
        ? `RECEIPT_${rawCode.toUpperCase()}`
        : `${wh.id}__${rowType}__${customCode || 'AUTO'}`;

      let currentGroup = groups.get(groupKey);
      if (!currentGroup) {
        currentGroup = {
          warehouse: wh,
          receiptCode: rawCode || customCode,
          receiptDate: item.receiptDate,
          inboundType: item.inboundType === 'return' ? 'return' : item.inboundType === 'new' ? 'new' : undefined,
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
        if (item.inboundType === 'return') {
          currentGroup.inboundType = 'return';
        } else if (!currentGroup.inboundType && item.inboundType) {
          currentGroup.inboundType = item.inboundType;
        }
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
    const baseTs = Date.now();
    const batchSalt = Math.random().toString(36).slice(2, 6);
    const userFullName = currentUser?.fullName || 'Võ Dương Phú';
    let createdCount = 0;
    const existingForAutoNumber = StorageService.getInboundReceipts();
    const newReceipts: InboundReceipt[] = [];

    groups.forEach(
      ({
        warehouse: targetWh,
        receiptCode: customRcpCode,
        receiptDate: customRcpDate,
        inboundType: customInboundType,
        departmentName: customDept,
        delivererName: customDeliverer,
        contractNo: customContract,
        requestNo: customReqNo,
        notes: customNotes,
        driverVehicleNo: customVehicle,
        items: whItems
      }) => {
        const first = whItems[0] as any;
        const normalizedGroupDate = formatExcelDate(customRcpDate) || todayDate;
        const generatedCode = customRcpCode?.trim()
          ? customRcpCode.trim()
          : generateNextInboundVoucherCode(
              [...newReceipts, ...existingForAutoNumber],
              normalizedGroupDate
            );

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
          inboundType: customInboundType === 'return' ? 'return' : 'new',
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
    void SyncService.syncNow();
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = receiptCode.trim();
    if (!trimmedCode) {
      setFormError('Số phiếu nhập không được để trống.');
      return;
    }
    if (!editingReceipt && !formDeliverer.trim()) {
      setFormError('Vui lòng nhập Đơn vị giao hàng.');
      return;
    }
    if (formItems.length === 0) {
      setFormError('Vui lòng thêm ít nhất một dòng vật tư vào phiếu nhập kho.');
      return;
    }

    if (editingReceipt && !isAdmin) {
      setFormError('Chỉ tài khoản Quản trị viên (Admin) mới có quyền sửa phiếu nhập kho.');
      return;
    }

    const existingDuplicate = receipts.find(
      (r) =>
        (!editingReceipt || r.id !== editingReceipt.id) &&
        normKey(r.receiptCode) === normKey(trimmedCode)
    );
    if (existingDuplicate) {
      setFormError(
        `Số phiếu "${trimmedCode}" đã tồn tại trong hệ thống. Vui lòng nhập số phiếu khác.`
      );
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

    const isVoucherLike = (val?: string | null): boolean => {
      if (!val) return false;
      const s = val.trim().toUpperCase();
      return (
        s === trimmedCode.toUpperCase() ||
        /^PNK\d{2}-/i.test(s) ||
        /^PXK\d{2}-/i.test(s) ||
        /^PNK-/i.test(s) ||
        /^PXK-/i.test(s) ||
        /^OSD\d{2}-/i.test(s)
      );
    };

    const headerPl =
      formPackingListNo.trim() ||
      (editingReceipt?.packingListNo && !isVoucherLike(editingReceipt.packingListNo)
        ? editingReceipt.packingListNo
        : '');
    const headerShp =
      formShipment.trim() || editingReceipt?.shipment || 'N/A';
    const headerSup =
      formSupplier.trim() || formDeliverer.trim() || editingReceipt?.supplier || 'N/A';
    const headerMaker =
      formManufacturer.trim() || editingReceipt?.manufacturer || 'N/A';

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

      const itemPl = (it.packingListNo || '').trim();
      let resolvedPl = '';
      if (itemPl && !isVoucherLike(itemPl)) {
        resolvedPl = itemPl;
      } else if (headerPl && !isVoucherLike(headerPl)) {
        resolvedPl = headerPl;
      } else {
        const mat = materialMap.get(normKey(it.materialCode));
        if (mat?.packingListNo && !isVoucherLike(mat.packingListNo)) {
          resolvedPl = mat.packingListNo;
        }
      }

      const itemShp = (it.shipment || '').trim();
      let resolvedShp = itemShp && itemShp !== 'N/A' ? itemShp : headerShp;
      if (resolvedShp === 'N/A') {
        const mat = materialMap.get(normKey(it.materialCode));
        if (mat?.shipment && mat.shipment !== 'N/A') {
          resolvedShp = mat.shipment;
        }
      }

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
        packingListNo: resolvedPl || '',
        shipment: resolvedShp || 'N/A',
        supplier: it.supplier?.trim() || headerSup,
        manufacturer: it.manufacturer?.trim() || headerMaker,
        category: it.category?.trim() || formNotes.trim() || 'Vật tư dự án',
        drawingNo: it.drawingNo?.trim() || 'N/A',
        warehouseName: wh?.name || it.warehouseName || 'Kho Dự Án',
        quantity: qty,
        weightKg: Math.max(0, Math.round((Number(it.weightKg) || 0) * 100) / 100),
        unitPrice: uPrice,
        totalPrice: tPrice,
        conditionNote: noteText,
        note: noteText
      };
    });

    const sums = sumInboundItems(normalizedItems);
    const editorName = currentUser?.fullName || 'Võ Dương Phú';

    if (editingReceipt) {
      const updatedReceipt: InboundReceipt = {
        ...editingReceipt,
        receiptCode: trimmedCode,
        receiptDate,
        warehouseId: wh?.id || editingReceipt.warehouseId || 'wh-01',
        warehouseName: wh?.name || editingReceipt.warehouseName || 'Kho Dự Án',
        departmentName: formDepartmentName.trim(),
        contractNo: formContractNo.trim(),
        requestNo: formRequestNo.trim(),
        inboundType: formInboundType,
        amountInWords: formAmountInWords.trim(),
        attachedDocs: formAttachedDocs.trim(),
        supplier:
          formSupplier.trim() ||
          formDeliverer.trim() ||
          editingReceipt.supplier ||
          'Đơn vị giao hàng',
        manufacturer: formManufacturer.trim(),
        shipment: headerShp,
        packingListNo: headerPl,
        delivererName: formDeliverer.trim() || formSupplier.trim(),
        receiverName: editingReceipt.receiverName || editorName,
        driverVehicleNo: formDriverVehicle.trim(),
        notes: formNotes.trim(),
        items: normalizedItems,
        packageCount: sums.packageCount,
        totalQuantity: sums.totalQuantity,
        totalWeightKg: sums.totalWeightKg,
        totalAmount: sums.totalAmount,
        lastEditedBy: editorName,
        lastEditedAt: new Date().toISOString()
      };

      StorageService.updateInboundReceipt(editingReceipt.id, updatedReceipt);
      loadData();
      setIsCreateModalOpen(false);
      setEditingReceipt(null);
      if (viewingReceipt?.id === editingReceipt.id) {
        const refreshed = StorageService.getInboundReceipts().find(
          (r) => normKey(r.receiptCode) === normKey(trimmedCode)
        );
        if (refreshed) setViewingReceipt(refreshed);
      }
      showToast(`Đã cập nhật phiếu nhập kho "${trimmedCode}" thành công!`);
      return;
    }

    const newReceipt: InboundReceipt = {
      id: `in-rcp-${Date.now()}`,
      receiptCode: trimmedCode,
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
      receiverName: editorName,
      driverVehicleNo: formDriverVehicle.trim(),
      notes: formNotes.trim(),
      items: normalizedItems,
      packageCount: sums.packageCount,
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      totalAmount: sums.totalAmount,
      createdAt: new Date().toISOString(),
      createdBy: editorName
    };

    StorageService.addInboundReceipt(newReceipt);
    loadData();
    setIsCreateModalOpen(false);
    showToast(`Đã lập phiếu nhập kho "${trimmedCode}" thành công!`);
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
    setSelectedIds((prev) => {
      if (!prev.has(targetId)) return prev;
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    loadData();
    showToast(`Đã xóa phiếu nhập "${targetCode}" thành công!`);
    setReceiptToDelete(null);

    if (viewingReceipt?.id === targetId) {
      setViewingReceipt(null);
    }
  };

  const confirmDeleteSelectedInbound = () => {
    if (!isAdmin || selectedIds.size === 0) return;
    const idsToDelete = Array.from(selectedIds);
    const deletedCount = StorageService.deleteInboundReceipts(idsToDelete);

    if (viewingReceipt && selectedIds.has(viewingReceipt.id)) {
      setViewingReceipt(null);
    }

    setSelectedIds(new Set());
    setIsDeleteSelectedModalOpen(false);
    loadData();
    showToast(
      `Đã xóa thành công ${deletedCount.toLocaleString('vi-VN')} phiếu nhập kho đã chọn!`
    );
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

    const filtered =
      !q && !checkWh && !startDate && !endDate
        ? receipts
        : receipts.filter((r) => {
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

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortField === 'date') {
        const dateA = formatExcelDate(a.receiptDate) || a.receiptDate || '';
        const dateB = formatExcelDate(b.receiptDate) || b.receiptDate || '';
        if (dateA !== dateB) {
          return sortOrder === 'desc'
            ? dateB.localeCompare(dateA)
            : dateA.localeCompare(dateB);
        }
        return sortOrder === 'desc'
          ? (b.receiptCode || '').localeCompare(a.receiptCode || '', 'vi', { numeric: true })
          : (a.receiptCode || '').localeCompare(b.receiptCode || '', 'vi', { numeric: true });
      } else {
        const codeA = a.receiptCode || '';
        const codeB = b.receiptCode || '';
        const cmp = codeA.localeCompare(codeB, 'vi', { numeric: true });
        if (cmp !== 0) {
          return sortOrder === 'desc' ? -cmp : cmp;
        }
        const dateA = formatExcelDate(a.receiptDate) || a.receiptDate || '';
        const dateB = formatExcelDate(b.receiptDate) || b.receiptDate || '';
        return dateB.localeCompare(dateA);
      }
    });

    return sorted;
  }, [receipts, deferredSearch, filterWarehouse, startDate, endDate, sortField, sortOrder]);

  const pagedReceipts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReceipts.slice(start, start + pageSize);
  }, [filteredReceipts, currentPage, pageSize]);

  // Thao tác chọn checkbox xóa nhiều phiếu nhập (chỉ dành cho Admin, O(pageSize) trên mỗi trang)
  const toggleSelectReceipt = (id: string) => {
    if (!isAdmin) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllPageSelected =
    isAdmin && pagedReceipts.length > 0 && pagedReceipts.every((r) => selectedIds.has(r.id));
  const isSomePageSelected =
    isAdmin && pagedReceipts.some((r) => selectedIds.has(r.id)) && !isAllPageSelected;

  const toggleSelectCurrentPage = () => {
    if (!isAdmin) return;
    if (isAllPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = 0; i < pagedReceipts.length; i++) {
          next.delete(pagedReceipts[i].id);
        }
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = 0; i < pagedReceipts.length; i++) {
          next.add(pagedReceipts[i].id);
        }
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    if (!isAdmin) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < filteredReceipts.length; i++) {
        next.add(filteredReceipts[i].id);
      }
      return next;
    });
  };

  const selectAllTotal = () => {
    if (!isAdmin) return;
    setSelectedIds(new Set(receipts.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const selectedReceiptsSummary = useMemo(() => {
    if (selectedIds.size === 0) return '';
    const sampleCodes: string[] = [];
    for (let i = 0; i < receipts.length; i++) {
      if (selectedIds.has(receipts[i].id)) {
        sampleCodes.push(receipts[i].receiptCode);
        if (sampleCodes.length >= 4) break;
      }
    }
    const extra = selectedIds.size - sampleCodes.length;
    if (extra > 0) {
      return `${sampleCodes.join(', ')} và ${extra.toLocaleString('vi-VN')} phiếu nhập khác`;
    }
    return sampleCodes.join(', ');
  }, [receipts, selectedIds]);

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

  // Lọc & phân trang các dòng vật tư trong form Lập / Sửa Phiếu (hỗ trợ mượt mà cả phiếu nhiều nghìn dòng)
  const indexedFormItems = useMemo(() => {
    const q = formItemSearch.trim().toLowerCase();
    const out: { item: InboundItemDetail; realIdx: number }[] = [];
    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      if (q) {
        const hit =
          (it.materialCode || '').toLowerCase().includes(q) ||
          (it.materialName || '').toLowerCase().includes(q) ||
          (it.batchCode || '').toLowerCase().includes(q) ||
          (it.packageNo || '').toLowerCase().includes(q) ||
          (it.note || '').toLowerCase().includes(q);
        if (!hit) continue;
      }
      out.push({ item: it, realIdx: i });
    }
    return out;
  }, [formItems, formItemSearch]);

  const totalFormItemPages = Math.max(1, Math.ceil(indexedFormItems.length / FORM_ITEM_PAGE_SIZE));
  const safeFormItemPage = Math.min(formItemPage, totalFormItemPages);

  const visibleFormItems = useMemo(() => {
    const start = (safeFormItemPage - 1) * FORM_ITEM_PAGE_SIZE;
    return indexedFormItems.slice(start, start + FORM_ITEM_PAGE_SIZE);
  }, [indexedFormItems, safeFormItemPage]);

  const formTotals = useMemo(() => sumInboundItems(formItems), [formItems]);

  // Danh sách vật tư gợi ý cho trường Chọn nhanh từ Danh mục vật tư có sẵn (tối đa 40 kết quả tức thì)
  const quickCatalogMatches = useMemo(() => {
    if (materials.length === 0) return [];
    const q = quickCatalogQuery.trim().toLowerCase();
    const qFolded = foldVietnameseAscii(quickCatalogQuery);
    const out: MaterialItem[] = [];
    for (let i = 0; i < materials.length; i++) {
      const m = materials[i];
      if (q) {
        const hit =
          m.code.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.category && m.category.toLowerCase().includes(q)) ||
          (m.packageNo && m.packageNo.toLowerCase().includes(q)) ||
          (m.drawingNo && m.drawingNo.toLowerCase().includes(q)) ||
          (m.supplier && m.supplier.toLowerCase().includes(q)) ||
          (qFolded &&
            (foldVietnameseAscii(m.name).includes(qFolded) ||
              foldVietnameseAscii(m.category).includes(qFolded)));
        if (!hit) continue;
      }
      out.push(m);
      if (out.length >= 40) break;
    }
    return out;
  }, [materials, quickCatalogQuery]);

  // Bộ lọc & phân trang cho Hộp thoại Chọn từ Danh mục vật tư có sẵn
  const catalogCategories = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < materials.length; i++) {
      const c = (materials[i].category || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [materials]);

  const filteredCatalogMaterials = useMemo(() => {
    const q = deferredCatalogSearch.trim().toLowerCase();
    const qFolded = foldVietnameseAscii(deferredCatalogSearch);
    const checkCat = catalogCategoryFilter !== 'all';
    if (!q && !checkCat) return materials;

    return materials.filter((m) => {
      if (checkCat && (m.category || '').trim() !== catalogCategoryFilter) return false;
      if (q) {
        return (
          m.code.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.packingListNo && m.packingListNo.toLowerCase().includes(q)) ||
          (m.shipment && m.shipment.toLowerCase().includes(q)) ||
          (m.category && m.category.toLowerCase().includes(q)) ||
          (m.packageNo && m.packageNo.toLowerCase().includes(q)) ||
          (m.drawingNo && m.drawingNo.toLowerCase().includes(q)) ||
          (m.supplier && m.supplier.toLowerCase().includes(q)) ||
          (m.manufacturer && m.manufacturer.toLowerCase().includes(q)) ||
          (qFolded &&
            (foldVietnameseAscii(m.name).includes(qFolded) ||
              foldVietnameseAscii(m.category).includes(qFolded) ||
              foldVietnameseAscii(m.packingListNo || '').includes(qFolded) ||
              foldVietnameseAscii(m.shipment || '').includes(qFolded)))
        );
      }
      return true;
    });
  }, [materials, deferredCatalogSearch, catalogCategoryFilter]);

  const pagedCatalogMaterials = useMemo(() => {
    const start = (catalogPage - 1) * catalogPageSize;
    return filteredCatalogMaterials.slice(start, start + catalogPageSize);
  }, [filteredCatalogMaterials, catalogPage, catalogPageSize]);

  const selectedFormCodeSet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < formItems.length; i++) {
      const k = normKey(formItems[i].materialCode);
      if (k) set.add(k);
    }
    return set;
  }, [formItems]);

  const isAllCatalogPageSelected =
    catalogTargetRowIdx === null &&
    pagedCatalogMaterials.length > 0 &&
    pagedCatalogMaterials.every((m) => selectedFormCodeSet.has(normKey(m.code)));

  const isSomeCatalogPageSelected =
    catalogTargetRowIdx === null &&
    pagedCatalogMaterials.some((m) => selectedFormCodeSet.has(normKey(m.code))) &&
    !isAllCatalogPageSelected;

  const selectedFilteredCatalogCount = useMemo(() => {
    if (catalogTargetRowIdx !== null) return 0;
    let count = 0;
    for (let i = 0; i < filteredCatalogMaterials.length; i++) {
      if (selectedFormCodeSet.has(normKey(filteredCatalogMaterials[i].code))) {
        count++;
      }
    }
    return count;
  }, [filteredCatalogMaterials, selectedFormCodeSet, catalogTargetRowIdx]);

  const toggleSelectCatalogPage = () => {
    if (catalogTargetRowIdx !== null || pagedCatalogMaterials.length === 0) return;
    setFormItemSearch('');
    if (isAllCatalogPageSelected) {
      const pageKeys = new Set(pagedCatalogMaterials.map((m) => normKey(m.code)));
      setFormItems((prev) => {
        const next = prev.filter((it) => !pageKeys.has(normKey(it.materialCode)));
        return next.length > 0 ? next : [createBlankInboundItem(0)];
      });
    } else {
      setFormItems((prev) => {
        const nonBlank = prev.filter(
          (it) => it.materialCode.trim() || it.materialName.trim()
        );
        const existingKeys = new Set(nonBlank.map((it) => normKey(it.materialCode)));
        const added: InboundItemDetail[] = [];
        for (let i = 0; i < pagedCatalogMaterials.length; i++) {
          const mat = pagedCatalogMaterials[i];
          const k = normKey(mat.code);
          if (!existingKeys.has(k)) {
            existingKeys.add(k);
            added.push(buildInboundItemFromMaterial(mat, nonBlank.length + added.length));
          }
        }
        const next = [...nonBlank, ...added];
        setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
        return next.length > 0 ? next : [createBlankInboundItem(0)];
      });
    }
  };

  const selectAllFilteredCatalog = () => {
    if (catalogTargetRowIdx !== null || filteredCatalogMaterials.length === 0) return;
    setFormItemSearch('');
    setFormItems((prev) => {
      const nonBlank = prev.filter(
        (it) => it.materialCode.trim() || it.materialName.trim()
      );
      const existingKeys = new Set(nonBlank.map((it) => normKey(it.materialCode)));
      const added: InboundItemDetail[] = [];
      for (let i = 0; i < filteredCatalogMaterials.length; i++) {
        const mat = filteredCatalogMaterials[i];
        const k = normKey(mat.code);
        if (!existingKeys.has(k)) {
          existingKeys.add(k);
          added.push(buildInboundItemFromMaterial(mat, nonBlank.length + added.length));
        }
      }
      const next = [...nonBlank, ...added];
      setFormItemPage(Math.max(1, Math.ceil(next.length / FORM_ITEM_PAGE_SIZE)));
      return next.length > 0 ? next : [createBlankInboundItem(0)];
    });
  };

  const clearSelectedFilteredCatalog = () => {
    if (catalogTargetRowIdx !== null || filteredCatalogMaterials.length === 0) return;
    const targetKeys = new Set(filteredCatalogMaterials.map((m) => normKey(m.code)));
    setFormItems((prev) => {
      const next = prev.filter((it) => !targetKeys.has(normKey(it.materialCode)));
      return next.length > 0 ? next : [createBlankInboundItem(0)];
    });
  };

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
          {isAdmin && selectedIds.size > 0 && (
            <button
              type="button"
              onClick={() => setIsDeleteSelectedModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-rose-600/20 transition active:scale-95 min-h-[42px]"
              title="Xóa các phiếu nhập kho đã đánh dấu chọn"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Xóa Đã Chọn ({selectedIds.size.toLocaleString('vi-VN')})</span>
            </button>
          )}

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

          <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs min-h-[40px]">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-500 font-medium shrink-0">Sắp xếp:</span>
            <select
              value={`${sortField}_${sortOrder}`}
              onChange={(e) => {
                const [f, o] = e.target.value.split('_') as [ReceiptSortField, SortOrder];
                setSortField(f);
                setSortOrder(o);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-semibold outline-none cursor-pointer text-xs"
            >
              <option value="date_desc">Ngày: Mới nhất trước (Mặc định)</option>
              <option value="date_asc">Ngày: Cũ nhất trước</option>
              <option value="code_desc">Số phiếu: Giảm dần (Z-A / 9-0)</option>
              <option value="code_asc">Số phiếu: Tăng dần (A-Z / 0-9)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Thanh thao tác chọn xóa nhiều phiếu nhập (chỉ hiển thị cho Admin khi có chọn checkbox) */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="min-w-8 px-2 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs tabular-nums">
              {selectedIds.size.toLocaleString('vi-VN')}
            </div>
            <div>
              <div className="text-sm font-bold text-blue-950 flex flex-wrap items-center gap-1.5">
                <span>
                  Đã chọn {selectedIds.size.toLocaleString('vi-VN')} /{' '}
                  {receipts.length.toLocaleString('vi-VN')} phiếu nhập kho
                </span>
                <span aria-hidden="true" className="text-blue-400">
                  ·
                </span>
                <span className="text-xs font-medium text-blue-700">
                  {selectedIds.size === receipts.length
                    ? 'Đã chọn tất cả'
                    : `${filteredReceipts.length.toLocaleString('vi-VN')} kết quả lọc`}
                </span>
              </div>
              <div className="text-xs text-blue-700">
                Xóa các phiếu nhập kho đã đánh dấu sẽ tự động trừ lại tồn kho tương ứng và đồng bộ trên toàn hệ thống.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {filteredReceipts.length < receipts.length &&
              selectedIds.size < filteredReceipts.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold transition min-h-[36px]"
                >
                  Chọn kết quả lọc ({filteredReceipts.length.toLocaleString('vi-VN')})
                </button>
              )}

            {selectedIds.size < receipts.length && (
              <button
                type="button"
                onClick={selectAllTotal}
                className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold transition min-h-[36px]"
              >
                Chọn tất cả ({receipts.length.toLocaleString('vi-VN')})
              </button>
            )}

            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition min-h-[36px]"
            >
              Bỏ chọn
            </button>

            <button
              type="button"
              onClick={() => setIsDeleteSelectedModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition active:scale-95 min-h-[36px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa {selectedIds.size.toLocaleString('vi-VN')} phiếu đã chọn</span>
            </button>
          </div>
        </div>
      )}

      {/* Receipts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
              <tr>
                {isAdmin && (
                  <th className="w-12 px-4 py-3.5 text-center">
                    <input
                      type="checkbox"
                      checked={isAllPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomePageSelected;
                      }}
                      onChange={toggleSelectCurrentPage}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      title={
                        isAllPageSelected
                          ? 'Bỏ chọn các phiếu nhập trên trang này'
                          : 'Chọn tất cả các phiếu nhập trên trang này'
                      }
                    />
                  </th>
                )}
                <th className="px-5 py-3.5 select-none">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>Số Phiếu & Ngày</span>
                    <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'code') {
                            setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                          } else {
                            setSortField('code');
                            setSortOrder('asc');
                          }
                          setCurrentPage(1);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium inline-flex items-center gap-0.5 transition ${
                          sortField === 'code'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        title="Bấm để sắp xếp theo Số phiếu"
                      >
                        <span>Số phiếu</span>
                        {sortField === 'code' ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (sortField === 'date') {
                            setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                          } else {
                            setSortField('date');
                            setSortOrder('desc');
                          }
                          setCurrentPage(1);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium inline-flex items-center gap-0.5 transition ${
                          sortField === 'date'
                            ? 'bg-blue-600 text-white font-bold'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                        title="Bấm để sắp xếp theo Ngày"
                      >
                        <span>Ngày</span>
                        {sortField === 'date' ? (
                          sortOrder === 'desc' ? (
                            <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUp className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </th>
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
                  <td colSpan={isAdmin ? 8 : 7} className="px-6 py-12 text-center text-slate-400">
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
                  const isRowSelected = isAdmin && selectedIds.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/60 transition ${
                        isRowSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {isAdmin && (
                        <td className="w-12 px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={isRowSelected}
                            onChange={() => toggleSelectReceipt(r.id)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                            title={`Chọn phiếu nhập ${r.receiptCode}`}
                          />
                        </td>
                      )}
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
                          <button
                            onClick={() => handleExportReceiptExcel(r)}
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition"
                            title="Xuất phiếu nhập kho ra Excel (.xlsx)"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => openEditModal(r)}
                              className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg border border-amber-200 transition"
                              title="Sửa phiếu nhập kho (Admin)"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
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

      {/* Modal Lập / Chỉnh Sửa Phiếu Nhập Kho (Chuẩn QN-OPR-PR11-FM05.01) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`p-2 rounded-xl shrink-0 ${
                    editingReceipt
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {editingReceipt ? (
                    <Pencil className="w-5 h-5" />
                  ) : (
                    <ArrowDownLeft className="w-5 h-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                    {editingReceipt
                      ? `Chỉnh Sửa Phiếu Nhập Kho: ${editingReceipt.receiptCode} (Mẫu QN-OPR-PR11-FM05.01)`
                      : 'Lập Phiếu Nhập Kho (Mẫu QN-OPR-PR11-FM05.01)'}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1">
                    {editingReceipt
                      ? 'Quyền Quản trị viên (Admin) — Mọi thay đổi số lượng/khối lượng sẽ tự động cập nhật lại tồn kho & đồng bộ thiết bị'
                      : 'CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC — Nhập đầy đủ thông tin để in phiếu A4 chuẩn'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingReceipt(null);
                }}
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
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <label className="block font-semibold text-slate-700 uppercase">
                        Số phiếu (*)
                      </label>
                      {!editingReceipt && (
                        <button
                          type="button"
                          onClick={() => {
                            const latest = StorageService.getInboundReceipts();
                            setIsCodeManuallyEdited(false);
                            setReceiptCode(generateNextPnkCode(latest, receiptDate));
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition"
                          title="Tự động lấy số phiếu nhập kế tiếp"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Số kế tiếp</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={receiptCode}
                      onChange={(e) => {
                        setIsCodeManuallyEdited(true);
                        setReceiptCode(e.target.value);
                      }}
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
                      Đơn vị giao hàng {!editingReceipt && '(*)'}
                    </label>
                    <input
                      type="text"
                      value={formDeliverer}
                      onChange={(e) => setFormDeliverer(e.target.value)}
                      placeholder="Ví dụ: Việt Xuân Mới"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold outline-none focus:border-blue-500"
                      required={!editingReceipt}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-sm text-slate-800">
                    Chi Tiết Vật Tư Nhập Kho ({formItems.length.toLocaleString('vi-VN')} mục hàng)
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {formItems.length > 15 && (
                      <div className="relative">
                        <input
                          type="text"
                          value={formItemSearch}
                          onChange={(e) => {
                            setFormItemSearch(e.target.value);
                            setFormItemPage(1);
                          }}
                          placeholder="Lọc dòng vật tư..."
                          className="pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-blue-500"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={addNewItemRow}
                      className="flex items-center gap-1 px-3 py-2 sm:py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold border border-slate-200 transition min-h-[38px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Dòng Thủ Công</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openCatalogPicker(null)}
                      className="flex items-center gap-1.5 px-3.5 py-2 sm:py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-xs font-semibold shadow-sm transition min-h-[38px]"
                    >
                      <PackageSearch className="w-3.5 h-3.5" />
                      <span>Chọn Nhiều Từ Danh Mục ({materials.length.toLocaleString('vi-VN')})</span>
                    </button>
                  </div>
                </div>

                {/* Trường chọn nhanh từ Danh mục vật tư có sẵn */}
                <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl p-3 space-y-1.5 relative z-20">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <label className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <PackageSearch className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Chọn vật tư từ Danh mục vật tư có sẵn</span>
                    </label>
                    <span className="text-slate-500">
                      Có sẵn {materials.length.toLocaleString('vi-VN')} vật tư · Chọn để tự điền Mã VT, Tên VT, ĐVT, Mã lô & Khối lượng
                    </span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={quickCatalogQuery}
                      onFocus={() => setIsQuickCatalogOpen(true)}
                      onBlur={() => {
                        setTimeout(() => setIsQuickCatalogOpen(false), 180);
                      }}
                      onChange={(e) => {
                        setQuickCatalogQuery(e.target.value);
                        setIsQuickCatalogOpen(true);
                      }}
                      placeholder={
                        materials.length > 0
                          ? 'Gõ Mã vật tư, Tên vật tư, Quy cách hoặc nhấp vào đây để chọn từ Danh mục vật tư có sẵn...'
                          : 'Danh mục vật tư hiện đang trống — bạn có thể nhập dòng vật tư mới trực tiếp bên dưới...'
                      }
                      className="w-full pl-8 pr-9 py-2 bg-white border border-blue-200 rounded-lg text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsQuickCatalogOpen((prev) => !prev);
                      }}
                      className="absolute right-2 top-1.5 p-1 text-slate-400 hover:text-slate-700 rounded"
                      title="Mở danh sách vật tư có sẵn"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {isQuickCatalogOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100 z-30">
                        {materials.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            Chưa có vật tư nào trong Danh mục. Khi bạn lưu phiếu nhập mới, vật tư sẽ tự động đồng bộ vào Danh mục.
                          </div>
                        ) : quickCatalogMatches.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            Không tìm thấy vật tư khớp từ khóa "{quickCatalogQuery}". Bạn có thể nhập thủ công ở bảng dưới.
                          </div>
                        ) : (
                          quickCatalogMatches.map((mat) => (
                            <button
                              key={mat.id || mat.code}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleQuickPickMaterial(mat);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50/80 transition flex items-start justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-blue-700 shrink-0">
                                    {mat.code}
                                  </span>
                                  <span className="font-semibold text-slate-900 truncate">
                                    {mat.name}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                  ĐVT: {mat.unit || 'Ống'}
                                  {mat.category ? ` · ${mat.category}` : ''}
                                  {mat.packageNo && mat.packageNo !== 'N/A'
                                    ? ` · Kiện/Lô: ${mat.packageNo}`
                                    : ''}
                                  {Number(mat.unitWeightKg) > 0
                                    ? ` · KL đơn vị: ${Number(mat.unitWeightKg).toLocaleString('en-US')} Kg`
                                    : ''}
                                </div>
                              </div>
                              <span className="text-[11px] font-semibold text-blue-600 shrink-0 pt-0.5">
                                + Chọn
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[980px]">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-10 text-center">STT</th>
                        <th className="p-2 w-44">Mã vật tư</th>
                        <th className="p-2 min-w-[220px]">Tên vật tư (*)</th>
                        <th className="p-2 w-32">Mã lô</th>
                        <th className="p-2 w-24 text-right">Số lượng (cây/tấm)</th>
                        <th className="p-2 w-20 text-center">ĐVT</th>
                        <th className="p-2 w-28 text-right">Khối lượng (Kg)</th>
                        <th className="p-2 w-28 text-right">Đơn giá (VNĐ)</th>
                        <th className="p-2 w-28 text-right">Thành tiền (VNĐ)</th>
                        <th className="p-2 w-36">Ghi chú</th>
                        <th className="p-2 w-14 text-center sticky right-0 bg-slate-100 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.06)] border-l border-slate-200">
                          Xóa
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleFormItems.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-6 text-center text-slate-400">
                            Không có dòng vật tư nào khớp từ khóa lọc.
                          </td>
                        </tr>
                      ) : (
                        visibleFormItems.map(({ item, realIdx }) => (
                          <tr key={item.id || realIdx} className="hover:bg-slate-50/70">
                            <td className="p-2 text-center text-slate-500 font-mono">
                              {realIdx + 1}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={item.materialCode}
                                  onChange={(e) =>
                                    updateItemRow(realIdx, 'materialCode', e.target.value)
                                  }
                                  placeholder="PI-P.AA.S..."
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono outline-none text-xs focus:border-blue-500"
                                />
                                {materials.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => openCatalogPicker(realIdx)}
                                    className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition shrink-0"
                                    title={`Chọn vật tư từ Danh mục cho dòng ${realIdx + 1}`}
                                  >
                                    <PackageSearch className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.materialName}
                                onChange={(e) =>
                                  updateItemRow(realIdx, 'materialName', e.target.value)
                                }
                                placeholder='20"x12m PIPE, API 5L B...'
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-medium outline-none text-xs focus:border-blue-500"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.batchCode ?? item.packageNo ?? ''}
                                onChange={(e) =>
                                  updateItemRow(realIdx, 'batchCode', e.target.value)
                                }
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
                                    realIdx,
                                    'quantity',
                                    e.target.value === '' ? 0 : roundQty(e.target.value)
                                  )
                                }
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-bold outline-none text-xs tabular-nums"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.unit}
                                onChange={(e) => updateItemRow(realIdx, 'unit', e.target.value)}
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
                                    realIdx,
                                    'weightKg',
                                    e.target.value === '' ? 0 : Number(e.target.value)
                                  )
                                }
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-mono font-medium outline-none text-xs tabular-nums"
                              />
                            </td>
                            <td className="p-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.unitPrice || ''}
                                onChange={(e) =>
                                  updateItemRow(realIdx, 'unitPrice', Number(e.target.value))
                                }
                                placeholder="-"
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-right font-mono outline-none text-xs tabular-nums"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-semibold text-slate-700 tabular-nums">
                              {Number(item.totalPrice) > 0
                                ? Number(item.totalPrice).toLocaleString('en-US')
                                : '-'}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.note ?? ''}
                                onChange={(e) => updateItemRow(realIdx, 'note', e.target.value)}
                                placeholder="Ghi chú..."
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded outline-none text-xs"
                              />
                            </td>
                            <td className="p-2 text-center sticky right-0 bg-white/95 backdrop-blur-[2px] z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.06)] border-l border-slate-100">
                              <button
                                type="button"
                                onClick={() => removeItemRow(realIdx)}
                                className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 rounded-lg transition inline-flex items-center justify-center shadow-xs"
                                title={`Xóa dòng vật tư ${realIdx + 1}`}
                                aria-label={`Xóa dòng vật tư ${realIdx + 1}`}
                              >
                                <Trash2 className="w-4 h-4 text-rose-600" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {totalFormItemPages > 1 && (
                    <PaginationBar
                      currentPage={safeFormItemPage}
                      totalItems={indexedFormItems.length}
                      pageSize={FORM_ITEM_PAGE_SIZE}
                      onPageChange={setFormItemPage}
                      itemLabel="dòng vật tư"
                    />
                  )}
                </div>

                {/* Tóm tắt TỔNG CỘNG */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs font-semibold">
                  <span>TỔNG CỘNG: {formItems.length.toLocaleString('vi-VN')} mục hàng</span>
                  <div className="flex flex-wrap gap-4">
                    <span>
                      Tổng số lượng:{' '}
                      <strong className="text-blue-700 tabular-nums">
                        {formTotals.totalQuantity.toLocaleString('vi-VN')}
                      </strong>
                    </span>
                    <span>
                      Tổng khối lượng:{' '}
                      <strong className="text-emerald-700 tabular-nums">
                        {formTotals.totalWeightKg.toLocaleString('en-US', {
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
                  className={`flex-1 py-2.5 text-white font-semibold text-sm rounded-xl transition shadow-md ${
                    editingReceipt
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                      : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                  }`}
                >
                  {editingReceipt ? 'Lưu Cập Nhật Phiếu Nhập Kho' : 'Lưu Phiếu Nhập Kho'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingReceipt(null);
                  }}
                  className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Chọn Vật Tư Từ Danh Mục Có Sẵn (Hỗ trợ cả chọn cho 1 dòng & chọn checkbox nhiều mục) */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <PackageSearch className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                    {catalogTargetRowIdx !== null
                      ? `Chọn Vật Tư Từ Danh Mục Cho Dòng Số ${catalogTargetRowIdx + 1}`
                      : 'Chọn Vật Tư Từ Danh Mục Vật Tư Có Sẵn'}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1">
                    {catalogTargetRowIdx !== null
                      ? 'Nhấp vào một vật tư bên dưới để điền tự động thông tin vào dòng đang chọn'
                      : `Tích chọn nhanh một hoặc nhiều vật tư từ ${materials.length.toLocaleString('vi-VN')} danh mục có sẵn để đưa vào phiếu nhập kho`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCatalogModalOpen(false);
                  setCatalogTargetRowIdx(null);
                }}
                className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2.5 bg-white">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => {
                    setCatalogSearch(e.target.value);
                    setCatalogPage(1);
                  }}
                  placeholder="Tìm nhanh theo Mã vật tư, Tên vật tư, Packing List, Shipment, Mã kiện, Bản vẽ, Nhà cung cấp..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm outline-none focus:bg-white focus:border-blue-500"
                  autoFocus
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>

              <select
                value={catalogCategoryFilter}
                onChange={(e) => {
                  setCatalogCategoryFilter(e.target.value);
                  setCatalogPage(1);
                }}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm outline-none focus:bg-white focus:border-blue-500 sm:w-56"
              >
                <option value="all">Tất cả hạng mục ({materials.length.toLocaleString('vi-VN')})</option>
                {catalogCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-40">Mã vật tư</th>
                        <th className="p-2.5 min-w-[240px]">Tên vật tư & Quy cách</th>
                        <th className="p-2.5 w-20 text-center">ĐVT</th>
                        <th className="p-2.5 w-44">Số packing list/Shipment</th>
                        <th className="p-2.5 w-32">Kiện / Lô</th>
                        <th className="p-2.5 w-28 text-right">KL đơn vị (Kg)</th>
                        <th className="p-2.5 w-20 text-center">
                          {catalogTargetRowIdx !== null ? (
                            'Chọn'
                          ) : (
                            <input
                              type="checkbox"
                              checked={isAllCatalogPageSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = isSomeCatalogPageSelected;
                              }}
                              onChange={toggleSelectCatalogPage}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                              title="Chọn / Bỏ chọn tất cả vật tư trên trang hiện tại"
                            />
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedCatalogMaterials.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            Không tìm thấy vật tư nào phù hợp trong Danh mục.
                          </td>
                        </tr>
                      ) : (
                        pagedCatalogMaterials.map((mat) => {
                          const isChecked =
                            catalogTargetRowIdx === null &&
                            selectedFormCodeSet.has(normKey(mat.code));
                          return (
                            <tr
                              key={mat.id || mat.code}
                              onClick={() => toggleCatalogMaterialSelection(mat)}
                              className={`cursor-pointer select-none transition-colors ${
                                isChecked
                                  ? 'bg-blue-50/70 hover:bg-blue-100/60'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="p-2.5 font-mono font-bold text-blue-700">
                                {mat.code}
                              </td>
                              <td className="p-2.5">
                                <span className="font-semibold text-slate-900 block">
                                  {mat.name}
                                </span>
                                {(mat.drawingNo && mat.drawingNo !== 'N/A') ||
                                (mat.supplier && mat.supplier !== 'N/A') ? (
                                  <span className="text-[11px] text-slate-500">
                                    {mat.drawingNo && mat.drawingNo !== 'N/A'
                                      ? `Bản vẽ: ${mat.drawingNo}`
                                      : ''}
                                    {mat.drawingNo &&
                                    mat.drawingNo !== 'N/A' &&
                                    mat.supplier &&
                                    mat.supplier !== 'N/A'
                                      ? ' · '
                                      : ''}
                                    {mat.supplier && mat.supplier !== 'N/A'
                                      ? `NCC: ${mat.supplier}`
                                      : ''}
                                  </span>
                                ) : null}
                              </td>
                              <td className="p-2.5 text-center font-medium text-slate-700">
                                {mat.unit || 'Ống'}
                              </td>
                              <td className="p-2.5 font-mono text-xs">
                                <span className="font-semibold text-blue-700 block">
                                  {mat.packingListNo && mat.packingListNo !== 'N/A'
                                    ? mat.packingListNo
                                    : '-'}
                                </span>
                                <span className="text-[11px] text-slate-500 block">
                                  {mat.shipment && mat.shipment !== 'N/A' ? mat.shipment : '-'}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono text-slate-700">
                                {mat.packageNo && mat.packageNo !== 'N/A' ? mat.packageNo : '-'}
                              </td>
                              <td className="p-2.5 text-right font-mono font-medium text-emerald-700 tabular-nums">
                                {Number(mat.unitWeightKg) > 0
                                  ? Number(mat.unitWeightKg).toLocaleString('en-US', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2
                                    })
                                  : '-'}
                              </td>
                              <td
                                className="p-2.5 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {catalogTargetRowIdx !== null ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleCatalogMaterialSelection(mat)}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition"
                                  >
                                    Chọn
                                  </button>
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleCatalogMaterialSelection(mat)}
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                                    title={
                                      isChecked
                                        ? `Bỏ chọn vật tư ${mat.code}`
                                        : `Chọn nhập kho vật tư ${mat.code}`
                                    }
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <PaginationBar
                  currentPage={catalogPage}
                  totalItems={filteredCatalogMaterials.length}
                  pageSize={catalogPageSize}
                  onPageChange={setCatalogPage}
                  onPageSizeChange={setCatalogPageSize}
                  pageSizeOptions={[50, 100, 200]}
                  itemLabel="vật tư trong danh mục"
                />
              </div>
            </div>

            <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
                {catalogTargetRowIdx !== null ? (
                  <span>
                    Đang chọn vật tư cho{' '}
                    <strong className="text-blue-700">Dòng số {catalogTargetRowIdx + 1}</strong>
                  </span>
                ) : (
                  <>
                    <span>
                      Đã có trong phiếu nhập:{' '}
                      <strong className="text-blue-700 font-bold tabular-nums">
                        {
                          formItems.filter(
                            (it) => it.materialCode.trim() || it.materialName.trim()
                          ).length.toLocaleString('vi-VN')
                        }
                      </strong>{' '}
                      mục hàng
                    </span>
                    {filteredCatalogMaterials.length > 0 && (
                      <span className="text-slate-400">
                        ({selectedFilteredCatalogCount.toLocaleString('vi-VN')}/
                        {filteredCatalogMaterials.length.toLocaleString('vi-VN')} danh mục đang hiển thị)
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {catalogTargetRowIdx === null &&
                  filteredCatalogMaterials.length > pagedCatalogMaterials.length &&
                  selectedFilteredCatalogCount < filteredCatalogMaterials.length && (
                    <button
                      type="button"
                      onClick={selectAllFilteredCatalog}
                      className="px-3 py-2 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition min-h-[38px]"
                    >
                      Chọn hết {filteredCatalogMaterials.length.toLocaleString('vi-VN')} kết quả lọc
                    </button>
                  )}

                {catalogTargetRowIdx === null && selectedFilteredCatalogCount > 0 && (
                  <button
                    type="button"
                    onClick={clearSelectedFilteredCatalog}
                    className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition min-h-[38px]"
                  >
                    Bỏ chọn ({selectedFilteredCatalogCount.toLocaleString('vi-VN')})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsCatalogModalOpen(false);
                    setCatalogTargetRowIdx(null);
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-500/20 transition active:scale-95 min-h-[38px]"
                >
                  {catalogTargetRowIdx !== null
                    ? 'Đóng'
                    : `Xong (${formItems
                        .filter((it) => it.materialCode.trim() || it.materialName.trim())
                        .length.toLocaleString('vi-VN')} mục)`}
                </button>
              </div>
            </div>
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
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => handleExportReceiptExcel(viewingReceipt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition min-h-[36px]"
                  title="Xuất phiếu nhập kho ra Excel (.xlsx)"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Xuất Excel</span>
                </button>
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
                      const target = viewingReceipt;
                      setViewingReceipt(null);
                      openEditModal(target);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-semibold transition min-h-[36px]"
                    title="Sửa phiếu nhập kho này (Admin)"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>Sửa Phiếu</span>
                  </button>
                )}
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

      {/* Modal Xác Nhận Xóa 1 Phiếu Nhập */}
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

      {/* Modal Xác Nhận Xóa Nhiều Phiếu Nhập Đã Chọn */}
      <ConfirmDeleteModal
        isOpen={isDeleteSelectedModalOpen}
        onClose={() => setIsDeleteSelectedModalOpen(false)}
        onConfirm={confirmDeleteSelectedInbound}
        title="Xác Nhận Xóa Nhiều Phiếu Nhập Kho"
        itemName={`${selectedIds.size.toLocaleString('vi-VN')} phiếu nhập đã chọn (${selectedReceiptsSummary})`}
        itemType="danh sách phiếu nhập kho"
        warningText="Toàn bộ các phiếu nhập kho đã đánh dấu sẽ bị xóa vĩnh viễn và tự động trừ lại số lượng, khối lượng tồn kho tương ứng trên toàn hệ thống."
      />
    </div>
  );
};

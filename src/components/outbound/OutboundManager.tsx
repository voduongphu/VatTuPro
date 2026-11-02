import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  OutboundReceipt,
  OutboundItemDetail,
  Warehouse,
  InventoryStockRecord,
  MaterialItem
} from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { ReceiptPrintModal } from '../common/ReceiptPrintModal';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { PaginationBar } from '../common/PaginationBar';
import {
  downloadOutboundTemplate,
  formatExcelDate,
  formatVoucherDateVi
} from '../../services/excelService';
import {
  roundQty,
  sumOutboundItems,
  buildDeterministicItemId
} from '../../utils/additiveMerge';
import {
  ArrowUpRight,
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

function buildPackingListSummary(items: OutboundItemDetail[]): string {
  const seen = new Set<string>();
  const sample: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const code = items[i].batchCode || items[i].packageNo || items[i].packingListNo;
    if (code && code !== 'N/A' && !seen.has(code)) {
      seen.add(code);
      if (sample.length < 4) sample.push(code);
    }
  }
  if (seen.size === 0) return 'N/A';
  if (seen.size <= sample.length) return sample.join(', ');
  return `${sample.join(', ')} (+${(seen.size - sample.length).toLocaleString('vi-VN')} lô)`;
}

export const OutboundManager: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const [receipts, setReceipts] = useState<OutboundReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockRecords, setStockRecords] = useState<InventoryStockRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination cho bảng phiếu xuất
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<OutboundReceipt | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<OutboundReceipt | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const deferredDetailSearch = useDeferredValue(detailSearch);
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(100);

  const [receiptToDelete, setReceiptToDelete] = useState<OutboundReceipt | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form New Outbound (Theo mẫu QN-OPR-PR11-FM06)
  const [issueCode, setIssueCode] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [formDepartmentName, setFormDepartmentName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientDepartment, setRecipientDepartment] = useState('');
  const [formRequestNo, setFormRequestNo] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOutboundType, setFormOutboundType] = useState<'issue' | 'transfer'>('issue');
  const [formItems, setFormItems] = useState<OutboundItemDetail[]>([]);
  const [formError, setFormError] = useState('');

  // Hộp thoại chọn từ tồn kho (lazy-loaded & phân trang)
  const [isPickStockOpen, setIsPickStockOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const deferredStockSearch = useDeferredValue(stockSearch);
  const [stockPage, setStockPage] = useState(1);
  const [stockPageSize, setStockPageSize] = useState(50);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = () => {
    setReceipts(StorageService.getOutboundReceipts());
    setWarehouses(StorageService.getWarehouses());
  };

  useEffect(() => {
    loadData();
    return StorageService.subscribe(loadData);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, filterWarehouse, startDate, endDate]);

  const materialMap = useMemo(() => {
    const map = new Map<string, MaterialItem>();
    for (let i = 0; i < materials.length; i++) {
      map.set(materials[i].code.toLowerCase(), materials[i]);
    }
    return map;
  }, [materials]);

  const generateNextPxkCode = (existingList: OutboundReceipt[]): string => {
    const yy = String(new Date().getFullYear()).slice(-2);
    const prefix = `PXK${yy}-`;
    let maxSeq = 0;
    for (let i = 0; i < existingList.length; i++) {
      const c = (existingList[i].issueCode || '').toUpperCase();
      if (c.startsWith(prefix)) {
        const num = parseInt(c.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  };

  const openStockPicker = () => {
    setStockRecords(StorageService.calculateInventoryRecords());
    setStockSearch('');
    setStockPage(1);
    setIsPickStockOpen(true);
  };

  const openCreateModal = () => {
    const currentReceipts = StorageService.getOutboundReceipts();
    setMaterials(StorageService.getMaterials());
    setIssueCode(generateNextPxkCode(currentReceipts));
    setIssueDate(new Date().toISOString().slice(0, 10));
    const whList = StorageService.getWarehouses();
    const defaultWh = whList[0]?.id || '';
    setSelectedWarehouseId(defaultWh);

    setFormDepartmentName('');
    setRecipientName('');
    setRecipientDepartment('');
    setFormRequestNo('');
    setFormNotes('');
    setFormOutboundType('issue');
    setFormError('');
    setFormItems([]);
    setIsCreateModalOpen(true);
  };

  const addManualItemRow = () => {
    setFormItems((prev) => [
      ...prev,
      {
        id: `out-item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        materialCode: '',
        materialName: '',
        unit: 'Ống',
        batchCode: '',
        packingListNo: 'N/A',
        shipment: 'N/A',
        packageNo: '',
        packageName: '',
        category: 'Vật tư dự án',
        drawingNo: 'N/A',
        manufacturer: 'N/A',
        supplier: 'N/A',
        quantity: 1,
        weightKg: 0,
        purpose: '',
        note: ''
      }
    ]);
  };

  const handleSelectStockItem = (st: InventoryStockRecord) => {
    if (st.currentQuantity <= 0 && st.currentWeightKg <= 0) {
      setFormError('Mặt hàng này hiện không còn tồn kho khả dụng!');
      return;
    }

    const exists = formItems.some(
      (it) =>
        it.packingListNo === st.packingListNo &&
        it.packageNo === st.packageNo &&
        it.materialCode === st.materialCode
    );

    if (exists) {
      setFormError('Mặt hàng này đã có trong danh sách xuất.');
      setIsPickStockOpen(false);
      return;
    }

    const unitW = st.currentQuantity > 0 ? st.currentWeightKg / st.currentQuantity : st.currentWeightKg;
    const defaultQty = st.currentQuantity > 0 ? Math.min(1, st.currentQuantity) : 0;
    const defaultBatch =
      st.packageNo && st.packageNo !== 'N/A'
        ? st.packageNo
        : st.shipment && st.shipment !== 'N/A'
          ? st.shipment
          : '';

    setFormItems((prev) => [
      ...prev,
      {
        id: `out-item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        materialCode: st.materialCode,
        materialName: st.materialName,
        unit: st.unit,
        batchCode: defaultBatch,
        packingListNo: st.packingListNo,
        shipment: st.shipment,
        packageNo: st.packageNo,
        packageName: st.packageName,
        category: st.category,
        drawingNo: st.drawingNo,
        manufacturer: st.manufacturer,
        supplier: st.supplier,
        quantity: defaultQty,
        weightKg: Math.round(unitW * defaultQty * 100) / 100,
        purpose: '',
        note: ''
      }
    ]);

    setFormError('');
    setIsPickStockOpen(false);
  };

  const removeItemRow = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx: number, field: keyof OutboundItemDetail, val: any) => {
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
          if (found.unitWeightKg && copy[idx].quantity) {
            copy[idx].weightKg = Math.round(found.unitWeightKg * roundQty(copy[idx].quantity) * 100) / 100;
          }
        }
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

      if (field === 'batchCode' && (!copy[idx].packingListNo || copy[idx].packingListNo === 'N/A')) {
        copy[idx].packageNo = String(val);
      }

      return copy;
    });
  };

  // Import từ file Excel xuất kho tối ưu O(N) cho trên 100.000 dòng
  const handleExcelImportSuccess = async (
    imported: Partial<OutboundItemDetail>[],
    defaultWhId?: string
  ) => {
    if (imported.length === 0) return;

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
        issueCode?: string;
        issueDate?: string;
        departmentName?: string;
        projectName?: string;
        recipientName?: string;
        recipientDepartment?: string;
        requestNo?: string;
        notes?: string;
        items: Partial<OutboundItemDetail>[];
      }
    >();

    for (let i = 0; i < imported.length; i++) {
      const item = imported[i] as any;
      const wh = resolveWarehouse(item.warehouseName);
      const rawCode = (item.issueCode || '').trim();
      const customCode = rawCode || (item.packingListNo ? `PXK-${item.packingListNo.trim()}` : '');
      const groupKey = rawCode
        ? `ISSUE_${rawCode.toUpperCase()}`
        : `${wh.id}__${customCode || 'AUTO'}`;

      let currentGroup = groups.get(groupKey);
      if (!currentGroup) {
        currentGroup = {
          warehouse: wh,
          issueCode: rawCode || customCode,
          issueDate: item.issueDate,
          departmentName: item.departmentName,
          projectName: item.projectName,
          recipientName: item.recipientName,
          recipientDepartment: item.recipientDepartment,
          requestNo: item.requestNo,
          notes: item.issueNotes,
          items: []
        };
        groups.set(groupKey, currentGroup);
      } else {
        if (!currentGroup.issueDate && item.issueDate) currentGroup.issueDate = item.issueDate;
        if (!currentGroup.departmentName && item.departmentName) currentGroup.departmentName = item.departmentName;
        if (!currentGroup.projectName && item.projectName) currentGroup.projectName = item.projectName;
        if (!currentGroup.recipientName && item.recipientName) currentGroup.recipientName = item.recipientName;
        if (!currentGroup.recipientDepartment && item.recipientDepartment) {
          currentGroup.recipientDepartment = item.recipientDepartment;
        }
        if (!currentGroup.requestNo && item.requestNo) currentGroup.requestNo = item.requestNo;
        if (!currentGroup.notes && item.issueNotes) currentGroup.notes = item.issueNotes;
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
    const newReceipts: OutboundReceipt[] = [];

    groups.forEach(
      ({
        warehouse: targetWh,
        issueCode: customCode,
        issueDate: customDate,
        departmentName: customDeptHeader,
        projectName: customProj,
        recipientName: customRecipient,
        recipientDepartment: customDept,
        requestNo: customReqNo,
        notes: customNotes,
        items: whItems
      }) => {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const first = whItems[0] as any;
        const generatedCode = customCode?.trim()
          ? customCode.trim()
          : `PXK${yy}-${randomNum + createdCount}`;

        const len = whItems.length;
        const fullItems: OutboundItemDetail[] = new Array(len);
        const occurrenceMap = new Map<string, number>();

        for (let idx = 0; idx < len; idx++) {
          const item = whItems[idx] as any;
          const qty = Math.max(0, roundQty(item.quantity));
          const weight = Math.max(0, Math.round((Number(item.weightKg) || 0) * 100) / 100);
          const batchVal = String(item.batchCode || item.packageNo || '').trim();
          const pkgNo = String(item.packageNo || batchVal || `PKG-${idx + 1}`).trim();
          const matCode = String(item.materialCode || `VT-OUT-${idx + 1}`).trim().toUpperCase();
          const plNo = String(item.packingListNo || 'PL-EXCEL-01').trim();
          const dwgNo = String(item.drawingNo || 'N/A').trim();

          const sigSeed = `${matCode}|${batchVal}|${plNo}|${pkgNo}|${dwgNo}|${qty}|${weight}`;
          const occ = (occurrenceMap.get(sigSeed) || 0) + 1;
          occurrenceMap.set(sigSeed, occ);

          fullItems[idx] = {
            id: buildDeterministicItemId('out', generatedCode, sigSeed, occ),
            materialCode: matCode,
            materialName: item.materialName || 'Vật tư xuất kho',
            unit: item.unit || 'Ống',
            batchCode: batchVal,
            packingListNo: plNo,
            shipment: item.shipment || 'SHP-EXCEL',
            packageNo: pkgNo,
            packageName: item.packageName || `Kiện xuất ${pkgNo}`,
            category: item.category || 'Hạng mục lắp đặt',
            drawingNo: dwgNo,
            manufacturer: item.manufacturer || 'N/A',
            supplier: item.supplier || 'N/A',
            warehouseName: targetWh.name,
            weightKg: weight,
            quantity: qty,
            purpose: item.purpose || '',
            note: item.note ?? item.purpose ?? ''
          };
        }

        const sums = sumOutboundItems(fullItems);
        const normalizedIssueDate = formatExcelDate(customDate) || todayDate;
        const effectiveDeptHeader = customDeptHeader || customProj || '';

        newReceipts.push({
          id: `out-rcp-${baseTs}-${batchSalt}-${createdCount}`,
          issueCode: generatedCode,
          issueDate: normalizedIssueDate,
          warehouseId: targetWh.id,
          warehouseName: targetWh.name,
          departmentName: effectiveDeptHeader,
          requestNo: customReqNo || '',
          outboundType: 'issue',
          projectName: customProj || effectiveDeptHeader,
          recipientDepartment: customDept || first?.recipientDepartment || 'Tổ thi công',
          recipientName: customRecipient || first?.recipientName || '',
          issuerName: userFullName,
          notes: customNotes || '',
          items: fullItems,
          packingListSummary: buildPackingListSummary(fullItems),
          totalQuantity: sums.totalQuantity,
          totalWeightKg: sums.totalWeightKg,
          createdAt: todayIso,
          createdBy: userFullName
        });
        createdCount++;
      }
    );

    StorageService.addOutboundReceipts(newReceipts);

    setSearchTerm('');
    setFilterWarehouse('all');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);

    loadData();
    showToast(
      `Đã import thành công ${newReceipts.length.toLocaleString('vi-VN')} phiếu xuất kho (${imported.length.toLocaleString('vi-VN')} mục hàng)!`
    );
  };

  const handleSaveCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueCode.trim()) {
      setFormError('Số phiếu xuất không được để trống.');
      return;
    }
    if (!recipientName.trim()) {
      setFormError('Vui lòng nhập họ tên Người nhận.');
      return;
    }
    if (formItems.length === 0) {
      setFormError('Vui lòng chọn từ tồn kho hoặc thêm ít nhất một dòng vật tư xuất.');
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
        setFormError(`Dòng số ${i + 1}: Số lượng và Khối lượng xuất không được là số âm.`);
        return;
      }
      if (q <= 0 && w <= 0) {
        setFormError(`Dòng số ${i + 1}: Vui lòng nhập Số lượng xuất (> 0) hoặc Khối lượng (> 0).`);
        return;
      }
    }

    const wh = warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0];
    const normalizedItems: OutboundItemDetail[] = formItems.map((it, idx) => {
      const batch = (it.batchCode || it.packageNo || '').trim();
      const noteText = (it.note ?? it.purpose ?? '').trim();
      return {
        ...it,
        materialCode:
          it.materialCode.trim() ||
          `VT-${it.materialName.trim().slice(0, 6).toUpperCase().replace(/\s+/g, '')}-${idx + 1}`,
        materialName: it.materialName.trim(),
        unit: it.unit.trim() || 'Ống',
        batchCode: batch,
        packageNo: it.packageNo || batch || 'N/A',
        quantity: Math.max(0, roundQty(it.quantity)),
        weightKg: Math.max(0, Math.round((Number(it.weightKg) || 0) * 100) / 100),
        purpose: noteText,
        note: noteText
      };
    });

    const sums = sumOutboundItems(normalizedItems);
    const deptHeader = formDepartmentName.trim();

    const newReceipt: OutboundReceipt = {
      id: `out-rcp-${Date.now()}`,
      issueCode: issueCode.trim(),
      issueDate,
      warehouseId: wh?.id || 'wh-01',
      warehouseName: wh?.name || 'Kho Dự Án',
      departmentName: deptHeader,
      requestNo: formRequestNo.trim(),
      outboundType: formOutboundType,
      projectName: deptHeader,
      recipientDepartment: recipientDepartment.trim() || 'Tổ thi công',
      recipientName: recipientName.trim(),
      issuerName: currentUser?.fullName || 'Võ Dương Phú',
      notes: formNotes.trim(),
      items: normalizedItems,
      packingListSummary: buildPackingListSummary(normalizedItems),
      totalQuantity: sums.totalQuantity,
      totalWeightKg: sums.totalWeightKg,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.fullName || 'Võ Dương Phú'
    };

    StorageService.addOutboundReceipt(newReceipt);
    loadData();
    setIsCreateModalOpen(false);
    showToast(`Đã lập phiếu xuất kho "${issueCode}" thành công!`);
  };

  const handleDeleteReceipt = (rcp: OutboundReceipt) => {
    if (!isAdmin) {
      showToast('Chỉ tài khoản Quản trị viên (Admin) mới có quyền xóa phiếu xuất kho.', 'error');
      return;
    }
    setReceiptToDelete(rcp);
  };

  const confirmDeleteOutbound = () => {
    if (!receiptToDelete) return;
    const targetId = receiptToDelete.id;
    const targetCode = receiptToDelete.issueCode;

    StorageService.deleteOutboundReceipt(targetId);
    setReceipts((prev) => prev.filter((r) => r.id !== targetId));
    loadData();
    showToast(`Đã xóa phiếu xuất "${targetCode}" thành công!`);
    setReceiptToDelete(null);

    if (viewingReceipt?.id === targetId) {
      setViewingReceipt(null);
    }
  };

  const openDetailModal = (rcp: OutboundReceipt) => {
    setDetailSearch('');
    setDetailPage(1);
    setViewingReceipt(rcp);
  };

  // Lọc phiếu xuất tối ưu O(N)
  const filteredReceipts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const checkWh = filterWarehouse !== 'all';

    if (!q && !checkWh && !startDate && !endDate) {
      return receipts;
    }

    return receipts.filter((r) => {
      if (checkWh && r.warehouseId !== filterWarehouse) return false;
      const normDate = formatExcelDate(r.issueDate);
      if (startDate && normDate < startDate) return false;
      if (endDate && normDate > endDate) return false;

      if (q) {
        const headerMatch =
          r.issueCode.toLowerCase().includes(q) ||
          r.recipientDepartment.toLowerCase().includes(q) ||
          r.recipientName.toLowerCase().includes(q) ||
          (r.requestNo && r.requestNo.toLowerCase().includes(q)) ||
          (r.departmentName && r.departmentName.toLowerCase().includes(q)) ||
          (r.notes && r.notes.toLowerCase().includes(q)) ||
          (r.projectName && r.projectName.toLowerCase().includes(q)) ||
          (r.packingListSummary && r.packingListSummary.toLowerCase().includes(q));

        if (headerMatch) return true;

        const items = r.items;
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (
            it.materialName.toLowerCase().includes(q) ||
            it.materialCode.toLowerCase().includes(q) ||
            (it.batchCode && it.batchCode.toLowerCase().includes(q)) ||
            it.packingListNo.toLowerCase().includes(q) ||
            it.shipment.toLowerCase().includes(q) ||
            it.packageNo.toLowerCase().includes(q)
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

  // Tồn kho lọc cho modal chọn vật tư xuất
  const availableStockForPicker = useMemo(() => {
    if (!isPickStockOpen) return [];
    const q = deferredStockSearch.trim().toLowerCase();
    return stockRecords.filter((st) => {
      if (selectedWarehouseId && st.warehouseId !== selectedWarehouseId) return false;
      if (st.currentQuantity <= 0 && st.currentWeightKg <= 0) return false;
      if (q) {
        return (
          st.materialName.toLowerCase().includes(q) ||
          st.materialCode.toLowerCase().includes(q) ||
          st.packingListNo.toLowerCase().includes(q) ||
          st.shipment.toLowerCase().includes(q) ||
          st.packageNo.toLowerCase().includes(q) ||
          st.drawingNo.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [isPickStockOpen, stockRecords, selectedWarehouseId, deferredStockSearch]);

  const pagedStockForPicker = useMemo(() => {
    const start = (stockPage - 1) * stockPageSize;
    return availableStockForPicker.slice(start, start + stockPageSize);
  }, [availableStockForPicker, stockPage, stockPageSize]);

  // Chi tiết phiếu xuất phân trang
  const filteredDetailItems = useMemo(() => {
    if (!viewingReceipt) return [];
    const q = deferredDetailSearch.trim().toLowerCase();
    if (!q) return viewingReceipt.items;
    return viewingReceipt.items.filter(
      (it) =>
        it.materialName.toLowerCase().includes(q) ||
        it.materialCode.toLowerCase().includes(q) ||
        (it.batchCode && it.batchCode.toLowerCase().includes(q)) ||
        it.packingListNo.toLowerCase().includes(q) ||
        it.shipment.toLowerCase().includes(q) ||
        it.packageNo.toLowerCase().includes(q) ||
        it.drawingNo.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
    );
  }, [viewingReceipt, deferredDetailSearch]);

  const pagedDetailItems = useMemo(() => {
    const start = (detailPage - 1) * detailPageSize;
    return filteredDetailItems.slice(start, start + detailPageSize);
  }, [filteredDetailItems, detailPage, detailPageSize]);

  const detailTotals = useMemo(
    () => sumOutboundItems(filteredDetailItems),
    [filteredDetailItems]
  );

  const viewingReceiptTotals = useMemo(
    () =>
      viewingReceipt
        ? sumOutboundItems(viewingReceipt.items)
        : { totalQuantity: 0, totalWeightKg: 0 },
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

      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl shrink-0">
            <ArrowUpRight className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Quản Lý Phiếu Xuất Kho (QN-OPR-PR11-FM06)
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Lập & in Phiếu Xuất Kho chuẩn PTSC Quảng Ngãi QLVT theo Người nhận, Đơn vị/Tổ/Nhóm, Số PYC/PĐX, Mã lô & Khối lượng (Kg)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:items-center gap-2 sm:gap-2.5 sm:flex-wrap w-full md:w-auto">
          <button
            onClick={downloadOutboundTemplate}
            title="Tải tệp Excel mẫu chuẩn để chuẩn bị xuất kho"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition min-h-[42px]"
          >
            <Download className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Tải Mẫu Excel Xuất Kho</span>
          </button>

          <button
            onClick={() => setIsExcelModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold text-xs shadow-md shadow-emerald-700/20 transition active:scale-95 min-h-[42px]"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Import Xuất Từ File Excel</span>
          </button>

          <button
            onClick={openCreateModal}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-blue-500/20 transition active:scale-95 min-h-[42px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Lập Phiếu Xuất Kho Mới</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo Số phiếu (PXK...), Người nhận, Đơn vị/Tổ/Nhóm, Số PYC/PĐX, Mã lô, Mã/Tên vật tư..."
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
            <option value="all">Tất cả kho xuất</option>
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

      {/* Outbound Receipts Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Số Phiếu Xuất & Ngày</th>
                <th className="px-5 py-3.5">Người Nhận & Đơn Vị/Tổ/Nhóm</th>
                <th className="px-5 py-3.5">Bộ Phận & Kho Xuất</th>
                <th className="px-5 py-3.5">Số PYC/PĐX & Lý Do Xuất</th>
                <th className="px-5 py-3.5 text-right">Tổng Số Lượng</th>
                <th className="px-5 py-3.5 text-right">Tổng Khối Lượng (Kg)</th>
                <th className="px-5 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedReceipts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Chưa có phiếu xuất kho nào phù hợp điều kiện lọc.
                  </td>
                </tr>
              ) : (
                pagedReceipts.map((r) => {
                  const plDisplay =
                    r.packingListSummary || buildPackingListSummary(r.items.slice(0, 50));
                  const rowSums = sumOutboundItems(r.items);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4">
                        <div>
                          <span className="font-mono font-bold text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 inline-block mb-1">
                            {r.issueCode}
                          </span>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{formatVoucherDateVi(r.issueDate)}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div>
                          <div className="font-bold text-slate-900 text-xs">
                            {r.recipientName || 'Chưa ghi tên'}
                          </div>
                          <div className="text-xs text-slate-600">{r.recipientDepartment}</div>
                          <div className="text-[11px] text-slate-400">
                            {r.outboundType === 'transfer'
                              ? 'Phiếu xuất điều chuyển'
                              : 'Phiếu xuất kho'}
                          </div>
                        </div>
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
                        <div className="text-xs space-y-0.5">
                          {r.requestNo ? (
                            <div className="font-mono font-semibold text-blue-700">
                              PYC/PĐX: {r.requestNo}
                            </div>
                          ) : (
                            <div className="font-mono font-semibold text-blue-700 line-clamp-1">
                              {plDisplay}
                            </div>
                          )}
                          {r.notes && !r.notes.startsWith('Import thành công ') && (
                            <div className="text-xs text-slate-700 line-clamp-1">{r.notes}</div>
                          )}
                          <div className="text-[11px] text-slate-500">
                            ({r.items.length.toLocaleString('vi-VN')} mục hàng)
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="font-bold text-slate-900 font-mono text-sm tabular-nums">
                          {rowSums.totalQuantity.toLocaleString('vi-VN')}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-right font-mono font-bold text-rose-700 tabular-nums">
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
                            title="Xem chi tiết phiếu xuất kho"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setSelectedReceiptForPrint(r)}
                            className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
                            title="In Phiếu Xuất Kho (Mẫu QN-OPR-PR11-FM06)"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteReceipt(r)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition"
                              title="Xóa phiếu xuất kho"
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
          itemLabel="phiếu xuất"
        />
      </div>

      {/* Modal Lập Phiếu Xuất Kho Mới (Chuẩn QN-OPR-PR11-FM06) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-xl shrink-0">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                    Lập Phiếu Xuất Kho (Mẫu QN-OPR-PR11-FM06)
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1">
                    CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC — Chọn từ tồn kho hoặc thêm dòng vật tư xuất
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

              {/* Thông tin đầu phiếu theo mẫu QN-OPR-PR11-FM06 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Số phiếu (*)
                    </label>
                    <input
                      type="text"
                      value={issueCode}
                      onChange={(e) => setIssueCode(e.target.value)}
                      placeholder="PXK25-0001"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-rose-700 outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Ngày lập phiếu (*)
                    </label>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
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
                      Kho xuất hàng (*)
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
                      Người nhận (*)
                    </label>
                    <input
                      type="text"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn Long"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Đơn vị/Tổ/Nhóm (*)
                    </label>
                    <input
                      type="text"
                      value={recipientDepartment}
                      onChange={(e) => setRecipientDepartment(e.target.value)}
                      placeholder="Ví dụ: Tổ thi công"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Số PYC/PĐX
                    </label>
                    <input
                      type="text"
                      value={formRequestNo}
                      onChange={(e) => setFormRequestNo(e.target.value)}
                      placeholder="Ví dụ: PYC25-0001"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 uppercase mb-1">
                      Lý do xuất kho
                    </label>
                    <input
                      type="text"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Ví dụ: Phục vụ công tác thi công UG piping"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-4 py-1.5 px-3 bg-white rounded-lg border border-slate-300">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="radio"
                        name="outboundType"
                        checked={formOutboundType === 'issue'}
                        onChange={() => setFormOutboundType('issue')}
                        className="text-blue-600"
                      />
                      <span>Phiếu xuất kho</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-slate-800">
                      <input
                        type="radio"
                        name="outboundType"
                        checked={formOutboundType === 'transfer'}
                        onChange={() => setFormOutboundType('transfer')}
                        className="text-blue-600"
                      />
                      <span>Xuất điều chuyển</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Danh sách 8 cột vật tư xuất theo mẫu PXK QLVT */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-sm text-slate-800">
                    Chi Tiết Vật Tư Xuất Kho ({formItems.length} mục hàng)
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={addManualItemRow}
                      className="flex items-center gap-1 px-3 py-2 sm:py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold border border-slate-200 transition min-h-[38px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Dòng Thủ Công</span>
                    </button>
                    <button
                      type="button"
                      onClick={openStockPicker}
                      className="flex items-center gap-1 px-3 py-2 sm:py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-xs font-semibold shadow transition min-h-[38px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Chọn Từ Tồn Kho Hiện Tại</span>
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[900px]">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-10 text-center">STT</th>
                        <th className="p-2 w-40">Mã vật tư</th>
                        <th className="p-2 min-w-[240px]">Tên vật tư (*)</th>
                        <th className="p-2 w-36">Mã lô</th>
                        <th className="p-2 w-28 text-right">Số lượng (cây/tấm)</th>
                        <th className="p-2 w-20 text-center">ĐVT</th>
                        <th className="p-2 w-32 text-right">Khối lượng (Kg)</th>
                        <th className="p-2 w-44">Ghi chú</th>
                        <th className="p-2 w-10 text-center">Xóa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-400">
                            Chưa có vật tư xuất. Bấm <strong>"Chọn Từ Tồn Kho Hiện Tại"</strong> hoặc{' '}
                            <strong>"Thêm Dòng Thủ Công"</strong> để lập phiếu xuất kho.
                          </td>
                        </tr>
                      ) : (
                        formItems.map((item, idx) => (
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
                                placeholder="76C-061.35"
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
                            <td className="p-2 text-center">
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
                            <td className="p-2">
                              <input
                                type="text"
                                value={item.note ?? item.purpose ?? ''}
                                onChange={(e) => updateItemRow(idx, 'note', e.target.value)}
                                placeholder="Ghi chú..."
                                className="w-full px-2 py-1 bg-white border border-slate-200 rounded outline-none text-xs"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeItemRow(idx)}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {formItems.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-xs font-semibold">
                    <span>TỔNG CỘNG: {formItems.length} mục hàng</span>
                    <div className="flex flex-wrap gap-4">
                      <span>
                        Tổng số lượng xuất:{' '}
                        <strong className="text-rose-700 tabular-nums">
                          {roundQty(
                            formItems.reduce((s, it) => s + roundQty(it.quantity), 0)
                          ).toLocaleString('vi-VN')}
                        </strong>
                      </span>
                      <span>
                        Tổng khối lượng xuất:{' '}
                        <strong className="text-rose-700 tabular-nums">
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
                )}
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu Phiếu Xuất Kho
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

      {/* Modal Chọn Từ Tồn Kho (Phân trang mượt cho 100.000+ bản ghi) */}
      {isPickStockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-sm truncate">
                  Chọn Hàng Hóa Từ Tồn Kho Khả Dụng
                </h4>
                <p className="text-xs text-slate-500 line-clamp-1">
                  Tìm nhanh theo Mã vật tư, Tên vật tư, Mã lô / Số kiện, Packing List
                </p>
              </div>
              <button
                onClick={() => setIsPickStockOpen(false)}
                className="p-2 hover:bg-slate-200 rounded text-slate-500 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-4 border-b border-slate-100">
              <div className="relative">
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => {
                    setStockSearch(e.target.value);
                    setStockPage(1);
                  }}
                  placeholder="Gõ tìm nhanh Mã vật tư, Tên vật tư, Mã lô, Packing List..."
                  className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 sm:top-2.5" />
              </div>
            </div>

            <div className="p-3.5 sm:p-4 overflow-y-auto flex-1">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-96 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 sticky top-0">
                      <tr>
                        <th className="p-2.5">Mã Vật Tư</th>
                        <th className="p-2.5">Tên Vật Tư</th>
                        <th className="p-2.5">Mã Lô / Số Kiện</th>
                        <th className="p-2.5">Packing List / Shipment</th>
                        <th className="p-2.5 text-right">Tồn SL</th>
                        <th className="p-2.5 text-right">Tồn KL (Kg)</th>
                        <th className="p-2.5 text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedStockForPicker.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">
                            Không tìm thấy mặt hàng tồn kho nào phù hợp.
                          </td>
                        </tr>
                      ) : (
                        pagedStockForPicker.map((st) => (
                          <tr key={st.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono font-bold text-blue-700">
                              {st.materialCode}
                            </td>
                            <td className="p-2.5">
                              <span className="font-semibold text-slate-900 block">
                                {st.materialName}
                              </span>
                              <span className="text-[11px] text-slate-500">ĐVT: {st.unit}</span>
                            </td>
                            <td className="p-2.5 font-mono font-semibold text-slate-800">
                              {st.packageNo}
                            </td>
                            <td className="p-2.5">
                              <span className="font-mono text-slate-700 block">
                                {st.packingListNo}
                              </span>
                              <span className="font-mono text-slate-400 text-[11px]">
                                {st.shipment}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-bold text-slate-900 font-mono">
                              {st.currentQuantity.toLocaleString('vi-VN')}
                            </td>
                            <td className="p-2.5 text-right font-mono font-medium text-emerald-700">
                              {st.currentWeightKg.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleSelectStockItem(st)}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition"
                              >
                                Chọn
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <PaginationBar
                  currentPage={stockPage}
                  totalItems={availableStockForPicker.length}
                  pageSize={stockPageSize}
                  onPageChange={setStockPage}
                  onPageSizeChange={setStockPageSize}
                  pageSizeOptions={[50, 100, 200]}
                  itemLabel="mặt hàng tồn"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem Chi Tiết Phiếu Xuất (Phân trang mượt cho phiếu >100.000 dòng) */}
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
                    Phiếu Xuất Kho: {viewingReceipt.issueCode}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-1">
                    Ngày: {formatVoucherDateVi(viewingReceipt.issueDate)} | Kho:{' '}
                    {viewingReceipt.warehouseName} | {viewingReceipt.items.length.toLocaleString('vi-VN')}{' '}
                    mục hàng | Tổng SL:{' '}
                    <strong className="text-rose-700 font-mono">
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
                  <span>Xem & In Phiếu (FM06)</span>
                </button>
                {isAdmin && (
                  <button
                    onClick={() => {
                      const toDelete = viewingReceipt;
                      setViewingReceipt(null);
                      setReceiptToDelete(toDelete);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition min-h-[36px]"
                    title="Xóa phiếu xuất kho này"
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
                  <span className="text-slate-400 block">Người nhận:</span>
                  <span className="font-bold text-slate-900">{viewingReceipt.recipientName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Đơn vị/Tổ/Nhóm:</span>
                  <span className="font-semibold text-slate-900">
                    {viewingReceipt.recipientDepartment}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Số PYC/PĐX:</span>
                  <span className="font-mono font-semibold text-blue-700">
                    {viewingReceipt.requestNo || '-'}
                  </span>
                </div>
                <div className="col-span-2 md:col-span-3">
                  <span className="text-slate-400 block">Lý do xuất kho:</span>
                  <span className="font-medium text-slate-800">
                    {viewingReceipt.notes || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Loại phiếu:</span>
                  <span className="font-semibold text-rose-700">
                    {viewingReceipt.outboundType === 'transfer'
                      ? 'Phiếu xuất điều chuyển'
                      : 'Phiếu xuất kho'}
                  </span>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => {
                    setDetailSearch(e.target.value);
                    setDetailPage(1);
                  }}
                  placeholder="Tìm nhanh Mã vật tư, Tên vật tư, Mã lô trong phiếu xuất..."
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
                        <th className="p-2.5">Mã Vật Tư</th>
                        <th className="p-2.5">Tên Vật Tư</th>
                        <th className="p-2.5 text-center">Mã Lô</th>
                        <th className="p-2.5 text-right">Số Lượng</th>
                        <th className="p-2.5 text-center">ĐVT</th>
                        <th className="p-2.5 text-right">Khối Lượng (Kg)</th>
                        <th className="p-2.5">Ghi Chú</th>
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
                          const batchText =
                            it.batchCode ||
                            (it.packageNo && it.packageNo !== 'N/A' ? it.packageNo : '');
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
                              <td className="p-2.5 text-right font-bold font-mono text-rose-700 tabular-nums">
                                {Number(it.weightKg || 0).toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}
                              </td>
                              <td className="p-2.5 text-[11px] text-slate-600">
                                {it.note ?? it.purpose ?? ''}
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
                        <td className="p-2.5 text-right text-rose-700 font-mono tabular-nums">
                          {detailTotals.totalWeightKg.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
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
        type="outbound"
        warehouses={warehouses}
        onImportSuccess={handleExcelImportSuccess}
      />

      {/* Modal In Phiếu */}
      <ReceiptPrintModal
        isOpen={Boolean(selectedReceiptForPrint)}
        onClose={() => setSelectedReceiptForPrint(null)}
        outbound={selectedReceiptForPrint}
      />

      {/* Modal Xác Nhận Xóa Phiếu Xuất */}
      <ConfirmDeleteModal
        isOpen={Boolean(receiptToDelete)}
        onClose={() => setReceiptToDelete(null)}
        onConfirm={confirmDeleteOutbound}
        title="Xác Nhận Xóa Phiếu Xuất Kho"
        itemName={
          receiptToDelete
            ? `Phiếu ${receiptToDelete.issueCode} (${receiptToDelete.recipientName || receiptToDelete.recipientDepartment})`
            : ''
        }
        itemType="phiếu xuất kho"
        warningText="Xóa phiếu xuất kho sẽ tự động hoàn trả lại số lượng và khối lượng tồn kho cho các kiện hàng liên quan. Bạn có chắc chắn muốn xóa không?"
      />
    </div>
  );
};

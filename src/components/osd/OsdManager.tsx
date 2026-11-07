import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  OsdReceipt, 
  OsdItemDetail, 
  OsdPdfAttachment, 
  OsdStatus, 
  OsdType, 
  InboundReceipt, 
  Warehouse 
} from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { FirestoreSyncService } from '../../services/firestoreSync';
import { SyncService } from '../../services/syncService';
import { exportToExcel } from '../../services/excelService';
import { generateNextOsdVoucherCode, roundQty } from '../../utils/additiveMerge';
import { PaginationBar } from '../common/PaginationBar';
import {
  FileWarning,
  Plus,
  Search,
  Filter,
  RotateCcw,
  Download,
  Eye,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Paperclip,
  Trash2,
  Pencil,
  Printer,
  X,
  Upload,
  Layers,
  ArrowRight,
  ShieldAlert,
  Check,
  PackageOpen,
  Calendar,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react';

export const OsdManager: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const [osdList, setOsdList] = useState<OsdReceipt[]>([]);
  const [inbounds, setInbounds] = useState<InboundReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [filterType, setFilterType] = useState<'all' | 'overage' | 'shortage' | 'damage'>('all');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOsd, setEditingOsd] = useState<OsdReceipt | null>(null);
  const [viewingOsd, setViewingOsd] = useState<OsdReceipt | null>(null);
  const [pdfPreviewModal, setPdfPreviewModal] = useState<OsdPdfAttachment | null>(null);
  const [osdToDelete, setOsdToDelete] = useState<OsdReceipt | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [loadingPdfId, setLoadingPdfId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleOpenPdf = async (pdf?: OsdPdfAttachment, osdId?: string) => {
    if (!pdf) return;
    if (pdf.dataUrl && pdf.dataUrl.length > 50) {
      setPdfPreviewModal(pdf);
      return;
    }
    if (!osdId) {
      setToast({ message: 'Biên bản chưa có nội dung PDF.', type: 'error' });
      return;
    }
    setLoadingPdfId(osdId);
    try {
      const fullDataUrl = await FirestoreSyncService.getOsdPdfAttachment(osdId);
      if (fullDataUrl && fullDataUrl.length > 50) {
        setPdfPreviewModal({ ...pdf, dataUrl: fullDataUrl });
      } else {
        setToast({ message: 'Không thể tải file PDF từ đám mây. Vui lòng thử lại sau.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Lỗi khi tải file PDF từ đám mây.', type: 'error' });
    } finally {
      setLoadingPdfId(null);
    }
  };

  // Form States
  const [formOsdCode, setFormOsdCode] = useState('');
  const [formOsdDate, setFormOsdDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedInboundId, setSelectedInboundId] = useState('');
  const [formWarehouseId, setFormWarehouseId] = useState('');
  const [formWarehouseName, setFormWarehouseName] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formPackingListNo, setFormPackingListNo] = useState('');
  const [formShipment, setFormShipment] = useState('');
  const [formStatus, setFormStatus] = useState<OsdStatus>('open');
  const [formResolutionNotes, setFormResolutionNotes] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPdf, setFormPdf] = useState<OsdPdfAttachment | undefined>(undefined);
  const [formItems, setFormItems] = useState<OsdItemDetail[]>([]);
  const [formError, setFormError] = useState('');
  const [isOffline, setIsOffline] = useState(!SyncService.isOnline());
  const [syncFeedback, setSyncFeedback] = useState<{
    type: 'warning' | 'error' | 'success';
    message: string;
    interrupted?: boolean;
    timestamp?: number;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = () => {
    setOsdList(StorageService.getOsdReceipts());
    setInbounds(StorageService.getInboundReceipts());
    setWarehouses(StorageService.getWarehouses());
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const isOnline = await SyncService.checkNetworkOnline();
      setIsOffline(!isOnline);
      if (!isOnline) {
        const msg = 'Thiết bị đang ngắt kết nối mạng. Toàn bộ dữ liệu OSD đã được bảo toàn an toàn trên máy này và sẽ tự động đồng bộ khi có kết nối trở lại.';
        setSyncFeedback({ type: 'warning', message: msg, interrupted: true, timestamp: Date.now() });
        showToast(msg, 'error');
        return;
      }

      const res = await SyncService.syncNow();
      loadData();
      if (res.success) {
        setSyncFeedback(null);
        showToast(res.message, 'success');
      } else if (res.isOffline) {
        setIsOffline(true);
        setSyncFeedback({ type: 'warning', message: res.message, interrupted: true, timestamp: Date.now() });
        showToast(res.message, 'error');
      } else {
        setSyncFeedback({ type: 'error', message: res.message, interrupted: true, timestamp: Date.now() });
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      const errMsg = `Đồng bộ OSD bị gián đoạn: ${err?.message || 'Lỗi mạng'}. Dữ liệu trên máy vẫn an toàn.`;
      setSyncFeedback({ type: 'error', message: errMsg, interrupted: true, timestamp: Date.now() });
      showToast(errMsg, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // 1. Nạp từ IndexedDB nếu chưa hydrate
    void StorageService.init().then(() => {
      loadData();
    });
    loadData();

    // 2. Lắng nghe thay đổi StorageService cục bộ
    const unsubStorage = StorageService.subscribe(loadData);

    // 3. Lắng nghe trạng thái đám mây Cloud Firestore
    const unsubCloud = FirestoreSyncService.subscribeState(() => {
      loadData();
    });

    // 4. Lắng nghe trạng thái mạng trực tuyến / ngoại tuyến
    const unsubNetwork = SyncService.subscribeNetworkStatus((online) => {
      setIsOffline(!online);
      if (online) {
        // Tự động kiểm tra đồng bộ khi vừa có mạng lại
        void SyncService.syncNow().then((res) => {
          loadData();
          if (res.success) {
            setSyncFeedback({ type: 'success', message: res.message, timestamp: Date.now() });
          }
        });
      } else {
        setSyncFeedback({
          type: 'warning',
          message: 'Thiết bị đang ngắt kết nối mạng. Dữ liệu biên bản OSD được lưu an toàn tại máy và sẽ tự động đồng bộ khi có mạng.',
          interrupted: true,
          timestamp: Date.now()
        });
      }
    });

    // 5. Lắng nghe nhịp đồng bộ của SyncService
    const unsubSync = SyncService.subscribeSyncState((syncing) => {
      setIsSyncing(syncing);
      if (!syncing) {
        loadData();
      }
    });

    // 6. Trình nghe đồng bộ hai chiều thời gian thực cho dữ liệu OSD (WebSocket + BroadcastChannel + Cloud Firestore)
    const unsubOsdRealtime = SyncService.subscribeOsd((newList) => {
      if (Array.isArray(newList)) {
        setOsdList(newList);
      }
    });

    // 7. Chủ động kéo dữ liệu đồng bộ hợp nhất mới nhất ngay khi mở trang
    void SyncService.syncNow().then((res) => {
      loadData();
      if (res.success) {
        setSyncFeedback(null);
      } else if (!res.success && res.error) {
        setSyncFeedback({ type: 'error', message: res.message, interrupted: true, timestamp: Date.now() });
      }
    });

    return () => {
      unsubStorage();
      unsubCloud();
      unsubNetwork();
      unsubSync();
      unsubOsdRealtime();
    };
  }, []);

  // Filtered OSD list
  const filteredOsdList = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return osdList.filter((osd) => {
      if (filterStatus !== 'all' && osd.status !== filterStatus) return false;
      if (filterWarehouse !== 'all' && osd.warehouseId !== filterWarehouse) return false;
      if (startDate && osd.osdDate < startDate) return false;
      if (endDate && osd.osdDate > endDate) return false;

      if (filterType !== 'all') {
        const hasType = osd.items.some((it) => it.osdType === filterType);
        if (!hasType) return false;
      }

      if (q) {
        const matchCode = osd.osdCode.toLowerCase().includes(q);
        const matchInbound = osd.inboundReceiptCode.toLowerCase().includes(q);
        const matchSupplier = (osd.supplier || '').toLowerCase().includes(q);
        const matchWh = (osd.warehouseName || '').toLowerCase().includes(q);
        const matchPl = (osd.packingListNo || '').toLowerCase().includes(q);
        const matchShp = (osd.shipment || '').toLowerCase().includes(q);
        const matchItems = osd.items.some(
          (it) =>
            it.materialCode.toLowerCase().includes(q) ||
            it.materialName.toLowerCase().includes(q) ||
            it.packageNo.toLowerCase().includes(q) ||
            it.packageName.toLowerCase().includes(q) ||
            it.defectDescription.toLowerCase().includes(q)
        );
        if (
          !matchCode &&
          !matchInbound &&
          !matchSupplier &&
          !matchWh &&
          !matchPl &&
          !matchShp &&
          !matchItems
        ) {
          return false;
        }
      }

      return true;
    });
  }, [osdList, deferredSearch, filterStatus, filterType, filterWarehouse, startDate, endDate]);

  // Statistics KPI Summary
  const stats = useMemo(() => {
    let openCount = 0;
    let closedCount = 0;
    let overageItemsCount = 0;
    let shortageItemsCount = 0;
    let damageItemsCount = 0;
    let totalAffectedQty = 0;

    for (let i = 0; i < osdList.length; i++) {
      const o = osdList[i];
      if (o.status === 'open') openCount++;
      else if (o.status === 'closed') closedCount++;

      for (let j = 0; j < o.items.length; j++) {
        const item = o.items[j];
        totalAffectedQty += item.osdQuantity;
        if (item.osdType === 'overage') overageItemsCount++;
        else if (item.osdType === 'shortage') shortageItemsCount++;
        else if (item.osdType === 'damage') damageItemsCount++;
      }
    }

    return {
      totalReceipts: osdList.length,
      openCount,
      closedCount,
      overageItemsCount,
      shortageItemsCount,
      damageItemsCount,
      totalAffectedQty: roundQty(totalAffectedQty)
    };
  }, [osdList]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredOsdList.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedList = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredOsdList.slice(start, start + pageSize);
  }, [filteredOsdList, safePage, pageSize]);

  const handleResetFilter = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterType('all');
    setFilterWarehouse('all');
    setStartDate('');
    setEndDate('');
  };

  // Quick manual toggle status between "Mở" and "Đóng" directly from the table checkbox
  const handleToggleStatus = (id: string, targetStatus: OsdStatus) => {
    const success = StorageService.toggleOsdStatus(
      id,
      targetStatus,
      undefined,
      currentUser?.fullName || currentUser?.username
    );
    if (success) {
      loadData();
      if (!SyncService.isOnline()) {
        showToast(
          `Đã chuyển trạng thái sang "${targetStatus === 'open' ? 'Mở' : 'Đóng'}" (Lưu cục bộ, sẽ tự đồng bộ khi có mạng)`,
          'success'
        );
      } else {
        showToast(
          `Đã chuyển trạng thái biên bản thành "${targetStatus === 'open' ? 'Mở' : 'Đóng'}"!`
        );
        void SyncService.syncNow().then((res) => {
          loadData();
          if (!res.success && res.error) {
            setSyncFeedback({ type: 'warning', message: res.message, interrupted: true, timestamp: Date.now() });
          }
        });
      }
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    const nextCode = generateNextOsdVoucherCode(osdList, today);
    setEditingOsd(null);
    setFormOsdCode(nextCode);
    setFormOsdDate(today);
    setSelectedInboundId('');
    setFormWarehouseId(warehouses[0]?.id || '');
    setFormWarehouseName(warehouses[0]?.name || '');
    setFormSupplier('');
    setFormPackingListNo('');
    setFormShipment('');
    setFormStatus('open');
    setFormResolutionNotes('');
    setFormNotes('');
    setFormPdf(undefined);
    setFormItems([]);
    setFormError('');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (osd: OsdReceipt) => {
    setEditingOsd(osd);
    setFormOsdCode(osd.osdCode);
    setFormOsdDate(osd.osdDate);
    setSelectedInboundId(osd.inboundReceiptId);
    setFormWarehouseId(osd.warehouseId);
    setFormWarehouseName(osd.warehouseName);
    setFormSupplier(osd.supplier);
    setFormPackingListNo(osd.packingListNo || '');
    setFormShipment(osd.shipment || '');
    setFormStatus(osd.status);
    setFormResolutionNotes(osd.resolutionNotes || '');
    setFormNotes(osd.notes || '');
    setFormPdf(osd.pdfAttachment);
    setFormItems(osd.items.map((it) => ({ ...it })));
    setFormError('');
    setIsModalOpen(true);
  };

  // When user selects an Inbound Receipt from dropdown, auto-populate details & allow selecting items
  const handleSelectInboundReceipt = (inboundId: string) => {
    setSelectedInboundId(inboundId);
    const matched = inbounds.find((r) => r.id === inboundId);
    if (!matched) return;

    setFormWarehouseId(matched.warehouseId);
    setFormWarehouseName(matched.warehouseName);
    setFormSupplier(matched.supplier || matched.delivererName);
    setFormPackingListNo(matched.packingListNo || '');
    setFormShipment(matched.shipment || '');

    // Nếu chưa có dòng vật tư nào hoặc đang lập phiếu mới, tự động gợi ý các dòng từ phiếu nhập kho
    if (formItems.length === 0 && Array.isArray(matched.items) && matched.items.length > 0) {
      const initialItems: OsdItemDetail[] = matched.items.map((it, idx) => ({
        id: `osd-item-${Date.now()}-${idx}`,
        materialCode: it.materialCode || 'N/A',
        materialName: it.materialName || 'Vật tư',
        unit: it.unit || 'Bộ',
        packageNo: it.packageNo || 'N/A',
        packageName: it.packageName || '',
        packingListNo: it.packingListNo || matched.packingListNo || 'N/A',
        shipment: it.shipment || matched.shipment || 'N/A',
        inboundQuantity: it.quantity,
        osdType: 'shortage',
        osdQuantity: 0,
        osdWeightKg: 0,
        defectDescription: '',
        rootCause: '',
        proposedAction: ''
      }));
      setFormItems(initialItems);
    }
  };

  // Add individual item row from source inbound receipt
  const addItemFromInbound = (inboundItem: any) => {
    const newItem: OsdItemDetail = {
      id: `osd-item-${Date.now()}-${formItems.length}`,
      materialCode: inboundItem.materialCode || 'N/A',
      materialName: inboundItem.materialName || 'Vật tư',
      unit: inboundItem.unit || 'Bộ',
      packageNo: inboundItem.packageNo || 'N/A',
      packageName: inboundItem.packageName || '',
      packingListNo: inboundItem.packingListNo || formPackingListNo || 'N/A',
      shipment: inboundItem.shipment || formShipment || 'N/A',
      inboundQuantity: inboundItem.quantity || 0,
      osdType: 'damage',
      osdQuantity: 1,
      osdWeightKg: 0,
      defectDescription: '',
      rootCause: '',
      proposedAction: ''
    };
    setFormItems((prev) => [...prev, newItem]);
  };

  // Add a blank item row
  const addBlankItem = () => {
    const newItem: OsdItemDetail = {
      id: `osd-item-${Date.now()}-${formItems.length}`,
      materialCode: '',
      materialName: '',
      unit: 'Bộ',
      packageNo: '',
      packageName: '',
      packingListNo: formPackingListNo || '',
      shipment: formShipment || '',
      inboundQuantity: 1,
      osdType: 'shortage',
      osdQuantity: 1,
      osdWeightKg: 0,
      defectDescription: '',
      rootCause: '',
      proposedAction: ''
    };
    setFormItems((prev) => [...prev, newItem]);
  };

  const updateItemRow = (idx: number, field: keyof OsdItemDetail, val: any) => {
    setFormItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const removeItemRow = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // PDF file attachment handler
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFormError('Vui lòng chỉ đính kèm file biên bản định dạng .pdf');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setFormError('Kích thước file PDF không được vượt quá 25MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setFormPdf({
        fileName: file.name,
        fileSize: file.size,
        fileType: 'application/pdf',
        uploadedAt: new Date().toISOString(),
        dataUrl
      });
      setFormError('');
    };
    reader.onerror = () => {
      setFormError('Không thể đọc file PDF. Vui lòng thử lại.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePdf = () => {
    setFormPdf(undefined);
  };

  // Save / Submit OSD Receipt
  const handleSaveOsd = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedCode = formOsdCode.trim().toUpperCase();
    if (!trimmedCode) {
      setFormError('Vui lòng nhập số biên bản OSD');
      return;
    }

    if (!selectedInboundId) {
      setFormError('Vui lòng chọn Phiếu nhập kho nguồn để liên kết vật tư');
      return;
    }

    const matchedInbound = inbounds.find((r) => r.id === selectedInboundId);
    const inboundCode = matchedInbound?.receiptCode || 'PNK-CHUA-RO';

    // Lọc các dòng vật tư hợp lệ (có số lượng OSD > 0)
    const validItems = formItems.filter(
      (it) => (it.materialCode.trim() || it.materialName.trim()) && it.osdQuantity > 0
    );

    if (validItems.length === 0) {
      setFormError('Vui lòng khai báo ít nhất 1 dòng vật tư có Số lượng OSD > 0');
      return;
    }

    let totalOsdQty = 0;
    let totalOsdWeight = 0;
    for (let i = 0; i < validItems.length; i++) {
      totalOsdQty += Number(validItems[i].osdQuantity) || 0;
      totalOsdWeight += Number(validItems[i].osdWeightKg) || 0;
    }

    const nowIso = new Date().toISOString();
    const editorName = currentUser?.fullName || currentUser?.username || 'Quản trị viên';

    if (editingOsd) {
      const updatedOsd: OsdReceipt = {
        ...editingOsd,
        osdCode: trimmedCode,
        osdDate: formOsdDate,
        inboundReceiptId: selectedInboundId,
        inboundReceiptCode: inboundCode,
        warehouseId: formWarehouseId,
        warehouseName: formWarehouseName,
        supplier: formSupplier,
        packingListNo: formPackingListNo,
        shipment: formShipment,
        status: formStatus,
        resolutionNotes: formResolutionNotes.trim(),
        resolvedAt: formStatus === 'closed' ? (editingOsd.resolvedAt || nowIso) : undefined,
        resolvedBy: formStatus === 'closed' ? (editingOsd.resolvedBy || editorName) : undefined,
        pdfAttachment: formPdf,
        items: validItems,
        totalOsdQuantity: roundQty(totalOsdQty),
        totalOsdWeightKg: Math.round(totalOsdWeight * 100) / 100,
        notes: formNotes.trim(),
        lastEditedBy: editorName,
        lastEditedAt: nowIso
      };

      StorageService.updateOsdReceipt(editingOsd.id, updatedOsd);
      void SyncService.pushOsdImmediately();
      if (formPdf?.dataUrl && formPdf.dataUrl.length > 50) {
        void FirestoreSyncService.pushSingleOsdAttachment(editingOsd.id, formPdf).catch(() => {});
      }
      if (!SyncService.isOnline()) {
        showToast(`Đã cập nhật OSD "${trimmedCode}" (Lưu cục bộ an toàn, sẽ tự đồng bộ khi có Internet)`, 'success');
      } else {
        showToast(`Đã cập nhật biên bản OSD "${trimmedCode}" thành công!`);
        void SyncService.syncNow().then((res) => {
          loadData();
          if (res.success) {
            setSyncFeedback(null);
          } else if (res.error) {
            setSyncFeedback({ type: 'warning', message: res.message, interrupted: true, timestamp: Date.now() });
          }
        });
      }
    } else {
      const newOsd: OsdReceipt = {
        id: `osd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        osdCode: trimmedCode,
        osdDate: formOsdDate,
        inboundReceiptId: selectedInboundId,
        inboundReceiptCode: inboundCode,
        warehouseId: formWarehouseId,
        warehouseName: formWarehouseName,
        supplier: formSupplier,
        packingListNo: formPackingListNo,
        shipment: formShipment,
        status: formStatus,
        resolutionNotes: formResolutionNotes.trim(),
        resolvedAt: formStatus === 'closed' ? nowIso : undefined,
        resolvedBy: formStatus === 'closed' ? editorName : undefined,
        pdfAttachment: formPdf,
        items: validItems,
        totalOsdQuantity: roundQty(totalOsdQty),
        totalOsdWeightKg: Math.round(totalOsdWeight * 100) / 100,
        notes: formNotes.trim(),
        createdAt: nowIso,
        createdBy: editorName
      };

      StorageService.addOsdReceipt(newOsd);
      void SyncService.pushOsdImmediately();
      if (formPdf?.dataUrl && formPdf.dataUrl.length > 50) {
        void FirestoreSyncService.pushSingleOsdAttachment(newOsd.id, formPdf).catch(() => {});
      }
      if (!SyncService.isOnline()) {
        showToast(`Đã lập biên bản OSD "${trimmedCode}" (Lưu cục bộ an toàn, sẽ tự đồng bộ khi có Internet)`, 'success');
      } else {
        showToast(`Đã lập biên bản OSD "${trimmedCode}" thành công!`);
        void SyncService.syncNow().then((res) => {
          loadData();
          if (res.success) {
            setSyncFeedback(null);
          } else if (res.error) {
            setSyncFeedback({ type: 'warning', message: res.message, interrupted: true, timestamp: Date.now() });
          }
        });
      }
    }

    setIsModalOpen(false);
    loadData();
  };

  // Delete OSD
  const confirmDelete = () => {
    if (!osdToDelete) return;
    const code = osdToDelete.osdCode;
    StorageService.deleteOsdReceipt(osdToDelete.id);
    void SyncService.pushOsdImmediately();
    setOsdToDelete(null);
    loadData();
    if (!SyncService.isOnline()) {
      showToast(`Đã xóa biên bản OSD "${code}" (Lưu cục bộ, sẽ tự đồng bộ khi có mạng)`);
    } else {
      showToast(`Đã xóa biên bản OSD "${code}"`);
      void SyncService.syncNow().then((res) => {
        loadData();
        if (res.success) {
          setSyncFeedback(null);
        } else if (res.error) {
          setSyncFeedback({ type: 'warning', message: res.message, interrupted: true, timestamp: Date.now() });
        }
      });
    }
  };

  // Export OSD to Excel
  const handleExportExcel = () => {
    const flatRows: any[] = [];
    filteredOsdList.forEach((osd, rIdx) => {
      osd.items.forEach((item, iIdx) => {
        flatRows.push({
          'STT': flatRows.length + 1,
          'Mã Biên Bản OSD': osd.osdCode,
          'Ngày Lập': osd.osdDate,
          'Trạng Thái': osd.status === 'open' ? 'Mở (Chưa xử lý)' : 'Đóng (Đã xử lý)',
          'Phiếu Nhập Nguồn': osd.inboundReceiptCode,
          'Kho Bãi': osd.warehouseName,
          'Nhà Cung Cấp / Đơn Vị Giao': osd.supplier,
          'Số Packing List': osd.packingListNo || '',
          'Shipment': osd.shipment || '',
          'Mã Vật Tư': item.materialCode,
          'Tên Vật Tư Thiết Bị': item.materialName,
          'ĐVT': item.unit,
          'Số Kiện': item.packageNo,
          'Tên Kiện': item.packageName,
          'SL Theo Phiếu Nhập': item.inboundQuantity,
          'Phân Loại OSD':
            item.osdType === 'overage'
              ? 'Thừa (Overage)'
              : item.osdType === 'shortage'
                ? 'Thiếu (Shortage)'
                : 'Hư hỏng (Damage)',
          'Số Lượng OSD': item.osdQuantity,
          'Khối Lượng Ảnh Hưởng (kg)': item.osdWeightKg || 0,
          'Mô Tả Tình Trạng Lỗi': item.defectDescription,
          'Nguyên Nhân': item.rootCause || '',
          'Biện Pháp Xử Lý': item.proposedAction || '',
          'Có File PDF Đính Kèm': osd.pdfAttachment ? `Có (${osd.pdfAttachment.fileName})` : 'Không',
          'Người Lập': osd.createdBy,
          'Ghi Chú Kết Quả Xử Lý': osd.resolutionNotes || ''
        });
      });
    });

    exportToExcel(
      flatRows,
      `DanhSach_BienBan_OSD_${new Date().toISOString().slice(0, 10)}`,
      'Danh_Sach_OSD'
    );
  };

  // Get Inbound item list for the selected inbound receipt
  const selectedInboundReceipt = inbounds.find((r) => r.id === selectedInboundId);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 ${
            toast.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl shrink-0">
            <FileWarning className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Quản Lý Vật Tư OSD (Overage - Shortage - Damage)
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Lập biên bản hàng Thừa - Thiếu - Hư hỏng từ phiếu nhập kho, đính kèm biên bản PDF &amp; theo dõi trạng thái Mở / Đóng
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={openCreateModal}
            className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 transition active:scale-95 min-h-[42px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Lập Phiếu OSD Mới</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-700/20 transition active:scale-95 min-h-[42px]"
            title="Xuất danh sách OSD ra file Excel"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Xuất Excel</span>
          </button>
        </div>
      </div>

      {/* Cảnh báo trạng thái mạng ngắt kết nối (Offline) */}
      {isOffline && (
        <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5 sm:mt-0">
              <WifiOff className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-amber-950">
                  Thiết bị đang mất kết nối Internet (Ngoại tuyến)
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/90 text-amber-900 uppercase tracking-wider">
                  Chế độ lưu Offline
                </span>
              </div>
              <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                Bạn vẫn có thể tạo, chỉnh sửa, đính kèm biên bản PDF hoặc chuyển trạng thái OSD bình thường. Tất cả dữ liệu được lưu an toàn trong bộ nhớ thiết bị này và sẽ tự động đồng bộ lên Đám mây &amp; máy chủ ngay khi có mạng trở lại.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cảnh báo khi đồng bộ OSD bị gián đoạn */}
      {!isOffline && syncFeedback?.interrupted && (
        <div className="bg-rose-50 border border-rose-300/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-rose-100 text-rose-800 rounded-xl shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-rose-950">
                  Đồng bộ dữ liệu OSD bị gián đoạn
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200/90 text-rose-900 uppercase tracking-wider">
                  Thông báo
                </span>
              </div>
              <p className="text-xs text-rose-900/90 mt-1 leading-relaxed">
                {syncFeedback.message} — Dữ liệu trên máy này vẫn an toàn. Vui lòng sử dụng nút &ldquo;Đồng Bộ Cloud&rdquo; trên thanh tiêu đề chính khi kết nối mạng ổn định.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSyncFeedback(null)}
              className="px-3.5 py-2 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition"
            >
              Đã hiểu & Bỏ qua
            </button>
          </div>
        </div>
      )}

      {/* Bảng tổng hợp KPI các OSD (Bao nhiêu cái Mở, bao nhiêu cái Đóng) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {/* Tổng số OSD */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400 uppercase">Tổng Phiếu OSD</span>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold text-slate-800 font-mono tabular-nums mt-1 block">
            {stats.totalReceipts}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {stats.totalAffectedQty.toLocaleString('vi-VN')} vật tư ảnh hưởng
          </span>
        </div>

        {/* OSD Đang MỞ */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-amber-300 shadow-sm bg-gradient-to-br from-amber-50/70 via-white to-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 uppercase flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>OSD Đang Mở</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900">
              Chưa xong
            </span>
          </div>
          <span className="text-xl sm:text-2xl font-extrabold text-amber-700 font-mono tabular-nums mt-1 block">
            {stats.openCount}
          </span>
          <span className="text-[10px] text-amber-700/80 block mt-0.5 font-medium">
            Biên bản đang xử lý
          </span>
        </div>

        {/* OSD Đã ĐÓNG */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-emerald-300 shadow-sm bg-gradient-to-br from-emerald-50/70 via-white to-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>OSD Đã Đóng</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/80 text-emerald-900">
              Hoàn thành
            </span>
          </div>
          <span className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono tabular-nums mt-1 block">
            {stats.closedCount}
          </span>
          <span className="text-[10px] text-emerald-700/80 block mt-0.5 font-medium">
            Đã xử lý giải quyết
          </span>
        </div>

        {/* Thừa (Overage) */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-purple-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-purple-700 uppercase">Thừa (Overage)</span>
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
          </div>
          <span className="text-xl font-bold text-purple-800 font-mono tabular-nums mt-1 block">
            {stats.overageItemsCount}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Mục hàng thừa</span>
        </div>

        {/* Thiếu (Shortage) */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-rose-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-700 uppercase">Thiếu (Shortage)</span>
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          </div>
          <span className="text-xl font-bold text-rose-800 font-mono tabular-nums mt-1 block">
            {stats.shortageItemsCount}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Mục hàng thiếu</span>
        </div>

        {/* Hư hỏng (Damage) */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-orange-200/80 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-orange-700 uppercase">Hư Hỏng (Damage)</span>
            <span className="w-2 h-2 rounded-full bg-orange-500"></span>
          </div>
          <span className="text-xl font-bold text-orange-800 font-mono tabular-nums mt-1 block">
            {stats.damageItemsCount}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Mục hàng hư hỏng</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Bộ Lọc &amp; Tra Cứu Biên Bản OSD</span>
          </div>
          <button
            onClick={handleResetFilter}
            className="text-xs font-medium text-slate-500 hover:text-blue-700 flex items-center gap-1 transition py-1 px-2 rounded-lg hover:bg-slate-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {/* Search Bar */}
          <div className="sm:col-span-2 relative">
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Tìm kiếm tổng hợp
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Mã OSD, phiếu nhập, NCC, mã vật tư, số kiện..."
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:ring-2 focus:ring-blue-500"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Filter Status */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Trạng thái xử lý
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            >
              <option value="all">Tất cả ({osdList.length})</option>
              <option value="open">Đang Mở ({stats.openCount})</option>
              <option value="closed">Đã Đóng ({stats.closedCount})</option>
            </select>
          </div>

          {/* Filter OSD Type */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Phân loại OSD
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            >
              <option value="all">Tất cả loại OSD</option>
              <option value="shortage">Thiếu (Shortage)</option>
              <option value="damage">Hư hỏng (Damage)</option>
              <option value="overage">Thừa (Overage)</option>
            </select>
          </div>

          {/* Filter Warehouse */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Kho bãi tiếp nhận
            </label>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            >
              <option value="all">Tất cả kho ({warehouses.length})</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main OSD Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="font-bold text-slate-900 text-sm">
            Danh Sách Biên Bản OSD ({filteredOsdList.length.toLocaleString('vi-VN')} biên bản)
          </div>
          <span className="text-xs text-slate-500">
            Click vào ô [Mở] hoặc [Đóng] để cập nhật trạng thái trực tiếp
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[1100px]">
            <thead className="bg-slate-50/90 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3 w-10 text-center">STT</th>
                <th className="p-3 w-32">MÃ BIÊN BẢN</th>
                <th className="p-3 w-24">NGÀY LẬP</th>
                <th className="p-3 w-32">PHIẾU NHẬP NGUỒN</th>
                <th className="p-3 w-36">KHO TIẾP NHẬN</th>
                <th className="p-3 w-40">ĐƠN VỊ GIAO / NCC</th>
                <th className="p-3 w-28 text-center">PHÂN LOẠI</th>
                <th className="p-3 w-44">VẬT TƯ BỊ ẢNH HƯỞNG</th>
                <th className="p-3 w-32 text-center">BIÊN BẢN PDF</th>
                <th className="p-3 w-44 text-center">TRẠNG THÁI XỬ LÝ (TICK THỦ CÔNG)</th>
                <th className="p-3 w-28 text-center">THAO TÁC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedList.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-slate-400 text-sm">
                    Chưa có biên bản OSD nào khớp với bộ lọc. Hãy bấm &quot;Lập Phiếu OSD Mới&quot; để bắt đầu.
                  </td>
                </tr>
              ) : (
                pagedList.map((osd, idx) => {
                  const hasShortage = osd.items.some((it) => it.osdType === 'shortage');
                  const hasDamage = osd.items.some((it) => it.osdType === 'damage');
                  const hasOverage = osd.items.some((it) => it.osdType === 'overage');

                  return (
                    <tr key={osd.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 text-center text-slate-400 font-mono">
                        {(safePage - 1) * pageSize + idx + 1}
                      </td>

                      {/* Mã biên bản OSD */}
                      <td className="p-3 font-mono font-bold text-blue-700">
                        {osd.osdCode}
                      </td>

                      {/* Ngày lập */}
                      <td className="p-3 font-mono text-slate-600">
                        {osd.osdDate}
                      </td>

                      {/* Phiếu nhập nguồn */}
                      <td className="p-3">
                        <span className="font-mono font-semibold text-slate-900 block">
                          {osd.inboundReceiptCode}
                        </span>
                        {osd.packingListNo && (
                          <span className="text-[10px] text-slate-500 font-mono block">
                            PL: {osd.packingListNo}
                          </span>
                        )}
                      </td>

                      {/* Kho bãi */}
                      <td className="p-3 font-medium text-slate-700">
                        {osd.warehouseName}
                      </td>

                      {/* Đơn vị giao / NCC */}
                      <td className="p-3 text-slate-700 line-clamp-1">
                        {osd.supplier || 'N/A'}
                      </td>

                      {/* Phân loại OSD */}
                      <td className="p-3 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          {hasDamage && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                              Hư hỏng
                            </span>
                          )}
                          {hasShortage && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              Thiếu
                            </span>
                          )}
                          {hasOverage && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              Thừa
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Vật tư bị ảnh hưởng */}
                      <td className="p-3">
                        <span className="font-semibold text-slate-900 block">
                          {osd.items.length} mục vật tư (SL: {osd.totalOsdQuantity})
                        </span>
                        <span className="text-[10px] text-slate-500 line-clamp-1">
                          {osd.items.map((it) => it.materialCode).filter(Boolean).join(', ')}
                        </span>
                      </td>

                      {/* Biên bản PDF đính kèm */}
                      <td className="p-3 text-center">
                        {osd.pdfAttachment ? (
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenPdf(osd.pdfAttachment, osd.id)}
                              disabled={loadingPdfId === osd.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg border border-rose-200 text-[11px] font-semibold transition disabled:opacity-60"
                              title={osd.pdfAttachment.fileName}
                            >
                              {loadingPdfId === osd.id ? (
                                <Loader2 className="w-3.5 h-3.5 text-rose-600 animate-spin" />
                              ) : (
                                <Paperclip className="w-3.5 h-3.5 text-rose-600" />
                              )}
                              <span className="max-w-[80px] truncate">PDF</span>
                              <Eye className="w-3 h-3 ml-0.5" />
                            </button>
                            <span className="text-[9px] text-slate-400">
                              {Math.round(osd.pdfAttachment.fileSize / 1024)} KB
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Chưa đính kèm</span>
                        )}
                      </td>

                      {/* Hai check box "Mở" và "Đóng" người sử dụng tick thủ công trực tiếp */}
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
                          {/* Checkbox Mở */}
                          <label
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer select-none transition ${
                              osd.status === 'open'
                                ? 'bg-amber-400 text-amber-950 shadow-sm ring-1 ring-amber-500'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                            title="Tick chọn Mở khi chưa xử lý hoàn thành OSD"
                          >
                            <input
                              type="checkbox"
                              checked={osd.status === 'open'}
                              onChange={() => handleToggleStatus(osd.id, 'open')}
                              className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                            />
                            <span>Mở</span>
                          </label>

                          {/* Checkbox Đóng */}
                          <label
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer select-none transition ${
                              osd.status === 'closed'
                                ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-700'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                            title="Tick chọn Đóng khi đã xử lý hoàn thành OSD"
                          >
                            <input
                              type="checkbox"
                              checked={osd.status === 'closed'}
                              onChange={() => handleToggleStatus(osd.id, 'closed')}
                              className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span>Đóng</span>
                          </label>
                        </div>
                      </td>

                      {/* Thao tác */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingOsd(osd)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Xem chi tiết biên bản hiện trường OSD"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(osd)}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition"
                            title="Chỉnh sửa biên bản OSD"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setOsdToDelete(osd)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Xóa biên bản OSD"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
          currentPage={safePage}
          totalItems={filteredOsdList.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
          itemLabel="biên bản OSD"
        />
      </div>

      {/* ========================================================================= */}
      {/* MODAL LẬP / CHỈNH SỬA BIÊN BẢN OSD */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <FileWarning className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingOsd ? `Chỉnh Sửa Biên Bản OSD: ${editingOsd.osdCode}` : 'Lập Biên Bản OSD Mới'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ghi nhận hàng hóa Thừa (Overage) - Thiếu (Shortage) - Hư hỏng (Damage) từ phiếu nhập kho
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveOsd} className="flex-1 overflow-y-auto p-5 space-y-5">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Thông tin biên bản OSD */}
              <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>1. Thông Tin Phiếu &amp; Nguồn Nhập Kho</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  {/* Mã OSD */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Mã phiếu OSD (*)
                    </label>
                    <input
                      type="text"
                      value={formOsdCode}
                      onChange={(e) => setFormOsdCode(e.target.value)}
                      placeholder="VD: OSD26-0001"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* Ngày lập */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Ngày lập OSD (*)
                    </label>
                    <input
                      type="date"
                      value={formOsdDate}
                      onChange={(e) => setFormOsdDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  {/* Chọn Phiếu Nhập Kho Nguồn */}
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Chọn Phiếu Nhập Kho Nguồn (*)
                    </label>
                    <select
                      value={selectedInboundId}
                      onChange={(e) => handleSelectInboundReceipt(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-blue-400 rounded-lg outline-none font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">-- Bấm để chọn Phiếu Nhập Kho ({inbounds.length} phiếu) --</option>
                      {inbounds.map((inb) => (
                        <option key={inb.id} value={inb.id}>
                          {inb.receiptCode} - {inb.receiptDate} | {inb.warehouseName} | {inb.supplier || inb.delivererName} ({inb.items.length} vật tư)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Kho tiếp nhận */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kho tiếp nhận</label>
                    <input
                      type="text"
                      value={formWarehouseName}
                      readOnly
                      placeholder="Tự động từ phiếu nhập"
                      className="w-full px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 outline-none"
                    />
                  </div>

                  {/* Đơn vị giao / NCC */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Đơn vị giao / NCC</label>
                    <input
                      type="text"
                      value={formSupplier}
                      onChange={(e) => setFormSupplier(e.target.value)}
                      placeholder="Tự động từ phiếu nhập"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 outline-none"
                    />
                  </div>

                  {/* Packing List */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Số Packing List</label>
                    <input
                      type="text"
                      value={formPackingListNo}
                      onChange={(e) => setFormPackingListNo(e.target.value)}
                      placeholder="PL-..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono outline-none"
                    />
                  </div>

                  {/* Shipment */}
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Shipment</label>
                    <input
                      type="text"
                      value={formShipment}
                      onChange={(e) => setFormShipment(e.target.value)}
                      placeholder="SHP-..."
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Danh sách vật tư OSD lấy từ phiếu nhập kho */}
              <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <PackageOpen className="w-4 h-4 text-amber-600" />
                    <span>2. Chi Tiết Vật Tư OSD ({formItems.length} dòng)</span>
                  </h4>

                  <div className="flex items-center gap-2">
                    {selectedInboundReceipt && selectedInboundReceipt.items.length > 0 && (
                      <div className="text-[11px] text-slate-500 font-medium">
                        Phiếu nhập có {selectedInboundReceipt.items.length} mục hàng
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={addBlankItem}
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm dòng vật tư</span>
                    </button>
                  </div>
                </div>

                {/* Danh sách các dòng vật tư OSD */}
                <div className="space-y-3">
                  {formItems.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300 text-xs">
                      Hãy chọn Phiếu nhập kho nguồn ở bước 1 để tải dữ liệu vật tư, hoặc bấm &quot;Thêm dòng vật tư&quot;.
                    </div>
                  ) : (
                    formItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                          <span className="font-bold text-xs text-slate-800">
                            #{idx + 1}. {item.materialName || item.materialCode || 'Vật tư mới'}
                          </span>

                          <div className="flex items-center gap-2">
                            {/* Phân loại OSD */}
                            <div className="flex items-center gap-1 text-xs">
                              <span className="font-semibold text-slate-600">Loại OSD:</span>
                              <select
                                value={item.osdType}
                                onChange={(e) => updateItemRow(idx, 'osdType', e.target.value as any)}
                                className={`px-2 py-1 rounded font-bold text-xs border outline-none ${
                                  item.osdType === 'damage'
                                    ? 'bg-orange-50 border-orange-300 text-orange-800'
                                    : item.osdType === 'shortage'
                                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                                      : 'bg-purple-50 border-purple-300 text-purple-800'
                                }`}
                              >
                                <option value="damage">Hư hỏng (Damage)</option>
                                <option value="shortage">Thiếu (Shortage)</option>
                                <option value="overage">Thừa (Overage)</option>
                              </select>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition"
                              title="Xóa dòng vật tư này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Grid các trường */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 text-xs">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Mã vật tư</label>
                            <input
                              type="text"
                              value={item.materialCode}
                              onChange={(e) => updateItemRow(idx, 'materialCode', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono font-medium outline-none"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Tên vật tư thiết bị</label>
                            <input
                              type="text"
                              value={item.materialName}
                              onChange={(e) => updateItemRow(idx, 'materialName', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-medium outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">ĐVT</label>
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => updateItemRow(idx, 'unit', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Số kiện (Pkg No)</label>
                            <input
                              type="text"
                              value={item.packageNo}
                              onChange={(e) => updateItemRow(idx, 'packageNo', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Tên kiện</label>
                            <input
                              type="text"
                              value={item.packageName}
                              onChange={(e) => updateItemRow(idx, 'packageName', e.target.value)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">SL theo phiếu nhập</label>
                            <input
                              type="number"
                              value={item.inboundQuantity}
                              onChange={(e) => updateItemRow(idx, 'inboundQuantity', Number(e.target.value) || 0)}
                              className="w-full px-2 py-1 bg-slate-100 border border-slate-200 rounded font-mono font-medium outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-amber-700 mb-0.5">
                              Số lượng OSD (*)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.osdQuantity}
                              onChange={(e) => updateItemRow(idx, 'osdQuantity', Number(e.target.value) || 0)}
                              className="w-full px-2 py-1 bg-amber-50 border border-amber-300 rounded font-mono font-bold text-amber-900 outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Khối lượng (kg)</label>
                            <input
                              type="number"
                              step="any"
                              value={item.osdWeightKg || 0}
                              onChange={(e) => updateItemRow(idx, 'osdWeightKg', Number(e.target.value) || 0)}
                              className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono outline-none"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              Mô tả tình trạng lỗi / hư hỏng / chênh lệch (*)
                            </label>
                            <input
                              type="text"
                              value={item.defectDescription}
                              onChange={(e) => updateItemRow(idx, 'defectDescription', e.target.value)}
                              placeholder="VD: Móp méo mặt bích, thiếu 2 bu lông, rách niêm phong..."
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                              Nguyên nhân &amp; Biện pháp xử lý
                            </label>
                            <input
                              type="text"
                              value={item.proposedAction}
                              onChange={(e) => updateItemRow(idx, 'proposedAction', e.target.value)}
                              placeholder="VD: Lập biên bản hiện trường với tài xế, yêu cầu NCC cấp bù..."
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Đính kèm biên bản PDF & Trạng thái xử lý (Tick thủ công) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Đính kèm file PDF */}
                <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-rose-600" />
                    <span>3. Đính Kèm Biên Bản OSD (File .PDF)</span>
                  </h4>

                  {formPdf ? (
                    <div className="bg-white p-3 rounded-xl border border-rose-200 flex items-center justify-between gap-2 shadow-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-slate-800 block truncate">
                            {formPdf.fileName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {Math.round(formPdf.fileSize / 1024)} KB - Đã đính kèm
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(formPdf, editingOsd?.id)}
                          className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Xem</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRemovePdf}
                          className="p-1 text-slate-400 hover:text-rose-600 transition"
                          title="Gỡ file đính kèm này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-4 text-center transition bg-white cursor-pointer group">
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={handlePdfUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                      />
                      <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-600 mx-auto mb-1.5 transition" />
                      <span className="block text-xs font-semibold text-slate-700 group-hover:text-blue-700">
                        Bấm hoặc kéo thả file biên bản (.pdf) vào đây
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        Hỗ trợ file PDF scan có chữ ký hiện trường, tối đa 25MB
                      </span>
                    </div>
                  )}
                </div>

                {/* Hai checkbox "Mở" và "Đóng" tick thủ công */}
                <div className="bg-slate-50/70 rounded-xl p-4 border border-slate-200/80 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-emerald-600" />
                    <span>4. Trạng Thái Xử Lý (Tick Thủ Công)</span>
                  </h4>

                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5">
                    <span className="text-xs text-slate-600 font-medium block">
                      Chọn trạng thái xử lý cho biên bản OSD này:
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Checkbox Mở */}
                      <label
                        className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition ${
                          formStatus === 'open'
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formStatus === 'open'}
                          onChange={() => setFormStatus('open')}
                          className="mt-0.5 w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-amber-900 block">
                            Mở (Chưa xử lý)
                          </span>
                          <span className="text-[10px] text-amber-700/80 block mt-0.5">
                            Khi chưa xử lý hoàn thành OSD
                          </span>
                        </div>
                      </label>

                      {/* Checkbox Đóng */}
                      <label
                        className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer select-none transition ${
                          formStatus === 'closed'
                            ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formStatus === 'closed'}
                          onChange={() => setFormStatus('closed')}
                          className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-emerald-900 block">
                            Đóng (Đã xử lý)
                          </span>
                          <span className="text-[10px] text-emerald-700/80 block mt-0.5">
                            Khi đã xử lý hoàn thành OSD
                          </span>
                        </div>
                      </label>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Ghi chú kết quả xử lý (khi đóng OSD hoặc cập nhật tiến độ)
                      </label>
                      <input
                        type="text"
                        value={formResolutionNotes}
                        onChange={(e) => setFormResolutionNotes(e.target.value)}
                        placeholder="VD: NCC đã bàn giao bù đủ 2 bu lông ngày 15/03, đã nghiệm thu xong."
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between bg-slate-50/70">
              <span className="text-xs text-slate-500">
                Tổng cộng: <b className="text-slate-800">{formItems.length}</b> dòng vật tư OSD
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleSaveOsd}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition active:scale-95"
                >
                  {editingOsd ? 'Cập Nhật Biên Bản' : 'Lưu Biên Bản OSD'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL XEM CHI TIẾT BIÊN BẢN OSD HIỆN TRƯỜNG */}
      {/* ========================================================================= */}
      {viewingOsd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 print:hidden">
              <div className="flex items-center gap-2">
                <FileWarning className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Biên Bản Ghi Nhận Hàng Hóa Thừa - Thiếu - Hư Hỏng (OSD Report)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>In biên bản</span>
                </button>
                <button
                  onClick={() => setViewingOsd(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content Printable */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-slate-800 font-sans print:p-0">
              <div className="text-center space-y-1 border-b border-slate-200 pb-4">
                <h2 className="text-lg sm:text-xl font-bold uppercase text-slate-900">
                  BIÊN BẢN GHI NHẬN HÀNG HÓA THỪA - THIẾU - HƯ HỎNG
                </h2>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-widest">
                  OVERAGE - SHORTAGE - DAMAGE (OSD) REPORT
                </p>
                <div className="flex justify-center items-center gap-4 text-xs font-mono text-slate-500 pt-1">
                  <span>Số biên bản: <b>{viewingOsd.osdCode}</b></span>
                  <span>•</span>
                  <span>Ngày lập: <b>{viewingOsd.osdDate}</b></span>
                  <span>•</span>
                  <span>
                    Trạng thái: 
                    <b className={viewingOsd.status === 'open' ? ' text-amber-700' : ' text-emerald-700'}>
                      {viewingOsd.status === 'open' ? ' MỞ (Chưa xử lý)' : ' ĐÓNG (Đã xử lý)'}
                    </b>
                  </span>
                </div>
              </div>

              {/* Thông tin chung */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block">Phiếu nhập kho liên kết</span>
                  <span className="font-bold text-slate-800 font-mono">{viewingOsd.inboundReceiptCode}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block">Kho tiếp nhận</span>
                  <span className="font-semibold text-slate-800">{viewingOsd.warehouseName}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block">Đơn vị giao hàng / NCC</span>
                  <span className="font-semibold text-slate-800">{viewingOsd.supplier || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] block">Số Packing List / Shipment</span>
                  <span className="font-mono text-slate-800">
                    {viewingOsd.packingListNo || 'N/A'} / {viewingOsd.shipment || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Bảng kê vật tư OSD */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                  Danh Mục Vật Tư Thiết Bị Ghi Nhận Sự Cố OSD:
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                      <tr>
                        <th className="p-2.5 w-8 text-center">STT</th>
                        <th className="p-2.5 w-28">Mã vật tư</th>
                        <th className="p-2.5">Tên vật tư thiết bị</th>
                        <th className="p-2.5 w-14 text-center">ĐVT</th>
                        <th className="p-2.5 w-24">Số kiện</th>
                        <th className="p-2.5 w-16 text-right">SL Nhập</th>
                        <th className="p-2.5 w-24 text-center">Phân loại</th>
                        <th className="p-2.5 w-16 text-right">SL OSD</th>
                        <th className="p-2.5">Mô tả tình trạng &amp; Kiến nghị</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingOsd.items.map((it, i) => (
                        <tr key={it.id}>
                          <td className="p-2.5 text-center text-slate-400 font-mono">{i + 1}</td>
                          <td className="p-2.5 font-mono font-bold text-blue-700">{it.materialCode}</td>
                          <td className="p-2.5 font-medium">{it.materialName}</td>
                          <td className="p-2.5 text-center text-slate-600">{it.unit}</td>
                          <td className="p-2.5 font-mono">{it.packageNo}</td>
                          <td className="p-2.5 text-right font-mono">{it.inboundQuantity}</td>
                          <td className="p-2.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                it.osdType === 'damage'
                                  ? 'bg-orange-100 text-orange-800'
                                  : it.osdType === 'shortage'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {it.osdType === 'damage'
                                ? 'Hư hỏng'
                                : it.osdType === 'shortage'
                                  ? 'Thiếu'
                                  : 'Thừa'}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-rose-700">
                            {it.osdQuantity}
                          </td>
                          <td className="p-2.5 text-[11px]">
                            <div className="font-semibold text-slate-800">{it.defectDescription}</div>
                            {it.proposedAction && (
                              <div className="text-slate-500 italic mt-0.5">KN: {it.proposedAction}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* File đính kèm & Kết quả giải quyết */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {viewingOsd.pdfAttachment && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-4 h-4 text-rose-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-bold text-rose-900 block truncate">
                          {viewingOsd.pdfAttachment.fileName}
                        </span>
                        <span className="text-[10px] text-rose-700">
                          {Math.round(viewingOsd.pdfAttachment.fileSize / 1024)} KB - Biên bản scan đính kèm
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenPdf(viewingOsd.pdfAttachment, viewingOsd.id)}
                      disabled={loadingPdfId === viewingOsd.id}
                      className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 rounded-lg font-bold border border-rose-300 shadow-sm transition disabled:opacity-60 flex items-center gap-1"
                    >
                      {loadingPdfId === viewingOsd.id && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                      )}
                      <span>Xem PDF</span>
                    </button>
                  </div>
                )}

                {viewingOsd.resolutionNotes && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="font-bold text-slate-700 block uppercase text-[10px]">
                      Ghi chú kết quả xử lý:
                    </span>
                    <p className="text-slate-700 mt-1 italic">{viewingOsd.resolutionNotes}</p>
                    {viewingOsd.resolvedBy && (
                      <span className="text-[10px] text-slate-400 block mt-1">
                        Xác nhận bởi: {viewingOsd.resolvedBy} {viewingOsd.resolvedAt && `(${viewingOsd.resolvedAt.slice(0, 10)})`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Chữ ký các bên */}
              <div className="grid grid-cols-3 gap-6 pt-6 text-center text-xs">
                <div className="space-y-12">
                  <span className="font-bold text-slate-700 uppercase block">ĐẠI DIỆN BÊN GIAO HÀNG</span>
                  <span className="text-slate-400 text-[11px] italic block">(Ký và ghi rõ họ tên)</span>
                </div>
                <div className="space-y-12">
                  <span className="font-bold text-slate-700 uppercase block">THỦ KHO TIẾP NHẬN</span>
                  <span className="text-slate-400 text-[11px] italic block">(Ký và ghi rõ họ tên)</span>
                </div>
                <div className="space-y-12">
                  <span className="font-bold text-slate-700 uppercase block">NGƯỜI LẬP BIÊN BẢN</span>
                  <span className="text-slate-800 font-semibold text-[11px] block mt-12">{viewingOsd.createdBy}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL XEM TRỰC TIẾP FILE BIÊN BẢN .PDF */}
      {/* ========================================================================= */}
      {pdfPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-rose-600 shrink-0" />
                <span className="font-bold text-sm text-slate-900 truncate">
                  {pdfPreviewModal.fileName}
                </span>
                <span className="text-xs text-slate-400 shrink-0">
                  ({Math.round(pdfPreviewModal.fileSize / 1024)} KB)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={pdfPreviewModal.dataUrl}
                  download={pdfPreviewModal.fileName}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải PDF về</span>
                </a>
                <button
                  onClick={() => setPdfPreviewModal(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewer Body */}
            <div className="flex-1 p-2 bg-slate-100 flex items-center justify-center min-h-[500px]">
              <object
                data={pdfPreviewModal.dataUrl}
                type="application/pdf"
                className="w-full h-[76vh] rounded-xl border border-slate-300 shadow-inner bg-white"
              >
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    Trình duyệt không hỗ trợ hiển thị PDF trực tiếp trong khung này.
                  </p>
                  <a
                    href={pdfPreviewModal.dataUrl}
                    download={pdfPreviewModal.fileName}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                  >
                    <Download className="w-4 h-4" />
                    <span>Tải file PDF về máy</span>
                  </a>
                </div>
              </object>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL XÁC NHẬN XÓA BIÊN BẢN OSD */}
      {/* ========================================================================= */}
      {osdToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Xác Nhận Xóa Biên Bản OSD</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa biên bản OSD số{' '}
              <b className="font-mono text-slate-900">{osdToDelete.osdCode}</b> (gồm{' '}
              {osdToDelete.items.length} mục vật tư ảnh hưởng)?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOsdToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition"
              >
                Xóa Vĩnh Viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

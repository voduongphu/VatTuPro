import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { useAuth } from '../../context/AuthContext';
import { MaterialItem } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { exportToExcel, downloadMaterialTemplate } from '../../services/excelService';
import { 
  Package, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  X,
  FileSpreadsheet,
  Boxes,
  RefreshCw
} from 'lucide-react';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ExcelImportModal } from '../common/ExcelImportModal';
import { PaginationBar } from '../common/PaginationBar';

export const MaterialCatalog: React.FC = () => {
  const { isAdmin } = useAuth();
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Multi-selection states for deletion
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<MaterialItem | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('Bộ');
  const [category, setCategory] = useState('Đường ống công nghệ P&ID');
  const [packageNo, setPackageNo] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [unitWeightKg, setUnitWeightKg] = useState<number>(0);
  const [specification, setSpecification] = useState('');
  const [minStockAlert, setMinStockAlert] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadMaterials = () => {
    const list = StorageService.getMaterials();
    setMaterials(list);
  };

  useEffect(() => {
    StorageService.syncMaterialsFromReceipts({ emitMutation: true });
    loadMaterials();
    return StorageService.subscribe(loadMaterials);
  }, []);

  const openAddModal = () => {
    setCode(`VT-${Date.now().toString().slice(-4)}`);
    setName('');
    setUnit('Bộ');
    setCategory('Đường ống công nghệ P&ID');
    setPackageNo('');
    setManufacturer('');
    setSupplier('');
    setUnitWeightKg(0);
    setSpecification('');
    setMinStockAlert(2);
    setNotes('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (item: MaterialItem) => {
    setEditingItem(item);
    setCode(item.code);
    setName(item.name);
    setUnit(item.unit);
    setCategory(item.category || 'Chung');
    setPackageNo(item.packageNo || '');
    setManufacturer(item.manufacturer || '');
    setSupplier(item.supplier || '');
    setUnitWeightKg(item.unitWeightKg || 0);
    setSpecification(item.specification || '');
    setMinStockAlert(item.minStockAlert || 0);
    setNotes(item.notes || '');
    setFormError('');
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setFormError('Mã vật tư và tên vật tư không được để trống.');
      return;
    }

    if (materials.some(m => m.code.toLowerCase() === code.trim().toLowerCase())) {
      setFormError(`Mã vật tư "${code}" đã tồn tại. Vui lòng đặt mã khác.`);
      return;
    }

    StorageService.addMaterial({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      unit: unit.trim() || 'Bộ',
      category: category.trim(),
      packageNo: packageNo.trim(),
      manufacturer: manufacturer.trim(),
      supplier: supplier.trim(),
      unitWeightKg: Number(unitWeightKg) || 0,
      specification: specification.trim(),
      minStockAlert: Number(minStockAlert) || 0,
      notes: notes.trim()
    });

    loadMaterials();
    setIsAddModalOpen(false);
    showToast(`Đã thêm vật tư "${name}" vào danh mục thành công!`);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!name.trim()) {
      setFormError('Tên vật tư không được để trống.');
      return;
    }

    const cleanedNotes = notes.trim();
    const isUnchangedAutoNote =
      cleanedNotes === (editingItem.notes || '').trim() &&
      (cleanedNotes.startsWith('Đồng bộ từ ') || cleanedNotes.startsWith('Tự động tạo '));

    StorageService.updateMaterial(editingItem.id, {
      name: name.trim(),
      unit: unit.trim(),
      category: category.trim(),
      packageNo: packageNo.trim(),
      manufacturer: manufacturer.trim(),
      supplier: supplier.trim(),
      unitWeightKg: Number(unitWeightKg) || 0,
      specification: specification.trim(),
      minStockAlert: Number(minStockAlert) || 0,
      notes: isUnchangedAutoNote ? '' : cleanedNotes
    });

    loadMaterials();
    setEditingItem(null);
    showToast(`Đã cập nhật vật tư "${name}".`);
  };

  const handleSyncFromReceipts = () => {
    const res = StorageService.syncMaterialsFromReceipts({
      forceFromReceipts: true,
      emitMutation: true,
      notify: true
    });
    loadMaterials();
    if (res.added > 0 || res.updated > 0) {
      showToast(
        `Đã đồng bộ Danh mục vật tư từ Phiếu nhập & Phiếu xuất (Thêm mới: ${res.added}, Cập nhật mới nhất: ${res.updated})!`
      );
    } else {
      showToast('Danh mục vật tư đã được đồng bộ đầy đủ với dữ liệu mới nhất từ Phiếu nhập & Phiếu xuất.');
    }
  };

  const confirmDeleteMaterial = () => {
    if (!itemToDelete) return;
    StorageService.deleteMaterial(itemToDelete.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(itemToDelete.id);
      return next;
    });
    loadMaterials();
    showToast(`Đã xóa vật tư "${itemToDelete.name}" thành công!`);
    setItemToDelete(null);
  };

  const confirmDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const count = StorageService.deleteMaterials(Array.from(selectedIds));
    setSelectedIds(new Set());
    loadMaterials();
    showToast(`Đã xóa thành công ${count} vật tư đã chọn khỏi danh mục!`);
    setIsDeleteSelectedModalOpen(false);
  };

  const confirmDeleteAll = () => {
    const count = StorageService.deleteAllMaterials();
    setSelectedIds(new Set());
    loadMaterials();
    showToast(`Đã xóa toàn bộ ${count} vật tư trong danh mục thành công!`);
    setIsDeleteAllModalOpen(false);
  };

  const handleExcelImportSuccess = (importedItems: Partial<MaterialItem>[], _wh?: string, mode?: 'upsert' | 'skip') => {
    if (importedItems.length === 0) return;
    const { added, updated } = StorageService.importMaterials(importedItems, mode || 'upsert');
    loadMaterials();
    showToast(`Đã import thành công danh mục vật tư! Thêm mới: ${added}, Cập nhật: ${updated} vật tư.`);
  };

  const handleExportExcel = () => {
    const exportData = filtered.map(m => ({
      'Mã Vật Tư': m.code,
      'Tên Vật Tư Thiết Bị': m.name,
      'Đơn Vị Tính': m.unit,
      'Package No.': m.packageNo || 'N/A',
      'Hạng Mục': m.category,
      'Nhà Sản Xuất': m.manufacturer || 'N/A',
      'Nhà Cung Cấp': m.supplier || 'N/A',
      'Khối Lượng Tiêu Chuẩn (kg)': m.unitWeightKg || 0,
      'Quy Cách Thông Số': m.specification || '',
      'Tồn Kho Tối Thiểu': m.minStockAlert || 0,
      'Ghi Chú': m.notes || ''
    }));

    exportToExcel(exportData, `DanhMuc_VatTu_ThietBi_${new Date().toISOString().slice(0, 10)}`, 'DanhMuc_VatTu');
    showToast('Đã xuất danh mục vật tư ra file Excel!');
  };

  // Lấy danh sách hạng mục duy nhất để lọc (giới hạn 200 hạng mục trên dropdown để tránh lag DOM)
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < materials.length; i++) {
      const cat = materials[i].category;
      if (cat) {
        set.add(cat);
        if (set.size >= 200) break;
      }
    }
    return Array.from(set);
  }, [materials]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const filterByCat = selectedCategory !== 'all';
    if (!q && !filterByCat) return materials;

    const out: MaterialItem[] = [];
    for (let i = 0; i < materials.length; i++) {
      const m = materials[i];
      if (filterByCat && m.category !== selectedCategory) continue;
      if (q) {
        const hit =
          m.name.toLowerCase().includes(q) ||
          m.code.toLowerCase().includes(q) ||
          (m.packageNo ? m.packageNo.toLowerCase().includes(q) : false) ||
          (m.manufacturer ? m.manufacturer.toLowerCase().includes(q) : false) ||
          (m.supplier ? m.supplier.toLowerCase().includes(q) : false);
        if (!hit) continue;
      }
      out.push(m);
    }
    return out;
  }, [materials, deferredSearch, selectedCategory]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, selectedCategory]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const pagedMaterials = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  // Checkbox helpers (chỉ kiểm tra trên trang hiện tại O(pageSize) để không duyệt 100k dòng mỗi lần render)
  const toggleSelectItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllPageSelected = pagedMaterials.length > 0 && pagedMaterials.every(m => selectedIds.has(m.id));
  const isSomePageSelected = pagedMaterials.some(m => selectedIds.has(m.id)) && !isAllPageSelected;

  const toggleSelectCurrentPage = () => {
    if (isAllPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = 0; i < pagedMaterials.length; i++) {
          next.delete(pagedMaterials[i].id);
        }
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        for (let i = 0; i < pagedMaterials.length; i++) {
          next.add(pagedMaterials[i].id);
        }
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (let i = 0; i < filtered.length; i++) {
        next.add(filtered[i].id);
      }
      return next;
    });
  };

  const selectAllTotal = () => {
    setSelectedIds(new Set(materials.map(m => m.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border shadow-md animate-in slide-in-from-top-2 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Quản Lý Danh Mục Vật Tư & Thiết Bị</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Tự động đồng bộ thời gian thực từ Phiếu nhập kho & Phiếu xuất kho (trùng mã lấy dữ liệu mới nhất)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:flex-wrap w-full md:w-auto">
          {/* Nút đồng bộ từ Phiếu nhập & Phiếu xuất */}
          {isAdmin && (
            <button
              onClick={handleSyncFromReceipts}
              title="Đồng bộ và cập nhật dữ liệu mới nhất từ toàn bộ Phiếu nhập kho và Phiếu xuất kho"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold transition active:scale-95 min-h-[40px]"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Đồng Bộ Nhập/Xuất</span>
            </button>
          )}

          {/* Nút tải mẫu Excel */}
          <button
            onClick={downloadMaterialTemplate}
            title="Tải tệp Excel mẫu để chuẩn bị dữ liệu nhập danh mục"
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Tải Mẫu Excel</span>
          </button>

          {/* Nút Import Excel */}
          <button
            onClick={() => {
              if (!isAdmin) {
                showToast('Chỉ Quản trị viên (Admin) mới có quyền import danh mục vật tư.', 'error');
                return;
              }
              setIsExcelModalOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-sm transition active:scale-95 min-h-[40px]"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Import Excel</span>
          </button>

          {/* Nút Xuất Excel */}
          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Xuất Excel</span>
          </button>

          {/* Nút Xóa các mục đã chọn */}
          {isAdmin && selectedIds.size > 0 && (
            <button
              onClick={() => setIsDeleteSelectedModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 sm:py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-600/20 transition active:scale-95 animate-in fade-in min-h-[40px]"
              title="Xóa các vật tư đã chọn theo checkbox"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Xóa ({selectedIds.size})</span>
            </button>
          )}

          {/* Nút Xóa toàn bộ danh mục */}
          {isAdmin && materials.length > 0 && (
            <button
              onClick={() => setIsDeleteAllModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition min-h-[40px]"
              title="Xóa toàn bộ vật tư trong danh mục"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span>Xóa Toàn Bộ</span>
            </button>
          )}

          {isAdmin ? (
            <button
              onClick={openAddModal}
              className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs shadow-md shadow-blue-500/20 transition active:scale-95 min-h-[40px]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Thêm Vật Tư Mới</span>
            </button>
          ) : (
            <div className="col-span-2 sm:col-span-1 text-xs bg-amber-50 text-amber-800 px-3 py-2 rounded-lg border border-amber-200 flex items-center justify-center gap-1.5 min-h-[40px]">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Quyền Admin quản lý</span>
            </div>
          )}
        </div>
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo mã VT, tên thiết bị, Package No., NSX, NCC..."
            className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-3" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-medium text-slate-500 whitespace-nowrap">Hạng mục:</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="flex-1 sm:flex-initial px-3 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          >
            <option value="all">Tất cả hạng mục ({materials.length.toLocaleString('vi-VN')})</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Banner thao tác khi chọn nhiều vật tư */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50/90 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="min-w-8 px-2 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-inner">
              {selectedIds.size.toLocaleString('vi-VN')}
            </div>
            <div>
              <div className="text-sm font-bold text-blue-950 flex items-center gap-2">
                <span>Đã chọn {selectedIds.size.toLocaleString('vi-VN')} / {materials.length.toLocaleString('vi-VN')} vật tư</span>
                <span className="text-xs font-normal text-blue-600 bg-blue-100/70 px-2 py-0.5 rounded-full">
                  {selectedIds.size === materials.length ? 'Đã chọn tất cả' : `${filtered.length.toLocaleString('vi-VN')} kết quả lọc`}
                </span>
              </div>
              <div className="text-xs text-blue-700">
                Thao tác xóa sẽ loại bỏ các vật tư đã đánh dấu khỏi danh mục hệ thống.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {filtered.length < materials.length && selectedIds.size < filtered.length && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold transition"
              >
                Chọn kết quả lọc ({filtered.length.toLocaleString('vi-VN')})
              </button>
            )}

            {selectedIds.size < materials.length && (
              <button
                type="button"
                onClick={selectAllTotal}
                className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold transition"
              >
                Chọn toàn bộ ({materials.length.toLocaleString('vi-VN')})
              </button>
            )}

            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition"
            >
              Bỏ chọn
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setIsDeleteSelectedModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa {selectedIds.size.toLocaleString('vi-VN')} mục đã chọn</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Materials Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="w-12 px-4 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={isAllPageSelected}
                    ref={el => {
                      if (el) el.indeterminate = isSomePageSelected;
                    }}
                    onChange={toggleSelectCurrentPage}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                    title={isAllPageSelected ? "Bỏ chọn các dòng trên trang này" : "Chọn tất cả các dòng trên trang này"}
                  />
                </th>
                <th className="px-5 py-3.5">Mã & Tên Vật Tư Thiết Bị</th>
                <th className="px-5 py-3.5">Hạng Mục</th>
                <th className="px-5 py-3.5">Package No.</th>
                <th className="px-5 py-3.5">Nhà Sản Xuất & Cung Cấp</th>
                <th className="px-5 py-3.5 text-center">ĐVT</th>
                <th className="px-5 py-3.5 text-right">Khối Lượng ĐV (kg)</th>
                <th className="px-5 py-3.5 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedMaterials.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    Không có vật tư nào khớp với từ khóa tìm kiếm.
                  </td>
                </tr>
              ) : (
                pagedMaterials.map(m => (
                  <tr key={m.id} className={`hover:bg-slate-50/60 transition ${selectedIds.has(m.id) ? 'bg-blue-50/40' : ''}`}>
                    <td className="w-12 px-4 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onChange={() => toggleSelectItem(m.id)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        title={`Chọn vật tư ${m.code}`}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/70 inline-block mb-1">
                          {m.code}
                        </span>
                        <div className="font-semibold text-slate-900 text-sm leading-snug">{m.name}</div>
                        {m.specification && (
                          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            Quy cách: {m.specification}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="inline-block bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-md border border-slate-200">
                        {m.category || 'Chung'}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {m.packageNo ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-mono text-xs font-semibold">
                          <Boxes className="w-3.5 h-3.5 shrink-0" />
                          <span>{m.packageNo}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">N/A</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="text-xs space-y-0.5">
                        <div className="font-medium text-slate-800">
                          NSX: <span className="text-slate-900 font-semibold">{m.manufacturer || 'N/A'}</span>
                        </div>
                        <div className="text-slate-500">
                          NCC: <span>{m.supplier || 'N/A'}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 text-center">
                      <span className="bg-slate-50 font-medium px-2 py-1 rounded border border-slate-200 text-xs text-slate-700">
                        {m.unit}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right font-mono font-medium text-slate-800">
                      {m.unitWeightKg?.toLocaleString('vi-VN')} kg
                    </td>

                    <td className="px-5 py-4 text-right">
                      {isAdmin ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(m)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                            title="Chỉnh sửa vật tư"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setItemToDelete(m)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition"
                            title="Xóa khỏi danh mục"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Chỉ xem</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          currentPage={safePage}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[50, 100, 200]}
          itemLabel="vật tư"
        />
      </div>

      {/* Modal Thêm Vật Tư */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">Thêm Vật Tư / Thiết Bị Mới</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Mã vật tư (*)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ví dụ: TB-VAL-200H"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono font-medium"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Đơn vị tính (*)</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="Bộ, Cái, Cây, Tủ, Tấn, Mét..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Tên vật tư thiết bị (*)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ví dụ: Van cầu áp lực cao Class 600 DN200"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Hạng mục</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Đường ống P&ID, Kết cấu thép, Điện..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Package No.</label>
                  <input
                    type="text"
                    value={packageNo}
                    onChange={(e) => setPackageNo(e.target.value)}
                    placeholder="ví dụ: PKG-01/15, BOX-03/08..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nhà sản xuất</label>
                  <input
                    type="text"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="Kitz Corp, Siemens, Posco..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nhà cung cấp</label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder="PetroSteel, Hòa Phát..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Khối lượng đơn vị (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={unitWeightKg}
                    onChange={(e) => setUnitWeightKg(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Cảnh báo tồn tối thiểu</label>
                  <input
                    type="number"
                    value={minStockAlert}
                    onChange={(e) => setMinStockAlert(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Quy cách kỹ thuật / Tiêu chuẩn</label>
                <textarea
                  rows={2}
                  value={specification}
                  onChange={(e) => setSpecification(e.target.value)}
                  placeholder="Vật liệu, tiêu chuẩn ASTM/ASME/JIS, kích thước..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu Vật Tư Mới
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Sửa Vật Tư */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">Sửa Vật Tư: {editingItem.code}</h3>
              </div>
              <button onClick={() => setEditingItem(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Tên vật tư thiết bị (*)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Đơn vị tính</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Hạng mục</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Package No.</label>
                  <input
                    type="text"
                    value={packageNo}
                    onChange={(e) => setPackageNo(e.target.value)}
                    placeholder="ví dụ: PKG-01/15, BOX-03/08..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Khối lượng đơn vị (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={unitWeightKg}
                    onChange={(e) => setUnitWeightKg(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nhà sản xuất</label>
                  <input
                    type="text"
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nhà cung cấp</label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Quy cách kỹ thuật</label>
                <textarea
                  rows={2}
                  value={specification}
                  onChange={(e) => setSpecification(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu Cập Nhật
                </button>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa 1 Vật Tư */}
      <ConfirmDeleteModal
        isOpen={Boolean(itemToDelete)}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDeleteMaterial}
        title="Xác Nhận Xóa Vật Tư Khỏi Danh Mục"
        itemName={itemToDelete ? `${itemToDelete.name} (${itemToDelete.code})` : ''}
        itemType="vật tư thiết bị"
        warningText="Vật tư này sẽ bị xóa khỏi danh mục chính của hệ thống. Bạn có chắc chắn muốn xóa không?"
      />

      {/* Modal Xác Nhận Xóa Các Vật Tư Đã Chọn */}
      <ConfirmDeleteModal
        isOpen={isDeleteSelectedModalOpen}
        onClose={() => setIsDeleteSelectedModalOpen(false)}
        onConfirm={confirmDeleteSelected}
        title="Xác Nhận Xóa Các Vật Tư Đã Chọn"
        itemName={`${selectedIds.size} vật tư được chọn bằng checkbox`}
        itemType="các vật tư đã chọn"
        warningText={`CẢNH BÁO: Bạn đang thực hiện xóa ${selectedIds.size} vật tư khỏi danh mục hệ thống. Thao tác này không thể hoàn tác.`}
      />

      {/* Modal Xác Nhận Xóa Toàn Bộ Danh Mục */}
      <ConfirmDeleteModal
        isOpen={isDeleteAllModalOpen}
        onClose={() => setIsDeleteAllModalOpen(false)}
        onConfirm={confirmDeleteAll}
        title="Xác Nhận XÓA TOÀN BỘ Danh Mục Vật Tư"
        itemName={`Toàn bộ ${materials.length} vật tư & thiết bị trong hệ thống`}
        itemType="toàn bộ danh mục vật tư"
        warningText="CẢNH BÁO NGUY HIỂM: Toàn bộ danh mục vật tư trong cơ sở dữ liệu sẽ bị xóa hoàn toàn. Bạn có chắc chắn muốn xóa tất cả không?"
      />

      {/* Modal Import Excel Danh Mục Vật Tư */}
      <ExcelImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        type="materials"
        onImportSuccess={handleExcelImportSuccess}
      />
    </div>
  );
};

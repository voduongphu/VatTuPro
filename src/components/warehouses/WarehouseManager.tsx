import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Warehouse } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { 
  Warehouse as WarehouseIcon, 
  Plus, 
  Edit3, 
  Trash2, 
  Search, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  X,
  Layers,
  Scale
} from 'lucide-react';

import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';

export const WarehouseManager: React.FC = () => {
  const { isAdmin } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);
  const [warehouseToDelete, setWarehouseToDelete] = useState<Warehouse | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<Warehouse['type']>('covered');
  const [capacityAreaM2, setCapacityAreaM2] = useState<number>(5000);
  const [capacityTons, setCapacityTons] = useState<number>(10000);
  const [keeperName, setKeeperName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<Warehouse['status']>('active');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadWarehouses = () => {
    const list = StorageService.getWarehouses();
    setWarehouses(list);
  };

  useEffect(() => {
    loadWarehouses();
    return StorageService.subscribe(loadWarehouses);
  }, []);

  const openAddModal = () => {
    setCode(`KB-${Date.now().toString().slice(-4)}`);
    setName('');
    setLocation('');
    setType('covered');
    setCapacityAreaM2(10000);
    setCapacityTons(15000);
    setKeeperName('Võ Dương Phú');
    setPhone('');
    setStatus('active');
    setNotes('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (wh: Warehouse) => {
    setEditingWh(wh);
    setCode(wh.code);
    setName(wh.name);
    setLocation(wh.location);
    setType(wh.type);
    setCapacityAreaM2(wh.capacityAreaM2 || 0);
    setCapacityTons(wh.capacityTons || 0);
    setKeeperName(wh.keeperName || '');
    setPhone(wh.phone || '');
    setStatus(wh.status);
    setNotes(wh.notes || '');
    setFormError('');
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      setFormError('Mã kho và Tên kho bãi là bắt buộc.');
      return;
    }

    if (warehouses.some(w => w.code.toLowerCase() === code.trim().toLowerCase())) {
      setFormError(`Mã kho "${code}" đã tồn tại. Vui lòng chọn mã khác.`);
      return;
    }

    StorageService.addWarehouse({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      location: location.trim(),
      type,
      capacityAreaM2: Number(capacityAreaM2) || 0,
      capacityTons: Number(capacityTons) || 0,
      keeperName: keeperName.trim(),
      phone: phone.trim(),
      status,
      notes: notes.trim()
    });

    loadWarehouses();
    setIsAddModalOpen(false);
    showToast(`Đã thêm kho bãi "${name}" thành công!`);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWh) return;
    if (!name.trim()) {
      setFormError('Tên kho bãi không được để trống.');
      return;
    }

    StorageService.updateWarehouse(editingWh.id, {
      name: name.trim(),
      location: location.trim(),
      type,
      capacityAreaM2: Number(capacityAreaM2) || 0,
      capacityTons: Number(capacityTons) || 0,
      keeperName: keeperName.trim(),
      phone: phone.trim(),
      status,
      notes: notes.trim()
    });

    loadWarehouses();
    setEditingWh(null);
    showToast(`Đã cập nhật kho bãi "${name}".`);
  };

  const handleDelete = (wh: Warehouse) => {
    setWarehouseToDelete(wh);
  };

  const confirmDeleteWarehouse = () => {
    if (!warehouseToDelete) return;
    StorageService.deleteWarehouse(warehouseToDelete.id);
    loadWarehouses();
    showToast(`Đã xóa kho bãi "${warehouseToDelete.name}" thành công!`);
    setWarehouseToDelete(null);
  };

  const filtered = warehouses.filter(w => {
    const matchSearch = 
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.keeperName && w.keeperName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchType = filterType === 'all' || w.type === filterType;
    return matchSearch && matchType;
  });

  const getTypeName = (t: Warehouse['type']) => {
    switch (t) {
      case 'covered': return 'Kho kín tiêu chuẩn';
      case 'open_yard': return 'Bãi ngoài trời';
      case 'specialized': return 'Kho kỹ thuật / Chuyên dụng';
      case 'transit': return 'Bãi trung chuyển';
      default: return t;
    }
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
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl shrink-0">
            <WarehouseIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Quản Lý Danh Mục Kho Bãi</h1>
            <p className="text-slate-500 text-xs mt-0.5">Quản lý hệ thống kho bãi lưu trữ vật tư, bãi cảng hàng nặng, diện tích & sức chứa</p>
          </div>
        </div>

        {isAdmin ? (
          <button
            onClick={openAddModal}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-md shadow-blue-500/20 transition active:scale-95 min-h-[42px]"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Thêm Kho Bãi Mới</span>
          </button>
        ) : (
          <div className="text-xs bg-amber-50 text-amber-800 px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Chỉ quyền Admin mới có thể thêm/sửa/xóa kho bãi</span>
          </div>
        )}
      </div>

      {/* Filter and stats */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo mã kho, tên kho, địa điểm, thủ kho..."
            className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-3" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-medium text-slate-500 whitespace-nowrap">Loại hình:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 sm:flex-initial px-3 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          >
            <option value="all">Tất cả kho bãi ({warehouses.length})</option>
            <option value="covered">Kho kín tiêu chuẩn</option>
            <option value="open_yard">Bãi ngoài trời</option>
            <option value="specialized">Kho chuyên dụng / điều hòa</option>
            <option value="transit">Bãi trung chuyển</option>
          </select>
        </div>
      </div>

      {/* Warehouses Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(w => (
          <div key={w.id} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-slate-100 text-slate-700 font-mono font-bold text-xs border border-slate-200">
                    {w.code}
                  </div>
                  <h3 className="font-bold text-slate-900 text-base leading-snug">{w.name}</h3>
                </div>

                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  w.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  w.status === 'full' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                  'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {w.status === 'active' ? 'Hoạt động' : w.status === 'full' ? 'Đầy tải' : 'Bảo trì'}
                </span>
              </div>

              <div className="mt-3 text-xs text-slate-500 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{w.location || 'Chưa cập nhật địa chỉ'}</span>
              </div>

              {/* Specs */}
              <div className="grid grid-cols-2 gap-2 mt-4 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Diện tích mặt bằng:
                  </span>
                  <span className="font-semibold text-slate-800">
                    {w.capacityAreaM2?.toLocaleString('vi-VN')} m²
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block flex items-center gap-1">
                    <Scale className="w-3 h-3" /> Sức chứa tải trọng:
                  </span>
                  <span className="font-semibold text-slate-800">
                    {w.capacityTons?.toLocaleString('vi-VN')} Tấn
                  </span>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-600 flex items-center justify-between">
                <span>Loại: <strong className="text-slate-800">{getTypeName(w.type)}</strong></span>
                <span>Thủ kho: <strong className="text-blue-700">{w.keeperName || 'N/A'}</strong></span>
              </div>

              {w.notes && (
                <div className="mt-2 text-[11px] text-slate-500 bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
                  <span className="font-semibold text-slate-600">Ghi chú:</span> {w.notes}
                </div>
              )}
            </div>

            {/* Actions for Admin */}
            <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              {isAdmin ? (
                <>
                  <button
                    onClick={() => openEditModal(w)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Sửa</span>
                  </button>
                  <button
                    onClick={() => handleDelete(w)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa</span>
                  </button>
                </>
              ) : (
                <span className="text-xs text-slate-400 italic">Chỉ xem dữ liệu</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Thêm Kho Bãi */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0">
                  <WarehouseIcon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">Thêm Kho Bãi Mới</h3>
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
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Mã kho (*)</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ví dụ: KB-CATLAI-02"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Loại hình</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="covered">Kho kín tiêu chuẩn</option>
                    <option value="open_yard">Bãi ngoài trời</option>
                    <option value="specialized">Kho chuyên dụng / Điều hòa</option>
                    <option value="transit">Bãi trung chuyển</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Tên kho bãi (*)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ví dụ: Kho Tổng Cát Lái 2"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Địa điểm / Vị trí</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Địa chỉ, phân khu..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Diện tích (m²)</label>
                  <input
                    type="number"
                    value={capacityAreaM2}
                    onChange={(e) => setCapacityAreaM2(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Sức chứa (Tấn)</label>
                  <input
                    type="number"
                    value={capacityTons}
                    onChange={(e) => setCapacityTons(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Thủ kho phụ trách</label>
                  <input
                    type="text"
                    value={keeperName}
                    onChange={(e) => setKeeperName(e.target.value)}
                    placeholder="ví dụ: Võ Dương Phú"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Trạng thái kho</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="active">Đang hoạt động</option>
                    <option value="full">Đã đầy hàng</option>
                    <option value="maintenance">Đang bảo trì / Nâng cấp</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Ghi chú thêm</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú về thiết bị nâng hạ, cầu trục, tiêu chuẩn PCCC..."
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu Kho Bãi Mới
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

      {/* Modal Sửa Kho Bãi */}
      {editingWh && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">Sửa Kho Bãi: {editingWh.code}</h3>
              </div>
              <button onClick={() => setEditingWh(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Tên kho bãi (*)</label>
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
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Loại hình</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="covered">Kho kín tiêu chuẩn</option>
                    <option value="open_yard">Bãi ngoài trời</option>
                    <option value="specialized">Kho chuyên dụng / Điều hòa</option>
                    <option value="transit">Bãi trung chuyển</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Trạng thái</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="active">Đang hoạt động</option>
                    <option value="full">Đầy tải</option>
                    <option value="maintenance">Bảo trì</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Địa điểm</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Diện tích (m²)</label>
                  <input
                    type="number"
                    value={capacityAreaM2}
                    onChange={(e) => setCapacityAreaM2(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Sức chứa (Tấn)</label>
                  <input
                    type="number"
                    value={capacityTons}
                    onChange={(e) => setCapacityTons(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Thủ kho phụ trách</label>
                <input
                  type="text"
                  value={keeperName}
                  onChange={(e) => setKeeperName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Ghi chú</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  onClick={() => setEditingWh(null)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Kho Bãi */}
      <ConfirmDeleteModal
        isOpen={Boolean(warehouseToDelete)}
        onClose={() => setWarehouseToDelete(null)}
        onConfirm={confirmDeleteWarehouse}
        title="Xác Nhận Xóa Kho Bãi"
        itemName={warehouseToDelete ? `${warehouseToDelete.name} (${warehouseToDelete.code})` : ''}
        itemType="kho bãi lưu trữ"
        warningText="Kho bãi này sẽ bị xóa khỏi danh sách. Bạn có chắc chắn muốn xóa không?"
      />
    </div>
  );
};

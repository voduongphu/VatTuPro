import React, { useMemo, useState } from 'react';
import {
  Warehouse as WarehouseIcon,
  Plus,
  Edit2,
  Trash2,
  Search,
  MapPin,
  Phone,
  UserCheck,
  Boxes,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  X,
  Building2,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { Warehouse } from '../types/inventory';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

interface WarehouseManagementViewProps {
  onNavigateToInventoryWithWarehouse?: (warehouseId: string) => void;
}

export const WarehouseManagementView: React.FC<WarehouseManagementViewProps> = ({
  onNavigateToInventoryWithWarehouse,
}) => {
  const {
    warehouses,
    items,
    transactions,
    currentUser,
    users,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    updateFilter,
  } = useInventory();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  // Form Fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [manager, setManager] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [formError, setFormError] = useState('');

  // Delete State
  const [warehouseToDelete, setWarehouseToDelete] = useState<Warehouse | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  // Warehouse Statistics Map
  const warehouseStats = useMemo(() => {
    const stats: Record<
      string,
      {
        itemCount: number;
        totalStock: number;
        totalValue: number;
        receiptCount: number;
        issueCount: number;
      }
    > = {};

    warehouses.forEach(wh => {
      stats[wh.id] = {
        itemCount: 0,
        totalStock: 0,
        totalValue: 0,
        receiptCount: 0,
        issueCount: 0,
      };
    });

    items.forEach(item => {
      if (stats[item.warehouseId]) {
        stats[item.warehouseId].itemCount += 1;
        stats[item.warehouseId].totalStock += item.currentStock;
        stats[item.warehouseId].totalValue += item.currentStock * item.unitPrice;
      }
    });

    transactions.forEach(t => {
      if (stats[t.warehouseId]) {
        if (t.type === 'NHAP_KHO') {
          stats[t.warehouseId].receiptCount += 1;
        } else {
          stats[t.warehouseId].issueCount += 1;
        }
      }
    });

    return stats;
  }, [warehouses, items, transactions]);

  // Overall KPIs
  const overallKPIs = useMemo(() => {
    let totalItems = 0;
    let totalStock = 0;
    let totalVal = 0;
    let activeWhCount = 0;

    warehouses.forEach(w => {
      if (w.status !== 'INACTIVE') activeWhCount++;
      const s = warehouseStats[w.id];
      if (s) {
        totalItems += s.itemCount;
        totalStock += s.totalStock;
        totalVal += s.totalValue;
      }
    });

    return {
      totalWarehouses: warehouses.length,
      activeWarehouses: activeWhCount,
      totalItems,
      totalStock,
      totalVal,
    };
  }, [warehouses, warehouseStats]);

  // Filtered warehouses
  const filteredWarehouses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return warehouses.filter(w => {
      const matchSearch =
        !q ||
        w.code.toLowerCase().includes(q) ||
        w.name.toLowerCase().includes(q) ||
        w.address.toLowerCase().includes(q) ||
        w.manager.toLowerCase().includes(q) ||
        (w.description && w.description.toLowerCase().includes(q));

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && w.status !== 'INACTIVE') ||
        (statusFilter === 'INACTIVE' && w.status === 'INACTIVE');

      return matchSearch && matchStatus;
    });
  }, [warehouses, searchQuery, statusFilter]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingWarehouse(null);
    setCode('');
    setName('');
    setAddress('');
    setManager('');
    setPhone('');
    setDescription('');
    setStatus('ACTIVE');
    setFormError('');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (w: Warehouse) => {
    setEditingWarehouse(w);
    setCode(w.code);
    setName(w.name);
    setAddress(w.address);
    setManager(w.manager);
    setPhone(w.phone || '');
    setDescription(w.description || '');
    setStatus(w.status || 'ACTIVE');
    setFormError('');
    setIsModalOpen(true);
  };

  // Submit Modal
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!code.trim()) {
      setFormError('Vui lòng nhập mã ký hiệu kho (ví dụ: KHO-DN).');
      return;
    }
    if (!name.trim()) {
      setFormError('Vui lòng nhập tên đầy đủ của kho hàng.');
      return;
    }
    if (!address.trim()) {
      setFormError('Vui lòng nhập địa chỉ vị trí kho.');
      return;
    }
    if (!manager.trim()) {
      setFormError('Vui lòng nhập tên thủ kho hoặc người phụ trách kho.');
      return;
    }

    if (editingWarehouse) {
      const res = updateWarehouse(editingWarehouse.id, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        address: address.trim(),
        manager: manager.trim(),
        phone: phone.trim() || undefined,
        description: description.trim() || undefined,
        status,
      });

      if (!res.success) {
        setFormError(res.error || 'Có lỗi xảy ra khi cập nhật kho.');
        return;
      }

      setNotification({
        text: `Đã cập nhật kho "${name.trim()}" (${code.trim().toUpperCase()}) thành công.`,
        type: 'success',
      });
    } else {
      const res = addWarehouse({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        address: address.trim(),
        manager: manager.trim(),
        phone: phone.trim() || undefined,
        description: description.trim() || undefined,
        status,
      });

      if (!res.success) {
        setFormError(res.error || 'Có lỗi xảy ra khi tạo mới kho.');
        return;
      }

      setNotification({
        text: `Đã thêm mới kho "${name.trim()}" (${code.trim().toUpperCase()}) thành công.`,
        type: 'success',
      });
    }

    setIsModalOpen(false);
  };

  // Handle Delete Request
  const handleRequestDelete = (w: Warehouse) => {
    if (!isAdmin) {
      setNotification({
        text: 'Chỉ Quản trị viên (Admin) mới có quyền xóa kho hàng.',
        type: 'error',
      });
      return;
    }
    setWarehouseToDelete(w);
  };

  // Confirm Delete
  const handleConfirmDelete = () => {
    if (!warehouseToDelete) return;

    const res = deleteWarehouse(warehouseToDelete.id);
    if (res.success) {
      setNotification({
        text: `Đã xóa kho "${warehouseToDelete.name}" thành công.`,
        type: 'success',
      });
    } else {
      setNotification({
        text: res.error || 'Không thể xóa kho hàng.',
        type: 'error',
      });
    }
    setWarehouseToDelete(null);
  };

  // View items of this warehouse
  const handleViewWarehouseItems = (whId: string) => {
    updateFilter('warehouses', [whId]);
    if (onNavigateToInventoryWithWarehouse) {
      onNavigateToInventoryWithWarehouse(whId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <span>Quản Lý Danh Mục Kho Hàng</span>
            <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {warehouses.length} kho lưu trữ
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Hệ thống danh mục các kho bãi, địa chỉ giao nhận, phân công thủ kho phụ trách và thống kê giá trị lưu kho
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm kho mới</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Chỉ Admin được Thêm/Sửa/Xóa</span>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-black/5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Tổng số kho</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {overallKPIs.totalWarehouses}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-1">
            {overallKPIs.activeWarehouses} kho đang hoạt động
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Mặt hàng lưu trữ</span>
            <Boxes className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {overallKPIs.totalItems}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Tổng {formatNumber(overallKPIs.totalStock)} đơn vị vật tư
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Tổng giá trị tồn kho</span>
            <DollarSign className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 tabular-nums truncate" title={formatCurrency(overallKPIs.totalVal)}>
            {formatCurrency(overallKPIs.totalVal)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Quy mô tài sản lưu động
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Quyền hạn Admin</span>
            <ShieldAlert className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xs font-semibold text-slate-800 mt-1">
            {isAdmin ? 'Được phép cấu hình' : 'Chỉ xem thống kê'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Thêm &bull; Sửa &bull; Xóa an toàn
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã kho, tên kho, địa chỉ, thủ kho..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto self-end">
          <span className="text-xs text-slate-500 font-medium">Trạng thái:</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Tất cả ({warehouses.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                statusFilter === 'ACTIVE'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Hoạt động ({overallKPIs.activeWarehouses})
            </button>
            <button
              onClick={() => setStatusFilter('INACTIVE')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                statusFilter === 'INACTIVE'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Tạm ngưng ({warehouses.length - overallKPIs.activeWarehouses})
            </button>
          </div>
        </div>
      </div>

      {/* Warehouse Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredWarehouses.map(w => {
          const stats = warehouseStats[w.id] || {
            itemCount: 0,
            totalStock: 0,
            totalValue: 0,
            receiptCount: 0,
            issueCount: 0,
          };
          const isActive = w.status !== 'INACTIVE';

          return (
            <div
              key={w.id}
              className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-xs transition-all overflow-hidden flex flex-col"
            >
              {/* Card Header */}
              <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
                        {w.code}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-1 leading-snug">
                      {w.name}
                    </h3>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleOpenEdit(w)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="Chỉnh sửa thông tin kho (Admin)"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRequestDelete(w)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Xóa kho hàng (Admin)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2 text-xs text-slate-600">
                  {/* Address */}
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-slate-700 leading-relaxed">{w.address}</span>
                  </div>

                  {/* Manager */}
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-medium text-slate-800">
                      Thủ kho: {w.manager}
                    </span>
                    {w.phone && (
                      <span className="text-slate-400 flex items-center gap-1">
                        &bull; <Phone className="w-3 h-3 inline" /> {w.phone}
                      </span>
                    )}
                  </div>

                  {/* Description if any */}
                  {w.description && (
                    <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                      &ldquo;{w.description}&rdquo;
                    </div>
                  )}
                </div>

                {/* Inventory Stock Stats Strip */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="grid grid-cols-3 gap-2 bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 text-center text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                        Số mặt hàng
                      </div>
                      <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                        {stats.itemCount} SKU
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                        Tổng số lượng
                      </div>
                      <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                        {formatNumber(stats.totalStock)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                        Giá trị tồn kho
                      </div>
                      <div className="font-bold text-indigo-700 tabular-nums mt-0.5 truncate" title={formatCurrency(stats.totalValue)}>
                        {formatCurrency(stats.totalValue)}
                      </div>
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="flex items-center justify-between mt-3 text-xs">
                    <span className="text-[11px] text-slate-400">
                      Lịch sử: <strong>{stats.receiptCount}</strong> phiếu nhập &bull; <strong>{stats.issueCount}</strong> phiếu xuất
                    </span>

                    <button
                      onClick={() => handleViewWarehouseItems(w.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                    >
                      <span>Xem vật tư kho này</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredWarehouses.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded-xl border border-slate-200 p-8">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-slate-700">
              Không tìm thấy kho hàng nào phù hợp
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Thử tìm kiếm với từ khóa khác hoặc thiết lập lại bộ lọc trạng thái.
            </p>
          </div>
        )}
      </div>

      {/* Modal Add / Edit Warehouse */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingWarehouse ? 'Chỉnh Sửa Thông Tin Kho' : 'Thêm Danh Mục Kho Mới'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {editingWarehouse ? `Cập nhật thông số kho ${editingWarehouse.code}` : 'Thiết lập kho lưu trữ vật tư và phân công quản lý'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Warehouse Code */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mã ký hiệu kho <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="VD: KHO-DN"
                    className="w-full px-3 py-2 text-xs font-mono uppercase bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white"
                    required
                  />
                  <span className="text-[10px] text-slate-400">Viết hoa không dấu</span>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trạng thái hoạt động
                  </label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white"
                  >
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="INACTIVE">Tạm dừng tiếp nhận</option>
                  </select>
                </div>
              </div>

              {/* Warehouse Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên đầy đủ của kho <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="VD: Kho Vật Tư Dự Án Đà Nẵng"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white"
                  required
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Địa chỉ vị trí kho <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="VD: Đường số 3, KCN Hòa Khánh, Q. Liên Chiểu, TP. Đà Nẵng"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Manager */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Thủ kho phụ trách <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={manager}
                    onChange={e => setManager(e.target.value)}
                    placeholder="VD: Nguyễn Văn A"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white"
                    required
                  />
                  {/* Quick autofill from existing stockkeepers */}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {users
                      .filter(u => u.role === 'THU_KHO' || u.role === 'ADMIN')
                      .slice(0, 3)
                      .map(u => (
                        <button
                          type="button"
                          key={u.id}
                          onClick={() => {
                            setManager(u.fullName);
                            if (u.phone) setPhone(u.phone);
                          }}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded cursor-pointer"
                        >
                          + {u.fullName}
                        </button>
                      ))}
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Số điện thoại liên hệ
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="VD: 0912.345.678"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mô tả / Ghi chú đặc thù
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ghi chú về diện tích, điều kiện bảo quản, tải trọng sàn, xe cẩu vào được..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 focus:bg-white"
                />
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  {editingWarehouse ? 'Lưu cập nhật' : 'Tạo kho mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {warehouseToDelete && (
        <ConfirmDeleteModal
          isOpen={!!warehouseToDelete}
          title="Xác nhận xóa kho hàng"
          message={`Bạn có chắc chắn muốn xóa kho "${warehouseToDelete.name}" (${warehouseToDelete.code}) khỏi danh mục hệ thống?`}
          itemDetails={[
            { label: 'Mã kho', value: warehouseToDelete.code },
            { label: 'Tên kho', value: warehouseToDelete.name },
            { label: 'Thủ kho phụ trách', value: warehouseToDelete.manager },
            {
              label: 'Số mặt hàng hiện tại',
              value: `${warehouseStats[warehouseToDelete.id]?.itemCount || 0} mặt hàng`,
            },
            {
              label: 'Chứng từ liên quan',
              value: `${(warehouseStats[warehouseToDelete.id]?.receiptCount || 0) + (warehouseStats[warehouseToDelete.id]?.issueCount || 0)} chứng từ`,
            },
          ]}
          warningNote={
            (warehouseStats[warehouseToDelete.id]?.itemCount || 0) > 0 ||
            (warehouseStats[warehouseToDelete.id]?.receiptCount || 0) +
              (warehouseStats[warehouseToDelete.id]?.issueCount || 0) >
              0
              ? 'Lưu ý: Kho đang có dữ liệu hàng hóa hoặc chứng từ lịch sử. Hệ thống sẽ từ chối xóa để bảo vệ an toàn sổ sách kế toán.'
              : 'Thao tác xóa không thể hoàn tác nếu đã xác nhận.'
          }
          confirmLabel="Xóa kho hàng"
          onConfirm={handleConfirmDelete}
          onClose={() => setWarehouseToDelete(null)}
        />
      )}
    </div>
  );
};

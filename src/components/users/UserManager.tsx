import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, UserRole } from '../../types/inventory';
import {
  Users,
  UserPlus,
  ShieldAlert,
  Trash2,
  Edit3,
  Search,
  CheckCircle2,
  X,
  ShieldCheck,
  UserCog,
  Building2,
  Phone,
  Mail,
  Lock,
  Unlock,
  Cloud,
  CloudUpload,
  RefreshCw
} from 'lucide-react';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  computeEmailAuthDigest,
  isBootstrappedAdminUser,
  normUserKey
} from '../../utils/additiveMerge';
import { SyncService } from '../../services/syncService';

export const UserManager: React.FC = () => {
  const { users, isAdmin, addUser, updateUser, deleteUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudState, setCloudState] = useState(() => SyncService.getCloudState());

  useEffect(() => {
    return SyncService.subscribeCloudState((st) => setCloudState(st));
  }, []);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Form states for Add/Edit
  const [formEmail, setFormEmail] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('staff');
  const [formPhone, setFormPhone] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3500);
  };

  const openAddModal = () => {
    setFormEmail('');
    setFormFullName('');
    setFormUsername('');
    setFormRole('staff');
    setFormPhone('');
    setFormDepartment('Ban Quản Lý Kho Bãi');
    setFormIsActive(true);
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (u: User) => {
    const mainAdmin = isBootstrappedAdminUser(u);
    setEditingUser(u);
    setFormEmail(mainAdmin ? BOOTSTRAPPED_ADMIN_EMAIL : u.email || '');
    setFormFullName(u.fullName);
    setFormUsername(u.username);
    setFormRole(mainAdmin ? 'admin' : u.role);
    setFormPhone(u.phone || '');
    setFormDepartment(u.department || '');
    setFormIsActive(mainAdmin ? true : u.isActive);
    setFormError('');
  };

  const buildUniqueUsername = (preferred: string, emailLower: string, excludeId?: string): string => {
    const baseCandidate =
      preferred.normalize('NFC').trim() ||
      emailLower.split('@')[0]?.trim() ||
      'user';
    let candidate = baseCandidate;
    let suffix = 2;
    while (
      users.some(
        (u) => u.id !== excludeId && normUserKey(u.username) === normUserKey(candidate)
      )
    ) {
      candidate = `${baseCandidate}.${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = formEmail.trim().toLowerCase();
    const cleanFullName = formFullName.normalize('NFC').trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Vui lòng nhập địa chỉ Email Google hợp lệ (ví dụ: nhanvien@gmail.com).');
      return;
    }
    if (!cleanFullName) {
      setFormError('Vui lòng nhập họ và tên đầy đủ của người sử dụng.');
      return;
    }

    const digest = computeEmailAuthDigest(cleanEmail);
    const existingByEmail = users.find(
      (u) =>
        (u.email || '').trim().toLowerCase() === cleanEmail ||
        (digest && u.emailDigest === digest)
    );
    if (existingByEmail) {
      setFormError(
        `Email Google "${cleanEmail}" đã được gán cho tài khoản "${existingByEmail.fullName}".`
      );
      return;
    }

    const finalUsername = buildUniqueUsername(formUsername, cleanEmail);

    try {
      addUser({
        username: finalUsername,
        fullName: cleanFullName,
        role: cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL ? 'admin' : formRole,
        password: 'google-oauth',
        email: cleanEmail,
        emailDigest: digest,
        phone: formPhone.trim(),
        department: formDepartment.trim(),
        isActive: cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL ? true : formIsActive
      });
      setIsAddModalOpen(false);
      showNotify(
        'success',
        `Đã tạo tài khoản Google "${cleanEmail}" (${cleanFullName}). Đang đồng bộ lên Cloud Firestore...`
      );

      // Đẩy đồng bộ tức thì lên Cloud Firestore & máy chủ nội bộ
      void SyncService.syncUsersToCloudImmediately().then((res) => {
        if (res.success) {
          showNotify('success', `Đã cấp quyền và đồng bộ tài khoản "${cleanEmail}" lên Cloud Firestore thành công!`);
        } else {
          showNotify('error', `Tài khoản đã lưu tại máy. ${res.message}`);
        }
      });
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi tạo người dùng');
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const isMainAdmin = isBootstrappedAdminUser(editingUser);
    const cleanEmail = isMainAdmin
      ? BOOTSTRAPPED_ADMIN_EMAIL
      : formEmail.trim().toLowerCase();
    const cleanFullName = formFullName.normalize('NFC').trim();

    if (!cleanFullName) {
      setFormError('Họ và tên người sử dụng không được để trống.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Vui lòng nhập Email Google hợp lệ để người dùng đăng nhập.');
      return;
    }

    const digest = computeEmailAuthDigest(cleanEmail);
    const duplicateEmailUser = users.find(
      (u) =>
        u.id !== editingUser.id &&
        ((u.email || '').trim().toLowerCase() === cleanEmail ||
          (digest && u.emailDigest === digest))
    );
    if (duplicateEmailUser) {
      setFormError(
        `Email Google "${cleanEmail}" đã thuộc về người dùng "${duplicateEmailUser.fullName}".`
      );
      return;
    }

    const finalUsername = isMainAdmin
      ? editingUser.username
      : buildUniqueUsername(formUsername || editingUser.username, cleanEmail, editingUser.id);

    updateUser(editingUser.id, {
      username: finalUsername,
      fullName: cleanFullName,
      role: isMainAdmin ? 'admin' : formRole,
      email: cleanEmail,
      emailDigest: digest,
      phone: formPhone.trim(),
      department: formDepartment.trim(),
      isActive: isMainAdmin ? true : formIsActive
    });

    setEditingUser(null);
    showNotify('success', `Đã cập nhật phân quyền cho "${cleanFullName}". Đang đồng bộ Cloud...`);
    void SyncService.syncUsersToCloudImmediately().then((res) => {
      if (res.success) {
        showNotify('success', `Đã đồng bộ cập nhật tài khoản "${cleanEmail}" lên Cloud Firestore thành công!`);
      }
    });
  };

  const handleToggleActive = (u: User) => {
    if (isBootstrappedAdminUser(u)) {
      showNotify('error', 'Không thể khóa tài khoản Quản trị viên chính voduongphu@gmail.com!');
      return;
    }
    const nextActive = !u.isActive;
    updateUser(u.id, { isActive: nextActive });
    showNotify(
      'success',
      nextActive
        ? `Đã mở khóa cho phép "${u.fullName}" đăng nhập Google.`
        : `Đã khóa quyền đăng nhập của "${u.fullName}".`
    );
    void SyncService.syncUsersToCloudImmediately();
  };

  const handleDelete = (u: User) => {
    if (isBootstrappedAdminUser(u)) {
      showNotify('error', 'Không thể xóa tài khoản Quản trị viên chính Võ Dương Phú!');
      return;
    }
    setUserToDelete(u);
  };

  const confirmDeleteUser = () => {
    if (!userToDelete) return;
    const ok = deleteUser(userToDelete.id);
    if (ok) {
      showNotify(
        'success',
        `Đã xóa tài khoản "${userToDelete.fullName}" (${userToDelete.email || userToDelete.username}). Đang đồng bộ Cloud...`
      );
      void SyncService.syncUsersToCloudImmediately().then((res) => {
        if (res.success) {
          showNotify('success', 'Đã xóa và cập nhật đồng bộ lên Cloud Firestore thành công.');
        }
      });
    } else {
      showNotify('error', 'Không thể xóa tài khoản này.');
    }
    setUserToDelete(null);
  };

  const handleForceSyncUsersToCloud = async () => {
    setIsSyncingCloud(true);
    try {
      const res = await SyncService.syncUsersToCloudImmediately();
      if (res.success) {
        showNotify('success', res.message);
      } else {
        showNotify('error', res.message);
      }
    } catch (err: any) {
      showNotify('error', `Lỗi đồng bộ: ${err?.message || String(err)}`);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const normalizedSearch = searchTerm.normalize('NFC').toLowerCase();
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.normalize('NFC').toLowerCase().includes(normalizedSearch) ||
      (u.email && u.email.toLowerCase().includes(normalizedSearch)) ||
      u.username.normalize('NFC').toLowerCase().includes(normalizedSearch) ||
      (u.department && u.department.normalize('NFC').toLowerCase().includes(normalizedSearch));
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <ShieldCheck className="w-3 h-3" /> Quản Trị Viên (Admin)
          </span>
        );
      case 'manager':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <UserCog className="w-3 h-3" /> Quản Lý Kho
          </span>
        );
      case 'staff':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Users className="w-3 h-3" /> Thủ Kho / Nhân Viên
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            Chỉ Xem
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 border shadow-md animate-in slide-in-from-top-2 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div>
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">
                Quản Lý Tài Khoản Google & Phân Quyền
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Người dùng đăng nhập đồng bộ bằng tài khoản Google (Gmail). Admin ({BOOTSTRAPPED_ADMIN_EMAIL}) quản lý vai trò và trạng thái truy cập.
              </p>
            </div>
          </div>
        </div>

        {isAdmin ? (
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            <button
              type="button"
              onClick={handleForceSyncUsersToCloud}
              disabled={isSyncingCloud}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-semibold text-xs sm:text-sm shadow-md shadow-emerald-700/20 transition active:scale-95 disabled:opacity-70 min-h-[42px]"
              title="Đẩy toàn bộ danh sách tài khoản người dùng lên Cloud Firestore ngay lập tức"
            >
              {isSyncingCloud ? (
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <CloudUpload className="w-4 h-4 shrink-0" />
              )}
              <span>{isSyncingCloud ? 'Đang đẩy lên Cloud...' : 'Đồng Bộ Tài Khoản Lên Cloud'}</span>
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs sm:text-sm shadow-md shadow-blue-500/20 transition active:scale-95 min-h-[42px]"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Thêm Tài Khoản Google</span>
            </button>
          </div>
        ) : (
          <div className="text-xs bg-amber-50 text-amber-800 px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Chỉ Admin ({BOOTSTRAPPED_ADMIN_EMAIL}) mới có quyền thêm/sửa/khóa người dùng</span>
          </div>
        )}
      </div>

      {/* Cloud Connection Status Banner */}
      {cloudState.status === 'connected' ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-950 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
            <span>
              Trạng thái Cloud Firestore: <strong>Đã kết nối ({cloudState.cloudEmail || BOOTSTRAPPED_ADMIN_EMAIL})</strong>. Mọi tài khoản tạo mới hoặc cập nhật phân quyền sẽ tự động đồng bộ tức thì sang tất cả thiết bị khác.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider shrink-0 hidden sm:inline">
            Realtime Active
          </span>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-300 text-xs text-amber-950 shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              Thiết bị chưa kết nối Google Cloud Firestore. Mọi tài khoản mới đang được lưu trữ an toàn tại máy này. Vui lòng bấm &ldquo;Kết Nối Google Cloud&rdquo; để tài khoản có thể đăng nhập trên thiết bị khác.
            </span>
          </div>
          <button
            type="button"
            onClick={async () => {
              setIsSyncingCloud(true);
              try {
                const res = await SyncService.connectCloudSync();
                showNotify(res.success ? 'success' : 'error', res.message);
              } finally {
                setIsSyncingCloud(false);
              }
            }}
            disabled={isSyncingCloud}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shrink-0 transition active:scale-95 text-xs shadow-xs"
          >
            {isSyncingCloud ? 'Đang kết nối...' : 'Kết Nối Google Cloud Ngay'}
          </button>
        </div>
      )}

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo Email Google, họ tên, phòng ban..."
            className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-3" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-medium text-slate-500 whitespace-nowrap">Vai trò:</label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="flex-1 sm:flex-initial px-3 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px]"
          >
            <option value="all">Tất cả vai trò ({users.length})</option>
            <option value="admin">Quản Trị Viên (Admin)</option>
            <option value="manager">Quản Lý Kho</option>
            <option value="staff">Thủ Kho / Nhân Viên</option>
            <option value="viewer">Chỉ Xem</option>
          </select>
        </div>
      </div>

      {/* Table of Users */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Người Sử Dụng</th>
                <th className="px-5 py-3.5">Tài Khoản Google (Email)</th>
                <th className="px-5 py-3.5">Vai Trò</th>
                <th className="px-5 py-3.5">Phòng Ban / Liên Hệ</th>
                <th className="px-5 py-3.5 text-center">Trạng Thái</th>
                <th className="px-5 py-3.5 text-right">Thao Tác Quản Trị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    Không tìm thấy người sử dụng nào phù hợp điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isMainAdmin = isBootstrappedAdminUser(u);
                  const displayEmail = isMainAdmin ? BOOTSTRAPPED_ADMIN_EMAIL : u.email || '';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                              isMainAdmin
                                ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {u.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5 flex-wrap">
                              <span>{u.fullName}</span>
                              {isMainAdmin && (
                                <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                                  ADMIN CHÍNH
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              Mã nội bộ: @{u.username} • Ngày tạo:{' '}
                              {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {displayEmail ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 border border-blue-200/80 text-blue-900 font-mono text-xs font-semibold">
                            <Mail className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{displayEmail}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                            Chưa gắn Email Google (Bấm Sửa để cập nhật)
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">{getRoleBadge(isMainAdmin ? 'admin' : u.role)}</td>

                      <td className="px-5 py-4">
                        <div className="space-y-0.5 text-xs text-slate-600">
                          {u.department && (
                            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{u.department}</span>
                            </div>
                          )}
                          {u.phone && (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{u.phone}</span>
                            </div>
                          )}
                          {!u.department && !u.phone && (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-center">
                        {u.isActive || isMainAdmin ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            Đã khóa
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {!isMainAdmin && (
                              <button
                                onClick={() => handleToggleActive(u)}
                                title={
                                  u.isActive
                                    ? 'Khóa quyền đăng nhập Google của tài khoản này'
                                    : 'Mở khóa cho phép tài khoản này đăng nhập Google'
                                }
                                className={`p-1.5 rounded-lg border transition ${
                                  u.isActive
                                    ? 'text-amber-600 hover:bg-amber-50 border-amber-200'
                                    : 'text-emerald-600 hover:bg-emerald-50 border-emerald-200'
                                }`}
                              >
                                {u.isActive ? (
                                  <Lock className="w-4 h-4" />
                                ) : (
                                  <Unlock className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            <button
                              onClick={() => openEditModal(u)}
                              title="Chỉnh sửa thông tin & Phân quyền"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {!isMainAdmin && (
                              <button
                                onClick={() => handleDelete(u)}
                                title="Xóa người sử dụng"
                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Chỉ xem</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Thêm tài khoản Google mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  Thêm Tài Khoản Google Mới
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Email Google đăng nhập (*)
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="ví dụ: nhanvienkho@gmail.com"
                  className="w-full px-3 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Nhân sự dùng đúng địa chỉ Gmail này để bấm &ldquo;Đăng nhập bằng tài khoản Google&rdquo;.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Họ và tên đầy đủ (*)
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    placeholder="ví dụ: Lê Văn Hải"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mã định danh nội bộ
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="Tự động lấy theo Gmail nếu để trống"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Vai trò phân quyền
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="staff">Thủ Kho / Nhân Viên Kho</option>
                    <option value="manager">Quản Lý Kho</option>
                    <option value="admin">Quản Trị Viên (Admin)</option>
                    <option value="viewer">Chỉ Xem Báo Cáo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Phòng ban / Đơn vị
                  </label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    placeholder="Ban Quản Lý Kho Bãi"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Số điện thoại liên hệ
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="09xx xxx xxx"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="userActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label htmlFor="userActive" className="text-xs font-medium text-slate-700">
                  Cho phép tài khoản Google này đăng nhập ngay lập tức
                </label>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu & Cấp Quyền Google
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

      {/* Modal Sửa thông tin & phân quyền */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
                  Phân Quyền Tài Khoản: {editingUser.fullName}
                </h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Email Google đăng nhập (*)
                </label>
                <input
                  type="email"
                  value={formEmail}
                  disabled={isBootstrappedAdminUser(editingUser)}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="nhanvien@gmail.com"
                  className="w-full px-3 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Họ và tên đầy đủ (*)
                  </label>
                  <input
                    type="text"
                    value={formFullName}
                    onChange={(e) => setFormFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mã định danh nội bộ
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    disabled={isBootstrappedAdminUser(editingUser)}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Vai trò
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    disabled={isBootstrappedAdminUser(editingUser)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-200"
                  >
                    <option value="admin">Quản Trị Viên (Admin)</option>
                    <option value="manager">Quản Lý Kho</option>
                    <option value="staff">Thủ Kho / Nhân Viên</option>
                    <option value="viewer">Chỉ Xem</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Phòng ban
                  </label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Số điện thoại
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editActive"
                  checked={formIsActive}
                  disabled={isBootstrappedAdminUser(editingUser)}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label htmlFor="editActive" className="text-xs font-medium text-slate-700">
                  Cho phép tài khoản này đăng nhập hệ thống
                </label>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Lưu Thay Đổi
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Người Dùng */}
      <ConfirmDeleteModal
        isOpen={Boolean(userToDelete)}
        onClose={() => setUserToDelete(null)}
        onConfirm={confirmDeleteUser}
        title="Xác Nhận Xóa Tài Khoản Google"
        itemName={
          userToDelete
            ? `${userToDelete.fullName} (${userToDelete.email || '@' + userToDelete.username})`
            : ''
        }
        itemType="tài khoản người sử dụng"
        warningText="Tài khoản này sẽ bị xóa khỏi danh sách phân quyền của hệ thống. Bạn có chắc chắn muốn xóa không?"
      />
    </div>
  );
};

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, UserRole } from '../../types/inventory';
import { 
  Users, 
  UserPlus, 
  ShieldAlert, 
  KeyRound, 
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
  Eye,
  EyeOff
} from 'lucide-react';
import { ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { normUserKey } from '../../utils/additiveMerge';

export const UserManager: React.FC = () => {
  const { users, isAdmin, addUser, updateUser, deleteUser, resetUserPassword } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  
  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPassUser, setResetPassUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('123456');
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Form states for Add/Edit
  const [formUsername, setFormUsername] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formPassword, setFormPassword] = useState('123456');
  const [formRole, setFormRole] = useState<UserRole>('staff');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDepartment, setFormDepartment] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const openAddModal = () => {
    setFormUsername('');
    setFormFullName('');
    setFormPassword('123456');
    setFormRole('staff');
    setFormEmail('');
    setFormPhone('');
    setFormDepartment('Ban Quản Lý Kho Bãi');
    setFormIsActive(true);
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormFullName(u.fullName);
    setFormPassword(u.password || '');
    setFormRole(u.role);
    setFormEmail(u.email || '');
    setFormPhone(u.phone || '');
    setFormDepartment(u.department || '');
    setFormIsActive(u.isActive);
    setFormError('');
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = formUsername.normalize('NFC').trim();
    const cleanFullName = formFullName.normalize('NFC').trim();
    const cleanPass = formPassword.trim() || '123456';

    if (!cleanUsername || !cleanFullName) {
      setFormError('Vui lòng điền tên đăng nhập và họ tên người dùng');
      return;
    }

    // Check trùng username chuẩn hóa NFC
    if (users.some((u) => normUserKey(u.username) === normUserKey(cleanUsername))) {
      setFormError(`Tên đăng nhập "${cleanUsername}" đã tồn tại trên hệ thống.`);
      return;
    }

    try {
      addUser({
        username: cleanUsername,
        fullName: cleanFullName,
        role: formRole,
        password: cleanPass,
        email: formEmail.trim(),
        phone: formPhone.trim(),
        department: formDepartment.trim(),
        isActive: formIsActive
      });
      setIsAddModalOpen(false);
      showNotify('success', `Đã tạo người sử dụng "${cleanFullName}" thành công với mật khẩu: ${cleanPass}`);
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi tạo người dùng');
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const cleanUsername = formUsername.normalize('NFC').trim();
    const cleanFullName = formFullName.normalize('NFC').trim();
    const cleanPass = formPassword.trim();
    const isMainAdmin = editingUser.username === 'Võ Dương Phú' || editingUser.id === 'user-admin-01';

    if (!cleanFullName || !cleanUsername) {
      setFormError('Tên đăng nhập và họ tên không được để trống');
      return;
    }

    if (
      !isMainAdmin &&
      users.some(
        (u) => u.id !== editingUser.id && normUserKey(u.username) === normUserKey(cleanUsername)
      )
    ) {
      setFormError(`Tên đăng nhập "${cleanUsername}" đã được sử dụng bởi tài khoản khác.`);
      return;
    }

    updateUser(editingUser.id, {
      username: isMainAdmin ? editingUser.username : cleanUsername,
      fullName: cleanFullName,
      ...(cleanPass ? { password: cleanPass } : {}),
      role: formRole,
      email: formEmail.trim(),
      phone: formPhone.trim(),
      department: formDepartment.trim(),
      isActive: formIsActive
    });

    setEditingUser(null);
    showNotify('success', `Đã cập nhật thông tin người dùng "${cleanFullName}".`);
  };

  const handleDelete = (u: User) => {
    if (u.username === 'Võ Dương Phú' || u.id === 'user-admin-01') {
      showNotify('error', 'Không thể xóa tài khoản Quản trị viên chính Võ Dương Phú!');
      return;
    }
    setUserToDelete(u);
  };

  const confirmDeleteUser = () => {
    if (!userToDelete) return;
    const ok = deleteUser(userToDelete.id);
    if (ok) {
      showNotify('success', `Đã xóa tài khoản "${userToDelete.fullName}" (${userToDelete.username}) thành công.`);
    } else {
      showNotify('error', 'Không thể xóa tài khoản này.');
    }
    setUserToDelete(null);
  };

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassUser) return;
    const cleanPass = newPasswordValue.trim();
    if (!cleanPass) {
      showNotify('error', 'Vui lòng nhập mật khẩu mới.');
      return;
    }
    resetUserPassword(resetPassUser.id, cleanPass);
    showNotify('success', `Đã cấp mật khẩu mới "${cleanPass}" cho người dùng ${resetPassUser.fullName}.`);
    setResetPassUser(null);
  };

  const normalizedSearch = searchTerm.normalize('NFC').toLowerCase();
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.normalize('NFC').toLowerCase().includes(normalizedSearch) ||
      u.username.normalize('NFC').toLowerCase().includes(normalizedSearch) ||
      (u.department && u.department.normalize('NFC').toLowerCase().includes(normalizedSearch));
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200"><ShieldCheck className="w-3 h-3" /> Quản Trị Viên (Admin)</span>;
      case 'manager':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200"><UserCog className="w-3 h-3" /> Quản Lý Kho</span>;
      case 'staff':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200"><Users className="w-3 h-3" /> Thủ Kho / Nhân Viên</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">Chỉ Xem</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {notification && (
        <div className={`p-4 rounded-xl flex items-center gap-3 border shadow-md animate-in slide-in-from-top-2 ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
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
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Quản Lý Danh Mục Người Sử Dụng</h1>
              <p className="text-slate-500 text-xs mt-0.5">Admin quản lý tài khoản, phân quyền vai trò và cấp phát mật khẩu truy cập hệ thống</p>
            </div>
          </div>
        </div>

        {isAdmin ? (
          <button
            onClick={openAddModal}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-md shadow-blue-500/20 transition active:scale-95 min-h-[42px]"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span>Thêm Người Sử Dụng Mới</span>
          </button>
        ) : (
          <div className="text-xs bg-amber-50 text-amber-800 px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Chỉ tài khoản Admin mới có quyền thêm/sửa/xóa và cấp mật khẩu</span>
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên đăng nhập, họ tên, phòng ban..."
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
                <th className="px-5 py-3.5">Tên Đăng Nhập</th>
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
                  const isMainAdmin = u.username === 'Võ Dương Phú' || u.id === 'user-admin-01';
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isMainAdmin 
                              ? 'bg-rose-100 text-rose-700 ring-2 ring-rose-300' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {u.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              {u.fullName}
                              {isMainAdmin && (
                                <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded font-bold">ADMIN CHÍNH</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              Ngày tạo: {new Date(u.createdAt).toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 font-mono font-medium text-slate-700">
                        <div className="space-y-1">
                          <div>
                            <span className="bg-slate-100 px-2 py-1 rounded-md text-xs border border-slate-200">
                              {u.username}
                            </span>
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span>MK:</span>
                              <span className="font-semibold text-slate-700">
                                {visiblePasswords[u.id] ? u.password || '—' : '••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setVisiblePasswords((prev) => ({
                                    ...prev,
                                    [u.id]: !prev[u.id]
                                  }))
                                }
                                title={visiblePasswords[u.id] ? 'Ẩn mật khẩu' : 'Xem mật khẩu đăng nhập'}
                                className="p-0.5 text-slate-400 hover:text-blue-600 rounded transition"
                              >
                                {visiblePasswords[u.id] ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {getRoleBadge(u.role)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-0.5 text-xs text-slate-600">
                          {u.department && (
                            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              <span>{u.department}</span>
                            </div>
                          )}
                          {u.phone && (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              <span>{u.phone}</span>
                            </div>
                          )}
                          {u.email && (
                            <div className="flex items-center gap-1.5 text-slate-500">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              <span>{u.email}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-center">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
                            Đã khóa
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Cấp mật khẩu */}
                            <button
                              onClick={() => {
                                setResetPassUser(u);
                                setNewPasswordValue('123456');
                              }}
                              title="Cấp lại mật khẩu cho người dùng"
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg border border-amber-200 transition"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>

                            {/* Sửa thông tin */}
                            <button
                              onClick={() => openEditModal(u)}
                              title="Chỉnh sửa thông tin"
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {/* Xóa người dùng (không cho xóa admin Võ Dương Phú) */}
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
                          <span className="text-xs text-slate-400">Không có quyền</span>
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

      {/* Modal Thêm người dùng mới */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">Thêm Người Sử Dụng Mới</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Tên đăng nhập (*)
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="ví dụ: levanhai"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mật khẩu khởi tạo (*)
                  </label>
                  <input
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Mặc định: 123456"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
              </div>

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
                    placeholder="Ban QL Kho Bãi Cát Lái"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="09xx xxx xxx"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="user@kho-vattu.vn"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
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
                  Kích hoạt tài khoản người dùng ngay lập tức
                </label>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-blue-500/20"
                >
                  Tạo Người Dùng
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

      {/* Modal Sửa người dùng */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">Sửa Người Dùng: {editingUser.username}</h3>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Tên đăng nhập (*)
                  </label>
                  <input
                    type="text"
                    value={formUsername}
                    disabled={editingUser.username === 'Võ Dương Phú' || editingUser.id === 'user-admin-01'}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-200"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mật khẩu đăng nhập
                  </label>
                  <input
                    type="text"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Nhập để đổi mật khẩu..."
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Vai trò
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    disabled={editingUser.username === 'Võ Dương Phú'}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editActive"
                  checked={formIsActive}
                  disabled={editingUser.username === 'Võ Dương Phú'}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300"
                />
                <label htmlFor="editActive" className="text-xs font-medium text-slate-700">
                  Tài khoản đang hoạt động
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

      {/* Modal Cấp Mật Khẩu (Admin cấp mật khẩu cho người sử dụng) */}
      {resetPassUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-amber-50">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm truncate">Cấp Mật Khẩu Cho Người Sử Dụng</h3>
                  <p className="text-xs text-amber-800 font-semibold truncate">{resetPassUser.fullName} ({resetPassUser.username})</p>
                </div>
              </div>
              <button onClick={() => setResetPassUser(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs text-slate-600">
                Với tư cách Admin, bạn có quyền cấp lại mật khẩu truy cập cho người dùng này. Mật khẩu mới sẽ có hiệu lực ngay lập tức.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Mật khẩu mới cấp phát (*)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={newPasswordValue}
                    onChange={(e) => setNewPasswordValue(e.target.value)}
                    placeholder="Nhập mật khẩu mới..."
                    className="w-full px-3.5 py-2.5 pl-10 text-sm font-mono bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    required
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setNewPasswordValue('123456')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600"
                >
                  Mặc định: 123456
                </button>
                <button
                  type="button"
                  onClick={() => setNewPasswordValue('1234567')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600"
                >
                  1234567
                </button>
                <button
                  type="button"
                  onClick={() => setNewPasswordValue(Math.floor(100000 + Math.random() * 900000).toString())}
                  className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-md font-medium"
                >
                  Tạo ngẫu nhiên 6 số
                </button>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-amber-500/20"
                >
                  Xác Nhận Cấp Mật Khẩu
                </button>
                <button
                  type="button"
                  onClick={() => setResetPassUser(null)}
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
        title="Xác Nhận Xóa Người Sử Dụng"
        itemName={userToDelete ? `${userToDelete.fullName} (@${userToDelete.username})` : ''}
        itemType="tài khoản người sử dụng"
        warningText="Tài khoản này sẽ bị xóa vĩnh viễn và không thể đăng nhập vào hệ thống nữa. Bạn có chắc chắn muốn xóa không?"
      />
    </div>
  );
};

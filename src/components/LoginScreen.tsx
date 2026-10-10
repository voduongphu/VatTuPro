import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEMO_GOOGLE_USERS, AuthUser, UserRole, ROLE_LABELS, ROLE_DESCRIPTIONS } from '../types/auth';
import {
  ShieldCheck,
  Boxes,
  Lock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  UserCheck,
  Building2,
  FileCheck2,
} from 'lucide-react';

export const GoogleLogoIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
);

export const LoginScreen: React.FC = () => {
  const { loginWithGoogle } = useAuth();
  const [selectedDemoUser, setSelectedDemoUser] = useState<AuthUser>(DEMO_GOOGLE_USERS[0]);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customRole, setCustomRole] = useState<UserRole>('STAFF');
  const [isLoading, setIsLoading] = useState(false);

  const handleDemoLogin = (userToLogin: AuthUser) => {
    setIsLoading(true);
    setTimeout(() => {
      loginWithGoogle(userToLogin);
      setIsLoading(false);
    }, 450);
  };

  const handleCustomGoogleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail.trim() || !customName.trim()) return;
    setIsLoading(true);
    setTimeout(() => {
      loginWithGoogle({
        name: customName.trim(),
        email: customEmail.trim(),
        role: customRole,
        department: 'Tài khoản Google liên kết',
      });
      setIsLoading(false);
    }, 450);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-850 to-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100">
      {/* Background ambient accents */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500 rounded-full blur-3xl"></div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center px-4">
        {/* Brand logo */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-xl shadow-blue-500/20 mb-4 ring-4 ring-white/10">
          <Boxes className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          VatTuPro Enterprise
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Hệ thống Quản lý Nhập Xuất Tồn Vật tư & Thiết bị chuyên sâu
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl relative z-10 px-4">
        <div className="bg-white/95 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-white/20 text-slate-900">
          {/* Header section in card */}
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              Đăng nhập với Google OAuth 2.0 & Phân quyền
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-2">
              Chào mừng bạn đến với hệ thống kho
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Đăng nhập bằng tài khoản Google để trải nghiệm các quyền hạn xóa, sửa phiếu theo vai trò
            </p>
          </div>

          {/* Primary Google Login Button */}
          <div className="space-y-4">
            <button
              onClick={() => handleDemoLogin(selectedDemoUser)}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-300 rounded-xl shadow-xs bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-semibold text-sm transition-all hover:shadow-md cursor-pointer group disabled:opacity-60"
            >
              <GoogleLogoIcon className="w-5 h-5 shrink-0" />
              <span>
                {isLoading ? 'Đang xác thực Google...' : `Tiếp tục với Google (${selectedDemoUser.name})`}
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-transform ml-auto" />
            </button>

            {/* Quick Demo User Selection */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                  Chọn tài khoản Google trải nghiệm vai trò:
                </span>
                <span className="text-[11px] text-slate-400">3 tài khoản mẫu</span>
              </div>

              <div className="space-y-2">
                {DEMO_GOOGLE_USERS.map(demoUser => {
                  const isSelected = selectedDemoUser.id === demoUser.id;
                  const isStaff = demoUser.role === 'STAFF';

                  return (
                    <div
                      key={demoUser.id}
                      onClick={() => setSelectedDemoUser(demoUser)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={demoUser.avatar}
                          alt={demoUser.name}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                              {demoUser.name}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                                demoUser.role === 'ADMIN'
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : demoUser.role === 'MANAGER'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {demoUser.role === 'ADMIN'
                                ? 'Admin'
                                : demoUser.role === 'MANAGER'
                                ? 'Thủ kho trưởng'
                                : 'Nhân viên'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate font-mono">
                            {demoUser.email}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            {demoUser.role === 'ADMIN' && (
                              <span className="text-emerald-700 font-medium">
                                ✓ Toàn quyền sửa/xóa phiếu nhập & xóa phiếu xuất
                              </span>
                            )}
                            {demoUser.role === 'MANAGER' && (
                              <span className="text-blue-700 font-medium">
                                ✓ Được phép sửa/xóa phiếu nhập & xóa phiếu xuất
                              </span>
                            )}
                            {demoUser.role === 'STAFF' && (
                              <span className="text-amber-700 font-medium">
                                ✗ KHÔNG có quyền sửa/xóa (chỉ tạo & xem)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleDemoLogin(demoUser);
                          }}
                          className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          Vào ngay
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Google Account Option */}
            <div className="pt-2 border-t border-slate-200">
              {!showCustomForm ? (
                <button
                  type="button"
                  onClick={() => setShowCustomForm(true)}
                  className="w-full text-center text-xs text-blue-600 hover:text-blue-800 font-medium py-1 cursor-pointer transition-colors"
                >
                  + Nhập tài khoản Google tùy chỉnh khác
                </button>
              ) : (
                <form onSubmit={handleCustomGoogleLogin} className="space-y-3 pt-1">
                  <div className="text-xs font-bold text-slate-800">
                    Đăng nhập tài khoản Google của bạn:
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                      Họ và tên hiển thị (*)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ví dụ: Hoàng Tuấn Kiệt"
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                      Email Google (@gmail.com hoặc Google Workspace) (*)
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="Ví dụ: tuankiet@gmail.com"
                      value={customEmail}
                      onChange={e => setCustomEmail(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                      Vai trò phân quyền
                    </label>
                    <select
                      value={customRole}
                      onChange={e => setCustomRole(e.target.value as UserRole)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
                    >
                      <option value="ADMIN">Quản trị viên (Toàn quyền)</option>
                      <option value="MANAGER">Thủ kho trưởng (Được sửa/xóa)</option>
                      <option value="STAFF">Nhân viên kho (Không được sửa/xóa)</option>
                      <option value="VIEWER">Khách xem (Chỉ xem)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-2 px-3 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      Đăng nhập tài khoản này
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCustomForm(false)}
                      className="py-2 px-3 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Security & Features footer in card */}
          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500">
            <div className="flex flex-col items-center gap-1">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>Bảo mật OAuth 2.0</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <FileCheck2 className="w-4 h-4 text-blue-600" />
              <span>Kiểm soát phân quyền</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Building2 className="w-4 h-4 text-purple-600" />
              <span>Quản lý kho đa điểm</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-4 text-center text-xs text-slate-400">
          VatTuPro Enterprise © 2026 · Hệ thống kho chuẩn hóa tiêu chuẩn công trình & nhà xưởng
        </p>
      </div>
    </div>
  );
};

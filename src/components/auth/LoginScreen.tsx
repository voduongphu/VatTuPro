import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ActiveUserSession } from '../../types/inventory';
import {
  Boxes,
  Lock,
  User,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
  Warehouse,
  Layers,
  MonitorSmartphone,
  LogOut,
  Clock,
  X
} from 'lucide-react';

function formatKickTime(iso?: string): string {
  try {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

export const LoginScreen: React.FC = () => {
  const {
    login,
    requestLogoutOtherDevice,
    sessionKickNotice,
    sessionKickAlert,
    isKickModalOpen,
    acknowledgeKickModal,
    clearSessionKickNotice
  } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [conflictSession, setConflictSession] = useState<ActiveUserSession | null>(null);
  const [conflictMessage, setConflictMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRequestingRemoteLogout, setIsRequestingRemoteLogout] = useState(false);

  const handleAcknowledgeModal = () => {
    if (!username.trim() && sessionKickAlert?.username) {
      setUsername(sessionKickAlert.username);
    }
    acknowledgeKickModal();
  };

  const validateInputs = (): boolean => {
    if (!username.trim()) {
      setErrorMessage('Vui lòng nhập tên người sử dụng.');
      return false;
    }
    if (!password) {
      setErrorMessage('Vui lòng nhập mật khẩu đăng nhập.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setConflictSession(null);
    setConflictMessage('');
    clearSessionKickNotice();

    if (!validateInputs()) return;

    setIsLoading(true);
    try {
      const res = await login(username.trim(), password, false);
      if (res.success) {
        setSuccessMessage('Đăng nhập thành công! Đang chuyển vào hệ thống...');
      } else if (res.conflict) {
        setConflictSession(res.activeSession || null);
        setConflictMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceLogoutAndLogin = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    clearSessionKickNotice();

    if (!validateInputs()) return;

    setIsRequestingRemoteLogout(true);
    try {
      const res = await login(username.trim(), password, true);
      if (res.success) {
        setConflictSession(null);
        setConflictMessage('');
        setSuccessMessage(res.message || 'Đã đăng xuất thiết bị kia và đăng nhập thành công!');
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsRequestingRemoteLogout(false);
    }
  };

  const handleRequestLogoutOtherOnly = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    clearSessionKickNotice();

    if (!validateInputs()) return;

    setIsRequestingRemoteLogout(true);
    try {
      const res = await requestLogoutOtherDevice(username.trim(), password);
      if (res.success) {
        setConflictSession(null);
        setConflictMessage('');
        setSuccessMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsRequestingRemoteLogout(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-slate-950 overflow-x-auto overflow-y-auto relative font-sans">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.22),rgba(255,255,255,0))] pointer-events-none" />

      <div className="min-h-dvh w-full flex p-3 sm:p-6 lg:p-8">
        <div className="m-auto w-full max-w-6xl bg-slate-900 border border-slate-800/90 rounded-2xl sm:rounded-3xl shadow-2xl shadow-black/60 overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10">
          {/* Form Đăng Nhập: Ưu tiên hiển thị ngay đầu tiên trên điện thoại (order-1), nằm bên phải trên máy tính (lg:order-2) */}
          <div className="order-1 lg:order-2 lg:col-span-7 p-5 sm:p-10 lg:p-12 bg-slate-900 flex flex-col justify-center">
            <div className="max-w-md mx-auto w-full space-y-5 sm:space-y-6">
              {/* Compact Brand Lockup chỉ hiện trên điện thoại/tablet */}
              <div className="lg:hidden flex items-center gap-3 pb-3 border-b border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/30 shrink-0">
                  <Boxes className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <span className="font-extrabold text-sm tracking-tight text-white block truncate">
                    LOGISTICS & INVENTORY
                  </span>
                  <span className="text-[11px] text-slate-400 block truncate">
                    Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư Dự Án
                  </span>
                </div>
              </div>

              {/* Title */}
              <div>
                <div className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold mb-1.5">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>Xác thực tài khoản người sử dụng</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Đăng Nhập Hệ Thống
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Nhập tên người sử dụng và mật khẩu đăng nhập đã được cấp. Mỗi tài khoản chỉ hoạt động trên 1 thiết bị tại một thời điểm.
                </p>
              </div>

              {/* Cảnh báo khi bị đăng xuất tự động do đăng nhập ở thiết bị khác */}
              {sessionKickNotice && (
                <div className="p-3.5 sm:p-4 bg-amber-950/85 border border-amber-700/80 rounded-2xl text-amber-200 text-xs flex items-start gap-2.5 shadow-lg">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <div className="font-bold text-amber-300 mb-0.5">Đã tự động thoát phiên trên thiết bị này</div>
                    <div>{sessionKickNotice}</div>
                  </div>
                  <button
                    type="button"
                    onClick={clearSessionKickNotice}
                    className="min-w-[36px] min-h-[36px] -mr-1 -mt-1 flex items-center justify-center text-amber-400 hover:text-white rounded-lg transition shrink-0"
                    title="Đóng thông báo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Cảnh báo chặn đăng nhập đồng thời trên 2 thiết bị + Thao tác Yêu cầu đăng xuất trên thiết bị kia */}
              {conflictMessage && (
                <div className="p-4 bg-amber-950/85 border border-amber-600/80 rounded-2xl text-amber-100 text-xs space-y-3 shadow-lg">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                    <div className="flex-1 leading-relaxed">
                      <div className="font-bold text-amber-300 text-sm mb-0.5">
                        Tài khoản đang hoạt động trên thiết bị khác
                      </div>
                      <p className="text-amber-100/90">{conflictMessage}</p>
                    </div>
                  </div>

                  {conflictSession && (
                    <div className="rounded-xl bg-slate-950/80 border border-amber-800/60 p-3 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <MonitorSmartphone className="w-3.5 h-3.5 text-amber-400" />
                          <span>Thiết bị đang mở:</span>
                        </span>
                        <span className="font-bold text-amber-300 text-right">
                          {conflictSession.deviceLabel || 'Thiết bị khác'}
                        </span>
                      </div>
                      {formatKickTime(conflictSession.loginAt) && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Đăng nhập lúc:</span>
                          </span>
                          <span className="font-mono text-slate-300">
                            {formatKickTime(conflictSession.loginAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={handleForceLogoutAndLogin}
                      disabled={isRequestingRemoteLogout || isLoading}
                      className="flex-1 min-h-[42px] px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-70"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>
                        {isRequestingRemoteLogout
                          ? 'Đang xử lý...'
                          : 'Yêu cầu đăng xuất thiết bị kia & Đăng nhập'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestLogoutOtherOnly}
                      disabled={isRequestingRemoteLogout || isLoading}
                      className="min-h-[42px] px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-amber-600/60 text-amber-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-70"
                    >
                      <span>Chỉ đăng xuất thiết bị kia</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Alert messages */}
              {errorMessage && (
                <div className="p-3.5 bg-rose-950/75 border border-rose-800 rounded-2xl text-rose-200 text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span className="font-medium leading-relaxed">{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3.5 bg-emerald-950/75 border border-emerald-800 rounded-2xl text-emerald-200 text-xs flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span className="font-medium leading-relaxed">{successMessage}</span>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tên người sử dụng (*)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Nhập tên người sử dụng..."
                      autoComplete="username"
                      className="w-full min-h-[48px] px-4 py-3 pl-11 text-base sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                      required
                    />
                    <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mật khẩu đăng nhập (*)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Nhập mật khẩu đăng nhập..."
                      autoComplete="current-password"
                      className="w-full min-h-[48px] px-4 py-3 pl-11 pr-12 text-base sm:text-sm bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition outline-none"
                      required
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="min-w-[44px] min-h-[44px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-white rounded-lg transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={isLoading || isRequestingRemoteLogout}
                    className="w-full min-h-[48px] py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Đang xác thực phiên thiết bị...</span>
                      </span>
                    ) : (
                      <>
                        <span>Đăng Nhập Vào Hệ Thống</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRequestLogoutOtherOnly}
                    disabled={isLoading || isRequestingRemoteLogout}
                    title="Nhập tên người sử dụng và mật khẩu rồi bấm nút này để đăng xuất phiên đang mở trên thiết bị khác"
                    className="w-full min-h-[44px] py-2.5 px-4 bg-slate-950/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/60 text-amber-300 font-semibold text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    <LogOut className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>
                      {isRequestingRemoteLogout
                        ? 'Đang gửi yêu cầu đăng xuất thiết bị kia...'
                        : 'Yêu cầu đăng xuất trên thiết bị kia'}
                    </span>
                  </button>
                </div>
              </form>

              <div className="pt-1 text-center text-xs text-slate-500">
                Cần cấp mới tài khoản hoặc quên mật khẩu? Vui lòng liên hệ <strong className="text-slate-300">Quản trị viên hệ thống</strong>.
              </div>
            </div>
          </div>

          {/* Giới thiệu & Tính năng: nằm bên trái trên máy tính (lg:order-1), nằm gọn phía dưới trên điện thoại (order-2) */}
          <div className="order-2 lg:order-1 lg:col-span-5 bg-gradient-to-br from-blue-950 via-slate-900 to-indigo-950 p-5 sm:p-8 lg:p-10 flex flex-col justify-between border-t lg:border-t-0 lg:border-r border-slate-800/80 text-white relative">
            <div>
              <div className="hidden lg:flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
                  <Boxes className="w-6 h-6 text-white" />
                </div>
                <div>
                  <span className="font-extrabold text-base tracking-tight text-white block">
                    LOGISTICS & INVENTORY
                  </span>
                  <span className="text-xs font-medium text-blue-300">
                    Quản trị kho vận thiết bị dự án
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-snug text-balance">
                  Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Giải pháp quản trị kho vật tư thiết bị dự án công trình chuyên sâu theo Packing List, Shipment, Package No., Kiện hàng, Nhà sản xuất & Nhà cung cấp.
                </p>
              </div>
            </div>

            <div className="my-5 lg:my-8 space-y-2.5 sm:space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 shrink-0">
                  <Warehouse className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-white block">Đồng Bộ Đa Thiết Bị Thời Gian Thực</span>
                  <span className="text-[11px] text-slate-400">Tự động cộng gộp dữ liệu từ mọi người dùng</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-white block">Nhập Xuất & Import File Excel Lớn</span>
                  <span className="text-[11px] text-slate-400">Xử lý mượt mà trên 100.000 dòng dữ liệu</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-white block">Bảo Mật Phiên Đơn Thiết Bị</span>
                  <span className="text-[11px] text-slate-400">Mỗi tài khoản chỉ hoạt động trên 1 thiết bị duy nhất</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
              <span>Hệ thống Quản lý Kho vận Công trình</span>
              <span>Bảo mật phiên thiết bị</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hộp thoại Cảnh Báo Nổi Bật Giữa Màn Hình khi bị tự động đăng xuất do đăng nhập trên thiết bị mới */}
      {sessionKickAlert && isKickModalOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
        >
          <div className="my-auto w-full max-w-md bg-slate-900 border border-amber-500/50 rounded-2xl sm:rounded-3xl shadow-2xl shadow-black/80 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-600/25 via-rose-600/20 to-slate-900 px-5 py-4 sm:px-6 sm:py-5 border-b border-amber-500/30 flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                  Cảnh Báo Bảo Mật Phiên Thiết Bị
                </span>
                <h3 className="text-base sm:text-lg font-extrabold text-white leading-snug mt-0.5">
                  {sessionKickAlert.title}
                </h3>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4 text-xs sm:text-sm text-slate-200">
              <p className="leading-relaxed text-slate-200">{sessionKickAlert.message}</p>

              {(sessionKickAlert.username || sessionKickAlert.deviceLabel || sessionKickAlert.loginAt) && (
                <div className="rounded-2xl bg-slate-950/90 border border-slate-800 p-3.5 space-y-2.5 text-xs">
                  {(sessionKickAlert.fullName || sessionKickAlert.username) && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400 flex items-center gap-1.5 shrink-0">
                        <User className="w-3.5 h-3.5 text-blue-400" />
                        <span>Tài khoản:</span>
                      </span>
                      <span className="font-bold text-white text-right truncate">
                        {sessionKickAlert.fullName || sessionKickAlert.username}
                      </span>
                    </div>
                  )}

                  {sessionKickAlert.deviceLabel && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400 flex items-center gap-1.5 shrink-0">
                        <MonitorSmartphone className="w-3.5 h-3.5 text-amber-400" />
                        <span>
                          {sessionKickAlert.reason === 'force_logout'
                            ? 'Thiết bị yêu cầu:'
                            : 'Thiết bị mới:'}
                        </span>
                      </span>
                      <span className="font-bold text-amber-300 text-right truncate">
                        {sessionKickAlert.deviceLabel}
                      </span>
                    </div>
                  )}

                  {formatKickTime(sessionKickAlert.loginAt) && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400 flex items-center gap-1.5 shrink-0">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Thời điểm:</span>
                      </span>
                      <span className="font-mono text-slate-300 text-right">
                        {formatKickTime(sessionKickAlert.loginAt)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {sessionKickAlert.reason === 'replaced' && (
                <p className="text-[11px] sm:text-xs text-amber-200/80 bg-amber-950/50 border border-amber-800/50 rounded-xl p-3 leading-relaxed">
                  Nếu không phải bạn vừa đăng nhập trên thiết bị mới, vui lòng đăng nhập lại ngay và thực hiện đổi mật khẩu để bảo vệ tài khoản.
                </p>
              )}

              <button
                type="button"
                onClick={handleAcknowledgeModal}
                className="w-full min-h-[48px] py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-[0.99]"
              >
                Đã hiểu & Quay lại đăng nhập
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  Boxes,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  Smartphone,
  RefreshCw,
  LogOut,
  X,
  Laptop,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { formatDate } from '../utils/formatters';

interface SessionConflictInfo {
  username: string;
  otherDeviceName: string;
  otherDeviceId?: string | null;
  lastActiveAt?: string | null;
}

export const LoginView: React.FC = () => {
  const {
    login,
    forceLogoutOtherDeviceAndLogin,
    sessionTerminatedReason,
    clearSessionTerminatedReason,
    currentDeviceInfo,
    regenerateDeviceIdForTesting,
  } = useInventory();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Multi-device conflict dialog state
  const [conflictInfo, setConflictInfo] = useState<SessionConflictInfo | null>(null);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [conflictFeedback, setConflictFeedback] = useState<string | null>(null);
  const [simulatedNotice, setSimulatedNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setConflictInfo(null);
    setConflictFeedback(null);
    setIsLoading(true);

    try {
      const res = await login(username, password);
      setIsLoading(false);

      if (!res.success) {
        if (res.code === 'SESSION_ACTIVE_ON_ANOTHER_DEVICE') {
          setConflictInfo({
            username: username.trim(),
            otherDeviceName: res.otherDevice?.name || 'Thiết bị khác',
            otherDeviceId: res.otherDevice?.id,
            lastActiveAt: res.otherDevice?.lastActiveAt,
          });
        } else {
          setError(res.error || 'Đăng nhập không thành công.');
        }
      }
    } catch {
      setIsLoading(false);
      setError('Đăng nhập không thành công.');
    }
  };

  // User clicked "Kiểm tra & Đăng nhập lại" (after logging out on the other device)
  const handleRecheckLogin = async () => {
    setConflictFeedback(null);
    setIsLoading(true);

    try {
      const res = await login(username, password);
      setIsLoading(false);

      if (!res.success) {
        if (res.code === 'SESSION_ACTIVE_ON_ANOTHER_DEVICE') {
          setConflictFeedback(
            `Tài khoản vẫn chưa được đăng xuất trên "${res.otherDevice?.name || 'thiết bị kia'}". Vui lòng đăng xuất trên thiết bị đó trước.`
          );
        } else {
          setError(res.error || 'Đăng nhập không thành công.');
          setConflictInfo(null);
        }
      }
    } catch {
      setIsLoading(false);
      setConflictFeedback('Lỗi kết nối khi kiểm tra. Vui lòng thử lại.');
    }
  };

  // User clicked "Đăng xuất thiết bị kia từ xa & Đăng nhập tại đây"
  const handleForceTakeover = async () => {
    setIsTakingOver(true);
    setConflictFeedback(null);

    try {
      const res = await forceLogoutOtherDeviceAndLogin(username, password);
      setIsTakingOver(false);

      if (!res.success) {
        setConflictFeedback(res.error || 'Không thể đăng xuất từ xa.');
      } else {
        setConflictInfo(null);
      }
    } catch {
      setIsTakingOver(false);
      setConflictFeedback('Có lỗi xảy ra khi thực hiện đăng xuất thiết bị kia.');
    }
  };

  const handleSimulateNewDevice = () => {
    const newId = regenerateDeviceIdForTesting();
    setSimulatedNotice(`Đã đổi sang mã thiết bị mới (${newId.slice(-6)}). Bạn có thể thử đăng nhập để kiểm tra chặn 2 thiết bị.`);
    setTimeout(() => setSimulatedNotice(null), 5000);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background aesthetic grid / ambient lights */}
      <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-500/20 mb-4">
          <Boxes className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">
          KhoVatTu &bull; Pro
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Hệ thống Quản lý Nhập - Xuất - Tồn Vật tư &amp; Thiết bị Đa Điều Kiện
        </p>
      </div>

      {/* Login Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 shadow-2xl rounded-2xl border border-slate-700/80 sm:px-10">
          
          {/* Banner: Session Terminated Notice (if user was kicked from another device or admin) */}
          {sessionTerminatedReason && (
            <div className="mb-5 p-3.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2.5 animate-fadeIn">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-300 mb-0.5">Phiên làm việc đã kết thúc</div>
                <div className="text-amber-200/90 leading-relaxed">{sessionTerminatedReason}</div>
              </div>
              <button
                type="button"
                onClick={clearSessionTerminatedReason}
                className="text-amber-400 hover:text-amber-200 p-0.5 shrink-0"
                title="Đóng thông báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Form standard login */}
          {!conflictInfo ? (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Tên đăng nhập
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Nhập tên đăng nhập..."
                    className="block w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Mật khẩu truy cập
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu..."
                    className="block w-full pl-10 pr-10 py-2.5 text-sm bg-slate-900/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang kiểm tra bảo mật...</span>
                    </>
                  ) : (
                    <>
                      <span>Đăng nhập vào hệ thống</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Multi-Device Conflict Warning Dialog (User Requirement: Cảnh báo đăng xuất trên thiết bị kia mới cho đăng nhập) */
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl shrink-0">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-300">
                      CẢNH BÁO: TÀI KHOẢN ĐANG ĐĂNG NHẬP TRÊN THIẾT BỊ KHÁC
                    </h3>
                    <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">
                      Tài khoản <strong className="text-white">@{conflictInfo.username}</strong> hiện đang được đăng nhập và kích hoạt trên:
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 p-3 bg-slate-900/80 rounded-xl border border-slate-700/80 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-slate-200 font-medium">
                    <Smartphone className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Thiết bị đang giữ phiên:</span>
                    <span className="text-white font-bold ml-auto">{conflictInfo.otherDeviceName}</span>
                  </div>
                  {conflictInfo.lastActiveAt && (
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Hoạt động gần nhất:</span>
                      <span className="text-slate-300 ml-auto">{formatDate(conflictInfo.lastActiveAt)}</span>
                    </div>
                  )}
                </div>

                <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
                  <div className="font-semibold flex items-center gap-1.5 text-rose-400 mb-1">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Quy định bảo mật hệ thống:</span>
                  </div>
                  <p className="leading-relaxed">
                    Hệ thống không cho phép đăng nhập cùng lúc một tài khoản trên 2 thiết bị khác nhau.
                    <br />
                    👉 <strong>Vui lòng đăng xuất tài khoản trên thiết bị kia mới có thể đăng nhập trên thiết bị này.</strong>
                  </p>
                </div>

                {conflictFeedback && (
                  <div className="mt-3 p-2.5 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{conflictFeedback}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                {/* 1. Recheck if other device has logged out */}
                <button
                  type="button"
                  onClick={handleRecheckLogin}
                  disabled={isLoading || isTakingOver}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Đã đăng xuất trên thiết bị kia - Kiểm tra lại</span>
                </button>

                {/* 2. Remote takeover in case device is lost / closed without logout */}
                <button
                  type="button"
                  onClick={handleForceTakeover}
                  disabled={isLoading || isTakingOver}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-rose-200 bg-rose-900/40 hover:bg-rose-900/60 border border-rose-700/50 transition-all disabled:opacity-50 cursor-pointer"
                  title="Đăng xuất thiết bị kia từ xa và cho phép thiết bị này đăng nhập ngay"
                >
                  {isTakingOver ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                      <span>Đang đăng xuất thiết bị kia...</span>
                    </>
                  ) : (
                    <>
                      <LogOut className="w-4 h-4 text-rose-400" />
                      <span>Đăng xuất thiết bị kia từ xa &amp; Đăng nhập tại đây</span>
                    </>
                  )}
                </button>

                {/* 3. Cancel & return to login */}
                <button
                  type="button"
                  onClick={() => {
                    setConflictInfo(null);
                    setConflictFeedback(null);
                    setError('');
                  }}
                  className="w-full py-2 px-4 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors text-center cursor-pointer"
                >
                  Quay lại đăng nhập tài khoản khác
                </button>
              </div>
            </div>
          )}

          {/* Current Device Identification & Testing Helper */}
          <div className="mt-6 pt-5 border-t border-slate-700/60 text-[11px] text-slate-400 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Laptop className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Thiết bị hiện tại:</span>
                <strong className="text-white font-medium">{currentDeviceInfo.name}</strong>
              </div>
              <span className="font-mono text-[10px] text-slate-500 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                ID: {currentDeviceInfo.id.slice(-8)}
              </span>
            </div>

            {/* Simulated notification */}
            {simulatedNotice && (
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 flex items-center gap-2 text-[10px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{simulatedNotice}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>Bảo vệ phiên đăng nhập độc quyền 1 thiết bị</span>
              <button
                type="button"
                onClick={handleSimulateNewDevice}
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors cursor-pointer"
                title="Tạo ID thiết bị mới để thử nghiệm tính năng đăng nhập trên 2 thiết bị khác nhau"
              >
                Giả lập thiết bị khác
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

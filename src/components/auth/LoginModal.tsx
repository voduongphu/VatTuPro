import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ActiveUserSession } from '../../types/inventory';
import {
  Lock,
  UserCheck,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const {
    login,
    connectCloudSync,
    cloudState,
    requestLogoutOtherDevice,
    resetBrowserAuthState
  } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [needsCloudConnect, setNeedsCloudConnect] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [conflictSession, setConflictSession] = useState<ActiveUserSession | null>(null);
  const [conflictMessage, setConflictMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConnectingCloud, setIsConnectingCloud] = useState(false);
  const [isForcingLogout, setIsForcingLogout] = useState(false);
  const [isResettingCookies, setIsResettingCookies] = useState(false);

  if (!isOpen) return null;

  const handleConnectCloud = async () => {
    setErrorMessage('');
    setNeedsCloudConnect(false);
    setSuccessMessage('');
    setIsConnectingCloud(true);
    try {
      const res = await connectCloudSync();
      if (res.success) {
        setSuccessMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleConnectCloudAndAutoLogin = async () => {
    setErrorMessage('');
    setNeedsCloudConnect(false);
    setSuccessMessage('');
    setConflictSession(null);
    setConflictMessage('');
    setIsConnectingCloud(true);
    try {
      const cloudRes = await connectCloudSync();
      if (!cloudRes.success) {
        setErrorMessage(cloudRes.message);
        return;
      }
      if (username.trim() && password) {
        const loginRes = await login(username.trim(), password, false);
        if (loginRes.success) {
          setSuccessMessage(loginRes.message);
          setTimeout(() => {
            onClose();
            setSuccessMessage('');
          }, 600);
          return;
        }
        if (loginRes.conflict) {
          setConflictSession(loginRes.activeSession || null);
          setConflictMessage(loginRes.message);
          return;
        }
        setNeedsCloudConnect(Boolean(loginRes.needsCloudConnect));
        setErrorMessage(loginRes.message);
      } else {
        setSuccessMessage(cloudRes.message);
      }
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleResetCookies = async () => {
    setErrorMessage('');
    setNeedsCloudConnect(false);
    setSuccessMessage('');
    setConflictSession(null);
    setConflictMessage('');
    setIsResettingCookies(true);
    try {
      const res = await resetBrowserAuthState();
      setSuccessMessage(res.message);
    } finally {
      setIsResettingCookies(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setNeedsCloudConnect(false);
    setSuccessMessage('');
    setConflictSession(null);
    setConflictMessage('');

    if (!username.trim() || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(username.normalize('NFC').trim(), password, false);
      if (res.success) {
        setSuccessMessage(res.message);
        setTimeout(() => {
          onClose();
          setSuccessMessage('');
        }, 600);
      } else if (res.conflict) {
        setConflictSession(res.activeSession || null);
        setConflictMessage(res.message);
      } else {
        setNeedsCloudConnect(Boolean(res.needsCloudConnect));
        setErrorMessage(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceLogoutAndLogin = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!username.trim() || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    setIsForcingLogout(true);
    try {
      const res = await login(username.trim(), password, true);
      if (res.success) {
        setConflictSession(null);
        setConflictMessage('');
        setSuccessMessage(res.message);
        setTimeout(() => {
          onClose();
          setSuccessMessage('');
        }, 600);
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsForcingLogout(false);
    }
  };

  const handleRequestLogoutOtherOnly = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!username.trim() || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    setIsForcingLogout(true);
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
      setIsForcingLogout(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="m-auto bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-5 sm:p-6 text-white text-center relative">
          <div className="mx-auto w-12 h-12 sm:w-14 sm:h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-3 shadow-inner ring-1 ring-white/20">
            <ShieldCheck className="w-7 h-7 sm:w-8 sm:h-8 text-blue-200" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Hệ Thống Quản Lý Vật Tư</h2>
          <p className="text-blue-100 text-xs mt-1">Đăng nhập tài khoản người sử dụng</p>
        </div>

        <div className="p-5 sm:p-6">
          {/* Trạng thái Đám mây */}
          <div className="mb-4">
            {cloudState.status === 'connected' ? (
              <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">
                  Đã kết nối Đám mây ({cloudState.cloudEmail || 'Google'})
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectCloud}
                disabled={isConnectingCloud || isSubmitting}
                className="w-full min-h-[40px] px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-blue-800 text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60"
              >
                <CloudOff className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {isConnectingCloud
                    ? 'Đang kết nối Đám mây...'
                    : 'Kết nối Đám mây Google (Đồng bộ Đa Thiết Bị)'}
                </span>
              </button>
            )}
          </div>

          {conflictMessage && (
            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-2.5">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">
                    Đang đăng nhập trên {conflictSession?.deviceLabel || 'thiết bị khác'}
                  </div>
                  <p className="leading-relaxed">{conflictMessage}</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={handleForceLogoutAndLogin}
                  disabled={isForcingLogout || isSubmitting}
                  className="w-full min-h-[38px] px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-70"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>
                    {isForcingLogout
                      ? 'Đang xử lý...'
                      : 'Yêu cầu đăng xuất thiết bị kia & Đăng nhập'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
              {needsCloudConnect && (
                <button
                  type="button"
                  onClick={handleConnectCloudAndAutoLogin}
                  disabled={isConnectingCloud || isSubmitting || isResettingCookies}
                  className="w-full min-h-[38px] px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-70"
                >
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isConnectingCloud
                      ? 'Đang kết nối & tự động đăng nhập...'
                      : 'Kết nối Đám mây & Đăng nhập ngay'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={handleResetCookies}
                disabled={isResettingCookies || isSubmitting || isConnectingCloud}
                className="w-full min-h-[36px] px-3 py-1.5 bg-white hover:bg-rose-100/60 border border-rose-300 text-rose-800 font-semibold rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-70"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isResettingCookies ? 'animate-spin' : ''}`} />
                <span>
                  {isResettingCookies
                    ? 'Đang xóa cookies phiên cũ...'
                    : 'Xóa cookies phiên cũ & Thử lại'}
                </span>
              </button>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên đăng nhập / Người dùng
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên tài khoản hoặc họ tên..."
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full min-h-[44px] px-3.5 py-2.5 pl-10 text-base sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition outline-none"
                  required
                />
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  autoComplete="current-password"
                  className="w-full min-h-[44px] px-3.5 py-2.5 pl-10 pr-11 text-base sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition outline-none"
                  required
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="min-w-[40px] min-h-[40px] absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting || isForcingLogout}
                  className="flex-1 min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/20 transition active:scale-[0.99] disabled:opacity-70"
                >
                  {isSubmitting ? 'Đang xác thực...' : 'Đăng Nhập Ngay'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition"
                >
                  Đóng
                </button>
              </div>

              <button
                type="button"
                onClick={handleRequestLogoutOtherOnly}
                disabled={isSubmitting || isForcingLogout}
                className="w-full min-h-[40px] py-2 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-70"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isForcingLogout
                    ? 'Đang gửi yêu cầu...'
                    : 'Yêu cầu đăng xuất trên thiết bị kia'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

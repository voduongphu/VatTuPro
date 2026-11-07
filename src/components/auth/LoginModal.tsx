import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { ActiveUserSession } from '../../types/inventory';
import {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Cloud,
  LogOut,
  X
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GoogleLogoIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.8H12z"
    />
    <path
      fill="#34A853"
      d="M3.2 7.3l3.2 2.4c.9-2.4 3.1-4 5.6-4 1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 8.1 2 4.8 4.2 3.2 7.3z"
    />
    <path
      fill="#FBBC05"
      d="M12 22c2.6 0 4.8-.9 6.4-2.4l-3-2.4c-.8.6-1.9 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1l-3.2 2.5C4.8 19.8 8.1 22 12 22z"
    />
    <path
      fill="#4285F4"
      d="M21.6 12.2c0-.7-.1-1.2-.2-1.8H12v3.9h5.5c-.3 1.3-1.1 2.4-2.1 3.1l3 2.4c1.8-1.6 3.2-4.1 3.2-7.6z"
    />
  </svg>
);

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const {
    loginWithGoogle,
    requestLogoutOtherDeviceWithGoogle,
    cloudState
  } = useAuth();

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [conflictSession, setConflictSession] = useState<ActiveUserSession | null>(null);
  const [conflictMessage, setConflictMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForcingLogout, setIsForcingLogout] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async (
    forceLogoutOtherDevice = false,
    forceSelectAccount = true,
    reuseExistingAccount = false
  ) => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!forceLogoutOtherDevice) {
      setConflictSession(null);
      setConflictMessage('');
    }
    setIsSubmitting(true);
    try {
      const res = await loginWithGoogle(
        forceLogoutOtherDevice,
        forceSelectAccount,
        reuseExistingAccount
      );
      if (res.success) {
        setConflictSession(null);
        setConflictMessage('');
        setSuccessMessage(res.message || 'Đăng nhập thành công!');
        setTimeout(() => {
          onClose();
          setSuccessMessage('');
        }, 500);
      } else if (res.conflict) {
        setConflictSession(res.activeSession || null);
        setConflictMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForceLogoutAndLogin = async () => {
    setIsForcingLogout(true);
    try {
      await handleGoogleSignIn(true, false, true);
    } finally {
      setIsForcingLogout(false);
    }
  };

  const handleRequestLogoutOtherOnly = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsForcingLogout(true);
    try {
      const res = await requestLogoutOtherDeviceWithGoogle();
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

  const activeGoogleEmail = (cloudState.cloudEmail || '').trim();
  const isBusy = isSubmitting || isForcingLogout;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="m-auto bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-5 sm:p-6 text-white text-center relative">
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="absolute right-3 top-3 p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="mx-auto w-12 h-12 sm:w-14 sm:h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-3 shadow-inner ring-1 ring-white/20">
            <ShieldCheck className="w-7 h-7 sm:w-8 sm:h-8 text-blue-200" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Hệ Thống Quản Lý Vật Tư</h2>
          <p className="text-blue-100 text-xs mt-1">Đăng nhập đồng bộ bằng tài khoản Google</p>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {conflictMessage && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-2.5">
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
                  disabled={isBusy}
                  className="w-full min-h-[40px] px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition flex items-center justify-center gap-1.5 disabled:opacity-70"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>
                    {isForcingLogout || isSubmitting
                      ? 'Đang chuyển phiên...'
                      : 'Đăng xuất thiết bị kia từ xa & Đăng nhập tại đây'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleRequestLogoutOtherOnly}
                  disabled={isBusy}
                  className="w-full min-h-[36px] px-3 py-1.5 bg-white hover:bg-amber-100/60 border border-amber-300 text-amber-900 font-semibold rounded-lg transition disabled:opacity-70"
                >
                  Chỉ đăng xuất thiết bị kia
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="space-y-2.5">
            {activeGoogleEmail ? (
              <>
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate">Tài khoản hiện tại: {activeGoogleEmail}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleGoogleSignIn(false, false, true)}
                  disabled={isBusy}
                  className="w-full min-h-[46px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2.5 disabled:opacity-70"
                >
                  <GoogleLogoIcon className="w-4 h-4 bg-white rounded-full p-0.5 shrink-0" />
                  <span className="truncate">
                    {isSubmitting && !isForcingLogout ? 'Đang xác thực...' : `Tiếp tục với ${activeGoogleEmail}`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGoogleSignIn(false, true, false)}
                  disabled={isBusy}
                  className="w-full min-h-[42px] py-2 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  <GoogleLogoIcon className="w-4 h-4 shrink-0" />
                  <span>Chọn tài khoản Google khác</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleGoogleSignIn(false, true, false)}
                disabled={isBusy}
                className="w-full min-h-[48px] py-3 px-4 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-blue-400 text-slate-900 font-bold text-sm rounded-xl shadow-sm transition flex items-center justify-center gap-3 disabled:opacity-70"
              >
                <GoogleLogoIcon className="w-5 h-5 shrink-0" />
                <span>
                  {isSubmitting && !isForcingLogout ? 'Đang mở xác thực Google...' : 'Đăng nhập bằng tài khoản Google'}
                </span>
              </button>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

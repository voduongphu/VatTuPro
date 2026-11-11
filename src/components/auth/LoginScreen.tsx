import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage, LanguageSwitcher } from '../../context/LanguageContext';
import type { ActiveUserSession } from '../../types/inventory';
import {
  Boxes,
  User,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Warehouse,
  Layers,
  MonitorSmartphone,
  LogOut,
  Clock,
  Cloud,
  RefreshCw,
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

export const LoginScreen: React.FC = () => {
  const {
    loginWithGoogle,
    requestLogoutOtherDeviceWithGoogle,
    cloudState,
    sessionKickNotice,
    sessionKickAlert,
    isKickModalOpen,
    acknowledgeKickModal,
    clearSessionKickNotice
  } = useAuth();
  const { t } = useLanguage();

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [conflictSession, setConflictSession] = useState<ActiveUserSession | null>(null);
  const [conflictMessage, setConflictMessage] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isRequestingRemoteLogout, setIsRequestingRemoteLogout] = useState(false);

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
    clearSessionKickNotice();
    setIsAuthenticating(true);
    try {
      const res = await loginWithGoogle(
        forceLogoutOtherDevice,
        forceSelectAccount,
        reuseExistingAccount
      );
      if (res.success) {
        setConflictSession(null);
        setConflictMessage('');
        setSuccessMessage(res.message || 'Đăng nhập Google thành công! Đang chuyển vào hệ thống...');
      } else if (res.conflict) {
        setConflictSession(res.activeSession || null);
        setConflictMessage(res.message);
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleForceLogoutAndContinue = async () => {
    setIsRequestingRemoteLogout(true);
    try {
      await handleGoogleSignIn(true, false, true);
    } finally {
      setIsRequestingRemoteLogout(false);
    }
  };

  const handleRequestLogoutOtherOnly = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    clearSessionKickNotice();
    setIsRequestingRemoteLogout(true);
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
      setIsRequestingRemoteLogout(false);
    }
  };

  const activeGoogleEmail = (cloudState.cloudEmail || '').trim();
  const isBusy = isAuthenticating || isRequestingRemoteLogout;

  return (
    <div className="min-h-dvh w-full bg-slate-950 overflow-x-auto overflow-y-auto relative font-sans">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(37,99,235,0.22),rgba(255,255,255,0))] pointer-events-none" />

      {/* Floating Language Switcher top right on wide screen */}
      <div className="absolute top-3 sm:top-5 right-3 sm:right-6 z-20">
        <LanguageSwitcher variant="dark" showLabel={true} />
      </div>

      <div className="min-h-dvh w-full flex p-3 sm:p-6 lg:p-8">
        <div className="m-auto w-full max-w-6xl bg-slate-900 border border-slate-800/90 rounded-2xl sm:rounded-3xl shadow-2xl shadow-black/60 overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10">
          {/* Cột Đăng Nhập Google: Ưu tiên hiển thị đầu tiên trên điện thoại (order-1), nằm bên phải trên máy tính (lg:order-2) */}
          <div className="order-1 lg:order-2 lg:col-span-7 p-5 sm:p-10 lg:p-12 bg-slate-900 flex flex-col justify-center">
            <div className="max-w-md mx-auto w-full space-y-5 sm:space-y-6">
              {/* Compact Brand Lockup chỉ hiện trên điện thoại/tablet */}
              <div className="lg:hidden flex items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/30 shrink-0">
                    <Boxes className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-extrabold text-sm tracking-tight text-white block truncate">
                      {t('appTitle')}
                    </span>
                    <span className="text-[11px] text-slate-400 block truncate">
                      {t('heroSubbrand')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tiêu đề & Language Switcher */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>{t('googleAuthHeaderBadge')}</span>
                  </div>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {t('googleAuthTitle')}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                  {t('googleAuthDesc')}
                </p>
              </div>

              {/* Cảnh báo khi bị đăng xuất tự động do đăng nhập ở thiết bị khác */}
              {sessionKickNotice && (
                <div className="p-3.5 sm:p-4 bg-amber-950/85 border border-amber-700/80 rounded-2xl text-amber-200 text-xs flex items-start gap-2.5 shadow-lg">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <div className="font-bold text-amber-300 mb-0.5">
                      {t('sessionTerminatedTitle')}
                    </div>
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

              {/* Cảnh báo chặn đăng nhập đồng thời trên 2 thiết bị + Thao tác 1 chạm chuyển phiên */}
              {conflictMessage && (
                <div className="p-4 bg-amber-950/85 border border-amber-600/80 rounded-2xl text-amber-100 text-xs space-y-3 shadow-lg">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                    <div className="flex-1 leading-relaxed">
                      <div className="font-bold text-amber-300 text-sm mb-0.5">
                        Tài khoản Google đang hoạt động trên thiết bị khác
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
                      onClick={handleForceLogoutAndContinue}
                      disabled={isBusy}
                      className="flex-1 min-h-[44px] px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-70"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>
                        {isRequestingRemoteLogout || isAuthenticating
                          ? t('sendingRequest')
                          : t('forceLogoutAndContinue')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestLogoutOtherOnly}
                      disabled={isBusy}
                      className="min-h-[44px] px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-amber-600/60 text-amber-200 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-70"
                    >
                      <span>{t('requestLogoutOnly')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Thông báo lỗi */}
              {errorMessage && (
                <div className="p-3.5 bg-rose-950/75 border border-rose-800 rounded-2xl text-rose-200 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="font-medium leading-relaxed">{errorMessage}</span>
                </div>
              )}

              {/* Thông báo thành công */}
              {successMessage && (
                <div className="p-3.5 bg-emerald-950/75 border border-emerald-800 rounded-2xl text-emerald-200 text-xs flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span className="font-medium leading-relaxed">{successMessage}</span>
                </div>
              )}

              {/* Khối nút Đăng Nhập Google Chính */}
              <div className="p-5 sm:p-6 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4 shadow-inner">
                {activeGoogleEmail ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200">
                      <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-emerald-300/80">
                          {activeGoogleEmail}
                        </div>
                        <div className="font-bold text-white truncate">{activeGoogleEmail}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn(false, false, true)}
                      disabled={isBusy}
                      className="w-full min-h-[52px] py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold text-sm rounded-xl shadow-lg shadow-blue-950/40 transition active:scale-[0.99] flex items-center justify-center gap-3 disabled:opacity-70"
                    >
                      {isAuthenticating && !isRequestingRemoteLogout ? (
                        <>
                          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                          <span>{t('syncing')}</span>
                        </>
                      ) : (
                        <>
                          <GoogleLogoIcon className="w-5 h-5 shrink-0" />
                          <span className="truncate">Google: {activeGoogleEmail}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleGoogleSignIn(false, true, false)}
                      disabled={isBusy}
                      className="w-full min-h-[44px] py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <GoogleLogoIcon className="w-4 h-4 shrink-0" />
                      <span>{t('switchGoogleAccountBtn')}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleGoogleSignIn(false, true, false)}
                    disabled={isBusy}
                    className="w-full min-h-[54px] py-3.5 px-5 bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-sm sm:text-base rounded-xl shadow-xl shadow-blue-950/50 transition active:scale-[0.99] flex items-center justify-center gap-3 disabled:opacity-70"
                  >
                    {isAuthenticating && !isRequestingRemoteLogout ? (
                      <>
                        <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                        <span>{t('openingGoogleAuth')}</span>
                      </>
                    ) : (
                      <>
                        <GoogleLogoIcon className="w-5 h-5 shrink-0" />
                        <span>{t('loginWithGoogle')}</span>
                      </>
                    )}
                  </button>
                )}

                <div className="pt-2 border-t border-slate-800/80 space-y-2 text-[11px] text-slate-400 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{t('adminDefaultNotice')}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Cloud className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>{t('staffNotice')}</span>
                  </div>
                </div>
              </div>

              <div className="text-center text-xs text-slate-500">
                {t('singleDeviceNotice')}
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
                    {t('appTitle')}
                  </span>
                  <span className="text-xs font-medium text-blue-300">
                    {t('heroSubbrand')}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <h1 className="text-lg sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-snug text-balance">
                  {t('heroTitle')}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {t('heroSubtitle')}
                </p>
              </div>
            </div>

            <div className="my-5 lg:my-8 space-y-2.5 sm:space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300 shrink-0">
                  <Warehouse className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-white block">{t('heroFeatureRealtime')}</span>
                  <span className="text-[11px] text-slate-400">
                    {t('heroFeatureRealtimeDesc')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-white block">{t('heroFeatureExcel')}</span>
                  <span className="text-[11px] text-slate-400">
                    {t('heroFeatureExcelDesc')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-white block">{t('heroFeatureSecurity')}</span>
                  <span className="text-[11px] text-slate-400">
                    {t('heroFeatureSecurityDesc')}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-400">
              <span>{t('heroFooterSystem')}</span>
              <span>Google OAuth 2.0</span>
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

              {(sessionKickAlert.username ||
                sessionKickAlert.deviceLabel ||
                sessionKickAlert.loginAt) && (
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
                  Nếu không phải bạn vừa đăng nhập trên thiết bị mới, vui lòng đăng nhập lại bằng tài khoản Google và kiểm tra bảo mật tài khoản của bạn.
                </p>
              )}

              <button
                type="button"
                onClick={acknowledgeKickModal}
                className="w-full min-h-[48px] py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition active:scale-[0.99]"
              >
                Đã hiểu & Quay lại đăng nhập Google
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

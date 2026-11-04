import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SyncService } from '../../services/syncService';
import {
  Boxes,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldCheck,
  MonitorSmartphone,
  CheckCircle2,
  AlertCircle,
  Cloud,
  CloudOff,
  LogIn,
  ChevronDown,
  Menu,
  X
} from 'lucide-react';
import { LoginModal } from '../auth/LoginModal';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';

interface NavbarProps {
  onOpenMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenMobileMenu }) => {
  const {
    currentUser,
    cloudState,
    connectCloudSync,
    disconnectCloudSync,
    logout,
    forceLogoutOtherDevicesFromCurrent,
    isAdmin
  } = useAuth();
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConnectingCloud, setIsConnectingCloud] = useState(false);
  const [isForcingRemoteLogout, setIsForcingRemoteLogout] = useState(false);
  const [remoteLogoutNotice, setRemoteLogoutNotice] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    return SyncService.subscribeSyncState(setIsSyncing);
  }, []);

  useEffect(() => {
    if (!remoteLogoutNotice) return;
    const timer = setTimeout(() => {
      setRemoteLogoutNotice(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [remoteLogoutNotice]);

  const handleManualSync = () => {
    void SyncService.syncNow();
  };

  const handleConnectCloud = async () => {
    setIsUserMenuOpen(false);
    setIsConnectingCloud(true);
    try {
      const res = await connectCloudSync();
      setRemoteLogoutNotice({
        success: res.success,
        message: res.message
      });
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleSwitchCloudAccount = async () => {
    setIsUserMenuOpen(false);
    setIsConnectingCloud(true);
    try {
      await disconnectCloudSync();
      const res = await connectCloudSync();
      setRemoteLogoutNotice({
        success: res.success,
        message: res.message
      });
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleDisconnectCloud = async () => {
    setIsUserMenuOpen(false);
    await disconnectCloudSync();
    setRemoteLogoutNotice({
      success: true,
      message: 'Đã ngắt kết nối Đám mây Google trên trình duyệt này.'
    });
  };

  const handleForceLogoutOtherDevices = async () => {
    setIsUserMenuOpen(false);
    setIsForcingRemoteLogout(true);
    try {
      const res = await forceLogoutOtherDevicesFromCurrent();
      setRemoteLogoutNotice(res);
    } finally {
      setIsForcingRemoteLogout(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 bg-slate-900 border-b border-slate-800 text-white shrink-0 z-40 w-full">
        <div className="w-full px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Mobile Drawer Trigger + Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {onOpenMobileMenu && (
              <button
                type="button"
                onClick={onOpenMobileMenu}
                aria-label="Mở danh mục điều hướng"
                className="lg:hidden min-w-[44px] min-h-[44px] -ml-1 rounded-xl flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800 transition shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20 text-white shrink-0">
              <Boxes className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>

            <div className="min-w-0">
              <span className="font-extrabold text-xs sm:text-sm md:text-base tracking-tight text-white block truncate">
                LOGISTICS & INVENTORY
              </span>
              <p className="text-[11px] text-slate-400 hidden md:block truncate">
                Quản Lý Nhập - Xuất - Tồn Vật Tư Thiết Bị Dự Án
              </p>
            </div>
          </div>

          {/* Right: Cloud Status + Sync + User Account */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap">
            {cloudState.status === 'connected' ? (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                title={`Đã kết nối Đám mây (${cloudState.cloudEmail || 'Google'}) — Bấm để đồng bộ ngay`}
                className="min-h-[40px] flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-200 hover:text-white bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-700/60 transition disabled:opacity-70 shrink-0"
              >
                <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="hidden md:inline">Đám mây</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectCloud}
                disabled={isConnectingCloud}
                title="Bấm để kết nối Đám mây Google — Tự động đồng bộ dữ liệu thời gian thực giữa Điện thoại & Máy tính"
                className="min-h-[40px] flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-amber-200 hover:text-white bg-amber-950/80 hover:bg-amber-900/80 border border-amber-600/70 transition disabled:opacity-70 shrink-0"
              >
                <CloudOff className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="hidden sm:inline">
                  {isConnectingCloud ? 'Đang kết nối...' : 'Kết nối Đám mây'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              title="Đồng bộ cộng gộp dữ liệu mới nhất giữa các thiết bị"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition disabled:opacity-70 shrink-0"
            >
              <RefreshCw className={`w-4 h-4 text-emerald-400 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Đang đồng bộ...' : 'Đồng Bộ'}</span>
            </button>

            {currentUser ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="min-h-[40px] flex items-center gap-2 p-1 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-slate-700 transition text-left"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isAdmin ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {currentUser.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="hidden md:block">
                    <div className="text-xs font-semibold text-white flex items-center gap-1">
                      <span className="max-w-[160px] truncate">{currentUser.fullName}</span>
                      {isAdmin && <ShieldCheck className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {isAdmin ? 'Quản trị viên (Admin)' : 'Nhân viên kho'}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 mr-0.5 sm:mr-0" />
                </button>

                {isUserMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 text-slate-700 text-xs z-50">
                      <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                        <div className="font-bold text-slate-900 truncate">{currentUser.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">@{currentUser.username}</div>
                        {cloudState.status === 'connected' ? (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium truncate">
                            <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">Đám mây: {cloudState.cloudEmail}</span>
                          </div>
                        ) : (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-700 font-medium">
                            <CloudOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Chưa kết nối Đám mây Google</span>
                          </div>
                        )}
                      </div>

                      {cloudState.status === 'connected' ? (
                        <>
                          <button
                            type="button"
                            onClick={handleSwitchCloudAccount}
                            disabled={isConnectingCloud}
                            className="w-full min-h-[42px] px-4 py-2 text-left hover:bg-emerald-50 text-emerald-800 flex items-center gap-2.5 font-medium"
                          >
                            <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Đổi tài khoản Google Đám mây</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleDisconnectCloud}
                            className="w-full min-h-[40px] px-4 py-2 text-left hover:bg-slate-50 text-slate-600 flex items-center gap-2.5"
                          >
                            <CloudOff className="w-4 h-4 text-slate-400 shrink-0" />
                            <span>Ngắt kết nối Đám mây trên máy này</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={handleConnectCloud}
                          disabled={isConnectingCloud}
                          className="w-full min-h-[44px] px-4 py-2.5 text-left bg-amber-50/70 hover:bg-amber-100/80 text-amber-900 flex items-center gap-2.5 font-semibold"
                        >
                          <Cloud className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Kết nối Đám mây Google (Đồng bộ Đa Thiết Bị)</span>
                        </button>
                      )}

                      <div className="border-t border-slate-100 my-1" />

                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          setIsChangePassModalOpen(true);
                        }}
                        className="w-full min-h-[44px] px-4 py-2.5 text-left hover:bg-slate-50 flex items-center gap-2.5"
                      >
                        <KeyRound className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>Đổi mật khẩu cá nhân</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleForceLogoutOtherDevices}
                        disabled={isForcingRemoteLogout}
                        className="w-full min-h-[44px] px-4 py-2.5 text-left hover:bg-amber-50 text-amber-800 flex items-center gap-2.5 font-medium disabled:opacity-60"
                      >
                        <MonitorSmartphone className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {isForcingRemoteLogout
                            ? 'Đang gửi yêu cầu...'
                            : 'Yêu cầu đăng xuất trên thiết bị kia'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          logout();
                        }}
                        className="w-full min-h-[44px] px-4 py-2.5 text-left hover:bg-slate-50 flex items-center gap-2.5 text-blue-700"
                      >
                        <LogIn className="w-4 h-4 shrink-0" />
                        <span>Đăng nhập tài khoản khác</span>
                      </button>

                      <div className="border-t border-slate-100 mt-1 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsUserMenuOpen(false);
                            logout();
                          }}
                          className="w-full min-h-[44px] px-4 py-2.5 text-left hover:bg-rose-50 text-rose-600 flex items-center gap-2.5 font-semibold"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          <span>Đăng xuất</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md transition shrink-0"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng Nhập</span>
              </button>
            )}
          </div>
        </div>

        {remoteLogoutNotice && (
          <div
            className={`px-3 sm:px-6 py-2 text-xs flex items-center justify-between gap-2 border-t ${
              remoteLogoutNotice.success
                ? 'bg-emerald-950/95 border-emerald-800 text-emerald-200'
                : 'bg-rose-950/95 border-rose-800 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {remoteLogoutNotice.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span className="truncate">{remoteLogoutNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setRemoteLogoutNotice(null)}
              className="p-1 rounded-lg hover:bg-white/10 transition shrink-0"
              title="Đóng thông báo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </header>

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <ChangePasswordModal
        isOpen={isChangePassModalOpen}
        onClose={() => setIsChangePassModalOpen(false)}
      />
    </>
  );
};

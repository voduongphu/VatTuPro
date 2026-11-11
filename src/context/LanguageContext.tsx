import React, { createContext, useContext, useState, useEffect } from 'react';
import { Globe, Languages } from 'lucide-react';

export type AppLanguage = 'vi' | 'en';

const TRANSLATIONS = {
  vi: {
    // Top Bar & Brand
    appTitle: 'LOGISTICS & INVENTORY',
    appSubtitle: 'Quản Lý Nhập - Xuất - Tồn Vật Tư Thiết Bị Dự Án',
    cloudSync: 'Đồng Bộ Cloud',
    syncing: 'Đang đồng bộ...',
    cloudSyncedTooltip: 'Đã kết nối Google Cloud — Bấm để đồng bộ toàn bộ dữ liệu & tài khoản lên Cloud ngay',
    cloudConnectTooltip: 'Bấm để tự động kết nối & đồng bộ toàn bộ dữ liệu kho bãi cùng tài khoản người dùng lên Cloud Firestore (tránh sót)',
    switchGoogleAccount: 'Đổi tài khoản Google khác',
    requestLogoutOther: 'Yêu cầu đăng xuất trên thiết bị kia',
    sendingRequest: 'Đang gửi yêu cầu...',
    logout: 'Đăng xuất',
    adminBadge: 'Quản trị viên chính (Admin)',
    googleUserBadge: 'Tài khoản Google đồng bộ',
    sessionAlertTitle: 'Cảnh báo phiên đăng nhập:',
    understand: 'Đã hiểu',
    languageToggleTooltip: 'Chuyển sang Tiếng Anh (Switch to English)',
    languageCurrent: 'Tiếng Việt',

    // Navigation / Sidebar
    navOverview: 'Tổng Quan & KPI',
    navInbound: 'Quản Lý Nhập Kho',
    navOutbound: 'Quản Lý Xuất Kho',
    navOsd: 'Quản Lý Vật Tư OSD',
    navReports: 'Báo Cáo Nhập-Xuất-Tồn',
    navCategorySection: 'Quản trị danh mục',
    navWarehouses: 'Quản Lý Kho Bãi',
    navMaterials: 'Danh Mục Vật Tư',
    navUsers: 'Người Sử Dụng',

    // Mobile Quick Tabs
    quickTabDashboard: 'Tổng quan',
    quickTabInbound: 'Nhập kho',
    quickTabOutbound: 'Xuất kho',
    quickTabOsd: 'Vật tư OSD',
    quickTabReport: 'Báo cáo NXT',
    quickTabWarehouses: 'Kho bãi',
    quickTabMaterials: 'Vật tư',
    quickTabUsers: 'Người dùng',

    // Login Screen
    loginWithGoogle: 'Đăng nhập bằng tài khoản Google',
    openingGoogleAuth: 'Đang mở xác thực Google...',
    googleAuthHeaderBadge: 'Xác thực đồng bộ bằng Google Cloud',
    googleAuthTitle: 'Đăng Nhập Bằng Google',
    googleAuthDesc: 'Đăng nhập trực tiếp bằng tài khoản Google (Gmail) để vào hệ thống và tự động đồng bộ dữ liệu thời gian thực giữa Máy tính và Điện thoại.',
    singleDeviceNotice: 'Mỗi tài khoản Google chỉ hoạt động trên 1 thiết bị tại một thời điểm để bảo vệ toàn vẹn tồn kho.',
    adminDefaultNotice: 'Tài khoản voduongphu@gmail.com được phân quyền mặc định là Quản trị viên chính (Admin).',
    staffNotice: 'Nhân sự kho đăng nhập bằng tài khoản Google cá nhân để tự động đồng bộ dữ liệu theo thời gian thực. Admin phân quyền chi tiết trong mục Người Sử Dụng.',
    heroTitle: 'Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư',
    heroSubtitle: 'Giải pháp quản trị kho vật tư thiết bị dự án công trình chuyên sâu theo Packing List, Shipment, Package No., Kiện hàng, Nhà sản xuất & Nhà cung cấp.',
    heroSubbrand: 'Quản trị kho vận thiết bị dự án',
    heroFeatureRealtime: 'Đồng Bộ Google Cloud Thời Gian Thực',
    heroFeatureRealtimeDesc: 'Đăng nhập 1 chạm bằng Google, tự động cộng gộp dữ liệu mọi thiết bị',
    heroFeatureExcel: 'Nhập Xuất & Import File Excel Lớn',
    heroFeatureExcelDesc: 'Xử lý mượt mà trên 100.000 dòng dữ liệu vật tư',
    heroFeatureSecurity: 'Bảo Mật Phiên Đơn Thiết Bị',
    heroFeatureSecurityDesc: 'Tự động ngắt phiên cũ khi chuyển sang máy mới',
    heroFooterSystem: 'Hệ thống Quản lý Kho vận Công trình',
    sessionTerminatedTitle: 'Đã tự động thoát phiên trên thiết bị này',
    conflictTitle: 'Tài khoản Google đang hoạt động trên thiết bị khác',
    conflictDeviceLabel: 'Thiết bị đang mở:',
    conflictLoginAt: 'Đăng nhập lúc:',
    forceLogoutAndContinue: 'Đăng xuất thiết bị kia & Vào hệ thống',
    requestLogoutOnly: 'Chỉ gửi yêu cầu đăng xuất thiết bị kia',
    switchGoogleAccountBtn: 'Chọn tài khoản Google khác',
    retryGoogleLogin: 'Thử lại đăng nhập Google'
  },
  en: {
    // Top Bar & Brand
    appTitle: 'LOGISTICS & INVENTORY',
    appSubtitle: 'Project Equipment & Material Logistics Management',
    cloudSync: 'Cloud Sync',
    syncing: 'Syncing...',
    cloudSyncedTooltip: 'Connected to Google Cloud — Click to synchronize all data & accounts to Cloud now',
    cloudConnectTooltip: 'Click to auto-connect & synchronize all warehouse data and user accounts to Cloud Firestore',
    switchGoogleAccount: 'Switch Google Account',
    requestLogoutOther: 'Request Logout on Other Device',
    sendingRequest: 'Sending request...',
    logout: 'Log Out',
    adminBadge: 'Main Administrator (Admin)',
    googleUserBadge: 'Synced Google Account',
    sessionAlertTitle: 'Session Alert:',
    understand: 'Understood',
    languageToggleTooltip: 'Switch to Vietnamese (Chuyển sang Tiếng Việt)',
    languageCurrent: 'English',

    // Navigation / Sidebar
    navOverview: 'Dashboard & KPIs',
    navInbound: 'Inbound Receipts',
    navOutbound: 'Outbound Issues',
    navOsd: 'OSD Discrepancies',
    navReports: 'Inventory Reports',
    navCategorySection: 'Master Catalogs',
    navWarehouses: 'Warehouse Setup',
    navMaterials: 'Materials Catalog',
    navUsers: 'User Accounts',

    // Mobile Quick Tabs
    quickTabDashboard: 'Dashboard',
    quickTabInbound: 'Inbound',
    quickTabOutbound: 'Outbound',
    quickTabOsd: 'OSD Items',
    quickTabReport: 'Reports',
    quickTabWarehouses: 'Warehouses',
    quickTabMaterials: 'Materials',
    quickTabUsers: 'Users',

    // Login Screen
    loginWithGoogle: 'Sign in with Google Account',
    openingGoogleAuth: 'Opening Google authentication...',
    googleAuthHeaderBadge: 'Authenticated via Google Cloud',
    googleAuthTitle: 'Sign In With Google',
    googleAuthDesc: 'Sign in directly with your Google account (Gmail) to access the system and sync real-time inventory between PC and Mobile.',
    singleDeviceNotice: 'Each Google account is restricted to 1 active device at a time to preserve inventory integrity.',
    adminDefaultNotice: 'Account voduongphu@gmail.com is granted default Main Administrator (Admin) privileges.',
    staffNotice: 'Warehouse personnel log in with their personal Google accounts for live sync. Admin manages role assignments under User Accounts.',
    heroTitle: 'Logistics & Inventory Management System',
    heroSubtitle: 'Enterprise construction project inventory management by Packing List, Shipment, Package No., Crate/Bundle, Manufacturer & Supplier.',
    heroSubbrand: 'Project equipment logistics governance',
    heroFeatureRealtime: 'Real-Time Google Cloud Sync',
    heroFeatureRealtimeDesc: 'One-tap Google sign-in with automatic data consistency across all devices',
    heroFeatureExcel: 'Inbound/Outbound & Bulk Excel Import',
    heroFeatureExcelDesc: 'Effortlessly processes 100,000+ inventory line items',
    heroFeatureSecurity: 'Single-Device Session Guard',
    heroFeatureSecurityDesc: 'Automatically revokes prior session when switching devices',
    heroFooterSystem: 'Construction Project Logistics System',
    sessionTerminatedTitle: 'Session ended on this device',
    conflictTitle: 'Google account is currently active on another device',
    conflictDeviceLabel: 'Active device:',
    conflictLoginAt: 'Logged in at:',
    forceLogoutAndContinue: 'Log Out Other Device & Proceed',
    requestLogoutOnly: 'Request Logout on Other Device Only',
    switchGoogleAccountBtn: 'Choose Another Google Account',
    retryGoogleLogin: 'Retry Google Login'
  }
};

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (key: keyof typeof TRANSLATIONS['vi']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'vtp_app_language';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === 'en' || stored === 'vi') return stored;
    } catch {
      // ignore localStorage read error
    }
    return 'vi';
  });

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'vi' ? 'en' : 'vi');
  };

  const t = (key: keyof typeof TRANSLATIONS['vi']): string => {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS['vi']?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

/**
 * Nút chuyển đổi ngôn ngữ Tiếng Anh / Tiếng Việt tiện dụng, thẩm mỹ cao
 */
export const LanguageSwitcher: React.FC<{
  variant?: 'light' | 'dark' | 'pill';
  showLabel?: boolean;
  className?: string;
}> = ({ variant = 'dark', showLabel = true, className = '' }) => {
  const { language, setLanguage, toggleLanguage, t } = useLanguage();

  if (variant === 'pill') {
    return (
      <div
        className={`inline-flex items-center p-0.5 rounded-xl border border-slate-700/80 bg-slate-800/90 shadow-sm ${className}`}
        role="group"
        aria-label="Language switch"
      >
        <button
          type="button"
          onClick={() => setLanguage('vi')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
            language === 'vi'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Tiếng Việt"
        >
          VI
        </button>
        <button
          type="button"
          onClick={() => setLanguage('en')}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
            language === 'en'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="English"
        >
          EN
        </button>
      </div>
    );
  }

  const isLight = variant === 'light';

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={t('languageToggleTooltip')}
      className={`min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition active:scale-95 shrink-0 ${
        isLight
          ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs'
          : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700 shadow-xs'
      } ${className}`}
    >
      <Languages className={`w-4 h-4 shrink-0 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
      <span className="font-bold tracking-wide">
        {language === 'vi' ? 'VI' : 'EN'}
      </span>
      {showLabel && (
        <span className="hidden sm:inline text-[11px] opacity-80 border-l pl-1.5 border-slate-500/40">
          {language === 'vi' ? 'Tiếng Việt' : 'English'}
        </span>
      )}
    </button>
  );
};

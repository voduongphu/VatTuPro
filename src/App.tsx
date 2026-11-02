/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { InboundManager } from './components/inbound/InboundManager';
import { OutboundManager } from './components/outbound/OutboundManager';
import { InventoryReport } from './components/reports/InventoryReport';
import { WarehouseManager } from './components/warehouses/WarehouseManager';
import { MaterialCatalog } from './components/materials/MaterialCatalog';
import { UserManager } from './components/users/UserManager';
import { LoginScreen } from './components/auth/LoginScreen';
import {
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Warehouse,
  Package,
  Users,
  AlertTriangle,
  X
} from 'lucide-react';

const MOBILE_QUICK_TABS = [
  { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'inbound', label: 'Nhập kho', icon: ArrowDownLeft },
  { id: 'outbound', label: 'Xuất kho', icon: ArrowUpRight },
  { id: 'report', label: 'Báo cáo NXT', icon: BarChart3 },
  { id: 'warehouses', label: 'Kho bãi', icon: Warehouse },
  { id: 'materials', label: 'Vật tư', icon: Package },
  { id: 'users', label: 'Người dùng', icon: Users }
];

const MainLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const { currentUser, replacedOtherDeviceAlert, clearReplacedOtherDeviceAlert } = useAuth();

  useEffect(() => {
    if (!replacedOtherDeviceAlert) return;
    const timer = setTimeout(() => {
      clearReplacedOtherDeviceAlert();
    }, 15000);
    return () => clearTimeout(timer);
  }, [replacedOtherDeviceAlert, clearReplacedOtherDeviceAlert]);

  // Hiển thị màn hình đăng nhập nếu người dùng chưa xác thực
  if (!currentUser) {
    return <LoginScreen />;
  }

  const handleSelectTab = (tab: string) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardOverview onNavigate={handleSelectTab} />;
      case 'inbound':
        return <InboundManager />;
      case 'outbound':
        return <OutboundManager />;
      case 'report':
        return <InventoryReport />;
      case 'warehouses':
        return <WarehouseManager />;
      case 'materials':
        return <MaterialCatalog />;
      case 'users':
        return <UserManager />;
      default:
        return <DashboardOverview onNavigate={handleSelectTab} />;
    }
  };

  return (
    <div className="min-h-dvh w-full bg-slate-100/70 flex flex-col font-sans">
      <Navbar onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />

      {/* Cảnh báo rõ ràng trên thiết bị mới khi hệ thống vừa tự động đăng xuất tài khoản ở thiết bị khác */}
      {replacedOtherDeviceAlert && (
        <div className="w-full bg-amber-50 border-b border-amber-300/90 px-3 sm:px-6 py-2.5 text-amber-950 shadow-sm">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/50 flex items-center justify-center text-amber-700 shrink-0 mt-0.5 sm:mt-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-xs leading-relaxed min-w-0">
                <span className="font-bold text-amber-900 mr-1.5">
                  Cảnh báo phiên đăng nhập:
                </span>
                <span className="text-amber-800">{replacedOtherDeviceAlert.message}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={clearReplacedOtherDeviceAlert}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-amber-200/70 hover:bg-amber-300/80 text-amber-950 font-bold text-xs flex items-center gap-1 shrink-0 transition"
            >
              <span>Đã hiểu</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Thanh chuyển tab nhanh trên điện thoại & máy tính bảng (cuộn ngang tự nhiên, không chiếm vùng cố định màn hình) */}
      <div className="lg:hidden w-full bg-white border-b border-slate-200/80 px-3 py-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max">
          {MOBILE_QUICK_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100/80 text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 w-full flex flex-row items-stretch min-w-0">
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleSelectTab}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        <main className="flex-1 min-w-0 p-3 sm:p-5 lg:p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}

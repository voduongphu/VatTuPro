import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Globe, Languages } from 'lucide-react';
import { COMPREHENSIVE_UI_PHRASES_EN } from './translationsDict';

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

/**
 * Từ điển các cụm từ UI cố định xuất hiện trong các tab (Chỉ dịch các nhãn nút, tiêu đề bảng, filter...
 * Tuyệt đối không dịch nội dung dữ liệu do người dùng tự nhập)
 */
const UI_PHRASES_EN: Record<string, string> = {
  // Common Actions & Controls
  'Tìm kiếm': 'Search',
  'Tìm kiếm...': 'Search...',
  'Tìm kiếm vật tư...': 'Search materials...',
  'Tìm kiếm vật tư, số phiếu...': 'Search materials, vouchers...',
  'Tìm kiếm theo mã, tên vật tư...': 'Search by code, material name...',
  'Tìm kiếm kho bãi...': 'Search warehouses...',
  'Tìm kiếm người dùng...': 'Search users...',
  'Thêm mới': 'Add New',
  'Thêm Mới': 'Add New',
  'Thêm vật tư': 'Add Material',
  'Thêm vật tư mới': 'Add New Material',
  'Thêm Vật Tư Mới': 'Add New Material',
  'Thêm kho mới': 'Add New Warehouse',
  'Thêm Kho Mới': 'Add New Warehouse',
  'Thêm người dùng': 'Add User',
  'Thêm Người Dùng': 'Add User',
  'Thêm dòng': 'Add Row',
  'Thêm dòng mới': 'Add New Row',
  'Thêm Dòng Vật Tư': 'Add Material Line',
  'Thêm từ danh mục': 'Add from Catalog',
  'Thêm từ tồn kho': 'Add from Stock',
  'Chọn nhiều mục': 'Select Multiple',
  'Chọn tất cả': 'Select All',
  'Bỏ chọn tất cả': 'Deselect All',
  '+ Chọn': '+ Select',
  '+Chọn': '+ Select',
  'Đã chọn': 'Selected',
  'Chỉnh sửa': 'Edit',
  'Sửa': 'Edit',
  'Xóa': 'Delete',
  'Xóa mục này': 'Delete this item',
  'Xóa các mục đã chọn': 'Delete Selected',
  'Xóa Các Mục Đã Chọn': 'Delete Selected Items',
  'Xóa tất cả': 'Delete All',
  'Xóa Tất Cả': 'Delete All',
  'Xóa phiếu': 'Delete Voucher',
  'Lưu': 'Save',
  'Lưu lại': 'Save',
  'Lưu thay đổi': 'Save Changes',
  'Lưu thông tin': 'Save Information',
  'Lưu phiếu': 'Save Voucher',
  'Lưu phiếu nhập': 'Save Inbound Receipt',
  'Lưu phiếu xuất': 'Save Outbound Issue',
  'Lưu kho bãi': 'Save Warehouse',
  'Lưu Kho Bãi': 'Save Warehouse',
  'Hủy': 'Cancel',
  'Hủy bỏ': 'Cancel',
  'Đóng': 'Close',
  'Xác nhận': 'Confirm',
  'Xác Nhận Xóa': 'Confirm Deletion',
  'Hành động này không thể hoàn tác': 'This action cannot be undone',
  'Chi tiết': 'Details',
  'Xem chi tiết': 'View Details',
  'Xem trước': 'Preview',
  'In phiếu': 'Print Voucher',
  'In ấn': 'Print',
  'Xuất Excel': 'Export Excel',
  'Xuất file Excel': 'Export Excel File',
  'Xuất Báo Cáo Excel': 'Export Excel Report',
  'Tải mẫu Excel': 'Download Excel Template',
  'Tải file mẫu': 'Download Template',
  'Import Excel': 'Import Excel',
  'Import Packing List Excel': 'Import Packing List Excel',
  'Nhập File Excel': 'Import Excel File',
  'Nhập File Excel Danh Mục': 'Import Materials Excel File',
  'Đặt lại': 'Reset',
  'Đặt lại bộ lọc': 'Reset Filters',
  'Làm mới': 'Refresh',
  'Quay lại': 'Back',
  'Tiếp tục': 'Continue',
  'Hoàn tất': 'Finish',
  'Cập nhật': 'Update',

  // Table Column Headers & Badges
  'STT': 'No.',
  'Mã vật tư': 'Material Code',
  'Mã Vật Tư': 'Material Code',
  'Mã VT': 'Item Code',
  'Tên vật tư': 'Material Name',
  'Tên Vật Tư': 'Material Name',
  'Tên vật tư (*)': 'Material Name (*)',
  'Tên Vật Tư Thiết Bị': 'Equipment & Material Name',
  'Tên vật tư & Quy cách': 'Material Name & Spec',
  'Quy cách': 'Specification',
  'Quy cách / Tiêu chuẩn': 'Specification / Standard',
  'Quy Cách & Ghi Chú': 'Specification & Notes',
  'Đơn vị tính': 'Unit',
  'ĐVT': 'Unit',
  'Đơn Vị': 'Unit',
  'Số lượng': 'Quantity',
  'Số Lượng': 'Quantity',
  'SL': 'Qty',
  'Số lượng (cây/tấm)': 'Quantity (pcs/sheets)',
  'Khối lượng': 'Weight',
  'Khối Lượng': 'Weight',
  'Khối lượng (Kg)': 'Weight (Kg)',
  'Tổng Khối Lượng (Kg)': 'Total Weight (Kg)',
  'Tổng Khối Lượng': 'Total Weight',
  'Tổng Số Lượng': 'Total Quantity',
  'Đơn trọng (Kg)': 'Unit Weight (Kg)',
  'KL đơn vị (Kg)': 'Unit Weight (Kg)',
  'KL Chuẩn (kg)': 'Std Weight (kg)',
  'Đơn giá': 'Unit Price',
  'Đơn giá (VNĐ)': 'Unit Price (VND)',
  'Thành tiền': 'Amount',
  'Thành tiền (VNĐ)': 'Total Amount (VND)',
  'Thành Tiền (VNĐ)': 'Total Amount (VND)',
  'Hạng mục': 'Category',
  'Hạng Mục': 'Category',
  'Hạng Mục Thi Công': 'Construction Work Item',
  'Số lô': 'Lot No.',
  'Mã lô': 'Lot No.',
  'Mã Lô': 'Lot No.',
  'Kiện / Lô': 'Package / Lot',
  'Số kiện': 'Package No.',
  'Số kiện / Package No.': 'Package No.',
  'Package No.': 'Package No.',
  'Tên kiện': 'Package Name',
  'Tên kiện / Package Name': 'Package Name',
  'Packing List': 'Packing List',
  'Số packing list': 'Packing List No.',
  'Số packing list/Shipment': 'Packing List / Shipment',
  'Shipment': 'Shipment',
  'Số vận đơn / B/L': 'Bill of Lading / B/L',
  'Số Vận Đơn / B/L': 'Bill of Lading / B/L',
  'Số Container': 'Container No.',
  'Số Đơn Hàng / PO': 'Purchase Order / PO',
  'Số Hợp Đồng': 'Contract No.',
  'Bản vẽ': 'Drawing',
  'Bản vẽ / Drawing': 'Drawing No.',
  'Bản vẽ / Drawing No.': 'Drawing No.',
  'Nhà sản xuất': 'Manufacturer',
  'Nhà Sản Xuất': 'Manufacturer',
  'NSX': 'Mfr',
  'Nhà cung cấp': 'Supplier',
  'Nhà Cung Cấp': 'Supplier',
  'NCC': 'Supplier',
  'NSX & NCC': 'Mfr & Supplier',
  'Kho': 'Warehouse',
  'Kho bãi': 'Warehouse',
  'Kho Bãi': 'Warehouse',
  'Kho tiếp nhận': 'Receiving Warehouse',
  'Kho Tiếp Nhận': 'Receiving Warehouse',
  'Kho xuất hàng': 'Issuing Warehouse',
  'Kho Xuất Hàng': 'Issuing Warehouse',
  'Kho lưu trữ': 'Storage Warehouse',
  'Kho Lưu Trữ': 'Storage Warehouse',
  'Bộ Phận & Kho Lưu Trữ': 'Department & Warehouse',
  'Đơn Vị Giao Hàng & Hợp Đồng': 'Delivery Contractor & Contract',
  'Đơn vị giao hàng': 'Delivery Contractor',
  'Người giao hàng': 'Deliverer',
  'Người nhận hàng': 'Receiver',
  'Người Nhận Hàng': 'Receiver',
  'Người nhận & Đơn vị': 'Receiver & Department',
  'Bộ phận nhận': 'Receiving Dept',
  'Bộ phận / Đơn vị nhận': 'Receiving Dept / Unit',
  'Mục đích xuất': 'Issue Purpose',
  'Mục Đích Xuất': 'Issue Purpose',
  'Ngày tạo': 'Created Date',
  'Ngày lập': 'Voucher Date',
  'Ngày nhập': 'Inbound Date',
  'Ngày Nhập': 'Inbound Date',
  'Ngày Nhập Kho': 'Inbound Date',
  'Ngày xuất': 'Outbound Date',
  'Ngày Xuất': 'Outbound Date',
  'Ngày Xuất Kho': 'Outbound Date',
  'Người tạo': 'Creator',
  'Người lập': 'Prepared By',
  'Người Lập': 'Prepared By',
  'Trạng thái': 'Status',
  'Trạng Thái': 'Status',
  'Thao tác': 'Actions',
  'Thao Tác': 'Actions',
  'Ghi chú': 'Notes',
  'Ghi Chú': 'Notes',
  'Nội Dung / Lô Hàng': 'Description / Cargo',
  'Tồn đầu kỳ': 'Beginning Stock',
  'Tồn Đầu Kỳ': 'Beginning Stock',
  'Nhập trong kỳ': 'Inbound in Period',
  'Nhập Trong Kỳ': 'Inbound in Period',
  'Xuất trong kỳ': 'Outbound in Period',
  'Xuất Trong Kỳ': 'Outbound in Period',
  'Tồn cuối kỳ': 'Ending Stock',
  'Tồn Cuối Kỳ': 'Ending Stock',
  'Tồn khả dụng': 'Available Stock',
  'Tồn Khả Dụng': 'Available Stock',
  'Tồn Tối Thiểu': 'Min Stock Alert',
  'Cảnh báo tồn tối thiểu': 'Min Stock Alert',
  'Tổng tồn thực tế': 'Total Actual Stock',
  'Tổng khối lượng tồn': 'Total Stock Weight',
  'Tổng dòng vật tư': 'Total Material Lines',

  // Filters & State Selectors
  'Tất cả': 'All',
  'Tất cả kho': 'All Warehouses',
  'Tất cả kho bãi': 'All Warehouses',
  'Tất cả trạng thái': 'All Statuses',
  'Tất cả vai trò': 'All Roles',
  'Tất cả hạng mục': 'All Categories',
  'Tất cả loại kho': 'All Types',
  'Đang hoạt động': 'Active',
  'Tạm ngưng': 'Inactive',
  'Kích hoạt': 'Active',
  'Đã khóa': 'Locked',
  'Chờ xử lý': 'Pending',
  'Đang xử lý': 'Processing',
  'Đã giải quyết': 'Resolved',
  'Đã đóng': 'Closed',
  'Đã xuất': 'Issued',
  'Chưa xuất': 'Unissued',
  'Bản nháp': 'Draft',
  'Đã duyệt': 'Approved',
  'Đã nhập kho': 'Stored',
  'Hoàn thành': 'Completed',
  'Nghiêm trọng': 'Critical',
  'Trung bình': 'Medium',
  'Nhẹ': 'Low',
  'Hư hỏng': 'Damaged',
  'Thiếu hụt': 'Shortage',
  'Thừa hàng': 'Overage',
  'Sai quy cách': 'Spec Mismatch',
  'Đã đền bù': 'Compensated',
  'Đã đổi trả': 'Replaced',

  // Tab & Section Titles
  'Tổng Quan & KPI': 'Dashboard & KPIs',
  'Quản Lý Nhập Kho': 'Inbound Management',
  'Quản Lý Xuất Kho': 'Outbound Management',
  'Quản Lý Vật Tư OSD': 'OS&D Item Management',
  'Báo Cáo Nhập-Xuất-Tồn': 'Inventory Reports',
  'Báo Cáo Nhập - Xuất - Tồn Đa Chiều': 'Multidimensional Inventory Report',
  'Quản Lý Kho Bãi': 'Warehouse Management',
  'Danh Mục Vật Tư': 'Materials Catalog',
  'Danh Mục Vật Tư Thiết Bị': 'Equipment & Materials Catalog',
  'Người Sử Dụng': 'User Management',
  'Quản Trị Người Dùng & Phân Quyền': 'User & Permissions Management',
  'Hư Hỏng, Thiếu Hụt, Thừa Hàng (OS&D)': 'Over, Short & Damaged (OS&D)',
  'Danh Sách Phiếu Nhập': 'Inbound Receipts List',
  'Lập Phiếu Nhập Mới': 'Create Inbound Receipt',
  'Danh Sách Phiếu Xuất': 'Outbound Issues List',
  'Lập Phiếu Xuất Mới': 'Create Outbound Issue',
  'Danh Sách Biên Bản OSD': 'OS&D Reports List',
  'Lập Biên Bản OSD Mới': 'Create OS&D Report',
  'Chi Tiết Phiếu Nhập': 'Inbound Receipt Details',
  'Chi Tiết Phiếu Xuất': 'Outbound Issue Details',
  'Bộ Lọc Tra Cứu': 'Search Filters',
  'Bộ Lọc Nâng Cao': 'Advanced Filters',
  'Bộ lọc tra cứu chuyên sâu': 'Advanced Search & Filter Parameters',
  'Thông Tin Chung': 'General Information',
  'Thông Tin Phiếu': 'Voucher Information',
  'Danh Sách Vật Tư': 'Materials List',
  'Danh Sách Hàng Hóa': 'Cargo & Items List',
  'Tổng Kết': 'Summary',
  'Tổng Quan Kho': 'Warehouse Overview',
  'Phân Bổ Tồn Kho Theo Hạng Mục': 'Stock Distribution by Category',
  'Phiếu Nhập Gần Đây': 'Recent Inbound Receipts',
  'Phiếu Xuất Gần Đây': 'Recent Outbound Issues',
  'Xem tất cả': 'View all',
  'Không có dữ liệu': 'No data available',
  'Không tìm thấy dữ liệu phù hợp': 'No matching records found',
  'Không có phiếu nhập nào': 'No inbound receipts found',
  'Không có phiếu xuất nào': 'No outbound issues found',
  'Không có vật tư nào': 'No materials found',
  'Không có kho nào': 'No warehouses found',
  'Không có biên bản nào': 'No OS&D reports found',
  'Chưa có dòng vật tư nào': 'No material lines added yet',
  'Hiển thị': 'Showing',
  'Tổng': 'Total',
  'Dòng/trang:': 'Rows/page:',
  'dòng': 'rows',
  'mục': 'items',
  'kho': 'warehouses',
  'kho bãi': 'warehouses',
  'phiếu': 'vouchers',
  'trang': 'page',
  'Từ ngày': 'From Date',
  'Đến ngày': 'To Date',
  'Hôm nay': 'Today',
  'Tuần này': 'This Week',
  'Tháng này': 'This Month',

  // Dashboard specifics
  'Hệ Thống Quản Lý Nhập Xuất Tồn Vật Tư Dự Án': 'Project Equipment & Material Logistics Management System',
  'Nhập Kho Mới / Import Excel': 'New Inbound / Import Excel',
  'Lập Phiếu Xuất Kho': 'Create Outbound Issue',
  'Xem Báo Cáo NXT Đa Chiều': 'View Multidimensional Inventory Report',
  'Tổng Khối Lượng Tồn': 'Total Inventory Weight',
  'Tổng Số Lượng Tồn': 'Total Inventory Quantity',
  'Đơn vị / Kiện': 'Units / Packages',
  'mã vật tư thiết bị': 'material items',
  'Shipment & Packing List': 'Shipment & Packing List',
  'Shipment quốc tế': 'International Shipments',
  'Mạng Lưới Kho Bãi': 'Warehouse Network',
  'kho đang hoạt động': 'active warehouses',
  'Sức chứa linh hoạt': 'Flexible storage capacity',
  'Khu bãi & kho': 'Yards & Warehouses',
  'Tấn': 'Tons',

  // Warehouse details
  'Mã kho': 'Warehouse Code',
  'Mã Kho': 'Warehouse Code',
  'Tên kho bãi': 'Warehouse Name',
  'Tên Kho Bãi': 'Warehouse Name',
  'Địa điểm / Vị trí': 'Location / Address',
  'Loại kho': 'Warehouse Type',
  'Kho Kín / Có Mái': 'Covered / Indoor Warehouse',
  'Kho Hở / Bãi Ngoài Trời': 'Open Yard / Outdoor Storage',
  'Kho Hóa Chất / Đặc Biệt': 'Hazardous / Specialized Storage',
  'Sức chứa diện tích (m²)': 'Area Capacity (m²)',
  'Sức Chứa Diện Tích (m²)': 'Area Capacity (m²)',
  'Sức chứa khối lượng (Tấn)': 'Weight Capacity (Tons)',
  'Sức Chứa Khối Lượng (Tấn)': 'Weight Capacity (Tons)',
  'Thủ kho / Người phụ trách': 'Warehouse Keeper / Person in Charge',
  'Thủ Kho / Người Phụ Trách': 'Warehouse Keeper / Person in Charge',
  'Số điện thoại': 'Phone Number',
  'Số Điện Thoại': 'Phone Number',

  // User details
  'Họ và tên': 'Full Name',
  'Họ Và Tên': 'Full Name',
  'Tài khoản / Username': 'Username',
  'Email Google': 'Google Email',
  'Vai trò / Phân quyền': 'Role / Permissions',
  'Quản trị viên (Admin)': 'Administrator (Admin)',
  'Thủ kho / Nhân viên': 'Warehouse Keeper / Staff',
  'Phòng ban / Đơn vị': 'Department / Division',
  'Ban Quản Lý Kho Bãi': 'Warehouse Management Division',
  'Trạng thái hoạt động': 'Account Status',
  'Kích hoạt tài khoản': 'Active Account',
  'Đổi mật khẩu': 'Change Password',
  'Đổi Mật Khẩu Cá Nhân': 'Change Personal Password',
  'Mật khẩu hiện tại': 'Current Password',
  'Mật khẩu mới': 'New Password',
  'Xác nhận mật khẩu mới': 'Confirm New Password',

  // Inbound & Outbound Details
  'Số Phiếu Nhập': 'Inbound Receipt No.',
  'Số Phiếu Xuất': 'Outbound Issue No.',
  'Mã phiếu xuất': 'Outbound Issue No.',
  'Mã Phiếu Xuất': 'Outbound Issue No.',
  'Mã phiếu nhập': 'Inbound Receipt No.',
  'Mã Phiếu Nhập': 'Inbound Receipt No.',
  'Mã phiếu': 'Voucher No.',
  'Mã Phiếu': 'Voucher No.',
  'Vật Tư Xuất Kho': 'Outbound Material Items',
  'Vật Tư Nhập Kho': 'Inbound Material Items',
  'Hàng Hóa Tồn Kho Khả Dụng': 'Available Inventory Items',
  'Vật tư đã chọn': 'Selected Materials',
  'Chọn vật tư': 'Select Material',
  'Chọn vật tư xuất': 'Select Outbound Item',
  'Tồn khả dụng:': 'Available stock:',
  'Khối lượng xuất (Kg)': 'Issue Weight (Kg)',
  'Số lượng xuất': 'Issue Quantity',
  'Khối lượng nhập (Kg)': 'Receipt Weight (Kg)',
  'Số lượng nhập': 'Receipt Quantity',
  'Hàng Hóa Tồn Kho': 'Inventory Stock',

  // OS&D Details
  'Mã Biên Bản': 'Report No.',
  'Mã biên bản': 'Report No.',
  'Loại bất thường': 'Discrepancy Type',
  'Loại Bất Thường': 'Discrepancy Type',
  'Mức độ nghiêm trọng': 'Severity Level',
  'Mức Độ Nghiêm Trọng': 'Severity Level',
  'Tình trạng xử lý': 'Resolution Status',
  'Tình Trạng Xử Lý': 'Resolution Status',
  'Biện pháp khắc phục': 'Corrective Action',
  'Biện Pháp Khắc Phục': 'Corrective Action',
  'Nguyên nhân': 'Root Cause',
  'Nguyên Nhân': 'Root Cause',
  'Đơn vị chịu trách nhiệm': 'Responsible Party',
  'Số lượng ảnh hưởng': 'Affected Quantity',
  'Khối lượng ảnh hưởng (Kg)': 'Affected Weight (Kg)',

  // Uppercase table headers & report specifics
  'NGÀY LẬP': 'VOUCHER DATE',
  'PHÂN LOẠI': 'CLASSIFICATION',
  'THAO TÁC': 'ACTIONS',
  'KIỆN HÀNG': 'PACKAGE',
  'MÃ BIÊN BẢN': 'REPORT NO.',
  'MÃ VẬT TƯ': 'MATERIAL CODE',
  'PACKING LIST': 'PACKING LIST',
  'PHIẾU NHẬP NGUỒN': 'SOURCE INBOUND RECEIPT',
  'BIÊN BẢN PDF': 'PDF REPORT',
  'KHO TIẾP NHẬN': 'RECEIVING WAREHOUSE',
  'ĐƠN VỊ GIAO / NCC': 'DELIVERY / SUPPLIER',
  'TRẠNG THÁI XỬ LÝ (TICK THỦ CÔNG)': 'RESOLUTION STATUS (MANUAL)',
  'VẬT TƯ BỊ ẢNH HƯỞNG': 'AFFECTED MATERIALS',
  'VẬT TƯ THIẾT BỊ': 'MATERIALS & EQUIPMENT',
  'TỔNG NHẬP': 'TOTAL INBOUND',
  'NHẬP TRẢ KHO': 'RETURN TO STOCK',
  'TỔNG XUẤT': 'TOTAL OUTBOUND',
  'TÁI XUẤT': 'TRANSFER OUT',
  'TỒN SL': 'STOCK QTY',
  'TỒN KL (KG)': 'STOCK WEIGHT (KG)',
  'TỒN KHO (SL)': 'STOCK ON HAND (QTY)',
  'TỒN KHO (kg)': 'STOCK ON HAND (KG)',
  'Bộ Lọc Điều Kiện Chuyên Sâu': 'Advanced Filter Parameters',
  'Xuất Báo Cáo Ra Excel': 'Export Report to Excel',
  'Báo Cáo Nhập - Xuất - Tồn Vật Tư Thiết Bị': 'Equipment & Material Inventory Report',
  'Bảng Chi Tiết Nhập - Xuất - Tồn Sau Gộp': 'Consolidated Inventory Inbound-Outbound-Stock Details',
  'Tra cứu đa điều kiện: Packing List, Shipment, Bản vẽ, Hạng mục, Kiện hàng, NSX, NCC, Khối lượng & Số lượng': 'Multi-criteria query: Packing List, Shipment, Drawing, Category, Package, Mfr, Supplier, Weight & Quantity',

  // Additional tab specific controls & placeholders
  'Loại hình:': 'Type:',
  'Kho kín tiêu chuẩn': 'Standard Covered Warehouse',
  'Bãi ngoài trời': 'Open Yard Storage',
  'Kho chuyên dụng / điều hòa': 'Specialized / AC Storage',
  'Bãi trung chuyển': 'Transit Yard',
  'Hoạt động': 'Active',
  'Đầy tải': 'Full Capacity',
  'Bảo trì': 'Maintenance',
  'Tìm theo mã kho, tên kho, địa điểm, thủ kho...': 'Search by code, warehouse name, location, keeper...',
  'Quản Lý Kho': 'Warehouse Manager',
  'Chỉ Xem': 'Viewer Only',
  'Tìm theo Email Google, họ tên, phòng ban...': 'Search by Google Email, name, department...',
  'Vai trò:': 'Role:',
  'Đồng Bộ Nhập/Xuất': 'Sync Inbound/Outbound',
  'Xóa Toàn Bộ': 'Delete All',
  'Tải Mẫu Excel Vật Tư': 'Download Materials Template',
  'Tải Mẫu Excel Nhập Kho': 'Download Inbound Template',
  'Tải Mẫu Excel Xuất Kho': 'Download Outbound Template',
  'Mở Bảng Tồn Kho Đầy Đủ': 'Open Full Inventory Table',
  'Nhập trả kho (Hàng hoàn trả từ công trường)': 'Return to Warehouse (Returned from Site)',
  'Xuất điều chuyển (Tái xuất sang kho khác/công trường)': 'Transfer Outbound (Transfer to another warehouse/site)',
  'Quản Lý Danh Mục Kho Bãi': 'Warehouse Directory Management',
  'Quản lý hệ thống kho bãi lưu trữ vật tư, bãi cảng hàng nặng, diện tích & sức chứa': 'Manage material warehouses, heavy cargo yards, area capacity & tonnage',
  'Thêm Kho Bãi Mới': 'Add New Warehouse',
  'Chỉnh Sửa Kho Bãi': 'Edit Warehouse',
  'Chỉ quyền Admin mới có thể thêm/sửa/xóa kho bãi': 'Admin rights required to add/edit/delete warehouses',
  'Chỉ Admin (voduongphu@gmail.com) mới có quyền thêm/sửa/khóa người dùng': 'Only Admin (voduongphu@gmail.com) can add/edit/lock users',
  'Chỉ Quản trị viên (Admin) mới có quyền import danh mục vật tư.': 'Only Administrators (Admin) can import materials catalog.'
};

// Merge all specialized and comprehensive phrases into one unified dictionary
export const ALL_UI_PHRASES_EN: Record<string, string> = {
  ...UI_PHRASES_EN,
  ...COMPREHENSIVE_UI_PHRASES_EN
};

// Precompute lowercase lookup map for instant case-insensitive matching
const LOWER_CASE_MAP: Record<string, string> = {};
for (const [k, v] of Object.entries(ALL_UI_PHRASES_EN)) {
  LOWER_CASE_MAP[k.trim().toLowerCase()] = v;
}

/**
 * Intelligent phrase translator with support for punctuation, colons, counts, and symbols
 */
export function lookupTranslation(rawText: string): string | null {
  if (!rawText) return null;
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // 1. Direct exact or trimmed match
  if (ALL_PHRASES_MATCH(trimmed)) {
    return ALL_PHRASES_MATCH(trimmed)!;
  }

  // 2. Trailing colon handling: "Kho bãi:" -> "Warehouse:"
  if (trimmed.endsWith(':')) {
    const withoutColon = trimmed.slice(0, -1).trim();
    const trans = ALL_PHRASES_MATCH(withoutColon);
    if (trans) return `${trans}:`;
  }

  // 3. Parentheses with numbers or counts: "Tất cả kho (4)" -> "All Warehouses (4)"
  const parenMatch = trimmed.match(/^(.*?)(\s*\([0-9.,\s/A-Za-z-]+\))$/);
  if (parenMatch) {
    const base = parenMatch[1].trim();
    const suffix = parenMatch[2];
    const trans = ALL_PHRASES_MATCH(base);
    if (trans) return `${trans}${suffix}`;
  }

  // 4. Leading symbols: "+ Chọn" -> "+ Select", "+ Thêm dòng" -> "+ Add line"
  if (trimmed.startsWith('+')) {
    const base = trimmed.replace(/^\+\s*/, '').trim();
    const trans = ALL_PHRASES_MATCH(base);
    if (trans) return `+ ${trans}`;
  }

  // 5. Asterisk suffix: "Tên vật tư (*)" -> "Material Name (*)"
  if (trimmed.endsWith('(*)') || trimmed.endsWith('*')) {
    const base = trimmed.replace(/\s*\(\*\)$|\s*\*$/, '').trim();
    const trans = ALL_PHRASES_MATCH(base);
    if (trans) return `${trans} (*)`;
  }

  return null;
}

function ALL_PHRASES_MATCH(str: string): string | null {
  if (ALL_UI_PHRASES_EN[str]) return ALL_UI_PHRASES_EN[str];
  const lower = str.toLowerCase();
  if (LOWER_CASE_MAP[lower]) return LOWER_CASE_MAP[lower];
  return null;
}

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (keyOrPhrase: string, fallback?: string) => string;
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

  const t = (keyOrPhrase: string, fallback?: string): string => {
    if (language === 'vi') {
      const direct = (TRANSLATIONS.vi as any)?.[keyOrPhrase];
      return direct || keyOrPhrase;
    }

    // language === 'en'
    const structured = (TRANSLATIONS.en as any)?.[keyOrPhrase];
    if (structured) return structured;

    const trans = lookupTranslation(keyOrPhrase);
    if (trans) return trans;

    return fallback || keyOrPhrase;
  };

  // Safe TreeWalker DOM text node translation hook for static UI elements across tabs
  // Preserves user-entered content (inputs, textareas, elements with user data)
  useEffect(() => {
    const isEn = language === 'en';
    let isScanning = false;

    const translateAttributes = (el: HTMLElement) => {
      // Check placeholder
      if (el.hasAttribute('placeholder')) {
        const ph = el.getAttribute('placeholder') || '';
        if (isEn) {
          const trans = lookupTranslation(ph);
          if (trans) {
            if (!el.hasAttribute('data-vi-placeholder')) {
              el.setAttribute('data-vi-placeholder', ph);
            }
            el.setAttribute('placeholder', trans);
          }
        } else if (el.hasAttribute('data-vi-placeholder')) {
          el.setAttribute('placeholder', el.getAttribute('data-vi-placeholder') || ph);
        }
      }

      // Check title tooltip
      if (el.hasAttribute('title')) {
        const tt = el.getAttribute('title') || '';
        if (isEn) {
          const trans = lookupTranslation(tt);
          if (trans) {
            if (!el.hasAttribute('data-vi-title')) {
              el.setAttribute('data-vi-title', tt);
            }
            el.setAttribute('title', trans);
          }
        } else if (el.hasAttribute('data-vi-title')) {
          el.setAttribute('title', el.getAttribute('data-vi-title') || tt);
        }
      }
    };

    const scanAll = () => {
      if (isScanning || !document.body) return;
      isScanning = true;

      try {
        // 1. Translate placeholders and tooltips
        const attrElements = document.body.querySelectorAll<HTMLElement>('[placeholder], [title]');
        attrElements.forEach(translateAttributes);

        // 2. High-performance TreeWalker for all text nodes
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;

              const tagName = parent.tagName;
              if (
                tagName === 'SCRIPT' ||
                tagName === 'STYLE' ||
                tagName === 'INPUT' ||
                tagName === 'TEXTAREA' ||
                tagName === 'CODE' ||
                tagName === 'PRE' ||
                parent.isContentEditable ||
                parent.getAttribute('data-user-content') === 'true' ||
                parent.classList.contains('user-data')
              ) {
                return NodeFilter.FILTER_REJECT;
              }

              // Protect user data cells in tables (like codes, user notes)
              if (tagName === 'TD' && parent.classList.contains('font-mono')) {
                return NodeFilter.FILTER_REJECT;
              }

              const val = node.nodeValue;
              if (!val || !val.trim()) return NodeFilter.FILTER_REJECT;

              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        let currentNode: Node | null;
        while ((currentNode = walker.nextNode())) {
          const raw = currentNode.nodeValue || '';
          const trimmed = raw.trim();
          if (!trimmed) continue;

          const anyNode = currentNode as any;

          if (isEn) {
            const trans = lookupTranslation(trimmed);
            if (trans && trans !== trimmed) {
              if (anyNode.__origViText === undefined) {
                anyNode.__origViText = raw;
              }
              currentNode.nodeValue = raw.replace(trimmed, trans);
            }
          } else {
            if (anyNode.__origViText !== undefined) {
              currentNode.nodeValue = anyNode.__origViText;
            }
          }
        }
      } finally {
        isScanning = false;
      }
    };

    // Run initial scan
    scanAll();

    // Use a lightweight MutationObserver to catch tab changes, re-renders, and modals
    let debounceTimer: any = null;
    const observer = new MutationObserver(() => {
      if (isScanning) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scanAll();
      }, 35);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => {
      clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [language]);

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

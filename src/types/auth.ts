export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';

export interface RolePermissions {
  canCreateTransaction: boolean;
  canEditInbound: boolean;
  canDeleteInbound: boolean;
  canDeleteOutbound: boolean;
  canImportExcel: boolean;
  canManageWarehouses: boolean;
  canManageCategories: boolean;
  canManageItems: boolean;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Quản trị viên (Toàn quyền)',
  MANAGER: 'Thủ kho trưởng (Được sửa/xóa)',
  STAFF: 'Nhân viên kho (Chỉ tạo/xem)',
  VIEWER: 'Khách / Xem báo cáo (Chỉ xem)',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: 'Toàn quyền cấu hình, phê duyệt, chỉnh sửa và xóa mọi phiếu nhập/xuất kho.',
  MANAGER: 'Có quyền sửa phiếu nhập, xóa phiếu nhập, xóa phiếu xuất và quản lý hàng tồn.',
  STAFF: 'Được tạo phiếu mới, lập biên bản và xem báo cáo. Không có quyền sửa hoặc xóa phiếu đã lưu.',
  VIEWER: 'Chỉ được xem danh mục tồn kho, xem phiếu và xuất báo cáo, không chỉnh sửa dữ liệu.',
};

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  ADMIN: {
    canCreateTransaction: true,
    canEditInbound: true,
    canDeleteInbound: true,
    canDeleteOutbound: true,
    canImportExcel: true,
    canManageWarehouses: true,
    canManageCategories: true,
    canManageItems: true,
  },
  MANAGER: {
    canCreateTransaction: true,
    canEditInbound: true,
    canDeleteInbound: true,
    canDeleteOutbound: true,
    canImportExcel: true,
    canManageWarehouses: true,
    canManageCategories: true,
    canManageItems: true,
  },
  STAFF: {
    canCreateTransaction: true,
    canEditInbound: false,
    canDeleteInbound: false,
    canDeleteOutbound: false,
    canImportExcel: true,
    canManageWarehouses: false,
    canManageCategories: false,
    canManageItems: true,
  },
  VIEWER: {
    canCreateTransaction: false,
    canEditInbound: false,
    canDeleteInbound: false,
    canDeleteOutbound: false,
    canImportExcel: false,
    canManageWarehouses: false,
    canManageCategories: false,
    canManageItems: false,
  },
};

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  department?: string;
  googleId?: string;
  lastLogin?: string;
}

export const DEMO_GOOGLE_USERS: AuthUser[] = [
  {
    id: 'user-admin',
    name: 'Nguyễn Văn An',
    email: 'an.nguyen@vattupro.vn',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'ADMIN',
    department: 'Ban Quản trị & Điều hành Kho',
    googleId: 'google-1092837482910',
  },
  {
    id: 'user-manager',
    name: 'Trần Thị Mai',
    email: 'mai.tran@vattupro.vn',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    role: 'MANAGER',
    department: 'Bộ phận Quản lý Kho Tổng',
    googleId: 'google-2039481726354',
  },
  {
    id: 'user-staff',
    name: 'Lê Hoàng Nam',
    email: 'nam.le@vattupro.vn',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    role: 'STAFF',
    department: 'Tổ vận hành & Kiểm đếm kho',
    googleId: 'google-3094827163542',
  },
];

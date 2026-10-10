import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Shield,
  ShieldCheck,
  Lock,
  Unlock,
  RotateCcw,
  UserCheck,
  Check,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { UserRole, ROLE_LABELS, ROLE_DESCRIPTIONS, RolePermissions, DEMO_GOOGLE_USERS } from '../types/auth';

interface PermissionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PermissionManagerModal: React.FC<PermissionManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    user,
    rolePermissionsMatrix,
    updateRolePermission,
    resetPermissionsToDefault,
    switchRole,
    switchUser,
  } = useAuth();

  if (!isOpen) return null;

  const roles: UserRole[] = ['ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];

  const permissionItems: Array<{
    key: keyof RolePermissions;
    title: string;
    description: string;
    isKeyFeature?: boolean;
  }> = [
    {
      key: 'canEditInbound',
      title: 'Sửa phiếu nhập kho',
      description: 'Cho phép chỉnh sửa thông tin chứng từ, số lượng, nhà cung cấp, vật tư trong phiếu nhập kho đã lưu.',
      isKeyFeature: true,
    },
    {
      key: 'canDeleteInbound',
      title: 'Xóa phiếu nhập kho',
      description: 'Cho phép xóa vĩnh viễn phiếu nhập kho và tự động trừ hoàn tác số lượng tồn kho tương ứng.',
      isKeyFeature: true,
    },
    {
      key: 'canDeleteOutbound',
      title: 'Xóa phiếu xuất kho',
      description: 'Cho phép xóa phiếu xuất kho và tự động hoàn trả lại số lượng vật tư đã xuất vào tồn kho.',
      isKeyFeature: true,
    },
    {
      key: 'canCreateTransaction',
      title: 'Tạo phiếu mới (Nhập / Xuất)',
      description: 'Cho phép lập phiếu nhập kho hoặc phiếu xuất kho thủ công.',
    },
    {
      key: 'canImportExcel',
      title: 'Import dữ liệu từ Excel',
      description: 'Cho phép import hàng loạt từ file Excel cho Nhập kho và Xuất kho.',
    },
    {
      key: 'canManageWarehouses',
      title: 'Quản lý kho bãi & Đổi tên kho',
      description: 'Cho phép thêm, đổi tên và xóa các kho lưu trữ.',
    },
    {
      key: 'canManageCategories',
      title: 'Quản lý danh mục vật tư',
      description: 'Cho phép thêm mới, đổi tên và xóa nhóm danh mục phân loại.',
    },
    {
      key: 'canManageItems',
      title: 'Chỉnh sửa danh mục mặt hàng',
      description: 'Cho phép thêm, sửa, xóa mã vật tư trong danh mục tồn.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400 border border-blue-400/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Bảng Phân Quyền & Kiểm Soát Thao Tác
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Role-Based Access Control
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Cấu hình quyền Xóa, Sửa phiếu nhập kho và Xóa phiếu xuất kho theo từng vai trò người dùng
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current User & Quick Switcher bar */}
        <div className="px-6 py-3 bg-blue-50/60 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-slate-700">Tài khoản đang đăng nhập:</span>
            {user ? (
              <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                <img src={user.avatar} alt={user.name} className="w-5 h-5 rounded-full object-cover" />
                <span className="font-bold text-slate-900">{user.name}</span>
                <span className="font-mono text-[11px] text-slate-500">({user.email})</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    user.role === 'ADMIN'
                      ? 'bg-purple-100 text-purple-800'
                      : user.role === 'MANAGER'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {user.role}
                </span>
              </div>
            ) : (
              <span className="text-slate-500">Chưa đăng nhập</span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-500 text-[11px]">Chuyển vai trò thử nghiệm:</span>
            {DEMO_GOOGLE_USERS.map(u => (
              <button
                key={u.id}
                onClick={() => switchUser(u.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                  user?.id === u.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
                title={`Chuyển sang ${u.name} (${u.role})`}
              >
                {u.role === 'ADMIN' ? 'Admin' : u.role === 'MANAGER' ? 'Thủ kho trưởng' : 'Nhân viên'}
              </button>
            ))}
          </div>
        </div>

        {/* Content Table */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Lưu ý phân quyền nghiệp vụ:</strong>
              <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                Khi xóa hoặc sửa phiếu, số lượng tồn kho của các mặt hàng sẽ được hoàn tác hoặc điều chỉnh tự động.
                Chỉ <strong>Quản trị viên</strong> và <strong>Thủ kho trưởng</strong> được cấp quyền này theo mặc định để đảm bảo tính toàn vẹn dữ liệu kế toán kho.
              </p>
            </div>
          </div>

          {/* Matrix table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4 w-1/2">Chức năng & Thao tác kiểm soát</th>
                  {roles.map(r => (
                    <th key={r} className="py-3 px-3 text-center">
                      <div>{r === 'ADMIN' ? 'Admin' : r === 'MANAGER' ? 'Thủ kho trưởng' : r === 'STAFF' ? 'Nhân viên kho' : 'Khách xem'}</div>
                      <span className="text-[10px] text-slate-400 font-normal lowercase">({r})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {permissionItems.map(item => (
                  <tr
                    key={item.key}
                    className={`hover:bg-slate-50 transition-colors ${
                      item.isKeyFeature ? 'bg-blue-50/20 font-medium' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${item.isKeyFeature ? 'text-blue-900' : 'text-slate-900'}`}>
                          {item.title}
                        </span>
                        {item.isKeyFeature && (
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">
                            Quan trọng
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5">
                        {item.description}
                      </p>
                    </td>

                    {roles.map(role => {
                      const isAllowed = rolePermissionsMatrix[role][item.key];
                      const isAdmin = role === 'ADMIN';

                      return (
                        <td key={role} className="py-3 px-3 text-center">
                          <button
                            type="button"
                            disabled={isAdmin} // Admin always has full power
                            onClick={() => updateRolePermission(role, item.key, !isAllowed)}
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all cursor-pointer ${
                              isAllowed
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'
                            } ${isAdmin ? 'cursor-not-allowed opacity-90' : ''}`}
                            title={
                              isAdmin
                                ? 'Admin luôn có đầy đủ quyền hạn'
                                : `${isAllowed ? 'Bấm để tước quyền' : 'Bấm để cấp quyền'}`
                            }
                          >
                            {isAllowed ? (
                              <Check className="w-4 h-4 text-emerald-700 stroke-[3]" />
                            ) : (
                              <Lock className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            onClick={resetPermissionsToDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Khôi phục mặc định</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Đóng & Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
};

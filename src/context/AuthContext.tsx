import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  AuthUser,
  UserRole,
  RolePermissions,
  DEFAULT_ROLE_PERMISSIONS,
  DEMO_GOOGLE_USERS,
} from '../types/auth';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  permissions: RolePermissions;
  rolePermissionsMatrix: Record<UserRole, RolePermissions>;
  loginWithGoogle: (customData?: Partial<AuthUser>) => void;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  switchUser: (userId: string) => void;
  updateRolePermission: (role: UserRole, permissionKey: keyof RolePermissions, value: boolean) => void;
  resetPermissionsToDefault: () => void;
  hasPermission: (permissionKey: keyof RolePermissions) => boolean;
}

const AUTH_USER_KEY = 'vattu_pro_auth_user_v1';
const PERMISSIONS_KEY = 'vattu_pro_permissions_matrix_v1';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Saved user or default to null (shows Login Screen, or first user if previously logged in)
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_USER_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load user from localStorage', e);
    }
    // Default to the Admin demo user for seamless start, but user can log out to view full Google login screen
    return DEMO_GOOGLE_USERS[0];
  });

  const [rolePermissionsMatrix, setRolePermissionsMatrix] = useState<Record<UserRole, RolePermissions>>(() => {
    try {
      const saved = localStorage.getItem(PERMISSIONS_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load permissions matrix', e);
    }
    return DEFAULT_ROLE_PERMISSIONS;
  });

  // Sync to localStorage
  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(AUTH_USER_KEY);
      }
    } catch (e) {
      console.error('Failed to save user to localStorage', e);
    }
  }, [user]);

  useEffect(() => {
    try {
      localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(rolePermissionsMatrix));
    } catch (e) {
      console.error('Failed to save permissions matrix', e);
    }
  }, [rolePermissionsMatrix]);

  const activeRole: UserRole = user?.role || 'VIEWER';
  const permissions: RolePermissions = rolePermissionsMatrix[activeRole] || DEFAULT_ROLE_PERMISSIONS.VIEWER;

  const loginWithGoogle = (customData?: Partial<AuthUser>) => {
    const newUser: AuthUser = {
      id: customData?.id || `google-user-${Date.now()}`,
      name: customData?.name || 'Người dùng Google',
      email: customData?.email || 'user@gmail.com',
      avatar:
        customData?.avatar ||
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      role: customData?.role || 'MANAGER',
      department: customData?.department || 'Kho Tổng Vận Hành',
      googleId: customData?.googleId || `g-${Date.now()}`,
      lastLogin: new Date().toISOString(),
    };
    setUser(newUser);
  };

  const logout = () => {
    setUser(null);
  };

  const switchRole = (newRole: UserRole) => {
    if (!user) return;
    setUser(prev => (prev ? { ...prev, role: newRole } : null));
  };

  const switchUser = (userId: string) => {
    const target = DEMO_GOOGLE_USERS.find(u => u.id === userId);
    if (target) {
      setUser({ ...target, lastLogin: new Date().toISOString() });
    }
  };

  const updateRolePermission = (role: UserRole, permissionKey: keyof RolePermissions, value: boolean) => {
    setRolePermissionsMatrix(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permissionKey]: value,
      },
    }));
  };

  const resetPermissionsToDefault = () => {
    setRolePermissionsMatrix(DEFAULT_ROLE_PERMISSIONS);
  };

  const hasPermission = (permissionKey: keyof RolePermissions): boolean => {
    if (!user) return false;
    return !!permissions[permissionKey];
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        permissions,
        rolePermissionsMatrix,
        loginWithGoogle,
        logout,
        switchRole,
        switchUser,
        updateRolePermission,
        resetPermissionsToDefault,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

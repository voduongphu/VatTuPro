import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, ActiveUserSession } from '../types/inventory';
import { StorageService } from '../services/storage';
import { SyncService, SessionInvalidationInfo } from '../services/syncService';
import type { CloudSyncSnapshotState } from '../services/firestoreSync';
import { normUserKey, isPasswordMatch, isRecordDeleted } from '../utils/additiveMerge';

export interface SessionKickAlert extends SessionInvalidationInfo {
  title: string;
  message: string;
}

export interface ReplacedOtherDeviceAlert {
  deviceLabel: string;
  loginAt?: string;
  message: string;
}

export interface LoginActionResult {
  success: boolean;
  message: string;
  conflict?: boolean;
  needsCloudConnect?: boolean;
  cloudConnectedOnly?: boolean;
  matchedUsername?: string;
  activeSession?: ActiveUserSession;
}

function buildKickAlert(info: SessionInvalidationInfo): SessionKickAlert {
  if (info.reason === 'disabled') {
    return {
      ...info,
      title: 'Tài Khoản Đã Bị Khóa Hoặc Ngừng Kích Hoạt',
      message:
        'Tài khoản của bạn đã bị khóa hoặc ngừng kích hoạt bởi Quản trị viên. Hệ thống đã tự động đăng xuất khỏi thiết bị này.'
    };
  }
  if (info.reason === 'force_logout') {
    const reqDevice = info.deviceLabel ? ` từ thiết bị "${info.deviceLabel}"` : '';
    return {
      ...info,
      title: 'Đã Nhận Yêu Cầu Đăng Xuất Từ Thiết Bị Khác',
      message: `Hệ thống vừa nhận được yêu cầu đăng xuất từ xa${reqDevice}. Phiên làm việc trên thiết bị này đã được tự động kết thúc để đảm bảo chỉ 1 thiết bị được hoạt động.`
    };
  }
  if (info.reason === 'expired') {
    return {
      ...info,
      title: 'Phiên Đăng Nhập Đã Kết Thúc',
      message:
        'Phiên đăng nhập trước đó đã hết hiệu lực hoặc đã đăng xuất. Vui lòng đăng nhập lại để tiếp tục làm việc.'
    };
  }
  const deviceDesc = info.deviceLabel ? ` (${info.deviceLabel})` : '';
  return {
    ...info,
    title: 'Cảnh Báo: Đã Tự Động Đăng Xuất Khỏi Thiết Bị Này',
    message: `Phát hiện tài khoản đang được chuyển phiên đăng nhập sang thiết bị mới${deviceDesc}. Hệ thống đã tự động đăng xuất khỏi thiết bị hiện tại để đảm bảo an toàn dữ liệu.`
  };
}

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  cloudState: CloudSyncSnapshotState;
  connectCloudSync: () => Promise<{ success: boolean; message: string; email?: string | null }>;
  disconnectCloudSync: () => Promise<void>;
  loginWithGoogle: (forceLogoutOtherDevice?: boolean) => Promise<LoginActionResult>;
  sessionKickNotice: string | null;
  sessionKickAlert: SessionKickAlert | null;
  isKickModalOpen: boolean;
  acknowledgeKickModal: () => void;
  clearSessionKickNotice: () => void;
  replacedOtherDeviceAlert: ReplacedOtherDeviceAlert | null;
  clearReplacedOtherDeviceAlert: () => void;
  login: (
    username: string,
    pass: string,
    forceLogoutOtherDevice?: boolean
  ) => Promise<LoginActionResult>;
  requestLogoutOtherDevice: (
    username: string,
    pass: string
  ) => Promise<{ success: boolean; message: string }>;
  forceLogoutOtherDevicesFromCurrent: () => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  isAdmin: boolean;
  isManager: boolean;
  refreshUsers: () => void;
  addUser: (user: Omit<User, 'id' | 'createdAt'>) => User;
  updateUser: (id: string, updates: Partial<User>) => User | null;
  deleteUser: (id: string) => boolean;
  resetUserPassword: (userId: string, newPass: string) => boolean;
  changeMyPassword: (oldPass: string, newPass: string) => { success: boolean; message: string };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>(() => StorageService.getUsers());
  const [cloudState, setCloudState] = useState<CloudSyncSnapshotState>(() =>
    SyncService.getCloudState()
  );
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const unified = SyncService.getUnifiedSession();
    if (!unified) return null;
    const list = StorageService.getUsers();
    const match = list.find(
      (u) =>
        u.id === unified.user.id || normUserKey(u.username) === normUserKey(unified.user.username)
    );
    if (match) {
      return match.isActive ? match : null;
    }
    const deleted = isRecordDeleted(
      StorageService.getTombstones().users,
      [unified.user.id, normUserKey(unified.user.username)],
      unified.user.updatedAt
    );
    if (deleted || unified.user.isActive === false) {
      return null;
    }
    return unified.user;
  });

  const [sessionKickAlert, setSessionKickAlert] = useState<SessionKickAlert | null>(() => {
    const persisted = SyncService.getPersistedKickNotice();
    return persisted ? buildKickAlert(persisted) : null;
  });
  const [isKickModalOpen, setIsKickModalOpen] = useState<boolean>(() => Boolean(SyncService.getPersistedKickNotice()));
  const [replacedOtherDeviceAlert, setReplacedOtherDeviceAlert] = useState<ReplacedOtherDeviceAlert | null>(null);

  const acknowledgeKickModal = () => {
    setIsKickModalOpen(false);
  };

  const clearSessionKickNotice = () => {
    setIsKickModalOpen(false);
    setSessionKickAlert(null);
    SyncService.clearPersistedKickNotice();
  };

  const clearReplacedOtherDeviceAlert = () => {
    setReplacedOtherDeviceAlert(null);
  };

  const refreshUsers = () => {
    const list = StorageService.getUsers();
    setUsers(list);
    return list;
  };

  useEffect(() => {
    return SyncService.subscribeCloudState(setCloudState);
  }, []);

  useEffect(() => {
    refreshUsers();
    const unified = SyncService.getUnifiedSession();
    if (unified) {
      void SyncService.verifyCurrentSession();
    } else {
      setCurrentUser(null);
    }
  }, []);

  // Lắng nghe sự kiện đăng nhập trên thiết bị mới -> tự động đăng xuất ngay lập tức khỏi thiết bị này & bật hộp thoại cảnh báo
  useEffect(() => {
    return SyncService.onSessionInvalidated((info) => {
      setCurrentUser(null);
      setReplacedOtherDeviceAlert(null);
      setSessionKickAlert(buildKickAlert(info));
      setIsKickModalOpen(true);
    });
  }, []);

  useEffect(() => {
    return StorageService.subscribe(() => {
      const latestUsers = StorageService.getUsers();
      setUsers(latestUsers);
      setCurrentUser((prev) => {
        if (!prev) return null;
        const unified = SyncService.getUnifiedSession();
        if (!unified) return null;

        const found = latestUsers.find(
          (u) => u.id === prev.id || normUserKey(u.username) === normUserKey(prev.username)
        );
        if (found) {
          if (!found.isActive) {
            void SyncService.logoutFromServer();
            return null;
          }
          SyncService.updateUnifiedSessionUser(found);
          return found;
        }

        const deleted = isRecordDeleted(
          StorageService.getTombstones().users,
          [prev.id, normUserKey(prev.username)],
          prev.updatedAt
        );
        if (deleted) {
          void SyncService.logoutFromServer();
          return null;
        }
        return prev;
      });
    });
  }, []);

  const connectCloudSync = async (): Promise<{
    success: boolean;
    message: string;
    email?: string | null;
  }> => {
    const res = await SyncService.connectCloudSync();
    refreshUsers();
    return res;
  };

  const disconnectCloudSync = async (): Promise<void> => {
    await SyncService.disconnectCloudSync();
  };

  const loginWithGoogle = async (forceLogoutOtherDevice = false): Promise<LoginActionResult> => {
    clearSessionKickNotice();
    setReplacedOtherDeviceAlert(null);
    const res = await SyncService.loginWithGoogleCloud({ forceLogoutOtherDevice });
    const latestUsers = StorageService.getUsers();
    setUsers(latestUsers);

    if (!res.success || !res.user) {
      return {
        success: false,
        cloudConnectedOnly: res.cloudConnectedOnly,
        conflict: res.conflict,
        activeSession: res.activeSession,
        matchedUsername: res.user?.username,
        message: res.message
      };
    }

    if (res.replacedSession) {
      const prevDevice = res.replacedSession.deviceLabel || 'Thiết bị khác';
      setReplacedOtherDeviceAlert({
        deviceLabel: prevDevice,
        loginAt: res.replacedSession.loginAt,
        message: `Đã yêu cầu đăng xuất thành công phiên đang mở trên "${prevDevice}" và chuyển sang thiết bị hiện tại.`
      });
    }

    setCurrentUser(res.user);
    return {
      success: true,
      message: res.message || 'Đăng nhập thành công!'
    };
  };

  const login = async (
    username: string,
    pass: string,
    forceLogoutOtherDevice = false
  ): Promise<LoginActionResult> => {
    clearSessionKickNotice();
    setReplacedOtherDeviceAlert(null);
    const res = await SyncService.loginWithServer(username.trim(), pass, {
      forceLogoutOtherDevice
    });
    const latestUsers = StorageService.getUsers();
    setUsers(latestUsers);

    if (!res.success || !res.user) {
      return {
        success: false,
        conflict: res.conflict,
        needsCloudConnect: res.needsCloudConnect,
        activeSession: res.activeSession,
        message: res.message
      };
    }

    if (res.replacedSession) {
      const prevDevice = res.replacedSession.deviceLabel || 'Thiết bị khác';
      setReplacedOtherDeviceAlert({
        deviceLabel: prevDevice,
        loginAt: res.replacedSession.loginAt,
        message: `Đã yêu cầu đăng xuất thành công phiên đang mở trên "${prevDevice}" và chuyển sang thiết bị hiện tại.`
      });
    }

    setCurrentUser(res.user);
    return {
      success: true,
      message: res.message || 'Đăng nhập thành công!'
    };
  };

  const requestLogoutOtherDevice = async (
    username: string,
    pass: string
  ): Promise<{ success: boolean; message: string }> => {
    clearSessionKickNotice();
    const res = await SyncService.requestLogoutOtherDevice(username.trim(), pass);
    refreshUsers();
    return res;
  };

  const forceLogoutOtherDevicesFromCurrent = async (): Promise<{
    success: boolean;
    message: string;
  }> => {
    const res = await SyncService.forceLogoutOtherDevicesKeepCurrent();
    refreshUsers();
    return res;
  };

  const logout = () => {
    setCurrentUser(null);
    setReplacedOtherDeviceAlert(null);
    void SyncService.logoutFromServer();
  };

  const addUser = (userData: Omit<User, 'id' | 'createdAt'>): User => {
    const newUser = StorageService.addUser(userData);
    refreshUsers();
    return newUser;
  };

  const updateUser = (id: string, updates: Partial<User>): User | null => {
    const updated = StorageService.updateUser(id, updates);
    refreshUsers();
    if (currentUser?.id === id && updated) {
      setCurrentUser(updated);
      SyncService.updateUnifiedSessionUser(updated);
    }
    return updated;
  };

  const deleteUser = (id: string): boolean => {
    const success = StorageService.deleteUser(id);
    if (success) {
      refreshUsers();
    }
    return success;
  };

  const resetUserPassword = (userId: string, newPass: string): boolean => {
    const success = StorageService.resetPassword(userId, newPass);
    if (success) {
      refreshUsers();
    }
    return success;
  };

  const changeMyPassword = (oldPass: string, newPass: string): { success: boolean; message: string } => {
    if (!currentUser) {
      return { success: false, message: 'Chưa đăng nhập' };
    }
    if (!isPasswordMatch(currentUser.password, oldPass)) {
      return { success: false, message: 'Mật khẩu hiện tại không đúng' };
    }
    const cleanNewPass = newPass.trim();
    if (!cleanNewPass) {
      return { success: false, message: 'Mật khẩu mới không được để trống' };
    }
    const success = StorageService.resetPassword(currentUser.id, cleanNewPass);
    if (success) {
      const updated = StorageService.getUsers().find((u) => u.id === currentUser.id) || {
        ...currentUser,
        password: cleanNewPass
      };
      setCurrentUser(updated);
      SyncService.updateUnifiedSessionUser(updated);
      refreshUsers();
      return { success: true, message: 'Đổi mật khẩu thành công!' };
    }
    return { success: false, message: 'Không thể đổi mật khẩu' };
  };

  const isAdmin = currentUser?.role === 'admin' || normUserKey(currentUser?.username) === normUserKey('Võ Dương Phú');
  const isManager = isAdmin || currentUser?.role === 'manager';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        cloudState,
        connectCloudSync,
        disconnectCloudSync,
        loginWithGoogle,
        sessionKickNotice: sessionKickAlert?.message || null,
        sessionKickAlert,
        isKickModalOpen,
        acknowledgeKickModal,
        clearSessionKickNotice,
        replacedOtherDeviceAlert,
        clearReplacedOtherDeviceAlert,
        login,
        requestLogoutOtherDevice,
        forceLogoutOtherDevicesFromCurrent,
        logout,
        isAdmin,
        isManager,
        refreshUsers,
        addUser,
        updateUser,
        deleteUser,
        resetUserPassword,
        changeMyPassword
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

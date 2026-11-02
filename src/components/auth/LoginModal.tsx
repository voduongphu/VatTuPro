import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, UserCheck, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!username.trim() || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(username.trim(), password);
      if (res.success) {
        setSuccessMessage(res.message);
        setTimeout(() => {
          onClose();
          setSuccessMessage('');
        }, 600);
      } else {
        setErrorMessage(res.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="m-auto bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 p-5 sm:p-6 text-white text-center relative">
          <div className="mx-auto w-12 h-12 sm:w-14 sm:h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-3 shadow-inner ring-1 ring-white/20">
            <ShieldCheck className="w-7 h-7 sm:w-8 sm:h-8 text-blue-200" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">Hệ Thống Quản Lý Vật Tư</h2>
          <p className="text-blue-100 text-xs mt-1">Đăng nhập tài khoản người sử dụng</p>
        </div>

        <div className="p-5 sm:p-6">
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tên đăng nhập / Người dùng
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên tài khoản..."
                  autoComplete="username"
                  className="w-full min-h-[44px] px-3.5 py-2.5 pl-10 text-base sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition outline-none"
                  required
                />
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Mật khẩu
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  autoComplete="current-password"
                  className="w-full min-h-[44px] px-3.5 py-2.5 pl-10 text-base sm:text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition outline-none"
                  required
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/20 transition active:scale-[0.99] disabled:opacity-70"
              >
                {isSubmitting ? 'Đang xác thực...' : 'Đăng Nhập Ngay'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition"
              >
                Đóng
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

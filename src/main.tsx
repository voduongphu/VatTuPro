import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { StorageService } from './services/storage';
import { SyncService } from './services/syncService';
import './index.css';

const Bootstrap: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Chỉ nạp bộ nhớ cục bộ IndexedDB (~20ms) để hiển thị giao diện đăng nhập/tổng quan ngay tức thì;
        // quá trình đồng bộ mạng/Cloud chạy nền tự động qua SyncService.start() không chặn giao diện.
        await StorageService.init();
        SyncService.start();
      } catch (err) {
        console.error('Bootstrap init error:', err);
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen w-full overflow-auto bg-slate-950 flex p-4 text-slate-300 font-sans">
        <div className="m-auto flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-xs font-medium tracking-wide">Đang mở hệ thống kho vận...</span>
        </div>
      </div>
    );
  }

  return <App />;
};

createRoot(document.getElementById('root')!).render(<Bootstrap />);

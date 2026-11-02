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
        await StorageService.init();
        SyncService.start();
        await SyncService.initialSync(4500);
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
          <span className="text-xs font-medium tracking-wide">Đang khởi tạo và đồng bộ toàn bộ dữ liệu kho vận...</span>
        </div>
      </div>
    );
  }

  return <App />;
};

createRoot(document.getElementById('root')!).render(<Bootstrap />);

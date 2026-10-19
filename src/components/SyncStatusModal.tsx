import React, { useState } from 'react';
import {
  RefreshCw,
  CheckCircle2,
  Database,
  Cloud,
  Zap,
  Copy,
  Check,
  X,
  Server,
  Sparkles,
  Globe,
  Radio,
  Wifi,
  WifiOff,
  CheckCheck,
  Play,
  Save,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

export const SyncStatusModal: React.FC = () => {
  const {
    syncStatus,
    lastSyncedAt,
    autoSyncEnabled,
    setAutoSyncEnabled,
    syncProvider,
    triggerManualSync,
    isSyncModalOpen,
    setIsSyncModalOpen,
    realtimeConnectionState,
    lastRealtimeUpdateMessage,
    simulateGoogleAIUpdate,
    saveSupabaseCredentials,
    supabaseCredentials,
  } = useInventory();

  const [activeGuideTab, setActiveGuideTab] = useState<'supabase-realtime' | 'edge-config' | 'vercel-kv'>('supabase-realtime');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isSimulatingAI, setIsSimulatingAI] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);

  // Supabase form state
  const [inputUrl, setInputUrl] = useState(supabaseCredentials.url || '');
  const [inputKey, setInputKey] = useState(supabaseCredentials.key || '');
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isSyncModalOpen) return null;

  const handleCopy = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleForceSync = async () => {
    setIsManualSyncing(true);
    await triggerManualSync();
    setTimeout(() => setIsManualSyncing(false), 500);
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = saveSupabaseCredentials(inputUrl.trim(), inputKey.trim());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSimulateGoogleAI = async () => {
    setIsSimulatingAI(true);
    setAiTestResult(null);
    try {
      const res = await simulateGoogleAIUpdate();
      setAiTestResult(res.message);
    } catch (err: any) {
      setAiTestResult('Lỗi khi mô phỏng: ' + (err?.message || 'Không xác định'));
    } finally {
      setIsSimulatingAI(false);
    }
  };

  const supabaseRealtimeSQL = `-- 1. Tạo bảng lưu trữ trạng thái vật tư tập trung cho Supabase
CREATE TABLE IF NOT EXISTS inventory_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Thêm bản ghi mặc định
INSERT INTO inventory_state (id, data) 
VALUES ('default', '{}')
ON CONFLICT (id) DO NOTHING;

-- 3. KÍCH HOẠT SUPABASE REALTIME (BẮT BUỘC ĐỂ WEBSOCKET HOẠT ĐỘNG TỨC THÌ)
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_state;

-- 4. Bật REPLICA IDENTITY FULL để gửi toàn bộ payload khi có UPDATE
ALTER TABLE inventory_state REPLICA IDENTITY FULL;

-- 5. Bật Row Level Security (RLS) & Cấp quyền truy cập Realtime
ALTER TABLE inventory_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public realtime read" 
ON inventory_state FOR SELECT USING (true);

CREATE POLICY "Allow public realtime insert" 
ON inventory_state FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public realtime update" 
ON inventory_state FOR UPDATE USING (true);`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-linear-to-r from-emerald-950 via-slate-900 to-indigo-950 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Supabase Realtime & Đồng Bộ Dữ Liệu</h3>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 animate-pulse" />
                  0s WebSocket
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Lắng nghe thay đổi bảng số liệu qua Supabase Realtime WebSocket - cập nhật tức thì khi Google AI trả về
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSyncModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
          {/* Realtime WebSocket Live Status Banner */}
          <div
            className={`border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
              realtimeConnectionState === 'CONNECTED'
                ? 'bg-emerald-50/80 border-emerald-200'
                : realtimeConnectionState === 'CONNECTING'
                ? 'bg-blue-50/80 border-blue-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      realtimeConnectionState === 'CONNECTED'
                        ? 'bg-emerald-400'
                        : realtimeConnectionState === 'CONNECTING'
                        ? 'bg-blue-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-3 w-3 ${
                      realtimeConnectionState === 'CONNECTED'
                        ? 'bg-emerald-500'
                        : realtimeConnectionState === 'CONNECTING'
                        ? 'bg-blue-500'
                        : 'bg-amber-500'
                    }`}
                  />
                </span>
                <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  {realtimeConnectionState === 'CONNECTED' && (
                    <>
                      <Wifi className="w-4 h-4 text-emerald-600" />
                      <span>Supabase Realtime: WebSocket Đang Hoạt Động (0s Delay)</span>
                    </>
                  )}
                  {realtimeConnectionState === 'CONNECTING' && (
                    <>
                      <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                      <span>Đang thiết lập kênh WebSocket với Supabase...</span>
                    </>
                  )}
                  {realtimeConnectionState === 'UNCONFIGURED' && (
                    <>
                      <WifiOff className="w-4 h-4 text-slate-400" />
                      <span>Supabase Realtime: Chưa cấu hình thông tin</span>
                    </>
                  )}
                  {realtimeConnectionState === 'ERROR' && (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                      <span>Lỗi kết nối Supabase Realtime (Đang dùng polling 5s)</span>
                    </>
                  )}
                </span>
              </div>
              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                <span>
                  Lần đồng bộ gần nhất:{' '}
                  <strong className="text-slate-800">
                    {lastSyncedAt ? lastSyncedAt.toLocaleTimeString('vi-VN') : 'Vừa khởi động'}
                  </strong>
                </span>
                <span>•</span>
                <span className="font-semibold text-emerald-700 inline-flex items-center gap-1">
                  <Server className="w-3 h-3" />
                  {realtimeConnectionState === 'CONNECTED'
                    ? 'Kênh Realtime: public:inventory_state'
                    : syncProvider === 'supabase'
                    ? 'Supabase Cloud (REST)'
                    : syncProvider === 'vercel-edge-config'
                    ? 'Vercel Edge Config (Global Store)'
                    : 'Bộ nhớ Cục bộ / Polling 5s'}
                </span>
              </div>
            </div>

            {/* Actions: Force Sync & Auto-Sync Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  autoSyncEnabled
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                    : 'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300'
                }`}
                title="Bật/Tắt chế độ tự động dự phòng mỗi 5 giây"
              >
                {autoSyncEnabled ? 'Auto 5s: Bật' : 'Auto 5s: Tắt'}
              </button>

              <button
                type="button"
                disabled={isManualSyncing}
                onClick={handleForceSync}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {/* Interactive Test: Simulate Google AI pushing new numbers */}
          <div className="bg-linear-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                    Thử Nghiệm: Mô Phỏng Google AI Cập Nhật Số Liệu Mới
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Bấm nút bên dưới để Google AI tính toán số liệu tồn kho mới. Nếu bạn mở ứng dụng ở 2 tab trình duyệt,
                    tab kia sẽ nhận cập nhật ngay lập tức qua WebSocket!
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isSimulatingAI}
                onClick={handleSimulateGoogleAI}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-60"
              >
                {isSimulatingAI ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Google AI đang tính toán & phát sóng WebSocket...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Kích Hoạt Google AI Gửi Số Liệu Mới</span>
                  </>
                )}
              </button>
            </div>

            {aiTestResult && (
              <div className="p-2.5 bg-white border border-emerald-300 rounded-lg text-xs text-emerald-900 font-medium flex items-center gap-2 animate-in fade-in duration-150">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{aiTestResult}</span>
              </div>
            )}
          </div>

          {/* Setup Guide Tabs */}
          <div>
            <div className="flex border-b border-slate-200 mb-4 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveGuideTab('supabase-realtime')}
                className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-bold transition-colors border-b-2 whitespace-nowrap ${
                  activeGuideTab === 'supabase-realtime'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Zap className="w-4 h-4 text-emerald-600" />
                <span>1. Cấu Hình Supabase Realtime (Trực tiếp tại đây) ⭐</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('edge-config')}
                className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-bold transition-colors border-b-2 whitespace-nowrap ${
                  activeGuideTab === 'edge-config'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>2. Global Config Store (Vercel Edge Config)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('vercel-kv')}
                className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-bold transition-colors border-b-2 whitespace-nowrap ${
                  activeGuideTab === 'vercel-kv'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Cloud className="w-4 h-4 text-blue-600" />
                <span>3. Vercel KV (Upstash Redis)</span>
              </button>
            </div>

            {/* Tab 1: Supabase Realtime */}
            {activeGuideTab === 'supabase-realtime' && (
              <div className="space-y-4 text-xs text-slate-600 animate-in fade-in duration-150">
                {/* Form to enter credentials directly */}
                <form onSubmit={handleSaveCredentials} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <Database className="w-4 h-4 text-emerald-600" />
                      <span>Nhập thông tin kết nối Supabase của bạn:</span>
                    </h5>
                    {saveSuccess && (
                      <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCheck className="w-3.5 h-3.5" />
                        Đã lưu & kết nối lại!
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Supabase Project URL (VITE_SUPABASE_URL) *
                      </label>
                      <input
                        type="url"
                        value={inputUrl}
                        onChange={(e) => setInputUrl(e.target.value)}
                        placeholder="https://your-project.supabase.co"
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Supabase Anon Key (VITE_SUPABASE_ANON_KEY) *
                      </label>
                      <input
                        type="text"
                        value={inputKey}
                        onChange={(e) => setInputKey(e.target.value)}
                        placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                        className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-slate-400">
                      Thông tin được lưu trữ an toàn trong trình duyệt hoặc đọc từ file môi trường <code>.env</code>.
                    </p>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Lưu & Kết Nối WebSocket</span>
                    </button>
                  </div>
                </form>

                {/* Step by step guide */}
                <ol className="list-decimal pl-5 space-y-3">
                  <li>
                    <strong className="text-slate-800">Tạo dự án trên Supabase:</strong> Truy cập{' '}
                    <code>supabase.com</code> &rarr; Chọn <strong>New Project</strong>.
                  </li>
                  <li>
                    <strong className="text-slate-800">Chạy câu lệnh SQL kích hoạt Realtime:</strong> Vào mục{' '}
                    <strong>SQL Editor</strong> và chạy toàn bộ đoạn script sau:
                    <div className="relative mt-2">
                      <pre className="p-3 bg-slate-900 text-emerald-300 rounded-lg font-mono text-[10.5px] overflow-x-auto leading-relaxed">
                        {supabaseRealtimeSQL}
                      </pre>
                      <button
                        type="button"
                        onClick={() => handleCopy(supabaseRealtimeSQL, 'sql')}
                        className="absolute top-2 right-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] flex items-center gap-1 transition-colors"
                      >
                        {copiedKey === 'sql' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Đã copy</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy SQL</span>
                          </>
                        )}
                      </button>
                    </div>
                  </li>
                  <li>
                    <strong className="text-slate-800">Kích hoạt Realtime trong Table Editor (Nếu cần):</strong>
                    <div className="text-slate-500 mt-0.5">
                      Vào tab <strong>Database</strong> &rarr; <strong>Publications</strong> &rarr; Nhấp vào{' '}
                      <code>supabase_realtime</code> &rarr; Đảm bảo bảng <code>inventory_state</code> đã được bật (Toggle ON).
                    </div>
                  </li>
                  <li>
                    <strong className="text-slate-800">Cấu hình biến môi trường trên Vercel:</strong>
                    <div className="mt-1.5 p-2 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] space-y-1">
                      <div>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
                      <div>VITE_SUPABASE_ANON_KEY=your-anon-public-key</div>
                    </div>
                  </li>
                </ol>
              </div>
            )}

            {/* Tab 2: Vercel Edge Config */}
            {activeGuideTab === 'edge-config' && (
              <div className="space-y-3 text-xs text-slate-600 animate-in fade-in duration-150">
                <ol className="list-decimal pl-5 space-y-2.5">
                  <li>
                    <strong className="text-slate-800">Mở Vercel Dashboard:</strong> Truy cập dự án &rarr; Tab{' '}
                    <strong>Storage</strong> &rarr; <strong>Create Database</strong> &rarr; Chọn <strong>Edge Config</strong>.
                  </li>
                  <li>
                    <strong className="text-slate-800">Vercel tự động cấp phát:</strong> Biến <code>EDGE_CONFIG</code> với
                    độ trễ đọc &lt; 15ms toàn cầu.
                  </li>
                  <li>
                    <strong className="text-slate-800">Thêm VERCEL_API_TOKEN:</strong> Để cho phép serverless ghi dữ liệu Google AI vào
                    Edge Config.
                  </li>
                </ol>
              </div>
            )}

            {/* Tab 3: Vercel KV */}
            {activeGuideTab === 'vercel-kv' && (
              <div className="space-y-3 text-xs text-slate-600 animate-in fade-in duration-150">
                <ol className="list-decimal pl-5 space-y-2.5">
                  <li>
                    <strong className="text-slate-800">Mở Vercel Dashboard:</strong> Chọn <strong>Storage</strong> &rarr;{' '}
                    <strong>Create Database</strong> &rarr; <strong>KV (Redis)</strong>.
                  </li>
                  <li>
                    <strong className="text-slate-800">Tự động cấu hình:</strong> Vercel cấp phát <code>KV_REST_API_URL</code> và{' '}
                    <code>KV_REST_API_TOKEN</code>.
                  </li>
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Kênh Supabase Realtime WebSocket tự động kết nối lại khi rớt mạng</span>
          </div>
          <button
            type="button"
            onClick={() => setIsSyncModalOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors shadow-2xs"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
};

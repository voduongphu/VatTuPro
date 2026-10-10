import React, { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import { formatNumber, formatVND } from '../utils/formatters';
import {
  CheckCircle2,
  AlertCircle,
  FileCheck,
  RefreshCw,
  Database,
  Upload,
  Download,
} from 'lucide-react';

export const AuditView: React.FC = () => {
  const {
    items,
    warehouses,
    adjustStock,
    exportAllDataJSON,
    importAllDataJSON,
    resetToInitialData,
  } = useInventory();

  const [selectedWh, setSelectedWh] = useState(warehouses[0] || 'Kho LP1-T08');
  const [auditorName, setAuditorName] = useState('Ban Kiểm Kê Kho');
  const [auditNotes, setAuditNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [showDataManagement, setShowDataManagement] = useState(false);

  // Filter items in selected warehouse
  const whItems = items.filter(it => it.warehouse === selectedWh);

  // Keep state for counted stock
  const [counts, setCounts] = useState<Record<string, number>>({});

  const getCounted = (itemId: string, systemStock: number) => {
    return counts[itemId] !== undefined ? counts[itemId] : systemStock;
  };

  const handleCountChange = (itemId: string, val: number) => {
    setCounts(prev => ({ ...prev, [itemId]: Math.max(0, val) }));
  };

  const handleAdjustSingle = (itemId: string, itemStock: number) => {
    const counted = getCounted(itemId, itemStock);
    if (counted === itemStock) {
      alert('Số lượng thực tế trùng khớp với sổ sách, không cần điều chỉnh.');
      return;
    }
    const diff = counted - itemStock;
    const isSurplus = diff > 0;
    const reasonText = isSurplus
      ? `Kiểm kê thừa ${Math.abs(diff)} đơn vị (${auditNotes || 'Đợt kiểm kê định kỳ'})`
      : `Kiểm kê hao hụt/thiếu ${Math.abs(diff)} đơn vị (${auditNotes || 'Đợt kiểm kê định kỳ'})`;

    adjustStock(itemId, counted, reasonText, auditorName);
    setSuccessMessage(`Đã cập nhật tồn kho cho mặt hàng thành ${counted}!`);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const handleAdjustAllDiscrepancies = () => {
    const discrepancies = whItems.filter(it => {
      const counted = getCounted(it.id, it.currentStock);
      return counted !== it.currentStock;
    });

    if (discrepancies.length === 0) {
      alert('Tất cả mặt hàng đều khớp số lượng, không có chênh lệch nào cần điều chỉnh.');
      return;
    }

    if (
      !window.confirm(
        `Phát hiện ${discrepancies.length} mặt hàng có chênh lệch. Bạn có chắc chắn muốn cân bằng tự động số tồn sổ sách theo số đếm thực tế?`
      )
    ) {
      return;
    }

    discrepancies.forEach(it => {
      const counted = getCounted(it.id, it.currentStock);
      const diff = counted - it.currentStock;
      const reasonText = `Cân bằng kiểm kê kho: chênh lệch ${diff > 0 ? '+' : ''}${diff}`;
      adjustStock(it.id, counted, reasonText, auditorName);
    });

    setSuccessMessage(`Đã điều chỉnh cân bằng thành công ${discrepancies.length} mặt hàng!`);
    setTimeout(() => setSuccessMessage(''), 5000);
  };

  const handleImportJSON = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonInput.trim()) return;
    const res = importAllDataJSON(jsonInput);
    if (res.success) {
      alert(res.message);
      setJsonInput('');
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Audit Header */}
      <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Kiểm Kê Kho & Điều Chỉnh Chênh Lệch
            </h2>
            <p className="text-xs text-slate-500">
              Đối chiếu tồn kho sổ sách với số lượng kiểm đếm thực tế tại kho
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDataManagement(!showDataManagement)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded hover:bg-slate-100 transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              <span>{showDataManagement ? 'Ẩn sao lưu dữ liệu' : 'Sao lưu / Phục hồi'}</span>
            </button>
            <button
              onClick={handleAdjustAllDiscrepancies}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 transition-colors shadow-xs"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Cân bằng tự động tất cả chênh lệch</span>
            </button>
          </div>
        </div>

        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Audit Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Chọn kho kiểm kê *
            </label>
            <select
              value={selectedWh}
              onChange={e => setSelectedWh(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-800"
            >
              {warehouses.map(w => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Người / Ban kiểm kê
            </label>
            <input
              type="text"
              value={auditorName}
              onChange={e => setAuditorName(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-800"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Lý do / Căn cứ kiểm kê
            </label>
            <input
              type="text"
              placeholder="VD: Kiểm kê quý IV/2026..."
              value={auditNotes}
              onChange={e => setAuditNotes(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Discrepancies Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            Danh sách vật tư tại: {selectedWh} ({whItems.length} mặt hàng)
          </span>
          <span className="text-slate-500">
            Nhập số lượng thực tế kiểm đếm vào cột "Thực tế" để tính chênh lệch
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                <th className="py-2.5 px-3 w-10 text-center">STT</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Mã VT</th>
                <th className="py-2.5 px-3 min-w-[200px]">Tên vật tư thiết bị</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Vị trí kệ</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">ĐVT</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Tồn sổ sách</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap w-28">Thực tế đếm</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Chênh lệch</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Giá trị lệch (VNĐ)</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {whItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                    Không có vật tư nào lưu tại kho này.
                  </td>
                </tr>
              ) : (
                whItems.map((item, idx) => {
                  const counted = getCounted(item.id, item.currentStock);
                  const diff = counted - item.currentStock;
                  const diffValue = diff * item.unitPrice;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-sans">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                        {item.code}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-semibold text-slate-800">{item.name}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">
                          {item.modelSpecs}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {item.locationBin || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600 font-sans">
                        {item.unit}
                      </td>

                      {/* System Stock */}
                      <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                        {formatNumber(item.currentStock)}
                      </td>

                      {/* Counted input */}
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={counted}
                          onChange={e => handleCountChange(item.id, Number(e.target.value))}
                          className="w-20 px-2 py-1 text-right text-xs font-mono font-bold bg-white border border-slate-300 rounded text-slate-900 focus:outline-none focus:border-slate-800"
                        />
                      </td>

                      {/* Difference */}
                      <td className="py-2.5 px-3 text-right">
                        {diff === 0 ? (
                          <span className="text-slate-400 font-normal">Khớp (0)</span>
                        ) : diff > 0 ? (
                          <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                            +{formatNumber(diff)}
                          </span>
                        ) : (
                          <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded">
                            {formatNumber(diff)}
                          </span>
                        )}
                      </td>

                      {/* Diff Value */}
                      <td className="py-2.5 px-3 text-right">
                        {diff === 0 ? (
                          <span className="text-slate-400">0 ₫</span>
                        ) : diff > 0 ? (
                          <span className="text-emerald-700 font-semibold">
                            +{formatVND(diffValue)}
                          </span>
                        ) : (
                          <span className="text-rose-700 font-semibold">
                            {formatVND(diffValue)}
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap font-sans">
                        {diff !== 0 ? (
                          <button
                            onClick={() => handleAdjustSingle(item.id, item.currentStock)}
                            className="px-2.5 py-1 text-[11px] font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors"
                          >
                            Cân bằng mục này
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Đã khớp</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data Management & Backup Section (Collapsible) */}
      {showDataManagement && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900">
              Quản Trị Dữ Liệu & Sao Lưu (Backup & Restore)
            </h3>
            <p className="text-xs text-slate-500">
              Xuất tệp JSON để lưu trữ ngoại tuyến hoặc phục hồi dữ liệu kho
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-xs font-bold text-slate-800">Xuất dữ liệu & Tải mẫu</h4>
              <p className="text-xs text-slate-600">
                Tải toàn bộ danh mục vật tư, phiếu nhập xuất và bộ lọc hiện tại về máy tính.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={exportAllDataJSON}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 transition-colors shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tải tệp sao lưu JSON</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Khôi phục lại dữ liệu mẫu gốc nhà máy? Dữ liệu hiện tại sẽ được thay thế bằng bộ mẫu chuẩn.')) {
                      resetToInitialData();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Khôi phục dữ liệu mẫu gốc</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={handleImportJSON}
              className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
            >
              <h4 className="text-xs font-bold text-slate-800">Nhập tệp sao lưu JSON</h4>
              <textarea
                rows={2}
                placeholder="Dán nội dung JSON sao lưu vào đây để phục hồi..."
                value={jsonInput}
                onChange={e => setJsonInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-800 font-mono"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Nạp & Cập nhật dữ liệu</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

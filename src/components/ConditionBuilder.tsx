import React, { useState } from 'react';
import {
  ConditionRule,
  FilterField,
  FilterOperator,
  MatchLogic,
  ITEM_TYPE_LABELS,
  ITEM_CONDITION_LABELS,
} from '../types/inventory';
import { useInventory } from '../context/InventoryContext';
import {
  Plus,
  Trash2,
  Bookmark,
  Check,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { formatNumber } from '../utils/formatters';

interface ConditionBuilderProps {
  matchedCount: number;
  totalCount: number;
}

const FIELD_OPTIONS: { id: FilterField; label: string; type: 'text' | 'select' | 'number' | 'special' }[] = [
  { id: 'searchQuery', label: 'Từ khóa tổng hợp (Mã, Tên, Quy cách)', type: 'text' },
  { id: 'type', label: 'Phân loại (Vật tư / Thiết bị / Công cụ)', type: 'select' },
  { id: 'category', label: 'Nhóm danh mục', type: 'select' },
  { id: 'warehouse', label: 'Kho lưu trữ', type: 'select' },
  { id: 'stockStatus', label: 'Trạng thái định mức tồn', type: 'select' },
  { id: 'condition', label: 'Tình trạng thiết bị máy móc', type: 'select' },
  { id: 'maintenanceDue', label: 'Lịch bảo dưỡng định kỳ', type: 'select' },
  { id: 'expiryStatus', label: 'Hạn sử dụng (Date)', type: 'select' },
  { id: 'currentStock', label: 'Số lượng tồn hiện tại', type: 'number' },
  { id: 'unitPrice', label: 'Đơn giá (VNĐ)', type: 'number' },
  { id: 'totalValue', label: 'Tổng giá trị tồn kho (VNĐ)', type: 'number' },
  { id: 'supplier', label: 'Nhà cung cấp', type: 'text' },
  { id: 'manufacturer', label: 'Nhà sản xuất (Hãng SX)', type: 'text' },
  { id: 'packingListNo', label: 'Số Packing List (P/L)', type: 'text' },
  { id: 'shipment', label: 'Lô hàng / Shipment', type: 'text' },
  { id: 'projectItem', label: 'Hạng mục công trình / Gói thầu', type: 'text' },
  { id: 'packageNo', label: 'Số kiện / Mã kiện hàng', type: 'text' },
  { id: 'packageName', label: 'Tên kiện / Quy cách kiện', type: 'text' },
];

export const ConditionBuilder: React.FC<ConditionBuilderProps> = ({
  matchedCount,
  totalCount,
}) => {
  const {
    activeRules,
    activeLogic,
    activePresetId,
    filterPresets,
    warehouses,
    categories,
    addConditionRule,
    updateConditionRule,
    removeConditionRule,
    clearConditionRules,
    setActiveLogic,
    applyPreset,
    saveCustomPreset,
    deletePreset,
  } = useInventory();

  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const handleAddNewRule = () => {
    addConditionRule({
      field: 'stockStatus',
      operator: 'EQUALS',
      value: 'THIEU_HUT',
    });
  };

  const handleSavePresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    saveCustomPreset(newPresetName.trim(), newPresetDesc.trim());
    setNewPresetName('');
    setNewPresetDesc('');
    setIsSavingPreset(false);
  };

  // Helper to render value input based on rule field
  const renderValueInput = (rule: ConditionRule) => {
    const { field, operator, value, secondaryValue } = rule;

    if (operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY') {
      return (
        <span className="text-xs text-slate-400 italic px-2 py-1.5 bg-slate-50 border border-slate-200 rounded">
          Không yêu cầu nhập giá trị
        </span>
      );
    }

    if (field === 'type') {
      return (
        <select
          value={value || 'VAT_TU'}
          onChange={e => updateConditionRule(rule.id, { value: e.target.value })}
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
        >
          {Object.entries(ITEM_TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      );
    }

    if (field === 'condition') {
      return (
        <select
          value={value || 'GOOD'}
          onChange={e => updateConditionRule(rule.id, { value: e.target.value })}
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
        >
          {Object.entries(ITEM_CONDITION_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      );
    }

    if (field === 'stockStatus') {
      return (
        <select
          value={value || 'THIEU_HUT'}
          onChange={e => updateConditionRule(rule.id, { value: e.target.value })}
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800 font-medium"
        >
          <option value="THIEU_HUT">Cảnh báo thiếu hụt (Tồn &lt; Min)</option>
          <option value="VUOT_DINH_MUC">Vượt mức tồn trữ (Tồn &gt; Max)</option>
          <option value="HET_HANG">Đã hết hàng (Tồn = 0)</option>
          <option value="HOP_LE">Tồn kho hợp lệ (Trong ngưỡng an toàn)</option>
        </select>
      );
    }

    if (field === 'maintenanceDue') {
      return (
        <select
          value={value || 'OVERDUE'}
          onChange={e => updateConditionRule(rule.id, { value: e.target.value })}
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
        >
          <option value="OVERDUE">Đã quá hạn bảo dưỡng định kỳ</option>
          <option value="DUE_SOON">Sắp tới hạn bảo dưỡng (trong 30 ngày)</option>
          <option value="OK">Lịch bảo dưỡng bình thường</option>
        </select>
      );
    }

    if (field === 'expiryStatus') {
      return (
        <select
          value={value || 'EXPIRING_SOON'}
          onChange={e => updateConditionRule(rule.id, { value: e.target.value })}
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
        >
          <option value="EXPIRING_SOON">Sắp hết hạn sử dụng (&lt; 60 ngày)</option>
          <option value="EXPIRED">Đã quá hạn sử dụng</option>
          <option value="SAFE">Còn hạn sử dụng dài</option>
        </select>
      );
    }

    if (field === 'warehouse') {
      return (
        <select
          value={value || warehouses[0]}
          onChange={e => updateConditionRule(rule.id, { value: e.target.value })}
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
        >
          {warehouses.map(w => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      );
    }

    if (field === 'category') {
      return (
        <select
          value={value || categories[0]}
          onChange={e => updateConditionRule(rule.id, { value: e.target.value })}
          className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
        >
          {categories.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      );
    }

    // Number fields (with support for BETWEEN)
    if (field === 'currentStock' || field === 'unitPrice' || field === 'totalValue') {
      if (operator === 'BETWEEN') {
        return (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              placeholder="Từ..."
              value={value || ''}
              onChange={e => updateConditionRule(rule.id, { value: Number(e.target.value) })}
              className="w-24 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800 font-mono"
            />
            <span className="text-xs text-slate-400">đến</span>
            <input
              type="number"
              placeholder="Đến..."
              value={secondaryValue || ''}
              onChange={e =>
                updateConditionRule(rule.id, { secondaryValue: Number(e.target.value) })
              }
              className="w-24 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800 font-mono"
            />
          </div>
        );
      }

      return (
        <input
          type="number"
          placeholder="Nhập giá trị..."
          value={value ?? ''}
          onChange={e => updateConditionRule(rule.id, { value: Number(e.target.value) })}
          className="w-32 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800 font-mono"
        />
      );
    }

    // General text input
    return (
      <input
        type="text"
        placeholder="Nhập từ khóa cần lọc..."
        value={value || ''}
        onChange={e => updateConditionRule(rule.id, { value: e.target.value })}
        className="w-48 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
      />
    );
  };

  return (
    <div className="border border-slate-200 bg-white rounded-lg p-4 mb-4">
      {/* Top Bar of Filter Section: Presets & Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
            Bộ lọc thông minh:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {filterPresets.map(preset => {
              const isActive = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  title={preset.description}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {preset.name}
                  {!preset.isDefault && (
                    <span
                      onClick={e => {
                        e.stopPropagation();
                        deletePreset(preset.id);
                      }}
                      className="ml-1 text-slate-400 hover:text-red-500"
                    >
                      ×
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Counter and Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            Kết quả:{' '}
            <span className="font-semibold text-slate-900 font-mono">
              {formatNumber(matchedCount)}
            </span>
            /{formatNumber(totalCount)} vật tư
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-slate-600 hover:text-slate-900 underline whitespace-nowrap"
          >
            {isExpanded ? 'Thu gọn điều kiện' : 'Tùy chỉnh nhiều điều kiện'}
          </button>
        </div>
      </div>

      {/* Expanded Condition Query Builder */}
      {isExpanded && (
        <div className="pt-3">
          {/* Match Logic Controller */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Điều kiện kết hợp:</span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md">
                <button
                  type="button"
                  onClick={() => setActiveLogic('AND')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    activeLogic === 'AND'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  VÀ (AND) - Phải thỏa tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLogic('OR')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    activeLogic === 'OR'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  HOẶC (OR) - Thỏa bất kỳ
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeRules.length > 0 && (
                <>
                  <button
                    onClick={() => setIsSavingPreset(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors whitespace-nowrap"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    Lưu thành bộ lọc mẫu
                  </button>
                  <button
                    onClick={clearConditionRules}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Xóa tất cả điều kiện
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Condition Rules List */}
          {activeRules.length === 0 ? (
            <div className="py-5 text-center bg-slate-50 border border-dashed border-slate-200 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">
                Chưa có điều kiện lọc nào được thiết lập. Tất cả vật tư thiết bị đang được hiển thị.
              </p>
              <button
                onClick={handleAddNewRule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm điều kiện lọc mới
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeRules.map((rule, index) => {
                const isNumeric = ['currentStock', 'unitPrice', 'totalValue'].includes(rule.field);
                return (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-md"
                  >
                    <span className="text-xs font-mono text-slate-500 w-6 text-center">
                      #{index + 1}
                    </span>

                    {/* Field Selector */}
                    <select
                      value={rule.field}
                      onChange={e => {
                        const newField = e.target.value as FilterField;
                        const isNum = ['currentStock', 'unitPrice', 'totalValue'].includes(newField);
                        updateConditionRule(rule.id, {
                          field: newField,
                          operator: isNum ? 'GREATER_THAN' : 'EQUALS',
                          value: isNum ? 0 : '',
                        });
                      }}
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
                    >
                      {FIELD_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* Operator Selector */}
                    <select
                      value={rule.operator}
                      onChange={e =>
                        updateConditionRule(rule.id, {
                          operator: e.target.value as FilterOperator,
                        })
                      }
                      className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-800 text-slate-800"
                    >
                      {isNumeric ? (
                        <>
                          <option value="GREATER_THAN">Lớn hơn hoặc bằng (&ge;)</option>
                          <option value="LESS_THAN">Nhỏ hơn hoặc bằng (&le;)</option>
                          <option value="EQUALS">Chính xác bằng (=)</option>
                          <option value="BETWEEN">Trong khoảng (Từ - Đến)</option>
                        </>
                      ) : (
                        <>
                          <option value="EQUALS">Chính xác bằng (=)</option>
                          <option value="NOT_EQUALS">Khác (!=)</option>
                          <option value="CONTAINS">Chứa từ khóa</option>
                          <option value="IS_EMPTY">Để trống / Chưa có</option>
                          <option value="IS_NOT_EMPTY">Có thông tin / Đã gán</option>
                        </>
                      )}
                    </select>

                    {/* Value Input */}
                    <div className="flex-1 min-w-[200px]">{renderValueInput(rule)}</div>

                    {/* Delete Rule Action */}
                    <button
                      onClick={() => removeConditionRule(rule.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                      title="Xóa điều kiện này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              <div className="pt-2">
                <button
                  onClick={handleAddNewRule}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm điều kiện
                </button>
              </div>
            </div>
          )}

          {/* Modal / Inline form to save custom preset */}
          {isSavingPreset && (
            <form
              onSubmit={handleSavePresetSubmit}
              className="mt-3 p-3 bg-slate-100 border border-slate-300 rounded-md space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800">
                  Lưu bộ điều kiện hiện tại thành mẫu dùng lại
                </h4>
                <button
                  type="button"
                  onClick={() => setIsSavingPreset(false)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Hủy
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Tên bộ lọc (ví dụ: Thiết bị Đồng Nai cần bảo trì)"
                  value={newPresetName}
                  onChange={e => setNewPresetName(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
                />
                <input
                  type="text"
                  placeholder="Ghi chú tóm tắt (không bắt buộc)"
                  value={newPresetDesc}
                  onChange={e => setNewPresetDesc(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 focus:outline-none focus:border-slate-800"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
                >
                  Xác nhận lưu
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

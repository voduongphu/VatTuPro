import React, { useState } from 'react';
import {
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Warehouse as WarehouseIcon,
  Layers,
  AlertTriangle,
  SlidersHorizontal,
  RotateCcw,
  Tag,
  Wrench,
  DollarSign,
  Calendar,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import {
  EquipmentCondition,
  ItemType,
  StockStatus,
} from '../types/inventory';
import {
  formatCurrency,
  getConditionLabel,
  getItemTypeLabel,
  getStockStatusLabel,
} from '../utils/formatters';

export const MultiFilterBar: React.FC = () => {
  const {
    warehouses,
    categories,
    suppliers,
    filterCriteria,
    updateFilter,
    resetFilterCriteria,
    applyPresetFilter,
    activeFilterCount,
    filteredItems,
  } = useInventory();

  const [isExpanded, setIsExpanded] = useState(false);

  // Toggle helpers for array filters
  const toggleWarehouse = (whId: string) => {
    const current = filterCriteria.warehouses;
    if (current.includes(whId)) {
      updateFilter('warehouses', current.filter(id => id !== whId));
    } else {
      updateFilter('warehouses', [...current, whId]);
    }
  };

  const toggleItemType = (type: ItemType) => {
    const current = filterCriteria.itemTypes;
    if (current.includes(type)) {
      updateFilter('itemTypes', current.filter(t => t !== type));
    } else {
      updateFilter('itemTypes', [...current, type]);
    }
  };

  const toggleCategory = (cat: string) => {
    const current = filterCriteria.categories;
    if (current.includes(cat)) {
      updateFilter('categories', current.filter(c => c !== cat));
    } else {
      updateFilter('categories', [...current, cat]);
    }
  };

  const toggleStockStatus = (status: StockStatus) => {
    const current = filterCriteria.stockStatuses;
    if (current.includes(status)) {
      updateFilter('stockStatuses', current.filter(s => s !== status));
    } else {
      updateFilter('stockStatuses', [...current, status]);
    }
  };

  const toggleCondition = (cond: EquipmentCondition) => {
    const current = filterCriteria.equipmentConditions;
    if (current.includes(cond)) {
      updateFilter('equipmentConditions', current.filter(c => c !== cond));
    } else {
      updateFilter('equipmentConditions', [...current, cond]);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs mb-6 overflow-hidden">
      {/* Search and Top Bar */}
      <div className="p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filterCriteria.searchQuery}
            onChange={e => updateFilter('searchQuery', e.target.value)}
            placeholder="Tìm theo mã SKU, tên vật tư, số serial/lô, thông số kỹ thuật..."
            className="w-full pl-10 pr-9 py-2 text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg transition-colors placeholder:text-slate-400 outline-none"
          />
          {filterCriteria.searchQuery && (
            <button
              onClick={() => updateFilter('searchQuery', '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action Controls & Toggle Advanced */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              isExpanded || activeFilterCount > 0
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Bộ lọc nâng cao</span>
            {activeFilterCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilterCriteria}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors"
              title="Xóa tất cả điều kiện lọc"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Đặt lại</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Filter Presets Strip */}
      <div className="px-4 sm:px-5 pb-3 pt-1 border-t border-slate-100 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-slate-400 shrink-0 font-medium">Bộ lọc nhanh:</span>
        <button
          onClick={() => resetFilterCriteria()}
          className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
            activeFilterCount === 0
              ? 'bg-slate-900 text-white font-medium'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Tất cả ({filteredItems.length})
        </button>
        <button
          onClick={() => applyPresetFilter('LOW_STOCK')}
          className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            filterCriteria.stockStatuses.includes('CANH_BAO_THAP') && filterCriteria.stockStatuses.includes('HET_HANG')
              ? 'bg-rose-700 text-white font-medium'
              : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          <span>Dưới định mức / Hết hàng</span>
        </button>
        <button
          onClick={() => applyPresetFilter('EQUIPMENT_ACTIVE')}
          className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            filterCriteria.equipmentConditions.includes('DANG_MUON')
              ? 'bg-blue-700 text-white font-medium'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
          }`}
        >
          <Layers className="w-3 h-3" />
          <span>Thiết bị đang cấp công trường</span>
        </button>
        <button
          onClick={() => applyPresetFilter('NEED_MAINTENANCE')}
          className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            filterCriteria.needsInspection
              ? 'bg-amber-700 text-white font-medium'
              : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
          }`}
        >
          <Wrench className="w-3 h-3" />
          <span>Cần kiểm định / Bảo dưỡng</span>
        </button>
        <button
          onClick={() => applyPresetFilter('HIGH_VALUE')}
          className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            filterCriteria.minValue === 20000000
              ? 'bg-emerald-700 text-white font-medium'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
          }`}
        >
          <DollarSign className="w-3 h-3" />
          <span>Giá trị cao (&gt; 20 triệu ₫)</span>
        </button>
      </div>

      {/* Advanced Filter Criteria Drawer */}
      {isExpanded && (
        <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/60 space-y-5">
          {/* Grid of multi-condition selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Condition 1: Kho hàng */}
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                <WarehouseIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Kho lưu trữ</span>
                {filterCriteria.warehouses.length > 0 && (
                  <span className="text-[10px] text-indigo-600 font-bold">({filterCriteria.warehouses.length})</span>
                )}
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto text-xs pr-1">
                {warehouses.map(wh => {
                  const checked = filterCriteria.warehouses.includes(wh.id);
                  return (
                    <label
                      key={wh.id}
                      className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWarehouse(wh.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span className="text-slate-700 truncate" title={wh.name}>
                        {wh.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Condition 2: Phân loại mặt hàng */}
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                <span>Phân loại mặt hàng</span>
                {filterCriteria.itemTypes.length > 0 && (
                  <span className="text-[10px] text-indigo-600 font-bold">({filterCriteria.itemTypes.length})</span>
                )}
              </div>
              <div className="space-y-1.5 text-xs">
                {(['VAT_TU', 'THIET_BI', 'CONG_CU', 'PHU_TUNG'] as ItemType[]).map(type => {
                  const checked = filterCriteria.itemTypes.includes(type);
                  return (
                    <label
                      key={type}
                      className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItemType(type)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span className="text-slate-700">{getItemTypeLabel(type)}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Condition 3: Trạng thái tồn kho */}
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
                <span>Tình trạng tồn kho</span>
                {filterCriteria.stockStatuses.length > 0 && (
                  <span className="text-[10px] text-indigo-600 font-bold">({filterCriteria.stockStatuses.length})</span>
                )}
              </div>
              <div className="space-y-1.5 text-xs">
                {(['BINH_THUONG', 'CANH_BAO_THAP', 'HET_HANG', 'VUOT_DINH_MUC'] as StockStatus[]).map(
                  status => {
                    const checked = filterCriteria.stockStatuses.includes(status);
                    return (
                      <label
                        key={status}
                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStockStatus(status)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                        />
                        <span className="text-slate-700">{getStockStatusLabel(status)}</span>
                      </label>
                    );
                  }
                )}
              </div>
            </div>

            {/* Condition 4: Tình trạng thiết bị */}
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                <Wrench className="w-3.5 h-3.5 text-slate-500" />
                <span>Tình trạng thiết bị</span>
                {filterCriteria.equipmentConditions.length > 0 && (
                  <span className="text-[10px] text-indigo-600 font-bold">({filterCriteria.equipmentConditions.length})</span>
                )}
              </div>
              <div className="space-y-1.5 text-xs">
                {(['SAN_SANG', 'DANG_MUON', 'BAO_DUONG', 'HONG_CHO_SUA'] as EquipmentCondition[]).map(
                  cond => {
                    const checked = filterCriteria.equipmentConditions.includes(cond);
                    return (
                      <label
                        key={cond}
                        className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCondition(cond)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                        />
                        <span className="text-slate-700">{getConditionLabel(cond)}</span>
                      </label>
                    );
                  }
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Secondary Conditions (Category, Range, Inspection) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Danh mục / Nhóm */}
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <label className="block text-xs font-semibold text-slate-800 mb-2">
                Nhóm ngành / Danh mục vật tư
              </label>
              <div className="space-y-1.5 max-h-32 overflow-y-auto text-xs pr-1">
                {categories.map(cat => {
                  const checked = filterCriteria.categories.includes(cat);
                  return (
                    <label
                      key={cat}
                      className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(cat)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                      />
                      <span className="text-slate-700">{cat}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Khoảng giá trị tồn kho */}
            <div className="bg-white p-3.5 rounded-lg border border-slate-200">
              <label className="block text-xs font-semibold text-slate-800 mb-2">
                Khoảng tổng giá trị tồn kho (VNĐ)
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <span className="text-[11px] text-slate-500 block mb-1">Từ (VNĐ)</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 ₫"
                    value={filterCriteria.minValue ?? ''}
                    onChange={e =>
                      updateFilter('minValue', e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded focus:border-indigo-500 outline-none tabular-nums"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block mb-1">Đến (VNĐ)</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Không giới hạn"
                    value={filterCriteria.maxValue ?? ''}
                    onChange={e =>
                      updateFilter('maxValue', e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded focus:border-indigo-500 outline-none tabular-nums"
                  />
                </div>
              </div>

              {/* Inspection checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-slate-100 text-xs">
                <input
                  type="checkbox"
                  checked={filterCriteria.needsInspection}
                  onChange={e => updateFilter('needsInspection', e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                />
                <span className="text-slate-700 font-medium">Chỉ hiện thiết bị đến hạn kiểm định / quá hạn</span>
              </label>
            </div>

            {/* Khoảng số lượng tồn & Nhà cung cấp */}
            <div className="bg-white p-3.5 rounded-lg border border-slate-200 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Nhà cung cấp / Đối tác
                </label>
                <select
                  value={filterCriteria.supplier}
                  onChange={e => updateFilter('supplier', e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded focus:border-indigo-500 outline-none bg-white"
                >
                  <option value="">Tất cả nhà cung cấp ({suppliers.length})</option>
                  {suppliers.map(sup => (
                    <option key={sup} value={sup}>
                      {sup}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Khoảng số lượng tồn kho
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Tồn tối thiểu"
                    value={filterCriteria.minStockQty ?? ''}
                    onChange={e =>
                      updateFilter('minStockQty', e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-indigo-500 outline-none tabular-nums"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Tồn tối đa"
                    value={filterCriteria.maxStockQty ?? ''}
                    onChange={e =>
                      updateFilter('maxStockQty', e.target.value ? Number(e.target.value) : undefined)
                    }
                    className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-indigo-500 outline-none tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Badges */}
      {activeFilterCount > 0 && (
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center flex-wrap gap-2 text-xs">
          <span className="text-slate-500 font-medium">Đang lọc theo:</span>

          {filterCriteria.searchQuery && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700">
              <span>Từ khóa: "{filterCriteria.searchQuery}"</span>
              <button
                onClick={() => updateFilter('searchQuery', '')}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filterCriteria.warehouses.map(whId => {
            const wh = warehouses.find(w => w.id === whId);
            return (
              <span
                key={whId}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700"
              >
                <span>Kho: {wh?.name || whId}</span>
                <button
                  onClick={() => toggleWarehouse(whId)}
                  className="hover:text-rose-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}

          {filterCriteria.itemTypes.map(type => (
            <span
              key={type}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700"
            >
              <span>Loại: {getItemTypeLabel(type)}</span>
              <button
                onClick={() => toggleItemType(type)}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {filterCriteria.stockStatuses.map(status => (
            <span
              key={status}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700"
            >
              <span>Tồn: {getStockStatusLabel(status)}</span>
              <button
                onClick={() => toggleStockStatus(status)}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {filterCriteria.equipmentConditions.map(cond => (
            <span
              key={cond}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700"
            >
              <span>Tình trạng: {getConditionLabel(cond)}</span>
              <button
                onClick={() => toggleCondition(cond)}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {filterCriteria.categories.map(cat => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700"
            >
              <span>Nhóm: {cat}</span>
              <button
                onClick={() => toggleCategory(cat)}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {filterCriteria.minValue !== undefined && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700">
              <span>Giá trị &ge; {formatCurrency(filterCriteria.minValue)}</span>
              <button
                onClick={() => updateFilter('minValue', undefined)}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filterCriteria.maxValue !== undefined && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700">
              <span>Giá trị &le; {formatCurrency(filterCriteria.maxValue)}</span>
              <button
                onClick={() => updateFilter('maxValue', undefined)}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filterCriteria.supplier && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700">
              <span>NCC: {filterCriteria.supplier}</span>
              <button
                onClick={() => updateFilter('supplier', '')}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filterCriteria.needsInspection && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700">
              <span>Đến hạn kiểm định</span>
              <button
                onClick={() => updateFilter('needsInspection', false)}
                className="hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            onClick={resetFilterCriteria}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 ml-1"
          >
            Xóa tất cả
          </button>
        </div>
      )}
    </div>
  );
};

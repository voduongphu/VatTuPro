import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { StockFilterParams, Warehouse } from '../../types/inventory';
import { StorageService } from '../../services/storage';
import { exportToExcel } from '../../services/excelService';
import { PaginationBar } from '../common/PaginationBar';
import { 
  BarChart3, 
  Download, 
  Search, 
  Filter, 
  RotateCcw
} from 'lucide-react';

export const InventoryReport: React.FC = () => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  // Filter States
  const [warehouseId, setWarehouseId] = useState('all');
  const [packingListNo, setPackingListNo] = useState('');
  const [shipment, setShipment] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [packageNo, setPackageNo] = useState('');
  const [packageName, setPackageName] = useState('');
  const [category, setCategory] = useState('');
  const [drawingNo, setDrawingNo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Deferred text inputs so typing remains 60fps even with 100,000+ stock records
  const defPackingListNo = useDeferredValue(packingListNo);
  const defShipment = useDeferredValue(shipment);
  const defManufacturer = useDeferredValue(manufacturer);
  const defSupplier = useDeferredValue(supplier);
  const defPackageNo = useDeferredValue(packageNo);
  const defPackageName = useDeferredValue(packageName);
  const defCategory = useDeferredValue(category);
  const defDrawingNo = useDeferredValue(drawingNo);
  const defSearchQuery = useDeferredValue(searchQuery);

  const [syncTick, setSyncTick] = useState(0);

  useEffect(() => {
    setWarehouses(StorageService.getWarehouses());
    return StorageService.subscribe(() => {
      setWarehouses(StorageService.getWarehouses());
      setSyncTick((t) => t + 1);
    });
  }, []);

  const records = useMemo(() => {
    const filter: StockFilterParams = {
      warehouseId: warehouseId === 'all' ? undefined : warehouseId,
      packingListNo: defPackingListNo || undefined,
      shipment: defShipment || undefined,
      manufacturer: defManufacturer || undefined,
      supplier: defSupplier || undefined,
      packageNo: defPackageNo || undefined,
      packageName: defPackageName || undefined,
      category: defCategory || undefined,
      drawingNo: defDrawingNo || undefined,
      searchQuery: defSearchQuery || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined
    };
    return StorageService.calculateInventoryRecords(filter);
  }, [
    syncTick,
    warehouseId,
    defPackingListNo,
    defShipment,
    defManufacturer,
    defSupplier,
    defPackageNo,
    defPackageName,
    defCategory,
    defDrawingNo,
    defSearchQuery,
    startDate,
    endDate
  ]);

  // Lấy danh sách gợi ý đã được cache O(1) từ StorageService (giới hạn 150 mục/loại)
  const {
    availablePLs,
    availableShipments,
    availableMakers,
    availableSuppliers,
    availableCategories
  } = useMemo(() => StorageService.getInventoryFilterOptions(), [records]);

  useEffect(() => {
    setCurrentPage(1);
  }, [records]);

  const handleResetFilter = () => {
    setWarehouseId('all');
    setPackingListNo('');
    setShipment('');
    setManufacturer('');
    setSupplier('');
    setPackageNo('');
    setPackageName('');
    setCategory('');
    setDrawingNo('');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  const handleExportExcel = () => {
    const dataToExport = records.map((r, index) => ({
      'STT': index + 1,
      'Packing List': r.packingListNo,
      'Shipment': r.shipment,
      'Kiện Hàng (Số kiện)': r.packageNo,
      'Tên Kiện Hàng': r.packageName,
      'Mã Vật Tư': r.materialCode,
      'Vật Tư Thiết Bị': r.materialName,
      'ĐVT': r.unit,
      'Tổng Nhập (SL)': r.inboundQuantity,
      'Tổng Nhập (kg)': r.inboundWeightKg,
      'Tổng Xuất (SL)': r.outboundQuantity,
      'Tổng Xuất (kg)': r.outboundWeightKg,
      'Tồn SL': r.currentQuantity,
      'Tồn KL (kg)': r.currentWeightKg,
      'Kho Bãi': r.warehouseName,
      'Hạng Mục': r.category,
      'Bản Vẽ Kỹ Thuật': r.drawingNo,
      'Nhà Sản Xuất': r.manufacturer,
      'Nhà Cung Cấp': r.supplier,
      'Ngày Cập Nhật': r.lastUpdated
    }));

    exportToExcel(
      dataToExport, 
      `BaoCao_NhapXuatTon_${new Date().toISOString().slice(0, 10)}`, 
      'NXT_VatTu_ThietBi'
    );
  };

  // Tính tổng 1 lượt duy nhất O(N) cho toàn bộ bản ghi lọc được
  const {
    totalInboundQty,
    totalInboundWeight,
    totalOutboundQty,
    totalOutboundWeight,
    totalStockQty,
    totalStockWeight
  } = useMemo(() => {
    let inQty = 0;
    let inW = 0;
    let outQty = 0;
    let outW = 0;
    let stkQty = 0;
    let stkW = 0;
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      inQty += r.inboundQuantity;
      inW += r.inboundWeightKg;
      outQty += r.outboundQuantity;
      outW += r.outboundWeightKg;
      stkQty += r.currentQuantity;
      stkW += r.currentWeightKg;
    }
    return {
      totalInboundQty: inQty,
      totalInboundWeight: Math.round(inW * 100) / 100,
      totalOutboundQty: outQty,
      totalOutboundWeight: Math.round(outW * 100) / 100,
      totalStockQty: stkQty,
      totalStockWeight: Math.round(stkW * 100) / 100
    };
  }, [records]);

  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIdx = (safePage - 1) * pageSize;

  const pagedRecords = useMemo(() => {
    return records.slice(pageStartIdx, pageStartIdx + pageSize);
  }, [records, pageStartIdx, pageSize]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3.5 sm:gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl shrink-0">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Báo Cáo Nhập - Xuất - Tồn Vật Tư Thiết Bị</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              Tra cứu đa điều kiện: Packing List, Shipment, Bản vẽ, Hạng mục, Kiện hàng, NSX, NCC, Khối lượng & Số lượng
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={handleExportExcel}
            className="w-full md:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-700/20 transition active:scale-95 min-h-[42px]"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Xuất Báo Cáo Ra Excel</span>
          </button>
        </div>
      </div>

      {/* Bộ Lọc Đa Điều Kiện (Multi-criteria Filter Panel) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Bộ Lọc Điều Kiện Chuyên Sâu</span>
          </div>
          <button
            onClick={handleResetFilter}
            className="text-xs font-medium text-slate-500 hover:text-blue-700 flex items-center gap-1 transition py-1 px-2 rounded-lg hover:bg-slate-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm tổng hợp (mã vật tư, tên kiện, hạng mục, bản vẽ, packing list, shipment...)"
            className="w-full pl-9 pr-4 py-2.5 sm:py-2 bg-slate-50 border border-slate-200 rounded-xl text-base sm:text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none min-h-[42px] sm:min-h-0"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 sm:top-2.5" />
        </div>

        {/* Grid các điều kiện cụ thể */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {/* Kho bãi */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Kho bãi</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full px-2.5 py-2 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none min-h-[38px] sm:min-h-0"
            >
              <option value="all">Tất cả kho ({warehouses.length})</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Packing List */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Số Packing List</label>
            <input
              type="text"
              value={packingListNo}
              onChange={(e) => setPackingListNo(e.target.value)}
              placeholder="VD: PL-2026..."
              list="pl-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono outline-none"
            />
            <datalist id="pl-list">
              {availablePLs.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Shipment */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Shipment / Vận đơn</label>
            <input
              type="text"
              value={shipment}
              onChange={(e) => setShipment(e.target.value)}
              placeholder="VD: SHP-PACIFIC..."
              list="shipment-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono outline-none"
            />
            <datalist id="shipment-list">
              {availableShipments.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          {/* Hạng mục */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Hạng mục dự án</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Đường ống, Kết cấu..."
              list="cat-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
            <datalist id="cat-list">
              {availableCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Bản vẽ */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Bản vẽ (DWG No)</label>
            <input
              type="text"
              value={drawingNo}
              onChange={(e) => setDrawingNo(e.target.value)}
              placeholder="DWG-PID..."
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono outline-none"
            />
          </div>

          {/* Số kiện */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Số kiện (Pkg No)</label>
            <input
              type="text"
              value={packageNo}
              onChange={(e) => setPackageNo(e.target.value)}
              placeholder="PKG-01..."
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
          </div>

          {/* Nhà sản xuất */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Nhà sản xuất</label>
            <input
              type="text"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="Siemens, Kitz..."
              list="maker-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
            <datalist id="maker-list">
              {availableMakers.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>

          {/* Nhà cung cấp */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Nhà cung cấp</label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Hòa Phát, Petro..."
              list="sup-list"
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
            <datalist id="sup-list">
              {availableSuppliers.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          {/* Tên kiện */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Tên kiện hàng</label>
            <input
              type="text"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              placeholder="Kiện cụm van..."
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none"
            />
          </div>

          {/* Từ ngày */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Từ ngày</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-[11px]"
            />
          </div>

          {/* Đến ngày */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Đến ngày</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-[11px]"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 block uppercase">Tổng Nhập (SL)</span>
          <span className="text-base sm:text-lg font-bold text-blue-700 font-mono tabular-nums mt-1 block truncate">
            {totalInboundQty.toLocaleString('vi-VN')}
          </span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 block uppercase">Tổng Nhập (kg)</span>
          <span className="text-base sm:text-lg font-bold text-blue-700 font-mono tabular-nums mt-1 block truncate">
            {totalInboundWeight.toLocaleString('vi-VN')}
          </span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 block uppercase">Tổng Xuất (SL)</span>
          <span className="text-base sm:text-lg font-bold text-rose-700 font-mono tabular-nums mt-1 block truncate">
            {totalOutboundQty.toLocaleString('vi-VN')}
          </span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 block uppercase">Tổng Xuất (kg)</span>
          <span className="text-base sm:text-lg font-bold text-rose-700 font-mono tabular-nums mt-1 block truncate">
            {totalOutboundWeight.toLocaleString('vi-VN')}
          </span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-emerald-200/80 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white">
          <span className="text-[11px] font-semibold text-emerald-800 block uppercase">TỒN KHO (SL)</span>
          <span className="text-lg sm:text-xl font-extrabold text-emerald-700 font-mono tabular-nums mt-1 block truncate">
            {totalStockQty.toLocaleString('vi-VN')}
          </span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-emerald-200/80 shadow-sm bg-gradient-to-br from-emerald-50/50 to-white">
          <span className="text-[11px] font-semibold text-emerald-800 block uppercase">TỒN KHO (kg)</span>
          <span className="text-lg sm:text-xl font-extrabold text-emerald-700 font-mono tabular-nums mt-1 block truncate">
            {totalStockWeight.toLocaleString('vi-VN')}
          </span>
        </div>
      </div>

      {/* Main Stock Report Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="font-bold text-slate-900 text-sm">
            Bảng Chi Tiết Tồn Kho Theo Điều Kiện ({records.length.toLocaleString('vi-VN')} bản ghi)
          </div>
          <span className="text-xs text-slate-500">
            Cập nhật thời gian thực theo từng phiếu nhập và xuất
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[1050px]">
            <thead className="bg-slate-50/90 text-slate-700 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3 w-10 text-center">STT</th>
                <th className="p-3 w-32">PACKING LIST</th>
                <th className="p-3 w-28">SHIPMENT</th>
                <th className="p-3 w-32">KIỆN HÀNG</th>
                <th className="p-3 w-32">MÃ VẬT TƯ</th>
                <th className="p-3 w-56">VẬT TƯ THIẾT BỊ</th>
                <th className="p-3 w-16 text-center">ĐVT</th>
                <th className="p-3 text-right bg-blue-50/50 text-blue-900">TỔNG NHẬP</th>
                <th className="p-3 text-right bg-rose-50/50 text-rose-900">TỔNG XUẤT</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-950 font-bold">TỒN SL</th>
                <th className="p-3 text-right bg-emerald-50 text-emerald-950 font-bold">TỒN KL (KG)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-12 text-center text-slate-400 text-sm">
                    Không có bản ghi tồn kho nào khớp với các điều kiện lọc đã chọn.
                  </td>
                </tr>
              ) : (
                pagedRecords.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 text-center text-slate-400">{(pageStartIdx + idx + 1).toLocaleString('vi-VN')}</td>
                    <td className="p-3 font-mono font-bold text-blue-700">{r.packingListNo}</td>
                    <td className="p-3 font-mono text-slate-700">{r.shipment}</td>
                    <td className="p-3">
                      <span className="font-bold text-slate-900 block">{r.packageNo}</span>
                      <span className="text-[11px] text-slate-500 line-clamp-1">{r.packageName}</span>
                    </td>
                    <td className="p-3 font-mono font-semibold text-slate-800">
                      {r.materialCode && r.materialCode !== 'N/A' ? (
                        <span>{r.materialCode}</span>
                      ) : (
                        <span className="text-slate-400 font-normal">N/A</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-semibold text-slate-900 block text-xs">{r.materialName}</span>
                    </td>
                    <td className="p-3 text-center font-medium text-slate-600">{r.unit}</td>
                    
                    {/* Nhập */}
                    <td className="p-3 text-right bg-blue-50/30 font-mono">
                      <div className="font-semibold text-blue-700">{r.inboundQuantity.toLocaleString('vi-VN')}</div>
                      <div className="text-[10px] text-slate-500">{r.inboundWeightKg.toLocaleString('vi-VN')} kg</div>
                    </td>

                    {/* Xuất */}
                    <td className="p-3 text-right bg-rose-50/30 font-mono">
                      <div className="font-semibold text-rose-700">{r.outboundQuantity.toLocaleString('vi-VN')}</div>
                      <div className="text-[10px] text-slate-500">{r.outboundWeightKg.toLocaleString('vi-VN')} kg</div>
                    </td>

                    {/* Tồn số lượng */}
                    <td className="p-3 text-right bg-emerald-50/50 font-mono font-bold text-emerald-800 text-sm">
                      {r.currentQuantity.toLocaleString('vi-VN')}
                    </td>

                    {/* Tồn khối lượng */}
                    <td className="p-3 text-right bg-emerald-50/50 font-mono font-bold text-emerald-800 text-sm">
                      {r.currentWeightKg.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100/90 font-bold border-t-2 border-slate-300">
              <tr>
                <td colSpan={7} className="p-3 text-right uppercase text-slate-700 text-xs">
                  Tổng Cộng Báo Cáo:
                </td>
                <td className="p-3 text-right font-mono text-blue-700">
                  <div>{totalInboundQty.toLocaleString('vi-VN')}</div>
                  <div className="text-[10px]">{totalInboundWeight.toLocaleString('vi-VN')} kg</div>
                </td>
                <td className="p-3 text-right font-mono text-rose-700">
                  <div>{totalOutboundQty.toLocaleString('vi-VN')}</div>
                  <div className="text-[10px]">{totalOutboundWeight.toLocaleString('vi-VN')} kg</div>
                </td>
                <td className="p-3 text-right font-mono text-emerald-800 text-sm">
                  {totalStockQty.toLocaleString('vi-VN')}
                </td>
                <td className="p-3 text-right font-mono text-emerald-800 text-sm">
                  {totalStockWeight.toLocaleString('vi-VN')} kg
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <PaginationBar
          currentPage={safePage}
          totalItems={records.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[50, 100, 200]}
          itemLabel="bản ghi tồn kho"
        />
      </div>
    </div>
  );
};

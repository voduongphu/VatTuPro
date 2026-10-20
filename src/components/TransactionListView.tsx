import React, { useState } from 'react';
import {
  PackagePlus,
  PackageMinus,
  Search,
  Filter,
  Download,
  Eye,
  Printer,
  Calendar,
  Warehouse as WarehouseIcon,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Trash2,
  Edit2,
  ShieldAlert,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { Transaction, TransactionType } from '../types/inventory';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import * as XLSX from 'xlsx';
import {
  exportToCSV,
  formatCurrency,
  formatDateTime,
  formatNumber,
  getSubtypeLabel,
  getTransactionTypeLabel,
} from '../utils/formatters';

interface TransactionListViewProps {
  initialType?: TransactionType;
  onOpenCreateTransaction: (type: TransactionType) => void;
  onPrintTransaction: (transaction: Transaction) => void;
  onOpenImportExcel: () => void;
  onEditTransaction: (transaction: Transaction) => void;
}

export const TransactionListView: React.FC<TransactionListViewProps> = ({
  initialType,
  onOpenCreateTransaction,
  onPrintTransaction,
  onOpenImportExcel,
  onEditTransaction,
}) => {
  const { transactions, warehouses, currentUser, deleteTransaction } = useInventory();
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>(initialType || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('ALL');

  const isAdmin = currentUser?.role === 'ADMIN';
  const canManage = currentUser?.role === 'ADMIN' || currentUser?.role === 'THU_KHO';

  const filteredTransactions = transactions.filter(trx => {
    if (typeFilter !== 'ALL' && trx.type !== typeFilter) return false;
    if (selectedWarehouse !== 'ALL' && trx.warehouseId !== selectedWarehouse) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchCode = trx.code.toLowerCase().includes(q);
      const matchPartner = trx.partnerName.toLowerCase().includes(q);
      const matchProject = trx.departmentOrProject.toLowerCase().includes(q);
      const matchNotes = trx.notes.toLowerCase().includes(q);
      const matchItems = trx.items.some(
        i => i.itemCode.toLowerCase().includes(q) || i.itemName.toLowerCase().includes(q)
      );
      if (!matchCode && !matchPartner && !matchProject && !matchNotes && !matchItems) {
        return false;
      }
    }

    return true;
  });

  // 1. Export Summary of vouchers with "Số Lượng Vật Tư" column
  const handleExportSummaryExcel = () => {
    const excelData = filteredTransactions.map((t, idx) => {
      const wh = warehouses.find(w => w.id === t.warehouseId);
      const totalQuantity = t.items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
      return {
        STT: idx + 1,
        'Số Phiếu': t.code,
        'Loại Nghiệp Vụ': getTransactionTypeLabel(t.type),
        'Phân Loại': getSubtypeLabel(t.subtype),
        'Ngày Lập Phiếu': formatDateTime(t.date),
        'Kho Hàng': wh?.name || t.warehouseId,
        'Đối Tác / Nhà Cung Cấp / Đơn Vị Nhận': t.partnerName,
        'Dự Án / Phòng Ban': t.departmentOrProject,
        'Người Lập Phiếu': t.creatorName,
        'Số Mặt Hàng': t.items.length,
        'Số Lượng Vật Tư': totalQuantity, // Crucial column
        'Tổng Giá Trị (VNĐ)': t.totalAmount,
        'Ghi Chú': t.notes || '',
        'Trạng Thái': t.status === 'HOAN_THANH' ? 'Hoàn thành' : 'Chờ duyệt',
      };
    });

    const totalLinesCount = filteredTransactions.reduce((acc, t) => acc + t.items.length, 0);
    const grandTotalQuantity = filteredTransactions.reduce(
      (acc, t) => acc + t.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0),
      0
    );
    const grandTotalAmount = filteredTransactions.reduce((acc, t) => acc + (Number(t.totalAmount) || 0), 0);

    excelData.push({
      STT: 'TỔNG CỘNG' as any,
      'Số Phiếu': `${filteredTransactions.length} phiếu`,
      'Loại Nghiệp Vụ': '',
      'Phân Loại': '',
      'Ngày Lập Phiếu': '',
      'Kho Hàng': '',
      'Đối Tác / Nhà Cung Cấp / Đơn Vị Nhận': '',
      'Dự Án / Phòng Ban': '',
      'Người Lập Phiếu': '',
      'Số Mặt Hàng': totalLinesCount,
      'Số Lượng Vật Tư': grandTotalQuantity,
      'Tổng Giá Trị (VNĐ)': grandTotalAmount,
      'Ghi Chú': '',
      'Trạng Thái': '',
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    const sheetPrefix =
      initialType === 'NHAP_KHO'
        ? 'Tong_Hop_Phieu_Nhap_Kho'
        : initialType === 'XUAT_KHO'
        ? 'Tong_Hop_Phieu_Xuat_Kho'
        : 'Tong_Hop_So_Luu_Chuyen_Kho';
    XLSX.utils.book_append_sheet(wb, ws, sheetPrefix);
    XLSX.writeFile(wb, `${sheetPrefix}_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  // 2. Export detailed items table for all vouchers with "Số Lượng Vật Tư" column
  const handleExportDetailExcel = () => {
    const detailData: any[] = [];
    let rowIdx = 1;

    filteredTransactions.forEach(t => {
      const wh = warehouses.find(w => w.id === t.warehouseId);
      t.items.forEach(line => {
        detailData.push({
          STT: rowIdx++,
          'Số Phiếu': t.code,
          'Loại Phiếu': getTransactionTypeLabel(t.type),
          'Hình Thức': getSubtypeLabel(t.subtype),
          'Ngày Lập': formatDateTime(t.date),
          'Kho Hàng': wh?.name || t.warehouseId,
          'Đối Tác / Đơn Vị Nhận': t.partnerName,
          'Dự Án': t.departmentOrProject,
          'Mã Vật Tư': line.itemCode,
          'Tên Vật Tư Thiết Bị': line.itemName,
          'ĐVT': line.unit,
          'Số Lượng Vật Tư': line.quantity, // Crucial column
          'Đơn Giá (VNĐ)': line.unitPrice,
          'Thành Tiền (VNĐ)': line.amount || line.quantity * line.unitPrice,
          'Số Lô / Serial': line.serialNumber || '-',
          'Ghi Chú': line.note || t.notes || '',
        });
      });
    });

    const totalQty = detailData.reduce((acc, row) => acc + (Number(row['Số Lượng Vật Tư']) || 0), 0);
    const totalAmt = detailData.reduce((acc, row) => acc + (Number(row['Thành Tiền (VNĐ)']) || 0), 0);

    detailData.push({
      STT: 'TỔNG CỘNG' as any,
      'Số Phiếu': '',
      'Loại Phiếu': '',
      'Hình Thức': '',
      'Ngày Lập': '',
      'Kho Hàng': '',
      'Đối Tác / Đơn Vị Nhận': '',
      'Dự Án': '',
      'Mã Vật Tư': '',
      'Tên Vật Tư Thiết Bị': `Tổng ${detailData.length} dòng vật tư`,
      'ĐVT': '',
      'Số Lượng Vật Tư': totalQty,
      'Đơn Giá (VNĐ)': '',
      'Thành Tiền (VNĐ)': totalAmt,
      'Số Lô / Serial': '',
      'Ghi Chú': '',
    });

    const ws = XLSX.utils.json_to_sheet(detailData);
    const wb = XLSX.utils.book_new();
    const sheetPrefix =
      initialType === 'NHAP_KHO'
        ? 'Chi_Tiet_Vat_Tu_Nhap_Kho'
        : initialType === 'XUAT_KHO'
        ? 'Chi_Tiet_Vat_Tu_Xuat_Kho'
        : 'Chi_Tiet_Vat_Tu_Chung_Tu';
    XLSX.utils.book_append_sheet(wb, ws, sheetPrefix);
    XLSX.writeFile(wb, `${sheetPrefix}_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  // 3. Export single voucher to Excel with "Số Lượng Vật Tư" column
  const handleExportSingleTrx = (trx: Transaction) => {
    const wh = warehouses.find(w => w.id === trx.warehouseId);
    const isReceipt = trx.type === 'NHAP_KHO';
    const title = isReceipt ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO';

    const sheetData: any[] = [
      { A: 'CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC', B: '', C: '', D: '', E: '', F: '', G: `Số phiếu: ${trx.code}` },
      { A: `BỘ PHẬN: ${trx.departmentOrProject || 'DỰ ÁN'}`, B: '', C: '', D: '', E: '', F: '', G: `Ngày lập: ${trx.date}` },
      { A: title, B: '', C: '', D: '', E: '', F: '', G: '' },
      {},
      { A: isReceipt ? `Đơn vị giao hàng / NCC: ${trx.partnerName}` : `Người nhận / Đơn vị nhận: ${trx.partnerName}`, B: '', C: '', D: '', E: `Kho lưu trữ: ${wh?.name || trx.warehouseId}`, F: '', G: '' },
      { A: `Dự án / Phòng ban: ${trx.departmentOrProject}`, B: '', C: '', D: '', E: `Hình thức: ${getSubtypeLabel(trx.subtype)}`, F: '', G: '' },
      { A: `Ghi chú: ${trx.notes || 'Không'}`, B: '', C: '', D: '', E: '', F: '', G: '' },
      {},
      {
        A: 'STT',
        B: 'Mã Vật Tư',
        C: 'Tên Vật Tư Thiết Bị',
        D: 'ĐVT',
        E: 'Số Lượng Vật Tư', // Crucial column
        F: 'Đơn Giá (VNĐ)',
        G: 'Thành Tiền (VNĐ)',
        H: 'Số Lô / Serial',
        I: 'Ghi Chú',
      },
    ];

    trx.items.forEach((it, idx) => {
      sheetData.push({
        A: idx + 1,
        B: it.itemCode,
        C: it.itemName,
        D: it.unit,
        E: it.quantity,
        F: it.unitPrice,
        G: it.amount || it.quantity * it.unitPrice,
        H: it.serialNumber || '-',
        I: it.note || '',
      });
    });

    const sumQty = trx.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    sheetData.push({
      A: 'CỘNG',
      B: '',
      C: `Tổng cộng ${trx.items.length} mặt hàng`,
      D: '',
      E: sumQty,
      F: '',
      G: trx.totalAmount,
      H: '',
      I: '',
    });

    const ws = XLSX.utils.json_to_sheet(sheetData, { skipHeader: true });
    const wb = XLSX.utils.book_new();
    const sheetName = isReceipt ? 'Phieu_Nhap' : 'Phieu_Xuat';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sheetName}_${trx.code.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`);
  };

  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  const handleDelete = (trx: Transaction) => {
    if (!isAdmin) {
      return;
    }
    setTransactionToDelete(trx);
  };

  const handleConfirmDelete = () => {
    if (!transactionToDelete) return;
    deleteTransaction(transactionToDelete.id);
    setTransactionToDelete(null);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {initialType === 'NHAP_KHO'
              ? 'Sổ Quản Lý Phiếu Nhập Kho (Goods Inward)'
              : initialType === 'XUAT_KHO'
              ? 'Sổ Quản Lý Phiếu Xuất Kho (Goods Outward)'
              : 'Quản Lý Sổ Chứng Từ Nhập - Xuất Kho'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Lưu vết toàn bộ quá trình giao nhận vật tư, thiết bị với các đối tác và dự án
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Import Excel */}
          {canManage && (
            <button
              onClick={onOpenImportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Import Excel</span>
            </button>
          )}

          {/* Export Excel Summary */}
          <button
            onClick={handleExportSummaryExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shadow-xs cursor-pointer"
            title="Xuất file Excel tổng hợp các phiếu kèm cột số lượng vật tư"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Xuất Excel (Tổng hợp)</span>
          </button>

          {/* Export Excel Details */}
          <button
            onClick={handleExportDetailExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors whitespace-nowrap shadow-xs cursor-pointer"
            title="Xuất file Excel chi tiết từng dòng vật tư trong phiếu kèm cột số lượng"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Xuất Excel (Chi tiết vật tư)</span>
          </button>

          {/* Create Goods In */}
          {canManage && (!initialType || initialType === 'NHAP_KHO') && (
            <button
              onClick={() => onOpenCreateTransaction('NHAP_KHO')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span>Lập Phiếu Nhập</span>
            </button>
          )}

          {/* Create Goods Out */}
          {canManage && (!initialType || initialType === 'XUAT_KHO') && (
            <button
              onClick={() => onOpenCreateTransaction('XUAT_KHO')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <PackageMinus className="w-3.5 h-3.5" />
              <span>Lập Phiếu Xuất</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex items-center gap-2">
          {!initialType && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  typeFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả ({transactions.length})
              </button>
              <button
                onClick={() => setTypeFilter('NHAP_KHO')}
                className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                  typeFilter === 'NHAP_KHO'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PackagePlus className="w-3 h-3 text-emerald-600" />
                <span>Nhập kho</span>
              </button>
              <button
                onClick={() => setTypeFilter('XUAT_KHO')}
                className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1 ${
                  typeFilter === 'XUAT_KHO'
                    ? 'bg-white text-amber-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PackageMinus className="w-3 h-3 text-amber-600" />
                <span>Xuất kho</span>
              </button>
            </div>
          )}

          <select
            value={selectedWarehouse}
            onChange={e => setSelectedWarehouse(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 font-medium outline-none"
          >
            <option value="ALL">Tất cả kho</option>
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="relative min-w-[280px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Tìm theo số phiếu, đối tác, dự án..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Không tìm thấy phiếu giao dịch nào phù hợp.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Số chứng từ</th>
                  <th className="py-3 px-3">Loại phiếu</th>
                  <th className="py-3 px-3">Thời gian</th>
                  <th className="py-3 px-3">Kho lưu</th>
                  <th className="py-3 px-4 min-w-[180px]">Đối tác / Bên nhận</th>
                  <th className="py-3 px-4 min-w-[160px]">Dự án / Mục đích</th>
                  <th className="py-3 px-3 text-center">Số khoản</th>
                  <th className="py-3 px-3 text-right">Số lượng vật tư</th>
                  <th className="py-3 px-4 text-right">Tổng thành tiền</th>
                  <th className="py-3 px-3 text-center">Trạng thái</th>
                  <th className="py-3 px-4 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map(trx => {
                  const wh = warehouses.find(w => w.id === trx.warehouseId);
                  const isReceipt = trx.type === 'NHAP_KHO';
                  const totalVoucherQty = trx.items.reduce(
                    (acc, it) => acc + (Number(it.quantity) || 0),
                    0
                  );

                  return (
                    <tr key={trx.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Code */}
                      <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            isReceipt ? 'text-emerald-700' : 'text-amber-800'
                          }
                        >
                          {trx.code}
                        </span>
                      </td>

                      {/* Subtype */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
                            isReceipt
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {getSubtypeLabel(trx.subtype)}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-slate-600 tabular-nums">
                        {formatDateTime(trx.date)}
                      </td>

                      {/* Warehouse */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-slate-700 max-w-[140px] truncate" title={wh?.name}>
                        {wh?.name}
                      </td>

                      {/* Partner */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 line-clamp-1" title={trx.partnerName}>
                          {trx.partnerName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Người lập: {trx.creatorName}
                        </div>
                      </td>

                      {/* Project / Purpose */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="line-clamp-1 font-medium text-slate-800" title={trx.departmentOrProject}>
                          {trx.departmentOrProject}
                        </div>
                        {trx.notes && (
                          <div className="text-[11px] text-slate-400 line-clamp-1" title={trx.notes}>
                            {trx.notes}
                          </div>
                        )}
                      </td>

                      {/* Items count */}
                      <td className="py-3.5 px-3 text-center tabular-nums text-slate-700 font-semibold whitespace-nowrap">
                        {trx.items.length} mặt hàng
                      </td>

                      {/* Total Quantity Column */}
                      <td className="py-3.5 px-3 text-right tabular-nums font-bold text-indigo-700 whitespace-nowrap bg-indigo-50/20">
                        {formatNumber(totalVoucherQty)}
                      </td>

                      {/* Total Amount */}
                      <td className="py-3.5 px-4 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(trx.totalAmount)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Đã lưu sổ</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {/* Export voucher Excel button */}
                          <button
                            onClick={() => handleExportSingleTrx(trx)}
                            className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                            title="Xuất phiếu này ra file Excel (.xlsx) kèm cột số lượng vật tư"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          </button>

                          <button
                            onClick={() => onPrintTransaction(trx)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Xem / In mẫu phiếu"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {canManage && (
                            <button
                              onClick={() => onEditTransaction(trx)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Sửa thông tin phiếu"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(trx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Xóa phiếu (Quản trị viên)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* In-app Delete Confirmation Modal */}
      {transactionToDelete && (
        <ConfirmDeleteModal
          isOpen={Boolean(transactionToDelete)}
          title={`Xác nhận xóa phiếu ${transactionToDelete.code}`}
          message="Bạn có chắc chắn muốn xóa vĩnh viễn phiếu này khỏi sổ chứng từ?"
          itemDetails={[
            {
              label: 'Loại nghiệp vụ',
              value: `${getTransactionTypeLabel(transactionToDelete.type)} - ${getSubtypeLabel(transactionToDelete.subtype)}`,
            },
            {
              label: transactionToDelete.type === 'NHAP_KHO' ? 'Nhà cung cấp' : 'Bên nhận',
              value: transactionToDelete.partnerName,
            },
            {
              label: 'Dự án / Phòng ban',
              value: transactionToDelete.departmentOrProject,
            },
            {
              label: 'Tổng giá trị chứng từ',
              value: formatCurrency(transactionToDelete.totalAmount),
            },
            {
              label: 'Số lượng mặt hàng',
              value: `${transactionToDelete.items.length} danh mục`,
            },
          ]}
          warningNote={`Cơ chế hoàn tồn tự động: Hệ thống sẽ tự động ${
            transactionToDelete.type === 'NHAP_KHO'
              ? 'trừ bớt số lượng đã nhập vào kho'
              : 'hoàn trả lại số lượng đã xuất về kho'
          } cho các mặt hàng tương ứng.`}
          confirmLabel="Xác nhận xóa phiếu"
          onConfirm={handleConfirmDelete}
          onClose={() => setTransactionToDelete(null)}
        />
      )}
    </div>
  );
};

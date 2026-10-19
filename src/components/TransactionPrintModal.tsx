import React, { useState, useMemo } from 'react';
import { X, Printer, Edit3, Check, RotateCcw } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { Transaction } from '../types/inventory';
import { numberToWordsVietnamese } from '../utils/numberToWords';
import { PtsLogo } from './PtsLogo';

interface TransactionPrintModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

interface EditableLineItem {
  id: string;
  itemCode: string;
  itemName: string;
  spec?: string;
  lotNumber: string;
  quantity: number;
  unit: string;
  weightKg: number;
  unitPrice: number;
  amount: number;
  note: string;
}

// Formal Vietnamese date formatter: Ngày 07 tháng 03 năm 2025
function formatVietnameseDocDate(dateStr?: string): string {
  if (!dateStr) {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `Ngày ${d} tháng ${m} năm ${y}`;
  }

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return `Ngày ... tháng ... năm ....`;
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `Ngày ${d} tháng ${m} năm ${y}`;
  } catch {
    return `Ngày ... tháng ... năm ....`;
  }
}

// Number formatter for weights: 2,202.00 or 15,414.00
function formatWeight(num: number): string {
  if (!num && num !== 0) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// Number formatter with comma separators for currency/quantities
function formatStandardNumber(num: number): string {
  if (!num && num !== 0) return '-';
  return new Intl.NumberFormat('en-US').format(num);
}

export const TransactionPrintModal: React.FC<TransactionPrintModalProps> = ({
  transaction,
  onClose,
}) => {
  const { warehouses, items: inventoryItems } = useInventory();

  if (!transaction) return null;

  const isReceipt = transaction.type === 'NHAP_KHO';
  const wh = warehouses.find(w => w.id === transaction.warehouseId);

  // Form Metadata State (Pre-filled from transaction, customizable)
  const [formCode, setFormCode] = useState(isReceipt ? 'QN-OPR-PR11-FM05.01' : 'QN-OPR-PR11-FM06');
  const [nhlDate, setNhlDate] = useState('02/08/2024');
  const [ticketNo, setTicketNo] = useState(transaction.code);
  const [docDateText, setDocDateText] = useState(() => formatVietnameseDocDate(transaction.date));
  const [companyName, setCompanyName] = useState('CÔNG TY CỔ PHẦN DỊCH VỤ DẦU KHÍ QUẢNG NGÃI PTSC');
  const [departmentName, setDepartmentName] = useState(
    transaction.departmentOrProject || 'DỰ ÁN LTIA-4.9'
  );

  // Receipt specific fields
  const [deliveryUnit, setDeliveryUnit] = useState(transaction.partnerName || 'Việt Xuân Mới');
  const [contractNo, setContractNo] = useState('');
  const [proposalNo, setProposalNo] = useState('');
  const [receiptContent, setReceiptContent] = useState(
    transaction.notes || `Phục vụ thi công hạng mục PIPING`
  );
  const [receiptType, setReceiptType] = useState<'nhap_moi' | 'nhap_tra_kho'>(
    transaction.subtype === 'NHAP_TRA_SAU_MUON' || transaction.subtype === 'NHAP_THU_HOI_DU_AN'
      ? 'nhap_tra_kho'
      : 'nhap_moi'
  );

  // Issue specific fields
  const [receiverName, setReceiverName] = useState(transaction.partnerName || 'Nguyễn Văn Long');
  const [receiverTeam, setReceiverTeam] = useState(
    transaction.departmentOrProject || 'Tổ thi công'
  );
  const [pycNo, setPycNo] = useState(
    transaction.code.replace('PXK', 'PYC').replace('PX-', 'PYC-') || 'PYC25-0001'
  );
  const [issueReason, setIssueReason] = useState(
    transaction.notes || 'Phục vụ công tác thi công UG piping'
  );
  const [issueType, setIssueType] = useState<'xuat_kho' | 'xuat_dieu_chuyen'>(
    transaction.subtype === 'XUAT_CHUYEN_KHO' ? 'xuat_dieu_chuyen' : 'xuat_kho'
  );

  // Signatures
  const [signPerson1, setSignPerson1] = useState(
    isReceipt ? transaction.partnerName : transaction.partnerName || 'Nguyễn Văn Long'
  );
  const [signPerson2, setSignPerson2] = useState(
    wh?.manager.split('-')[0].trim() || 'Thủ kho'
  );
  const [signPerson3, setSignPerson3] = useState('P.TCKT');
  const [signPerson4, setSignPerson4] = useState(
    transaction.approverName || 'Phê duyệt'
  );

  // Attached docs & note
  const [attachedDocs, setAttachedDocs] = useState('');

  // Edit mode toggle
  const [isEditing, setIsEditing] = useState(false);

  // Line items with Lot number & Weight in kg
  const [lineItems, setLineItems] = useState<EditableLineItem[]>(() => {
    return transaction.items.map((line, idx) => {
      const invItem = inventoryItems.find(i => i.id === line.itemId || i.code === line.itemCode);

      // Determine lot number: prefer line serialNumber, then item lot, then default pattern
      const lotNumber =
        line.serialNumber ||
        invItem?.serialOrLot ||
        (isReceipt ? `183A${String(100 + idx * 14).padStart(4, '0')}` : `76C-06${idx + 1}.35`);

      // Determine weight in kg:
      // In PTSC oil & gas pipe inventory, pipe weight is typically ~2,202.00 kg per pipe.
      // If unit is kg, weight is quantity. If spec contains weight number, use it.
      let unitWeight = 2202.0;
      if (line.unit.toLowerCase() === 'kg') {
        unitWeight = 1.0;
      } else if (invItem?.spec) {
        const match = invItem.spec.match(/([0-9,.]+)\s*(?:kg|kilo)/i);
        if (match) {
          const parsed = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(parsed) && parsed > 0) unitWeight = parsed;
        }
      } else if (line.unitPrice && line.unitPrice > 1000000) {
        unitWeight = 2202.0;
      } else {
        unitWeight = 50.0;
      }

      const totalWeight = unitWeight * line.quantity;

      return {
        id: `${line.itemId}-${idx}`,
        itemCode: line.itemCode,
        itemName: line.itemName,
        spec: invItem?.spec,
        lotNumber,
        quantity: line.quantity,
        unit: line.unit,
        weightKg: totalWeight,
        unitPrice: line.unitPrice,
        amount: line.amount,
        note: line.note || '',
      };
    });
  });

  // Totals calculated dynamically
  const totals = useMemo(() => {
    const totalQty = lineItems.reduce((acc, it) => acc + (it.quantity || 0), 0);
    const totalWeightKg = lineItems.reduce((acc, it) => acc + (it.weightKg || 0), 0);
    const totalAmount = lineItems.reduce((acc, it) => acc + (it.amount || 0), 0);
    const itemCount = lineItems.length;
    return { totalQty, totalWeightKg, totalAmount, itemCount };
  }, [lineItems]);

  const handlePrint = () => {
    window.print();
  };

  const handleUpdateLine = (index: number, field: keyof EditableLineItem, val: any) => {
    setLineItems(prev => {
      const next = [...prev];
      const item = { ...next[index], [field]: val };

      // auto update amount if qty or unitPrice changed
      if (field === 'quantity' || field === 'unitPrice') {
        item.amount = (item.quantity || 0) * (item.unitPrice || 0);
      }
      next[index] = item;
      return next;
    });
  };

  const handleResetToSample = () => {
    if (isReceipt) {
      setTicketNo('PNK25-0019');
      setDeliveryUnit('Việt Xuân Mới');
      setReceiptContent('Phục vụ thi công hạng mục PIPING');
      setDepartmentName('DỰ ÁN LTIA-4.9');
    } else {
      setTicketNo('PXK25-0001');
      setReceiverName('Nguyễn Văn Long');
      setReceiverTeam('Tổ thi công');
      setPycNo('PYC25-0001');
      setIssueReason('Phục vụ công tác thi công UG piping');
      setDepartmentName('DỰ ÁN LTIA-4.9');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible">
      {/* Modal Container */}
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl flex flex-col max-h-[95vh] print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full print:m-0">
        
        {/* Top Floating Toolbar (Hidden during print) */}
        <div className="p-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <span
              className={`font-mono text-xs font-bold px-2.5 py-1 rounded-md text-white ${
                isReceipt ? 'bg-indigo-600' : 'bg-emerald-600'
              }`}
            >
              {isReceipt ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'}
            </span>
            <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-200 px-2 py-0.5 rounded">
              {ticketNo}
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline">
              Mẫu chuẩn PTSC Quảng Ngãi
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border ${
                isEditing
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title="Chỉnh sửa nội dung biểu mẫu trực tiếp trên trang in"
            >
              {isEditing ? (
                <>
                  <Check className="w-3.5 h-3.5 text-amber-600" />
                  <span>Xong chỉnh sửa</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                  <span>Sửa thông tin phiếu</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleResetToSample}
              className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200"
              title="Điền dữ liệu mẫu như hình mẫu"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>In Phiếu (Ctrl + P)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas (A4 Portrait Sheet) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/50 print:bg-white print:p-0 print:overflow-visible flex justify-center">
          <div
            id="printable-document"
            className="w-full max-w-[210mm] min-h-[297mm] bg-white text-black p-8 sm:p-10 shadow-lg border border-slate-300 print:border-none print:shadow-none print:p-4 print:max-w-none print:w-full print:m-0 flex flex-col justify-between font-['Times_New_Roman',Times,serif] leading-tight"
            style={{ color: '#000000' }}
          >
            {/* DOCUMENT TOP CONTAINER */}
            <div>
              {/* TOP HEADER: Logo PTSC + Company Title + Standard Form Code */}
              <div className="flex items-start justify-between gap-2 border-b-0 pb-1">
                {/* Left: PTSC Logo */}
                <div className="w-[180px] shrink-0 pt-0.5">
                  <PtsLogo />
                </div>

                {/* Center: Company Name & Department */}
                <div className="flex-1 text-center px-1">
                  {isEditing ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        className="w-full text-center text-[12px] font-bold border border-dashed border-indigo-400 p-0.5"
                      />
                      <input
                        type="text"
                        value={departmentName}
                        onChange={e => setDepartmentName(e.target.value)}
                        className="w-full text-center text-[12px] font-bold border border-dashed border-indigo-400 p-0.5"
                      />
                    </div>
                  ) : (
                    <>
                      <h2 className="text-[12.5px] font-bold tracking-tight uppercase leading-snug">
                        {companyName}
                      </h2>
                      <h3 className="text-[13px] font-bold uppercase underline underline-offset-2 mt-0.5">
                        BỘ PHẬN: {departmentName}
                      </h3>
                    </>
                  )}
                </div>

                {/* Right: Form Number & Boxed Ticket Number */}
                <div className="w-[195px] shrink-0 text-right">
                  <div className="text-[11px] font-sans font-medium leading-tight">
                    {isEditing ? (
                      <div className="space-y-1 mb-1">
                        <input
                          type="text"
                          value={formCode}
                          onChange={e => setFormCode(e.target.value)}
                          className="w-full text-right text-[10px] border border-dashed border-indigo-400 p-0.5 font-sans"
                        />
                        <input
                          type="text"
                          value={nhlDate}
                          onChange={e => setNhlDate(e.target.value)}
                          className="w-full text-right text-[10px] border border-dashed border-indigo-400 p-0.5 font-sans"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="font-semibold text-[11px]">{formCode}</div>
                        <div className="text-[10px] text-slate-700">NHL: {nhlDate}</div>
                      </>
                    )}
                  </div>

                  {/* Bordered Ticket Box */}
                  <div className="mt-1 inline-flex border border-black text-[12px] font-bold">
                    <span className="px-2 py-0.5 border-r border-black bg-slate-50 uppercase text-[11px]">
                      SỐ PHIẾU:
                    </span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={ticketNo}
                        onChange={e => setTicketNo(e.target.value)}
                        className="w-24 px-1.5 py-0.5 text-center font-bold font-mono text-[11px] border-none outline-none"
                      />
                    ) : (
                      <span className="px-2.5 py-0.5 font-bold font-mono tracking-wide">
                        {ticketNo}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* TITLE & FORMAL VIETNAMESE DATE */}
              <div className="text-center my-4">
                <h1 className="text-[20px] sm:text-[22px] font-bold uppercase tracking-wider">
                  {isReceipt ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'}
                </h1>
                {isEditing ? (
                  <input
                    type="text"
                    value={docDateText}
                    onChange={e => setDocDateText(e.target.value)}
                    className="mt-1 text-center italic text-[13px] border border-dashed border-indigo-400 p-0.5 w-64"
                  />
                ) : (
                  <p className="text-[13px] italic mt-0.5">{docDateText}</p>
                )}
              </div>

              {/* METADATA FIELDS (UNDERLINED ROWS MATCHING EXACT SAMPLES) */}
              <div className="space-y-1 text-[13px] mb-3">
                {isReceipt ? (
                  /* Phiếu Nhập Kho Metadata */
                  <>
                    <div className="flex items-baseline">
                      <span className="font-bold whitespace-nowrap">Đơn vị giao hàng:</span>
                      <span className="mx-2 font-bold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={deliveryUnit}
                            onChange={e => setDeliveryUnit(e.target.value)}
                            className="font-bold border-b border-indigo-400 outline-none px-1"
                          />
                        ) : (
                          deliveryUnit
                        )}
                      </span>
                      <div className="flex-1 border-b border-slate-300 mb-1 min-w-[50px]"></div>
                    </div>

                    <div className="flex items-baseline">
                      <span className="font-bold whitespace-nowrap">Hợp đồng:</span>
                      <span className="mx-2 font-semibold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={contractNo}
                            onChange={e => setContractNo(e.target.value)}
                            placeholder="Nhập số HĐ..."
                            className="font-semibold border-b border-indigo-400 outline-none px-1 text-xs"
                          />
                        ) : (
                          contractNo
                        )}
                      </span>
                      <div className="flex-1 border-b border-slate-300 mb-1 min-w-[50px]"></div>
                    </div>

                    <div className="flex items-baseline">
                      <span className="font-bold whitespace-nowrap">Đề xuất số:</span>
                      <span className="mx-2 font-semibold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={proposalNo}
                            onChange={e => setProposalNo(e.target.value)}
                            placeholder="Nhập số đề xuất..."
                            className="font-semibold border-b border-indigo-400 outline-none px-1 text-xs"
                          />
                        ) : (
                          proposalNo
                        )}
                      </span>
                      <div className="flex-1 border-b border-slate-300 mb-1 min-w-[50px]"></div>
                    </div>

                    <div className="flex items-baseline">
                      <span className="font-bold whitespace-nowrap">Nội dung:</span>
                      <span className="mx-2 font-semibold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={receiptContent}
                            onChange={e => setReceiptContent(e.target.value)}
                            className="font-semibold border-b border-indigo-400 outline-none px-1"
                          />
                        ) : (
                          receiptContent
                        )}
                      </span>
                      <div className="flex-1 border-b border-slate-300 mb-1 min-w-[50px]"></div>
                    </div>

                    {/* Receipt Subtype Checkboxes */}
                    <div className="flex justify-center items-center gap-16 pt-2 pb-1 text-[13px]">
                      <button
                        type="button"
                        onClick={() => setReceiptType('nhap_moi')}
                        className="inline-flex items-center gap-2 cursor-pointer select-none"
                      >
                        <span className="w-3.5 h-3.5 border border-black flex items-center justify-center font-bold text-[10px] leading-none">
                          {receiptType === 'nhap_moi' ? '✓' : ''}
                        </span>
                        <span>Nhập mới</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setReceiptType('nhap_tra_kho')}
                        className="inline-flex items-center gap-2 cursor-pointer select-none"
                      >
                        <span className="w-3.5 h-3.5 border border-black flex items-center justify-center font-bold text-[10px] leading-none">
                          {receiptType === 'nhap_tra_kho' ? '✓' : ''}
                        </span>
                        <span>Nhập trả kho</span>
                      </button>
                    </div>
                  </>
                ) : (
                  /* Phiếu Xuất Kho Metadata */
                  <>
                    <div className="flex items-baseline">
                      <span className="font-bold whitespace-nowrap">Người nhận:</span>
                      <span className="mx-2 font-bold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={receiverName}
                            onChange={e => setReceiverName(e.target.value)}
                            className="font-bold border-b border-indigo-400 outline-none px-1"
                          />
                        ) : (
                          receiverName
                        )}
                      </span>
                      <div className="flex-1 border-b border-slate-300 mb-1 min-w-[50px]"></div>
                    </div>

                    <div className="flex items-baseline">
                      <span className="font-bold whitespace-nowrap">Đơn vị/Tổ/Nhóm:</span>
                      <span className="mx-2 font-semibold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={receiverTeam}
                            onChange={e => setReceiverTeam(e.target.value)}
                            className="font-semibold border-b border-indigo-400 outline-none px-1"
                          />
                        ) : (
                          receiverTeam
                        )}
                      </span>
                      <div className="flex-1 border-b border-slate-300 mb-1 min-w-[50px]"></div>
                    </div>

                    <div className="flex items-baseline">
                      <span className="font-bold whitespace-nowrap">Số PYC/PĐX:</span>
                      <span className="mx-2 font-semibold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={pycNo}
                            onChange={e => setPycNo(e.target.value)}
                            className="font-semibold border-b border-indigo-400 outline-none px-1"
                          />
                        ) : (
                          pycNo
                        )}
                      </span>
                      <div className="flex-1 border-b border-slate-300 mb-1 min-w-[50px]"></div>
                    </div>

                    <div className="flex items-baseline">
                      <span className="font-bold whitespace-nowrap">Lý do xuất kho:</span>
                      <span className="mx-2 font-semibold whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="text"
                            value={issueReason}
                            onChange={e => setIssueReason(e.target.value)}
                            className="font-semibold border-b border-indigo-400 outline-none px-1"
                          />
                        ) : (
                          issueReason
                        )}
                      </span>
                      <div className="flex-1 border-b border-slate-300 mb-1 min-w-[50px]"></div>
                    </div>

                    {/* Issue Subtype Checkboxes */}
                    <div className="flex justify-center items-center gap-16 pt-2 pb-1 text-[13px]">
                      <button
                        type="button"
                        onClick={() => setIssueType('xuat_kho')}
                        className="inline-flex items-center gap-2 cursor-pointer select-none"
                      >
                        <span className="w-3.5 h-3.5 border border-black flex items-center justify-center font-bold text-[10px] leading-none">
                          {issueType === 'xuat_kho' ? '✓' : ''}
                        </span>
                        <span>Phiếu xuất kho</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIssueType('xuat_dieu_chuyen')}
                        className="inline-flex items-center gap-2 cursor-pointer select-none"
                      >
                        <span className="w-3.5 h-3.5 border border-black flex items-center justify-center font-bold text-[10px] leading-none">
                          {issueType === 'xuat_dieu_chuyen' ? '✓' : ''}
                        </span>
                        <span>Phiếu xuất điều chuyển</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* TABLE: CRISP BORDERED SPECIFICATION TABLE */}
              <div className="mt-2 mb-2">
                <table className="w-full border-collapse border border-black text-[12px] leading-snug">
                  <thead>
                    <tr className="border-b border-black text-center font-bold text-[11.5px]">
                      <th className="border border-black p-1.5 w-[38px]">STT</th>
                      <th className="border border-black p-1.5 w-[125px]">Mã vật tư</th>
                      <th className="border border-black p-1.5 min-w-[170px]">Tên vật tư</th>
                      <th className="border border-black p-1.5 w-[85px]">Mã lô</th>
                      <th className="border border-black p-1.5 w-[75px]">
                        Số lượng
                        <br />
                        <span className="text-[10px] font-normal">(cây/tấm)</span>
                      </th>
                      <th className="border border-black p-1.5 w-[48px]">ĐVT</th>
                      <th className="border border-black p-1.5 w-[85px]">
                        Khối lượng
                        <br />
                        <span className="text-[10px] font-normal">(Kg)</span>
                      </th>

                      {/* Receipt has Unit price & Amount; Issue note does not have prices in sample! */}
                      {isReceipt && (
                        <>
                          <th className="border border-black p-1.5 w-[75px]">
                            Đơn giá
                            <br />
                            <span className="text-[10px] font-normal">(VNĐ)</span>
                          </th>
                          <th className="border border-black p-1.5 w-[80px]">
                            Thành tiền
                            <br />
                            <span className="text-[10px] font-normal">(VNĐ)</span>
                          </th>
                        </>
                      )}

                      <th className="border border-black p-1.5 w-[65px]">Ghi chú</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lineItems.map((item, idx) => (
                      <tr key={item.id} className="border-b border-black align-middle">
                        {/* 1. STT */}
                        <td className="border border-black p-1.5 text-center">{idx + 1}</td>

                        {/* 2. Mã vật tư */}
                        <td className="border border-black p-1.5 font-mono text-[11px] text-center break-all">
                          {isEditing ? (
                            <input
                              type="text"
                              value={item.itemCode}
                              onChange={e => handleUpdateLine(idx, 'itemCode', e.target.value)}
                              className="w-full text-center border border-dashed border-indigo-400 p-0.5 text-[10px]"
                            />
                          ) : (
                            item.itemCode
                          )}
                        </td>

                        {/* 3. Tên vật tư + Quy cách */}
                        <td className="border border-black p-1.5 text-left">
                          {isEditing ? (
                            <textarea
                              rows={2}
                              value={item.itemName}
                              onChange={e => handleUpdateLine(idx, 'itemName', e.target.value)}
                              className="w-full border border-dashed border-indigo-400 p-0.5 text-xs"
                            />
                          ) : (
                            <div>
                              <span className="font-semibold">{item.itemName}</span>
                              {item.spec && (
                                <div className="text-[11px] text-slate-800 leading-tight mt-0.5">
                                  {item.spec}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 4. Mã lô */}
                        <td className="border border-black p-1.5 text-center font-mono text-[11.5px]">
                          {isEditing ? (
                            <input
                              type="text"
                              value={item.lotNumber}
                              onChange={e => handleUpdateLine(idx, 'lotNumber', e.target.value)}
                              className="w-full text-center border border-dashed border-indigo-400 p-0.5 text-xs font-mono"
                            />
                          ) : (
                            item.lotNumber || '-'
                          )}
                        </td>

                        {/* 5. Số lượng (cây/tấm) */}
                        <td className="border border-black p-1.5 text-center font-bold">
                          {isEditing ? (
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={e =>
                                handleUpdateLine(idx, 'quantity', parseFloat(e.target.value) || 0)
                              }
                              className="w-full text-center border border-dashed border-indigo-400 p-0.5 text-xs font-bold"
                            />
                          ) : (
                            formatStandardNumber(item.quantity)
                          )}
                        </td>

                        {/* 6. ĐVT */}
                        <td className="border border-black p-1.5 text-center">
                          {isEditing ? (
                            <input
                              type="text"
                              value={item.unit}
                              onChange={e => handleUpdateLine(idx, 'unit', e.target.value)}
                              className="w-full text-center border border-dashed border-indigo-400 p-0.5 text-xs"
                            />
                          ) : (
                            item.unit
                          )}
                        </td>

                        {/* 7. Khối lượng (Kg) */}
                        <td className="border border-black p-1.5 text-right font-mono text-[11.5px] tabular-nums">
                          {isEditing ? (
                            <input
                              type="number"
                              step="0.01"
                              value={item.weightKg}
                              onChange={e =>
                                handleUpdateLine(idx, 'weightKg', parseFloat(e.target.value) || 0)
                              }
                              className="w-full text-right border border-dashed border-indigo-400 p-0.5 text-xs font-mono"
                            />
                          ) : (
                            formatWeight(item.weightKg)
                          )}
                        </td>

                        {/* 8 & 9. Đơn giá & Thành tiền (Receipt only) */}
                        {isReceipt && (
                          <>
                            <td className="border border-black p-1.5 text-right font-mono text-[11px] tabular-nums">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={item.unitPrice}
                                  onChange={e =>
                                    handleUpdateLine(
                                      idx,
                                      'unitPrice',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-full text-right border border-dashed border-indigo-400 p-0.5 text-xs font-mono"
                                />
                              ) : item.unitPrice > 0 ? (
                                formatStandardNumber(item.unitPrice)
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="border border-black p-1.5 text-right font-mono text-[11px] tabular-nums font-semibold">
                              {item.amount > 0 ? formatStandardNumber(item.amount) : '-'}
                            </td>
                          </>
                        )}

                        {/* 10. Ghi chú */}
                        <td className="border border-black p-1.5 text-center text-[11px]">
                          {isEditing ? (
                            <input
                              type="text"
                              value={item.note}
                              onChange={e => handleUpdateLine(idx, 'note', e.target.value)}
                              className="w-full border border-dashed border-indigo-400 p-0.5 text-[10px]"
                            />
                          ) : (
                            item.note || ''
                          )}
                        </td>
                      </tr>
                    ))}

                    {/* TOTAL FOOTER ROW MATCHING THE SCREENSHOTS */}
                    <tr className="border-t border-black font-bold text-[12px] bg-slate-50/50">
                      {/* TỔNG CỘNG spanned on STT + Mã vật tư */}
                      <td colSpan={2} className="border border-black p-1.5 text-center uppercase">
                        TỔNG CỘNG
                      </td>

                      {/* {X} mục hàng */}
                      <td className="border border-black p-1.5 text-center">
                        {totals.itemCount} mục hàng
                      </td>

                      {/* Mã lô empty */}
                      <td className="border border-black p-1.5"></td>

                      {/* Total Qty */}
                      <td className="border border-black p-1.5 text-center">
                        {formatStandardNumber(totals.totalQty)}
                      </td>

                      {/* ĐVT empty */}
                      <td className="border border-black p-1.5"></td>

                      {/* Total Weight Kg */}
                      <td className="border border-black p-1.5 text-right font-mono tabular-nums">
                        {formatWeight(totals.totalWeightKg)}
                      </td>

                      {/* Receipt price columns */}
                      {isReceipt && (
                        <>
                          <td className="border border-black p-1.5"></td>
                          <td className="border border-black p-1.5 text-right font-mono tabular-nums">
                            {totals.totalAmount > 0 ? formatStandardNumber(totals.totalAmount) : '-'}
                          </td>
                        </>
                      )}

                      {/* Ghi chú empty */}
                      <td className="border border-black p-1.5"></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* POST TABLE NOTES (ONLY IN RECEIPT IN THE SAMPLE) */}
              {isReceipt && (
                <div className="text-[12.5px] space-y-1 mt-2.5 mb-1 leading-relaxed">
                  <div>
                    <span className="font-bold">Viết bằng chữ :</span>{' '}
                    <span className="italic">
                      {totals.totalAmount > 0
                        ? numberToWordsVietnamese(totals.totalAmount)
                        : '........................................................................................................................................................................'}
                    </span>
                  </div>
                  <div className="flex items-baseline">
                    <span className="font-bold whitespace-nowrap">Số chứng từ gốc kèm theo:</span>
                    <span className="mx-2">
                      {isEditing ? (
                        <input
                          type="text"
                          value={attachedDocs}
                          onChange={e => setAttachedDocs(e.target.value)}
                          placeholder="Nhập số hóa đơn / Packing list..."
                          className="border-b border-indigo-400 outline-none text-xs px-1 w-64"
                        />
                      ) : (
                        attachedDocs
                      )}
                    </span>
                    <div className="flex-1 border-b border-slate-300 min-w-8 mb-1"></div>
                  </div>
                  <div className="italic text-[11px] text-slate-700 underline underline-offset-2 pt-0.5">
                    Note: Cột số lượng (cây/tấm), mã lô, chiều rộng, chiều dài chỉ áp dụng đối với vật tư chính.
                  </div>
                </div>
              )}
            </div>

            {/* DOCUMENT BOTTOM CONTAINER: SIGNATURES & PAGE NUMBER */}
            <div className="mt-6 pt-2">
              {/* 4 SIGNATURE COLUMNS MATCHING EXACT TITLES */}
              <div className="grid grid-cols-4 gap-2 text-center text-[13px]">
                {/* Column 1 */}
                <div>
                  <p className="font-bold uppercase">
                    {isReceipt ? 'Người giao hàng' : 'Người nhận'}
                  </p>
                  <p className="italic text-[11px] text-slate-600 mt-0.5">(Ký, ghi rõ họ tên)</p>
                  <div className="h-16 flex items-end justify-center pb-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={signPerson1}
                        onChange={e => setSignPerson1(e.target.value)}
                        className="text-center font-semibold text-xs border border-dashed border-indigo-400 w-full"
                      />
                    ) : (
                      <span className="font-semibold text-xs">{signPerson1}</span>
                    )}
                  </div>
                </div>

                {/* Column 2 */}
                <div>
                  <p className="font-bold uppercase">
                    {isReceipt ? 'Thủ kho/NV QLVT' : 'Thủ kho'}
                  </p>
                  <p className="italic text-[11px] text-slate-600 mt-0.5">(Ký, ghi rõ họ tên)</p>
                  <div className="h-16 flex items-end justify-center pb-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={signPerson2}
                        onChange={e => setSignPerson2(e.target.value)}
                        className="text-center font-semibold text-xs border border-dashed border-indigo-400 w-full"
                      />
                    ) : (
                      <span className="font-semibold text-xs">{signPerson2}</span>
                    )}
                  </div>
                </div>

                {/* Column 3 */}
                <div>
                  <p className="font-bold uppercase">P.TCKT</p>
                  <p className="italic text-[11px] text-slate-600 mt-0.5">(Ký, ghi rõ họ tên)</p>
                  <div className="h-16 flex items-end justify-center pb-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={signPerson3}
                        onChange={e => setSignPerson3(e.target.value)}
                        className="text-center font-semibold text-xs border border-dashed border-indigo-400 w-full"
                      />
                    ) : (
                      <span className="font-semibold text-xs">{signPerson3}</span>
                    )}
                  </div>
                </div>

                {/* Column 4 */}
                <div>
                  <p className="font-bold uppercase">Phê duyệt</p>
                  <p className="italic text-[11px] text-slate-600 mt-0.5">(Ký, ghi rõ họ tên)</p>
                  <div className="h-16 flex items-end justify-center pb-1">
                    {isEditing ? (
                      <input
                        type="text"
                        value={signPerson4}
                        onChange={e => setSignPerson4(e.target.value)}
                        className="text-center font-semibold text-xs border border-dashed border-indigo-400 w-full"
                      />
                    ) : (
                      <span className="font-semibold text-xs">{signPerson4}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Page footer */}
              <div className="text-center text-[10.5px] text-slate-500 pt-6 font-sans">
                Page 1 of 1
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

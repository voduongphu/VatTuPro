import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface PaginationBarProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 200],
  itemLabel = 'dòng'
}) => {
  const { language, t } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  if (totalItems === 0) return null;

  const startIdx = (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  const locItemLabel = language === 'en'
    ? (itemLabel === 'dòng' ? 'rows' : itemLabel === 'kho' ? 'warehouses' : itemLabel === 'vật tư' ? 'items' : t(itemLabel))
    : itemLabel;

  // Tính dãy trang hiển thị gọn gàng
  const getVisiblePages = () => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safePage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="px-3 sm:px-4 py-3 bg-slate-50/90 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 text-xs">
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 text-slate-600 text-center sm:text-left">
        <span>
          {language === 'en' ? 'Showing' : 'Hiển thị'} <strong className="text-slate-900 font-mono tabular-nums">{startIdx.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}</strong> -{' '}
          <strong className="text-slate-900 font-mono tabular-nums">{endIdx.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}</strong> / {language === 'en' ? 'Total' : 'Tổng'}{' '}
          <strong className="text-blue-700 font-mono tabular-nums">{totalItems.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}</strong> {locItemLabel}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 hidden sm:inline">|</span>
            <span className="text-slate-500">{language === 'en' ? 'Rows/page:' : 'Dòng/trang:'}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="px-2 py-1.5 sm:py-1 bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-h-[34px] sm:min-h-0"
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => onPageChange(1)}
            className="min-w-[36px] min-h-[36px] sm:min-w-[30px] sm:min-h-[30px] p-1.5 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Trang đầu"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => onPageChange(safePage - 1)}
            className="min-w-[36px] min-h-[36px] sm:min-w-[30px] sm:min-h-[30px] p-1.5 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Trang trước"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          {visiblePages.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`min-w-[36px] min-h-[36px] sm:min-w-[30px] sm:min-h-[30px] px-2 rounded-lg font-mono tabular-nums font-bold text-xs transition ${
                p === safePage
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {p.toLocaleString('vi-VN')}
            </button>
          ))}

          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="min-w-[36px] min-h-[36px] sm:min-w-[30px] sm:min-h-[30px] p-1.5 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Trang tiếp"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => onPageChange(totalPages)}
            className="min-w-[36px] min-h-[36px] sm:min-w-[30px] sm:min-h-[30px] p-1.5 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
            title="Trang cuối"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>

          <span className="ml-1 text-[11px] text-slate-500 font-mono tabular-nums">
            Trang {safePage.toLocaleString('vi-VN')}/{totalPages.toLocaleString('vi-VN')}
          </span>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  itemName: string;
  itemType?: string;
  warningText?: string;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  itemType = 'mục này',
  warningText
}) => {
  const { language, t } = useLanguage();
  if (!isOpen) return null;

  const locTitle = t(title);
  const locItemType = language === 'en'
    ? (itemType === 'mục này' ? 'this item' : itemType === 'kho bãi này' ? 'this warehouse' : itemType === 'vật tư này' ? 'this material item' : itemType === 'người dùng này' ? 'this user' : t(itemType))
    : itemType;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-rose-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-inner">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{locTitle}</h3>
              <p className="text-xs text-rose-700 font-medium">{language === 'en' ? 'This action cannot be undone' : 'Hành động này không thể hoàn tác'}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-slate-200/70 rounded-lg text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-600">
            {language === 'en' ? `Are you sure you want to delete ${locItemType}:` : `Bạn có chắc chắn muốn xóa ${locItemType}:`}
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 text-sm break-words flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span data-user-content="true">{itemName}</span>
          </div>

          {warningText ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{t(warningText)}</span>
            </div>
          ) : (
            <div className="text-xs text-slate-500">
              {language === 'en' ? 'Deleted data will be immediately synchronized across the system.' : 'Dữ liệu sau khi xóa sẽ được cập nhật đồng bộ ngay lập tức trên toàn hệ thống.'}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-rose-600/20 transition active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('Xác Nhận Xóa')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition"
            >
              {t('Hủy')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

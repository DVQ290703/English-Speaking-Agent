import { useT } from '../../i18n/useLanguage';

interface LogoutConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmModal({ onCancel, onConfirm }: LogoutConfirmModalProps) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-xl shrink-0">
            👋
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{t('dash.logout.title')}</h3>
            <p className="text-sm text-gray-500 mt-1">{t('dash.logout.body')}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
          >
            {t('dash.logout.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

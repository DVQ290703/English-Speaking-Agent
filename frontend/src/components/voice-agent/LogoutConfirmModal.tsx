import { useT } from '../../i18n/useLanguage';
import ConfirmModal from '../ui/ConfirmModal';

interface LogoutConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmModal({ onCancel, onConfirm }: LogoutConfirmModalProps) {
  const t = useT();
  return (
    <ConfirmModal
      isOpen
      onClose={onCancel}
      onConfirm={onConfirm}
      title={t('dash.logout.title')}
      description={t('dash.logout.body')}
      confirmText={t('dash.logout.confirm')}
      cancelText={t('common.cancel')}
      icon={<span className="text-xl">👋</span>}
      isDestructive
    />
  );
}

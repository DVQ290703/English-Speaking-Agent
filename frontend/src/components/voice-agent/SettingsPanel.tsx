import { useT } from '../../i18n/LanguageContext';
import { TOPICS, type TopicId } from './constants';

interface SettingsPanelProps {
  topic: TopicId | null;
  onSelectTopic: (id: TopicId) => void;
  onClose: () => void;
}

export default function SettingsPanel({ topic, onSelectTopic, onClose }: SettingsPanelProps) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" onClick={onClose}>
      <div
        className="mt-18 mr-3 bg-white border border-gray-200 rounded-xl shadow-2xl w-80 p-4 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-800 mb-1 text-sm">{t('va.settings.title')}</h3>
        <p className="text-[10px] text-gray-500 mb-3">{t('va.settings.subtitle')}</p>
        <div className="space-y-1">
          {TOPICS.map((tp) => {
            const tpTitle =
              t(`topic.${tp.label}.title`) === `topic.${tp.label}.title`
                ? tp.label
                : t(`topic.${tp.label}.title`);
            const tpDesc =
              t(`topic.${tp.label}.desc`) === `topic.${tp.label}.desc`
                ? tp.desc
                : t(`topic.${tp.label}.desc`);
            return (
              <button
                key={tp.id}
                onClick={() => onSelectTopic(tp.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${
                  topic === tp.id
                    ? 'bg-blue-100 border border-blue-300 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 border border-transparent'
                }`}
              >
                <div>
                  <div className="text-xs font-medium text-gray-800">{tpTitle}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{tpDesc}</div>
                </div>
                {topic === tp.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

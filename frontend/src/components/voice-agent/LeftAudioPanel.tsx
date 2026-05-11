import { User, Sparkles } from 'lucide-react';

import { useT } from '../../i18n/useLanguage';
import DeviceSelect from './DeviceSelect';
import SelectDropdown from './SelectDropdown';
import { AgentWaveform, MicWaveform } from './Waveforms';
import { ACCENTS, GENDERS, type Accent, type AuthUser, type Gender } from './constants';
import { FlagUK, FlagUS } from './FlagIcons';
import type { MicDevice } from '../../hooks/useMicDevices';

interface LeftAudioPanelProps {
  gender: Gender;
  onChangeGender: (next: Gender) => void;
  accent: Accent;
  onChangeAccent: (next: Accent) => void;
  agentSpeaking: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  micDevices: MicDevice[];
  selectedMicId: string;
  onSelectMic: (deviceId: string) => void;
  currentUser: AuthUser | null;
}

function InactiveDots({ dotClass }: { dotClass: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      ))}
    </div>
  );
}

export default function LeftAudioPanel({
  gender,
  onChangeGender,
  accent,
  onChangeAccent,
  agentSpeaking,
  isConnected,
  isConnecting,
  micDevices,
  selectedMicId,
  onSelectMic,
  currentUser,
}: LeftAudioPanelProps) {
  const t = useT();
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-700 tracking-wide">
          {t('va.left.audioSettings')}
        </span>
        <div className="flex items-center gap-2">
          {/* Accent toggle */}
          <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onChangeAccent(a)}
                title={`${a} accent`}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                  accent === a
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {a === 'US' ? <FlagUS /> : <FlagUK />}
                <span>{a}</span>
              </button>
            ))}
          </div>
          <SelectDropdown value={gender} options={GENDERS} onChange={onChangeGender} />
        </div>
      </div>

      <div className="px-2 mt-2 space-y-2">
        <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-md border border-gray-200 flex items-center gap-2.5 px-2 py-2">
          <div
            className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 ${
              agentSpeaking
                ? 'bg-blue-600/30 border-2 border-blue-500/60 shadow-lg shadow-blue-200'
                : 'bg-blue-100 border border-blue-200'
            }`}
          >
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-gray-700 mb-1">Agent</div>
            {isConnected || isConnecting ? (
              <AgentWaveform active={agentSpeaking} />
            ) : (
              <InactiveDots dotClass="bg-blue-500/30" />
            )}
          </div>
        </div>

        <div className="px-2 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-700 tracking-widest uppercase">
              {t('va.left.microphone')}
            </span>
            <div className="flex items-center gap-2">
              <DeviceSelect
                value={
                  micDevices.find((d) => d.deviceId === selectedMicId)?.label ??
                  (micDevices[0]?.label || 'Default Mic')
                }
                options={micDevices.length > 0 ? micDevices.map((d) => d.label) : ['Default Mic']}
                onChange={(label) => {
                  const device = micDevices.find((d) => d.label === label);
                  if (device) onSelectMic(device.deviceId);
                }}
              />
            </div>
          </div>
        </div>

        <div className="bg-linear-to-r from-violet-50 to-purple-50 rounded-md border border-gray-200 flex items-center gap-2.5 px-2 py-2">
          <div
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 bg-violet-100 border border-violet-200"
          >
            {currentUser?.display_name?.[0] ? (
              <span className="text-sm font-semibold text-violet-700">
                {currentUser.display_name[0].toUpperCase()}
              </span>
            ) : (
              <User className="w-5 h-5 text-violet-700" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-gray-700 mb-1 truncate">
              {currentUser?.display_name || t('common.you')}
            </div>
            {isConnected || isConnecting ? (
              <MicWaveform active={false} speaking={false} />
            ) : (
              <InactiveDots dotClass="bg-violet-500/30" />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

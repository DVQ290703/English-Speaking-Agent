import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface MicDevice {
  deviceId: string;
  label: string;
}

export interface UseMicDevicesResult {
  micDevices: MicDevice[];
  selectedMicId: string;
  selectedMicIdRef: React.MutableRefObject<string>;
  setSelectedMicId: (id: string) => void;
  refreshMicDevices: () => Promise<void>;
  refreshMicDevicesRef: React.MutableRefObject<() => Promise<void>>;
}

/**
 * Enumerate real microphone devices and keep the list fresh whenever the
 * user plugs/unplugs hardware. Device labels are empty strings until mic
 * permission is granted, so callers should re-invoke `refreshMicDevices`
 * after a successful getUserMedia.
 */
export default function useMicDevices(): UseMicDevicesResult {
  const [micDevices, setMicDevices] = useState<MicDevice[]>([]);
  const [selectedMicId, setSelectedMicIdState] = useState<string>('');
  const selectedMicIdRef = useRef<string>('');

  useEffect(() => {
    selectedMicIdRef.current = selectedMicId;
  }, [selectedMicId]);

  const setSelectedMicId = useCallback((id: string) => {
    selectedMicIdRef.current = id;
    setSelectedMicIdState(id);
  }, []);

  const refreshMicDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));
      setMicDevices(mics);
      setSelectedMicIdState((prev) => {
        const stillPresent = mics.some((m) => m.deviceId === prev);
        if (stillPresent) return prev;
        const first = mics[0]?.deviceId ?? '';
        selectedMicIdRef.current = first;
        return first;
      });
    } catch {
      // enumerateDevices can throw in restricted contexts; ignore.
    }
  }, []);

  const refreshMicDevicesRef = useRef(refreshMicDevices);
  useLayoutEffect(() => {
    refreshMicDevicesRef.current = refreshMicDevices;
  }, [refreshMicDevices]);

  useEffect(() => {
    void refreshMicDevicesRef.current();
    const handler = () => void refreshMicDevicesRef.current();
    navigator.mediaDevices?.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handler);
  }, []);

  return {
    micDevices,
    selectedMicId,
    selectedMicIdRef,
    setSelectedMicId,
    refreshMicDevices,
    refreshMicDevicesRef,
  };
}

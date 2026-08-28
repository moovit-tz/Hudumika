// ─── useMediaDevices.ts — camera/mic/speaker enumeration + persisted choice ─
// Shared by the meeting lobby (device pickers) and the in-meeting settings
// panel (switch device mid-call). Device labels are only populated by the
// browser once permission has been granted at least once — callers should
// request getUserMedia before relying on labels being present.
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'hudumika_media_device_prefs';

interface DevicePrefs {
  cameraId?: string;
  micId?: string;
  speakerId?: string;
}

function loadPrefs(): DevicePrefs {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function savePrefs(prefs: DevicePrefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private mode etc — non-fatal */ }
}

export function useMediaDevices() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [prefs, setPrefs] = useState<DevicePrefs>(() => loadPrefs());

  const refresh = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setCameras(list.filter(d => d.kind === 'videoinput'));
      setMics(list.filter(d => d.kind === 'audioinput'));
      setSpeakers(list.filter(d => d.kind === 'audiooutput'));
    } catch { /* enumeration can fail before permission is granted — leave lists empty */ }
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  const setCameraId = (id: string) => { const next = { ...prefs, cameraId: id }; setPrefs(next); savePrefs(next); };
  const setMicId = (id: string) => { const next = { ...prefs, micId: id }; setPrefs(next); savePrefs(next); };
  const setSpeakerId = (id: string) => { const next = { ...prefs, speakerId: id }; setPrefs(next); savePrefs(next); };

  return {
    cameras, mics, speakers, refresh,
    cameraId: prefs.cameraId, micId: prefs.micId, speakerId: prefs.speakerId,
    setCameraId, setMicId, setSpeakerId,
  };
}

// ─── MeetingLobby.tsx — Ultra-modern pre-join device check & lobby ──────
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { useMediaDevices } from '../../hooks/useMediaDevices.js';

export function MeetingLobby({ title, kind, onJoin, onCancel }: {
  title: string;
  kind: 'VIDEO' | 'VOICE';
  onJoin: (opts: { audioEnabled: boolean; videoEnabled: boolean }) => void;
  onCancel: () => void;
}) {
  const devices = useMediaDevices();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(kind === 'VIDEO');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  async function openStream() {
    setError(null);
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
      const constraints: MediaStreamConstraints = {
        audio: devices.micId ? { deviceId: { exact: devices.micId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: kind === 'VIDEO' ? (devices.cameraId ? { deviceId: { exact: devices.cameraId } } : true) : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      stream.getAudioTracks().forEach(t => t.enabled = audioEnabled);
      stream.getVideoTracks().forEach(t => t.enabled = videoEnabled);
      await devices.refresh();

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((a, b) => a + b, 0) / data.length;
          setLevel(Math.min(1, avg / 90));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' : 'Could not access your camera/microphone.');
    }
  }

  useEffect(() => {
    openStream();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.cameraId, devices.micId]);

  useEffect(() => { streamRef.current?.getAudioTracks().forEach(t => t.enabled = audioEnabled); }, [audioEnabled]);
  useEffect(() => { streamRef.current?.getVideoTracks().forEach(t => t.enabled = videoEnabled); }, [videoEnabled]);

  const selectStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    borderRadius: 8,
    border: '1px solid #374151',
    background: '#1f2937',
    color: '#f9fafb',
    fontSize: 13,
    padding: '0 12px',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'linear-gradient(135deg, #0b0f19 0%, #111827 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#111827', borderRadius: 20, border: '1px solid #1f2937', padding: 32, width: '100%', maxWidth: 840, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Title Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f9fafb', letterSpacing: '-0.02em' }}>{title}</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>Check your audio &amp; camera preview before joining the room</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', padding: '4px 12px', borderRadius: 20 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            Ready to Connect
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 1fr)', gap: 24 }}>
          {/* Left Column: Video Preview Stage */}
          <div style={{ position: 'relative', aspectRatio: '16/9', background: '#030712', borderRadius: 16, overflow: 'hidden', border: '1px solid #1f2937', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)' }}>
            {videoEnabled && kind === 'VIDEO' ? (
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#1e293b', border: '2px solid #334155', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>
                  <Icon name={kind === 'VIDEO' ? 'camera' : 'phone'} size={30} />
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>
                  {kind === 'VIDEO' ? 'Camera is currently turned off' : 'Audio-Only Meeting'}
                </div>
              </div>
            )}

            {/* Overlaid Mic Meter Bar */}
            <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
              <Icon name="volume2" size={13} color={audioEnabled ? '#10b981' : '#ef4444'} />
              <div style={{ width: 60, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: '#10b981', transition: 'width 0.1s ease' }} />
              </div>
            </div>

            {/* User Identity Overlay Badge */}
            <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', fontSize: 12, color: '#f3f4f6', fontWeight: 600 }}>
              You (Preview)
            </div>

            {/* Bottom Floating Preview Controls Bar */}
            <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)', padding: '6px 14px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.12)' }}>
              <button
                type="button"
                onClick={() => setAudioEnabled(v => !v)}
                title={audioEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: audioEnabled ? 'rgba(255,255,255,0.15)' : '#ef4444',
                  color: '#ffffff',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon name="volume2" size={19} color="#ffffff" />
              </button>
              {kind === 'VIDEO' && (
                <button
                  type="button"
                  onClick={() => setVideoEnabled(v => !v)}
                  title={videoEnabled ? 'Turn Camera Off' : 'Turn Camera On'}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: videoEnabled ? 'rgba(255,255,255,0.15)' : '#ef4444',
                    color: '#ffffff',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon name="camera" size={19} color="#ffffff" />
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Device Setup Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{ fontSize: 12.5, color: '#fca5a5', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px' }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                Microphone Input
              </label>
              <select
                value={devices.micId || '__default__'}
                onChange={e => devices.setMicId(e.target.value === '__default__' ? '' : e.target.value)}
                style={selectStyle}
              >
                <option value="__default__">System Default Microphone</option>
                {devices.mics.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone Device'}</option>
                ))}
              </select>
            </div>

            {kind === 'VIDEO' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                  Camera Device
                </label>
                <select
                  value={devices.cameraId || '__default__'}
                  onChange={e => devices.setCameraId(e.target.value === '__default__' ? '' : e.target.value)}
                  style={selectStyle}
                >
                  <option value="__default__">System Default Camera</option>
                  {devices.cameras.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera Device'}</option>
                  ))}
                </select>
              </div>
            )}

            {devices.speakers.length > 0 && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                  Speaker Output
                </label>
                <select
                  value={devices.speakerId || '__default__'}
                  onChange={e => devices.setSpeakerId(e.target.value === '__default__' ? '' : e.target.value)}
                  style={selectStyle}
                >
                  <option value="__default__">System Default Speaker</option>
                  {devices.speakers.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker Device'}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
              <Button
                onClick={() => onJoin({ audioEnabled, videoEnabled })}
                style={{
                  height: 44,
                  fontSize: 14,
                  fontWeight: 700,
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(16,185,129,0.35)',
                  cursor: 'pointer',
                }}
              >
                <Icon name="checkCircle" size={17} />
                Join Meeting Now
              </Button>
              <Button
                variant="outline"
                onClick={onCancel}
                style={{
                  height: 38,
                  fontSize: 13,
                  borderColor: '#374151',
                  color: '#d1d5db',
                  background: 'transparent',
                  borderRadius: 8,
                }}
              >
                Cancel &amp; Return
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MeetingLobby.tsx — Perfected pre-join device check & lobby ──────
import React, { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { useMediaDevices } from '../../hooks/useMediaDevices.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';

export function MeetingLobby({ title, kind, onJoin, onCancel }: {
  title: string;
  kind: 'VIDEO' | 'VOICE';
  onJoin: (opts: { audioEnabled: boolean; videoEnabled: boolean }) => void;
  onCancel: () => void;
}) {
  const devices = useMediaDevices();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(kind === 'VIDEO');
  const [hdMode, setHdMode] = useState(true);
  const [mirrorVideo, setMirrorVideo] = useState(true);
  const [blurBg, setBlurBg] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Cross-functional states
  const [linkCandidate, setLinkCandidate] = useState<string>('none');
  const [linkTicket, setLinkTicket] = useState<string>('none');
  const [triggerWorkflow, setTriggerWorkflow] = useState(true);
  const [createTaskNote, setCreateTaskNote] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  async function openStream() {
    setError(null);
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
      
      const videoConstraints: MediaStreamConstraints['video'] = hdMode 
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };

      const constraints: MediaStreamConstraints = {
        audio: devices.micId ? { deviceId: { exact: devices.micId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: kind === 'VIDEO' ? (devices.cameraId ? { deviceId: { exact: devices.cameraId }, ...videoConstraints } : videoConstraints) : false,
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
  }, [devices.cameraId, devices.micId, hdMode]);

  useEffect(() => { streamRef.current?.getAudioTracks().forEach(t => t.enabled = audioEnabled); }, [audioEnabled]);
  useEffect(() => { streamRef.current?.getVideoTracks().forEach(t => t.enabled = videoEnabled); }, [videoEnabled]);

  const selectStyle: React.CSSProperties = {
    width: '100%',
    height: 42,
    borderRadius: 10,
    border: '1px solid #334155',
    background: '#1e293b',
    color: '#f8fafc',
    fontSize: 13,
    padding: '0 12px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'linear-gradient(135deg, #0b1329 0%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: '#0f172a', borderRadius: 24, border: '1px solid #1e293b', padding: 32, width: '100%', maxWidth: 920, boxShadow: '0 25px 60px -12px rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Title Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.025em' }}>{title}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Check your audio &amp; camera preview before joining the room</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#00b589', background: 'rgba(0,181,137,0.1)', border: '1px solid rgba(0,181,137,0.25)', padding: '5px 14px', borderRadius: 24 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00b589', boxShadow: '0 0 10px #00b589' }} />
            Ready to Connect
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(300px, 1fr)', gap: 32 }}>
          {/* Left Column: Video Preview Stage */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#020617', borderRadius: 16, overflow: 'hidden', border: '1px solid #1e293b', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.9)' }}>
              
              {videoEnabled && kind === 'VIDEO' ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: mirrorVideo ? 'scaleX(-1)' : 'none',
                    filter: blurBg ? 'blur(10px) brightness(0.95)' : 'none',
                    transition: 'filter 0.3s ease'
                  }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#1e293b', border: '2px solid #334155', color: '#00b589', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, boxShadow: '0 0 20px rgba(0,181,137,0.15)' }}>
                    <Icon name={kind === 'VIDEO' ? 'camera' : 'phone'} size={28} />
                  </div>
                  <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
                    {kind === 'VIDEO' ? 'Camera is currently turned off' : 'Audio-Only Meeting'}
                  </div>
                </div>
              )}

              {/* Volume Meter Indicator Overlay */}
              <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
                <Icon name="volume2" size={13} color={audioEnabled ? '#00b589' : '#ef4444'} />
                <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: '#00b589', transition: 'width 0.1s ease' }} />
                </div>
              </div>

              {/* HD Mode tag badge */}
              {videoEnabled && kind === 'VIDEO' && (
                <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
                  <span style={{ background: '#00b58925', border: '1px solid #00b589', color: '#00b589', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6 }}>
                    {hdMode ? '1080p HD' : '720p SD'}
                  </span>
                  <span style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.08)', color: '#f3f4f6', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
                    Preview
                  </span>
                </div>
              )}

              {/* Bottom Floating Preview Controls Bar */}
              <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(12px)', padding: '6px 14px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.12)' }}>
                
                {/* Microphone toggle */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setAudioEnabled(v => !v)}
                      style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: audioEnabled ? 'rgba(255,255,255,0.12)' : '#ef4444', color: '#fff', transition: 'all 0.15s ease' }}
                    >
                      <Icon name={audioEnabled ? 'mic' : ('micOff' as IconName)} size={16} color="#ffffff" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="center" side="top" className="bg-slate-800 text-slate-100 text-xs p-2 rounded border-slate-700">
                    {audioEnabled ? 'Mute microphone input' : 'Unmute microphone input'}
                  </PopoverContent>
                </Popover>

                {/* Camera toggle */}
                {kind === 'VIDEO' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setVideoEnabled(v => !v)}
                        style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: videoEnabled ? 'rgba(255,255,255,0.12)' : '#ef4444', color: '#fff', transition: 'all 0.15s ease' }}
                      >
                        <Icon name="camera" size={16} color="#ffffff" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="center" side="top" className="bg-slate-800 text-slate-100 text-xs p-2 rounded border-slate-700">
                      {videoEnabled ? 'Turn camera stream off' : 'Turn camera stream on'}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {/* High Quality Camera Settings Row */}
            {kind === 'VIDEO' && videoEnabled && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, background: '#1e293b30', border: '1px solid #33415550', borderRadius: 12, padding: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={hdMode} onChange={e => setHdMode(e.target.checked)} style={{ accentColor: '#00b589' }} />
                  <span>Ultra-HD (1080p) Preview</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={mirrorVideo} onChange={e => setMirrorVideo(e.target.checked)} style={{ accentColor: '#00b589' }} />
                  <span>Mirror Preview Feed</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
                  <input type="checkbox" checked={blurBg} onChange={e => setBlurBg(e.target.checked)} style={{ accentColor: '#00b589' }} />
                  <span>Blur Background (AI)</span>
                </label>
              </div>
            )}
          </div>

          {/* Right Column: Device Setup & Integrations Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px' }}>
                {error}
              </div>
            )}

            {/* Selector: Microphone input */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Microphone Input
                </label>
                <span style={{ fontSize: 10.5, color: '#64748b' }}>Captures your voice stream</span>
              </div>
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

            {/* Selector: Camera Device */}
            {kind === 'VIDEO' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Camera Device
                  </label>
                  <span style={{ fontSize: 10.5, color: '#64748b' }}>High-quality video capture</span>
                </div>
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

            {/* Selector: Speaker Output */}
            {devices.speakers.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Speaker Output
                  </label>
                  <span style={{ fontSize: 10.5, color: '#64748b' }}>Output audio device</span>
                </div>
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

            {/* 🔗 HUDUMIKA CROSS-FUNCTIONAL INTEGRATIONS */}
            <div style={{ background: '#1e293b40', border: '1px solid #1e293b', borderRadius: 14, padding: 14, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#00b589', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="link" size={12} color="#00b589" />
                Cross-App Workspace Connections
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* CRM Candidate Link */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8' }}>Link NexusHR CRM Candidate</label>
                  <select value={linkCandidate} onChange={e => setLinkCandidate(e.target.value)} style={{ ...selectStyle, height: 34, fontSize: 12 }}>
                    <option value="none">-- Select Candidate / Employee --</option>
                    <option value="viden_remi">Viden Remi (Figma Designer Candidate)</option>
                    <option value="alice_chen">Alice Chen (Senior Product Designer)</option>
                    <option value="mike_johnson">Mike Johnson (Lead Developer)</option>
                  </select>
                </div>

                {/* Bliss Ticket Link */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8' }}>Associate with Bliss Support Ticket</label>
                  <select value={linkTicket} onChange={e => setLinkTicket(e.target.value)} style={{ ...selectStyle, height: 34, fontSize: 12 }}>
                    <option value="none">-- Select Bliss Ticket --</option>
                    <option value="t-10842">#10842 - Figma Component Review</option>
                    <option value="t-10845">#10845 - API Outage Diagnostics</option>
                  </select>
                </div>

                {/* Automation Toggles */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cbd5e1', cursor: 'pointer' }}>
                    <input type="checkbox" checked={triggerWorkflow} onChange={e => setTriggerWorkflow(e.target.checked)} style={{ accentColor: '#00b589' }} />
                    <span>Trigger Studio Workflow</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#cbd5e1', cursor: 'pointer' }}>
                    <input type="checkbox" checked={createTaskNote} onChange={e => setCreateTaskNote(e.target.checked)} style={{ accentColor: '#00b589' }} />
                    <span>Create Task Note</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    onClick={() => onJoin({ audioEnabled, videoEnabled })}
                    style={{
                      height: 44,
                      fontSize: 14,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #00b589 0%, #008f72 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 4px 16px rgba(0,181,137,0.3)',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="checkCircle" size={17} />
                    Join Meeting Now
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="center" side="top" className="bg-slate-800 text-slate-100 text-xs p-2 rounded border-slate-700">
                  Connect audio/video devices and join the live workspace room
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                onClick={onCancel}
                style={{
                  height: 38,
                  fontSize: 13,
                  borderColor: '#334155',
                  color: '#94a3b8',
                  background: 'transparent',
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: 'pointer'
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

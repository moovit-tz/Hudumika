// ─── MeetingLobby.tsx — pre-join device check & lobby ──────
import React, { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { useMediaDevices } from '../../hooks/useMediaDevices.js';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover.js';

export function MeetingLobby({ title, kind, onJoin, onCancel, hideWorkspaceLinks }: {
  title: string;
  kind: 'VIDEO' | 'VOICE';
  onJoin: (opts: { audioEnabled: boolean; videoEnabled: boolean }) => void;
  onCancel: () => void;
  /** Hides the "Cross-App Workspace Connections" card — NexusHR/Bliss
      internal-workspace linking an anonymous guest (GuestMeetingJoin.tsx)
      has no access to and can't meaningfully use. Purely additive; the
      authenticated flow (MeetingSession.tsx) is unaffected. */
  hideWorkspaceLinks?: boolean;
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--font)' }}>
      <div style={{ background: 'var(--white)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, width: '100%', maxWidth: 920, boxShadow: 'var(--elev-lg)', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Title Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 20, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)' }}>{title}</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>Check your audio &amp; camera preview before joining the room</div>
          </div>
          <Badge variant="success">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            Ready to Connect
          </Badge>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(300px, 1fr)', gap: 32 }}>
          {/* Left Column: Video Preview Stage */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ position: 'relative', aspectRatio: '16/9', background: '#0a0e1a', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>

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
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.16)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={kind === 'VIDEO' ? 'camera' : 'phone'} size={28} />
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
                    {kind === 'VIDEO' ? 'Camera is currently turned off' : 'Audio-Only Meeting'}
                  </div>
                </div>
              )}

              {/* Volume Meter Indicator Overlay */}
              <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)' }}>
                <Icon name="volume2" size={13} color={audioEnabled ? 'var(--teal)' : 'var(--red)'} />
                <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: 'var(--teal)', transition: 'width 0.1s ease' }} />
                </div>
              </div>

              {/* HD Mode tag badge */}
              {videoEnabled && kind === 'VIDEO' && (
                <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
                  <Badge variant="brand">{hdMode ? '1080p HD' : '720p SD'}</Badge>
                  <span style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}>
                    Preview
                  </span>
                </div>
              )}

              {/* Bottom Floating Preview Controls Bar */}
              <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 10, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', padding: '6px 14px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.12)' }}>

                {/* Microphone toggle */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setAudioEnabled(v => !v)}
                      style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: audioEnabled ? 'rgba(255,255,255,0.12)' : 'var(--red)', color: '#fff', transition: 'all 0.15s ease' }}
                    >
                      <Icon name={audioEnabled ? 'mic' : ('micOff' as IconName)} size={16} color="#ffffff" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="center" side="top" className="w-auto py-1.5 px-2.5 text-xs">
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
                        style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: videoEnabled ? 'rgba(255,255,255,0.12)' : 'var(--red)', color: '#fff', transition: 'all 0.15s ease' }}
                      >
                        <Icon name="camera" size={16} color="#ffffff" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="center" side="top" className="w-auto py-1.5 px-2.5 text-xs">
                      {videoEnabled ? 'Turn camera stream off' : 'Turn camera stream on'}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {/* High Quality Camera Settings Row */}
            {kind === 'VIDEO' && videoEnabled && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 12, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
                  <Checkbox checked={hdMode} onCheckedChange={c => setHdMode(c === true)} />
                  Ultra-HD (1080p) Preview
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
                  <Checkbox checked={mirrorVideo} onCheckedChange={c => setMirrorVideo(c === true)} />
                  Mirror Preview Feed
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink2)', cursor: 'pointer' }}>
                  <Checkbox checked={blurBg} onCheckedChange={c => setBlurBg(c === true)} />
                  Blur Background (AI)
                </label>
              </div>
            )}
          </div>

          {/* Right Column: Device Setup & Integrations Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 'var(--r-lg)', padding: '10px 14px' }}>
                {error}
              </div>
            )}

            {/* Selector: Microphone input */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Microphone Input
                </label>
                <span style={{ fontSize: 10.5, color: 'var(--ink4)' }}>Captures your voice stream</span>
              </div>
              <Select value={devices.micId || '__default__'} onValueChange={v => devices.setMicId(v === '__default__' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">System Default Microphone</SelectItem>
                  {devices.mics.map(d => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone Device'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selector: Camera Device */}
            {kind === 'VIDEO' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Camera Device
                  </label>
                  <span style={{ fontSize: 10.5, color: 'var(--ink4)' }}>High-quality video capture</span>
                </div>
                <Select value={devices.cameraId || '__default__'} onValueChange={v => devices.setCameraId(v === '__default__' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">System Default Camera</SelectItem>
                    {devices.cameras.map(d => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || 'Camera Device'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Selector: Speaker Output */}
            {devices.speakers.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Speaker Output
                  </label>
                  <span style={{ fontSize: 10.5, color: 'var(--ink4)' }}>Output audio device</span>
                </div>
                <Select value={devices.speakerId || '__default__'} onValueChange={v => devices.setSpeakerId(v === '__default__' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">System Default Speaker</SelectItem>
                    {devices.speakers.map(d => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker Device'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cross-app workspace connections */}
            {!hideWorkspaceLinks && (
            <SectionCard title="Cross-App Workspace Connections">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* CRM Candidate Link */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>Link NexusHR CRM Candidate</label>
                  <Select value={linkCandidate} onValueChange={setLinkCandidate}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Select Candidate / Employee --</SelectItem>
                      <SelectItem value="viden_remi">Viden Remi (Figma Designer Candidate)</SelectItem>
                      <SelectItem value="alice_chen">Alice Chen (Senior Product Designer)</SelectItem>
                      <SelectItem value="mike_johnson">Mike Johnson (Lead Developer)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Bliss Ticket Link */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>Associate with Bliss Support Ticket</label>
                  <Select value={linkTicket} onValueChange={setLinkTicket}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Select Bliss Ticket --</SelectItem>
                      <SelectItem value="t-10842">#10842 - Figma Component Review</SelectItem>
                      <SelectItem value="t-10845">#10845 - API Outage Diagnostics</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Automation Toggles */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink2)', cursor: 'pointer' }}>
                    <Checkbox checked={triggerWorkflow} onCheckedChange={c => setTriggerWorkflow(c === true)} />
                    Trigger Studio Workflow
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink2)', cursor: 'pointer' }}>
                    <Checkbox checked={createTaskNote} onCheckedChange={c => setCreateTaskNote(c === true)} />
                    Create Task Note
                  </label>
                </div>
              </div>
            </SectionCard>
            )}

            {/* Action buttons */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="lg" onClick={() => onJoin({ audioEnabled, videoEnabled })}>
                    <Icon name="checkCircle" size={17} />
                    Join Meeting Now
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="center" side="top" className="w-auto py-1.5 px-2.5 text-xs">
                  Connect audio/video devices and join the live workspace room
                </PopoverContent>
              </Popover>

              <Button variant="outline" onClick={onCancel}>
                Cancel &amp; Return
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

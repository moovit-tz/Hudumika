import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Icon } from '../../components/Icon.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Badge } from '../../components/ui/badge.js';
import { apiFetch } from '../../lib/api.js';
import { usePageSEO } from '../../hooks/usePageSEO.js';
import { showAlert } from '../../lib/alert.js';
import './Sms.css';

interface Contact {
  id: string;
  name: string;
  phone: string;
  group_id?: string;
}

interface ContactGroup {
  id: string;
  name: string;
  memberCount: number;
}

export function SmsVoiceBroadcast() {
  usePageSEO('Voice Broadcast Campaign', 'Broadcast high-fidelity voice announcements, interactive voice alerts, and automated call campaigns.');

  // Voice message state
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'record'>('upload');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Recipients state
  const [manualEntry, setManualEntry] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Load contacts and groups
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/sms/groups').catch(() => ({ data: [] })),
      apiFetch('/v1/sms/recipients/search?q=').catch(() => ({ data: [] })),
    ])
      .then(([gRes, cRes]) => {
        setGroups(gRes.data || []);
        const rawContacts = (cRes.data || []).map((c: any) => ({
          id: c.id,
          name: c.name || c.phone,
          phone: c.phone,
          group_id: c.group_id,
        }));
        setContacts(rawContacts);
      })
      .finally(() => setLoading(false));
  }, []);

  // Audio file drag & drop
  const [dragOver, setDragOver] = useState(false);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      setAudioUrl(URL.createObjectURL(file));
    }
  };

  // Recording handler
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setRecordedBlob(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      showAlert('Microphone access denied: ' + (err.message || 'Cannot access audio device'));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // Parse manual numbers
  const manualNumbers = manualEntry
    .split(/[\n, ]+/)
    .map((n) => n.trim())
    .filter((n) => n.length >= 7);

  // Filtered contacts
  const filteredContacts = contacts.filter((c) => {
    const matchesGroup = selectedGroupId === 'all' || c.group_id === selectedGroupId;
    const matchesSearch =
      !contactSearch.trim() ||
      c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.phone.includes(contactSearch);
    return matchesGroup && matchesSearch;
  });

  const toggleContact = (id: string) => {
    const next = new Set(selectedContactIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedContactIds(next);
  };

  const selectAllVisible = () => {
    const next = new Set(selectedContactIds);
    const allSelected = filteredContacts.every((c) => next.has(c.id));
    if (allSelected) {
      filteredContacts.forEach((c) => next.delete(c.id));
    } else {
      filteredContacts.forEach((c) => next.add(c.id));
    }
    setSelectedContactIds(next);
  };

  const totalRecipientsCount = manualNumbers.length + selectedContactIds.size;
  const hasAudio = !!audioUrl;

  const handleLaunchBroadcast = async () => {
    if (!hasAudio) {
      showAlert('Please provide a voice message recording or audio file.');
      return;
    }
    if (totalRecipientsCount === 0) {
      showAlert('Please specify at least one recipient for this broadcast.');
      return;
    }

    showAlert('Voice delivery is unavailable: no voice provider is connected. Your recording was not sent.');
  };

  return (
    <div className="sms-container">
      <PageHeader
        crumbs={[{ label: 'SMS & Messaging', to: '/sms' }, 'Voice Broadcast']}
        titlePlain="Voice"
        titleEm="Broadcast"
        subtitle="Compose at your pace, then validate when it feels right."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button
              variant="outline"
              disabled={!hasAudio || totalRecipientsCount === 0}
              onClick={() => showAlert('Automated audio and recipient validation is not available yet.')}
            >
              <Icon name="checkCircle" size={14} /> Validate
            </Button>
            <Button
              disabled={!hasAudio || totalRecipientsCount === 0 || sending}
              onClick={handleLaunchBroadcast}
            >
              <Icon name="phone" size={14} /> {sending ? 'Dispatching…' : 'Launch Broadcast'}
            </Button>
          </div>
        }
      />

      <div role="status" style={{ padding: '12px 16px', marginBottom: 16, border: '1px solid var(--amber, #f59e0b)', borderRadius: 'var(--r)', background: 'var(--amber-l, #fffbeb)', color: 'var(--ink)' }}>
        Voice calls are unavailable because no voice provider is connected. Recordings are for local preview only and will not be sent.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 1fr)', gap: 24 }}>
        {/* Left Column: 01 Voice Message */}
        <SectionCard
          title="01 Voice message"
          action={
            <Badge variant={hasAudio ? 'brand' : 'gray'}>
              {hasAudio ? (audioFile ? `${(audioFile.size / 1024 / 1024).toFixed(1)} MB` : 'Audio Ready') : 'None yet'}
            </Badge>
          }
          collapsible={false}
        >
          {/* Audio Input Method Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={`sms-filter-pill ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
              data-ui-native-button=""
            >
              <Icon name="upload" size={13} style={{ marginRight: 6 }} /> Upload
            </button>
            <button
              type="button"
              className={`sms-filter-pill ${activeTab === 'url' ? 'active' : ''}`}
              onClick={() => setActiveTab('url')}
              data-ui-native-button=""
            >
              <Icon name="link" size={13} style={{ marginRight: 6 }} /> URL
            </button>
            <button
              type="button"
              className={`sms-filter-pill ${activeTab === 'record' ? 'active' : ''}`}
              onClick={() => setActiveTab('record')}
              data-ui-native-button=""
            >
              <Icon name="mic" size={13} style={{ marginRight: 6 }} /> Record
            </button>
          </div>

          {/* Upload Area */}
          {activeTab === 'upload' && (
            <div>
              <div
                className={`sms-dropzone ${dragOver ? 'dragover' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById('voice-audio-file')?.click()}
              >
                <div className="sms-dropzone-icon">
                  <Icon name="mic" size={24} />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                    Drop your audio file or click to browse
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                    MP3, WAV, OGG, M4A, up to 50 MB
                  </div>
                </div>
                <input
                  type="file"
                  id="voice-audio-file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={handleFileInput}
                />
              </div>

              {audioFile && (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Icon name="checkCircle" size={16} color="var(--teal)" />
                      <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{audioFile.name}</strong>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setAudioFile(null); setAudioUrl(''); }}>
                      <Icon name="trash2" size={13} /> Remove
                    </Button>
                  </div>
                  {audioUrl && <audio controls src={audioUrl} style={{ width: '100%', height: 36 }} />}
                </div>
              )}
            </div>
          )}

          {/* URL Input */}
          {activeTab === 'url' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://storage.hudumika.com/broadcasts/announcement.mp3"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (urlInput.trim()) {
                      setAudioUrl(urlInput.trim());
                      showAlert('Audio loaded from URL.');
                    }
                  }}
                >
                  Load
                </Button>
              </div>
              {audioUrl && (
                <div style={{ padding: 12, borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <audio controls src={audioUrl} style={{ width: '100%', height: 36 }} />
                </div>
              )}
            </div>
          )}

          {/* Record In-Browser */}
          {activeTab === 'record' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: 16 }}>
              {!isRecording ? (
                <Button variant="default" onClick={startRecording}>
                  <Icon name="mic" size={15} /> Start Recording
                </Button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontWeight: 700, fontSize: 14 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1s infinite' }} />
                    Recording: {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                  </div>
                  <Button variant="destructive" onClick={stopRecording}>
                    <Icon name="xCircle" size={14} /> Stop Recording
                  </Button>
                </div>
              )}

              {recordedBlob && audioUrl && !isRecording && (
                <div style={{ width: '100%', padding: 12, borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <audio controls src={audioUrl} style={{ width: '100%', height: 36 }} />
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* Right Column: 02 Recipients */}
        <SectionCard
          title="02 Recipients"
          action={<Badge variant="gray">{totalRecipientsCount} selected</Badge>}
          collapsible={false}
        >
          {/* Manual Entry */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: 0.5, marginBottom: 6 }}>
              MANUAL ENTRY
            </label>
            <Textarea
              value={manualEntry}
              onChange={(e) => setManualEntry(e.target.value)}
              placeholder="Enter a phone number, then press Enter, comma or space"
              rows={3}
              style={{ fontSize: 12.5 }} aria-label="MANUAL ENTRY" />
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
              Tip: paste a list separated by commas, spaces, or newlines
            </div>
          </div>

          <div style={{ textAlign: 'center', margin: '14px 0', fontSize: 11, color: 'var(--ink3)', position: 'relative' }}>
            <span style={{ background: 'var(--white)', padding: '0 8px', position: 'relative', zIndex: 1 }}>
              — or from contacts —
            </span>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Contact List */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: 0.5 }}>
                CONTACT LIST
              </label>
              <button
                type="button"
                onClick={selectAllVisible}
                style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
                data-ui-native-button=""
              >
                Select visible
              </button>
            </div>

            {/* Group Pills */}
            <div className="sms-filter-pills" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={`sms-filter-pill ${selectedGroupId === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedGroupId('all')}
                data-ui-native-button=""
              >
                All ({contacts.length})
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`sms-filter-pill ${selectedGroupId === g.id ? 'active' : ''}`}
                  onClick={() => setSelectedGroupId(g.id)}
                  data-ui-native-button=""
                >
                  {g.name} ({g.memberCount})
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ marginBottom: 10 }}>
              <Input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search contacts…"
                style={{ fontSize: 12.5 }}
              />
            </div>

            {/* Contacts Container */}
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 6 }}>
              {filteredContacts.map((c) => (
                <div
                  key={c.id}
                  onClick={() => toggleContact(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 'var(--r-sm)',
                    background: selectedContactIds.has(c.id) ? 'var(--teal-l)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 12.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedContactIds.has(c.id)}
                    onChange={() => {}}
                    style={{ accentColor: 'var(--teal)', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{c.phone}</div>
                  </div>
                </div>
              ))}
              {filteredContacts.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--ink3)' }}>
                  No contacts found in this group.
                </div>
              )}
            </div>

            {/* Footer Summary */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ color: 'var(--ink3)' }}>
                {selectedContactIds.size} / {filteredContacts.length} loaded
              </span>
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                Total: <span style={{ color: 'var(--teal)' }}>{totalRecipientsCount}</span> numbers
              </span>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

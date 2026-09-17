import React, { useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { Badge } from './ui/badge.js';

interface CMSTranslationModalProps {
  open: boolean;
  onClose: () => void;
  resourceType: 'page' | 'post' | 'entry';
  resourceId: string;
  resourceTitle: string;
  currentLocale?: string;
  translationGroupId?: string;
  onTranslated?: (newId: string, locale: string) => void;
}

const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'sw', name: 'Swahili (Kiswahili)', flag: '🇹🇿' },
  { code: 'fr', name: 'French (Français)', flag: '🇫🇷' },
  { code: 'pt', name: 'Portuguese (Português)', flag: '🇵🇹' },
  { code: 'ar', name: 'Arabic (العربية)', flag: '🇦🇪' },
];

export function CMSTranslationModal({
  open,
  onClose,
  resourceType,
  resourceId,
  resourceTitle,
  currentLocale = 'en',
  translationGroupId,
  onTranslated,
}: CMSTranslationModalProps) {
  const [targetLocale, setTargetLocale] = useState('sw');
  const [translating, setTranslating] = useState(false);
  const [existingTranslations, setExistingTranslations] = useState<any[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);

  useEffect(() => {
    if (open && translationGroupId) {
      setLoadingGroup(true);
      apiFetch<any>(`/v1/cms/translations/${translationGroupId}`)
        .then(res => {
          const items = resourceType === 'page' ? res.pages : resourceType === 'post' ? res.posts : res.entries;
          setExistingTranslations(items ?? []);
        })
        .catch(() => setExistingTranslations([]))
        .finally(() => setLoadingGroup(false));
    }
  }, [open, translationGroupId, resourceType]);

  async function handleTranslate() {
    setTranslating(true);
    try {
      const result: { id: string; locale: string; title: string; status: string } = await apiFetch('/v1/cms/translate', {
        method: 'POST',
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          target_locale: targetLocale,
        }),
      });

      showAlert(`AI translation generated in Draft status for ${SUPPORTED_LOCALES.find(l => l.code === targetLocale)?.name || targetLocale}.`);
      if (onTranslated) {
        onTranslated(result.id, result.locale);
      }
      onClose();
    } catch (err: any) {
      showAlert(`Translation failed: ${err.message}`);
    } finally {
      setTranslating(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 480,
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="globe" size={18} style={{ color: 'var(--teal)' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
              Localization & AI Translation
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
          Translate "{resourceTitle}" into another language using Anthropic AI. All machine translations are saved strictly as <strong>Draft</strong> for editorial human review (§25–26).
        </p>

        {/* Existing Language Versions */}
        {existingTranslations.length > 0 && (
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-muted)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
              LINKED LANGUAGE EDITIONS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {existingTranslations.map(item => {
                const locInfo = SUPPORTED_LOCALES.find(l => l.code === item.locale);
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      background: 'var(--surface)',
                      borderRadius: 6,
                      border: item.id === resourceId ? '1px solid var(--teal)' : '1px solid var(--border)',
                      fontSize: 12,
                    }}
                  >
                    <span>{locInfo?.flag || '🌐'}</span>
                    <span style={{ fontWeight: 600 }}>{locInfo?.name || item.locale}</span>
                    <Badge variant={item.status === 'published' ? 'success' : 'secondary'}>{item.status}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Target Language Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Select Target Language
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {SUPPORTED_LOCALES.filter(l => l.code !== currentLocale).map(l => (
              <button
                key={l.code}
                type="button"
                onClick={() => setTargetLocale(l.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: targetLocale === l.code ? '2px solid var(--teal)' : '1px solid var(--border)',
                  background: targetLocale === l.code ? 'var(--teal-l)' : 'var(--bg)',
                  color: targetLocale === l.code ? 'var(--teal)' : 'var(--text)',
                  fontWeight: targetLocale === l.code ? 600 : 500,
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 16 }}>{l.flag}</span>
                <span>{l.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleTranslate}
            disabled={translating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--teal)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: translating ? 0.7 : 1,
            }}
          >
            <Icon name="sparkle" size={14} />
            {translating ? 'Generating Draft Translation...' : 'Translate with AI (Draft)'}
          </button>
        </div>
      </div>
    </div>
  );
}

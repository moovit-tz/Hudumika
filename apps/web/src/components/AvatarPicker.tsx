import React, { useEffect, useRef, useState } from 'react';
import { PersonAvatar } from './PersonAvatar.js';
import { setAvatar, clearAvatar, squareAvatarDataUrl, avatarObjectUrl } from '../lib/identity.js';
import type { SubjectKind } from '../lib/identity.js';
import { Icon } from './Icon.js';

/**
 * Set the picture for anything the identity service knows about.
 *
 * Setting a picture existed in exactly one place — NexusHR's staff profile —
 * and it wrote through an HR-specific endpoint. Everywhere else in the
 * platform a face or a mark was initials with no way to change it: a customer
 * in CRM, a lead, a chain partner, a contact, a driver in HuduFreight, a
 * supplier in Finance.
 *
 * This is the control for all of them. It renders the subject through the same
 * PersonAvatar every read-only surface uses, so the editable one and the rest
 * cannot drift apart, and overlays a camera button. The file is downscaled by
 * the same shared helper the staff profile uses, so no caller can invent its
 * own idea of what a picture is.
 *
 * `canEdit` false renders the avatar alone, with no control and no file input,
 * rather than a disabled button.
 */
export function AvatarPicker({
  id, kind, name, size = 72, shape, ring = false, canEdit = true, onChange,
}: {
  id: string;
  kind: SubjectKind;
  name: string;
  size?: number;
  /** Defaults to a circle for people, a rounded square for organisations. */
  shape?: 'circle' | 'square';
  /** A white frame + shadow drawn on the avatar itself (e.g. sitting on a
   *  cover photo), not a wrapping div — a wrapper can't stay concentric with
   *  the avatar's own clip once the "Remove" label/error text sits beside it
   *  in the same flex column, so the frame goes directly on the element that
   *  is already clipped to `shape`. */
  ring?: boolean;
  canEdit?: boolean;
  /** Fired after the picture is saved or removed, for a caller that keeps its own copy. */
  onChange?: (dataUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on every save so the avatar remounts and re-reads the cache, which
  // forgetAvatar has just cleared.
  const [rev, setRev] = useState(0);
  // Whether there is anything to remove. Without this the Remove control shows
  // against a subject drawing initials, where pressing it does nothing at all.
  const [hasPicture, setHasPicture] = useState(false);

  useEffect(() => {
    let alive = true;
    avatarObjectUrl(id, kind).then(u => { if (alive) setHasPicture(!!u); });
    return () => { alive = false; };
  }, [id, kind, rev]);

  const isOrg = kind === 'customers' || kind === 'leads' || kind === 'suppliers';
  const effectiveShape = shape ?? (isOrg ? 'square' : 'circle');

  async function choose(file: File) {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await squareAvatarDataUrl(file);
      await setAvatar(id, kind, dataUrl);
      setRev(r => r + 1);
      onChange?.(dataUrl);
    } catch (e: any) {
      // Shown in place rather than thrown away — a picture that silently fails
      // to save looks identical to one that saved and did not refresh.
      setError(e?.message || 'That picture could not be saved.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await clearAvatar(id, kind);
      setRev(r => r + 1);
      onChange?.(null);
    } catch (e: any) {
      setError(e?.message || 'That picture could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  // PersonAvatar for organisations too, not CompanyAvatar: CompanyAvatar takes
  // an already-resolved URL, and the whole point here is to read the picture
  // from the identity endpoint like every other subject. The only difference an
  // organisation gets is the corner radius.
  const avatarStyle: React.CSSProperties | undefined = {
    ...(effectiveShape === 'square' ? { borderRadius: Math.max(4, Math.round(size * 0.22)) } : {}),
    ...(ring ? { border: '4px solid #fff', boxShadow: 'var(--elev)', boxSizing: 'border-box' } : {}),
  };
  const avatar = (
    <PersonAvatar
      key={rev} userId={id} kind={kind} name={name} size={size}
      style={Object.keys(avatarStyle).length > 0 ? avatarStyle : undefined}
    />
  );

  if (!canEdit) return avatar;

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        {avatar}
        <button
          type="button"
          title={busy ? 'Saving…' : 'Set picture'}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            position: 'absolute', right: -2, bottom: -2,
            width: Math.max(22, Math.round(size * 0.32)),
            height: Math.max(22, Math.round(size * 0.32)),
            borderRadius: '50%',
            border: '2px solid var(--white)',
            background: busy ? 'var(--ink3)' : 'var(--teal)',
            color: '#fff', cursor: busy ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, lineHeight: 1,
          }}
        >
          <Icon name="camera" size={Math.max(11, Math.round(size * 0.16))} color="#fff" />
        </button>
        <input
          ref={inputRef} type="file" accept="image/*" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) choose(f); }}
        />
      </div>

      {hasPicture && (
        <button type="button" onClick={remove} disabled={busy}
          style={{ background: 'none', border: 'none', padding: 0, cursor: busy ? 'wait' : 'pointer',
                   color: 'var(--ink3)', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font)' }}>
          Remove
        </button>
      )}

      {error && (
        <span style={{ color: 'var(--red)', fontSize: 11.5, maxWidth: 220 }}>{error}</span>
      )}
    </div>
  );
}

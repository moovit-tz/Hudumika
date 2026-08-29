"use client";

import { useState, useEffect } from "react";
import { GlassPanel } from "@/components/OneUI";
import { apiFetch } from "@/lib/api";
import { Sk } from "@/components/Skeleton";
import {
  getCachedVaultSession,
  setCachedVaultSession,
  clearCachedVaultSession,
} from "@/lib/vaultSession";
import {
  deriveKey,
  encryptCanary,
  verifyCanary,
  encryptPayload,
  decryptPayload,
  generateSalt,
  generateVaultKeypair,
  exportVaultPublicKey,
  importVaultPublicKey,
  wrapVaultPrivateKey,
  unwrapVaultPrivateKey,
  generateItemDEK,
  wrapDEKForOwner,
  unwrapDEKForOwner,
  wrapDEKForRecipient,
  unwrapSharedDEK,
} from "@hudumika/ondi-vault-crypto";
import {
  KeyRound,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
  Globe,
  StickyNote,
  CreditCard,
  X,
  Check,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  Share2,
  Users,
  UserPlus,
} from "lucide-react";

type Step = "loading" | "needsSetup" | "needsUnlock" | "unlocked";
type ItemType = "LOGIN" | "NOTE" | "CARD";
type SharePermission = "VIEW" | "EDIT";

interface VaultItem {
  id: string;
  type: ItemType;
  encryptedBlob: string;
  iv: string;
  wrappedDEK: string | null;
  wrappedDEKIv: string | null;
  updatedAt: string;
}

interface DecryptedItem {
  id: string;
  type: ItemType;
  updatedAt: string;
  data: Record<string, string>;
  /** The item's own DEK, already unwrapped. Extractable (re-shareable) only for owned items. */
  dek: CryptoKey | null;
  isShared: boolean;
  permission?: SharePermission;
  shareId?: string;
  ownerOndi?: string;
}

interface ItemShare {
  shareId: string;
  sharedWithId: string;
  sharedWithOndi: string;
  permission: SharePermission;
  createdAt: string;
}

const TYPE_META: Record<
  ItemType,
  {
    label: string;
    icon: typeof Globe;
    fields: { key: string; label: string; secret?: boolean }[];
  }
> = {
  LOGIN: {
    label: "Login",
    icon: Globe,
    fields: [
      { key: "title", label: "Name" },
      { key: "username", label: "Username / Email" },
      { key: "password", label: "Password", secret: true },
      { key: "url", label: "Website" },
    ],
  },
  NOTE: {
    label: "Secure note",
    icon: StickyNote,
    fields: [
      { key: "title", label: "Title" },
      { key: "body", label: "Note", secret: true },
    ],
  },
  CARD: {
    label: "Card",
    icon: CreditCard,
    fields: [
      { key: "title", label: "Name" },
      { key: "cardholder", label: "Cardholder" },
      { key: "number", label: "Card number", secret: true },
      { key: "expiry", label: "Expiry (MM/YY)" },
      { key: "cvv", label: "CVV", secret: true },
    ],
  },
};

export function PasswordVaultPanel() {
  const [step, setStep] = useState<Step>("loading");
  const [config, setConfig] = useState<{
    salt: string;
    kdfIterations: number;
    canaryCiphertext: string;
    canaryIv: string;
    wrappedPrivateKey: string | null;
    wrappedPrivateKeyIv: string | null;
  } | null>(null);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [sharedItems, setSharedItems] = useState<DecryptedItem[]>([]);

  const [passphrase, setPassphrase] = useState("");
  const [passphraseConfirm, setPassphraseConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<{
    id: string | null;
    type: ItemType;
    data: Record<string, string>;
    readOnly?: boolean;
  } | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [revealField, setRevealField] = useState<string | null>(null);

  const [resetting, setResetting] = useState(false);
  const [resetChallengeId, setResetChallengeId] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const [sharingItemId, setSharingItemId] = useState<string | null>(null);
  const [shareOndi, setShareOndi] = useState("");
  const [sharePermission, setSharePermission] =
    useState<SharePermission>("VIEW");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");

  const [managingItemId, setManagingItemId] = useState<string | null>(null);
  const [itemShares, setItemShares] = useState<ItemShare[]>([]);
  const [managingLoading, setManagingLoading] = useState(false);
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/vault/config")
      .then(async (res) => {
        if (!res.configured) {
          setStep("needsSetup");
          return;
        }
        setConfig(res);

        // Already unlocked earlier this browser session (e.g. switched to
        // the Documents tab and back) — reuse the cached key instead of
        // prompting for the passphrase again.
        const { vaultKey: cachedKey, privateKey: cachedPrivKey } =
          getCachedVaultSession();
        if (cachedKey) {
          setVaultKey(cachedKey);
          setPrivateKey(cachedPrivKey);
          try {
            await decryptAll(cachedKey);
            await loadSharedWithMe(cachedPrivKey);
            setStep("unlocked");
            return;
          } catch {
            clearCachedVaultSession();
          }
        }
        setStep("needsUnlock");
      })
      .catch(() => setStep("needsSetup"));
  }, []);

  async function decryptAll(masterKey: CryptoKey) {
    const res = await apiFetch("/vault/items");
    const decrypted: DecryptedItem[] = [];
    const toMigrate: {
      id: string;
      type: ItemType;
      data: Record<string, string>;
    }[] = [];

    for (const raw of res.items as VaultItem[]) {
      try {
        if (raw.wrappedDEK && raw.wrappedDEKIv) {
          const dek = await unwrapDEKForOwner(
            raw.wrappedDEK,
            raw.wrappedDEKIv,
            masterKey,
          );
          const data = await decryptPayload<Record<string, string>>(
            dek,
            raw.encryptedBlob,
            raw.iv,
          );
          decrypted.push({
            id: raw.id,
            type: raw.type,
            updatedAt: raw.updatedAt,
            data,
            dek,
            isShared: false,
          });
        } else {
          // Pre-sharing item — old format, decrypted directly with the master key.
          // Presence/absence of wrappedDEK is the idempotent migration marker.
          const data = await decryptPayload<Record<string, string>>(
            masterKey,
            raw.encryptedBlob,
            raw.iv,
          );
          decrypted.push({
            id: raw.id,
            type: raw.type,
            updatedAt: raw.updatedAt,
            data,
            dek: null,
            isShared: false,
          });
          toMigrate.push({ id: raw.id, type: raw.type, data });
        }
      } catch {
        // Skip items that fail to decrypt rather than crash the whole vault view.
      }
    }
    setItems(decrypted);

    // Sequential, awaited migration — never concurrent unawaited PATCHes, so a
    // crash mid-migration just leaves the rest for next unlock, never a
    // half-migrated row.
    for (const item of toMigrate) {
      try {
        const dek = await generateItemDEK();
        const { ciphertext, iv } = await encryptPayload(dek, item.data);
        const { wrappedDEK, wrappedDEKIv } = await wrapDEKForOwner(
          dek,
          masterKey,
        );
        await apiFetch(`/vault/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            encryptedBlob: ciphertext,
            iv,
            wrappedDEK,
            wrappedDEKIv,
          }),
        });
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, dek } : it)),
        );
      } catch {
        // Leave unmigrated — next unlock will retry.
      }
    }
  }

  async function loadSharedWithMe(privKey: CryptoKey | null) {
    if (!privKey) return setSharedItems([]);
    try {
      const res = await apiFetch("/vault/shared-with-me");
      const decrypted: DecryptedItem[] = [];
      for (const s of res.shares) {
        try {
          const dek = await unwrapSharedDEK(
            s.wrappedDEK,
            privKey,
            s.permission,
          );
          const data = await decryptPayload<Record<string, string>>(
            dek,
            s.encryptedBlob,
            s.iv,
          );
          decrypted.push({
            id: s.itemId,
            type: s.type,
            updatedAt: s.updatedAt,
            data,
            dek,
            isShared: true,
            permission: s.permission,
            shareId: s.shareId,
          });
        } catch {
          // Most commonly: the owner reset their vault (new keypair) since
          // this share was made, so the old wrapped DEK no longer decrypts.
        }
      }
      setSharedItems(decrypted);
    } catch {
      setSharedItems([]);
    }
  }

  async function ensureKeypair(masterKey: CryptoKey): Promise<CryptoKey> {
    if (config?.wrappedPrivateKey && config?.wrappedPrivateKeyIv) {
      return unwrapVaultPrivateKey(
        config.wrappedPrivateKey,
        config.wrappedPrivateKeyIv,
        masterKey,
      );
    }
    // Lazy keypair backfill — this vault predates sharing.
    const keypair = await generateVaultKeypair();
    const publicKeyJwk = await exportVaultPublicKey(keypair.publicKey);
    const wrapped = await wrapVaultPrivateKey(keypair.privateKey, masterKey);
    await apiFetch("/vault/config", {
      method: "PATCH",
      body: JSON.stringify({
        publicKeyJwk,
        wrappedPrivateKey: wrapped.wrappedPrivateKey,
        wrappedPrivateKeyIv: wrapped.wrappedPrivateKeyIv,
      }),
    });
    return keypair.privateKey;
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (passphrase.length < 8)
      return setError("Passphrase must be at least 8 characters.");
    if (passphrase !== passphraseConfirm)
      return setError("Passphrases do not match.");

    setBusy(true);
    try {
      const salt = generateSalt();
      const iterations = 600000;
      const key = await deriveKey(passphrase, salt, iterations);
      const { ciphertext, iv } = await encryptCanary(key);

      const keypair = await generateVaultKeypair();
      const publicKeyJwk = await exportVaultPublicKey(keypair.publicKey);
      const { wrappedPrivateKey, wrappedPrivateKeyIv } =
        await wrapVaultPrivateKey(keypair.privateKey, key);

      await apiFetch("/vault/config", {
        method: "POST",
        body: JSON.stringify({
          salt,
          canaryCiphertext: ciphertext,
          canaryIv: iv,
          publicKeyJwk,
          wrappedPrivateKey,
          wrappedPrivateKeyIv,
        }),
      });

      // Without this, locking and unlocking again in the same session (no
      // page reload) would silently no-op — handleUnlock bails out on a null
      // config, and this was the only place that ever should have set it.
      setConfig({
        salt,
        kdfIterations: iterations,
        canaryCiphertext: ciphertext,
        canaryIv: iv,
        wrappedPrivateKey,
        wrappedPrivateKeyIv,
      });

      setVaultKey(key);
      setPrivateKey(keypair.privateKey);
      setCachedVaultSession(key, keypair.privateKey);
      setItems([]);
      setSharedItems([]);
      setPassphrase("");
      setPassphraseConfirm("");
      setStep("unlocked");
    } catch {
      setError("Could not set up the vault. Please try again.");
    }
    setBusy(false);
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!config) return;

    setBusy(true);
    try {
      const key = await deriveKey(
        passphrase,
        config.salt,
        config.kdfIterations,
      );
      const ok = await verifyCanary(
        key,
        config.canaryCiphertext,
        config.canaryIv,
      );
      if (!ok) {
        setError("Incorrect passphrase.");
        setBusy(false);
        return;
      }
      setVaultKey(key);
      const privKey = await ensureKeypair(key);
      setPrivateKey(privKey);
      setCachedVaultSession(key, privKey);
      await decryptAll(key);
      await loadSharedWithMe(privKey);
      setPassphrase("");
      setStep("unlocked");
    } catch {
      setError("Incorrect passphrase.");
    }
    setBusy(false);
  }

  function handleLock() {
    setVaultKey(null);
    setPrivateKey(null);
    clearCachedVaultSession();
    setItems([]);
    setSharedItems([]);
    setEditing(null);
    setStep("needsUnlock");
  }

  function openNewItem(type: ItemType) {
    setEditing({ id: null, type, data: {} });
    setRevealField(null);
  }

  function openEditItem(item: DecryptedItem) {
    setEditing({
      id: item.id,
      type: item.type,
      data: { ...item.data },
      readOnly: item.isShared && item.permission === "VIEW",
    });
    setRevealField(null);
  }

  async function saveItem() {
    if (!editing || !vaultKey) return;
    setSavingItem(true);
    try {
      if (editing.id) {
        const existing = [...items, ...sharedItems].find(
          (i) => i.id === editing.id,
        );
        if (!existing?.dek) throw new Error("missing_dek");
        const { ciphertext, iv } = await encryptPayload(
          existing.dek,
          editing.data,
        );
        await apiFetch(`/vault/items/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ encryptedBlob: ciphertext, iv }),
        });
        if (existing.isShared) await loadSharedWithMe(privateKey);
        else await decryptAll(vaultKey);
      } else {
        const dek = await generateItemDEK();
        const { ciphertext, iv } = await encryptPayload(dek, editing.data);
        const { wrappedDEK, wrappedDEKIv } = await wrapDEKForOwner(
          dek,
          vaultKey,
        );
        await apiFetch("/vault/items", {
          method: "POST",
          body: JSON.stringify({
            type: editing.type,
            encryptedBlob: ciphertext,
            iv,
            wrappedDEK,
            wrappedDEKIv,
          }),
        });
        await decryptAll(vaultKey);
      }
      setEditing(null);
    } catch {
      // Leave the editor open with its data intact so nothing is lost on failure.
    }
    setSavingItem(false);
  }

  async function deleteItem(id: string) {
    if (!vaultKey) return;
    try {
      await apiFetch(`/vault/items/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {}
  }

  function openShareModal(itemId: string) {
    setSharingItemId(itemId);
    setShareOndi("");
    setSharePermission("VIEW");
    setShareError("");
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!sharingItemId) return;
    setShareError("");
    setShareBusy(true);
    try {
      const item = items.find((i) => i.id === sharingItemId);
      if (!item?.dek) throw new Error("item_not_migrated");

      const lookup = await apiFetch(
        `/vault/users/lookup?ondi=${encodeURIComponent(shareOndi.trim())}`,
      );
      const recipientPublicKey = await importVaultPublicKey(
        lookup.publicKeyJwk,
      );
      const { wrappedDEK } = await wrapDEKForRecipient(
        item.dek,
        recipientPublicKey,
      );

      await apiFetch(`/vault/items/${sharingItemId}/share`, {
        method: "POST",
        body: JSON.stringify({
          sharedWithId: lookup.id,
          permission: sharePermission,
          wrappedDEK,
        }),
      });

      setSharingItemId(null);
      setShareOndi("");
    } catch (err: any) {
      setShareError(
        err?.message === "user_not_found"
          ? "No Ondi user found with that ID."
          : err?.message === "cannot_share_with_self"
            ? "You can't share an item with yourself."
            : err?.message === "recipient_vault_not_ready"
              ? "That user hasn't set up their Vault yet."
              : err?.message === "item_not_migrated"
                ? "This item is still finishing setup — try again in a moment."
                : "Could not share this item. Try again.",
      );
    }
    setShareBusy(false);
  }

  async function openManageShares(itemId: string) {
    setManagingItemId(itemId);
    setManagingLoading(true);
    try {
      const res = await apiFetch(`/vault/items/${itemId}/shares`);
      setItemShares(res.shares ?? []);
    } catch {
      setItemShares([]);
    }
    setManagingLoading(false);
  }

  async function handleRevokeShare(shareId: string) {
    if (!managingItemId || !vaultKey) return;
    setRevokingShareId(shareId);
    try {
      const res = await apiFetch(`/vault/shares/${shareId}`, {
        method: "DELETE",
      });
      if (res.rotationRequired) {
        const item = items.find((i) => i.id === managingItemId);
        if (item?.dek) {
          const freshDek = await generateItemDEK();
          const { ciphertext, iv } = await encryptPayload(freshDek, item.data);
          const { wrappedDEK, wrappedDEKIv } = await wrapDEKForOwner(
            freshDek,
            vaultKey,
          );
          const rewrapped = await Promise.all(
            (
              res.remainingShares as { shareId: string; publicKeyJwk: object }[]
            ).map(async (s) => {
              const pub = await importVaultPublicKey(s.publicKeyJwk);
              const wrap = await wrapDEKForRecipient(freshDek, pub);
              return { shareId: s.shareId, wrappedDEK: wrap.wrappedDEK };
            }),
          );
          await apiFetch(`/vault/items/${managingItemId}/rotate-dek`, {
            method: "POST",
            body: JSON.stringify({
              encryptedBlob: ciphertext,
              iv,
              wrappedDEK,
              wrappedDEKIv,
              shares: rewrapped,
            }),
          });
          setItems((prev) =>
            prev.map((i) =>
              i.id === managingItemId ? { ...i, dek: freshDek } : i,
            ),
          );
        }
      }
      setItemShares((prev) => prev.filter((s) => s.shareId !== shareId));
    } catch {}
    setRevokingShareId(null);
  }

  async function startReset() {
    setResetError("");
    setResetBusy(true);
    try {
      const me = await apiFetch("/auth/me");
      const challenge = await apiFetch("/auth/step-up/challenge", {
        method: "POST",
        body: JSON.stringify({ userId: me.id, type: "totp" }),
      });
      setResetChallengeId(challenge.challengeId);
    } catch {
      setResetError("Could not start verification. Try again.");
    }
    setResetBusy(false);
  }

  async function confirmReset() {
    if (!resetChallengeId) return;
    setResetBusy(true);
    setResetError("");
    try {
      await apiFetch("/auth/step-up/verify", {
        method: "POST",
        body: JSON.stringify({
          challengeId: resetChallengeId,
          code: resetCode,
        }),
      });
      await apiFetch("/vault/config", { method: "DELETE" });
      setResetting(false);
      setResetChallengeId(null);
      setResetCode("");
      setVaultKey(null);
      setPrivateKey(null);
      setItems([]);
      setSharedItems([]);
      setConfig(null);
      setStep("needsSetup");
    } catch {
      setResetError("Incorrect code. Try again.");
    }
    setResetBusy(false);
  }

  function renderItemCard(
    item: DecryptedItem,
    opts: { shared?: boolean } = {},
  ) {
    const meta = TYPE_META[item.type];
    const Icon = meta.icon;
    const canEdit = !opts.shared || item.permission === "EDIT";
    return (
      <GlassPanel
        key={item.id}
        className="p-5 bg-white border-slate-100 rounded-lg"
      >
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-[#4253D1]/10 flex items-center justify-center shrink-0">
            <Icon size={20} className="text-[#4253D1]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-[#001633] text-sm tracking-tight truncate">
                {item.data.title || meta.label}
              </p>
              {opts.shared && (
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    item.permission === "EDIT"
                      ? "bg-blue-50 text-[#4253D1]"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {item.permission}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {item.type === "LOGIN" && (item.data.username || "—")}
              {item.type === "NOTE" && "Secure note"}
              {item.type === "CARD" &&
                (item.data.number ? `•••• ${item.data.number.slice(-4)}` : "—")}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => openEditItem(item)}
              className="p-2 rounded-full text-slate-400 hover:text-[#4253D1] hover:bg-blue-50 transition-all"
              title={canEdit ? "Edit" : "View"}
            >
              {canEdit ? <Pencil size={14} /> : <Eye size={14} />}
            </button>
            {!opts.shared && (
              <>
                <button
                  onClick={() => openShareModal(item.id)}
                  className="p-2 rounded-full text-slate-400 hover:text-[#4253D1] hover:bg-blue-50 transition-all"
                  title="Share"
                >
                  <Share2 size={14} />
                </button>
                <button
                  onClick={() => openManageShares(item.id)}
                  className="p-2 rounded-full text-slate-400 hover:text-[#4253D1] hover:bg-blue-50 transition-all"
                  title="Manage shares"
                >
                  <Users size={14} />
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-10">
      <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
        Store logins, cards and secure notes, encrypted end-to-end with a
        passphrase only you know. Ondi never has access to your Vault
        Passphrase and cannot read what's stored here. Share individual items
        with another Ondi user without ever giving up zero-knowledge — Ondi
        still can't read the content.
      </p>

      {step === "loading" && (
        <div className="p-8 lg:p-10 bg-white border border-slate-100 rounded-lg max-w-lg space-y-6">
          <Sk className="w-12 h-12 rounded-lg" />
          <div className="space-y-2">
            <Sk className="h-5 w-40" />
            <Sk className="h-3 w-64" />
            <Sk className="h-3 w-52" />
          </div>
          <Sk className="h-11 w-full rounded-lg" />
        </div>
      )}

      {step === "needsSetup" && (
        <GlassPanel className="p-8 lg:p-10 bg-white border-slate-100 rounded-lg max-w-lg">
          <div className="w-12 h-12 rounded-lg bg-[#4253D1]/10 flex items-center justify-center mb-6">
            <Lock size={22} className="text-[#4253D1]" />
          </div>
          <h2 className="font-bold text-[#001633] text-xl tracking-tight mb-2">
            Set up your Vault
          </h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            Choose a Vault Passphrase. It's separate from your Ondi sign-in and
            is never sent to our servers —
            <span className="font-semibold text-[#001633]">
              {" "}
              there is no way to recover it if you forget it.
            </span>{" "}
            Losing it means resetting the Vault and losing everything stored
            inside.
          </p>
          <form onSubmit={handleSetup} className="space-y-4">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Vault passphrase"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
              autoFocus
            />
            <input
              type="password"
              value={passphraseConfirm}
              onChange={(e) => setPassphraseConfirm(e.target.value)}
              placeholder="Confirm passphrase"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
            />
            {error && (
              <p className="text-xs text-red-500 font-medium">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 bg-[#4253D1] text-white text-sm font-bold rounded-md hover:bg-[#001633] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? (
                <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Lock size={14} />
              )}
              Create Vault
            </button>
          </form>
        </GlassPanel>
      )}

      {step === "needsUnlock" && (
        <GlassPanel className="p-8 lg:p-10 bg-white border-slate-100 rounded-lg max-w-lg">
          <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center mb-6">
            <Lock size={22} className="text-slate-400" />
          </div>
          <h2 className="font-bold text-[#001633] text-xl tracking-tight mb-2">
            Unlock your Vault
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Enter your Vault Passphrase to view your stored items.
          </p>
          <form onSubmit={handleUnlock} className="space-y-4">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Vault passphrase"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-500 font-medium">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 bg-[#4253D1] text-white text-sm font-bold rounded-md hover:bg-[#001633] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? (
                <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Unlock size={14} />
              )}
              Unlock
            </button>
          </form>
          <button
            onClick={() => setResetting(true)}
            className="mt-5 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors"
          >
            Forgot your passphrase?
          </button>
        </GlassPanel>
      )}

      {step === "unlocked" && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(Object.keys(TYPE_META) as ItemType[]).map((t) => {
                const Icon = TYPE_META[t].icon;
                return (
                  <button
                    key={t}
                    onClick={() => openNewItem(t)}
                    className="flex items-center gap-2 px-4 py-2 rounded-md border border-slate-200 text-xs font-bold text-[#001633] hover:border-[#4253D1] hover:text-[#4253D1] transition-all"
                  >
                    <Icon size={14} /> Add {TYPE_META[t].label}{" "}
                    <Plus size={12} />
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleLock}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-bold text-slate-500 hover:bg-slate-50 transition-all"
            >
              <Lock size={12} /> Lock Vault
            </button>
          </div>

          {items.length === 0 ? (
            <GlassPanel className="p-10 bg-white border-slate-100 rounded-lg text-center">
              <p className="text-slate-400 text-sm">Your vault is empty</p>
              <p className="text-slate-400 text-xs mt-2">
                Add a login, note or card to get started.
              </p>
            </GlassPanel>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => renderItemCard(item))}
            </div>
          )}

          {sharedItems.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 w-fit">
                <Users size={14} className="text-slate-500" />
                <span className="text-sm font-bold text-slate-500">
                  Shared With You
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sharedItems.map((item) =>
                  renderItemCard(item, { shared: true }),
                )}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={() => setResetting(true)}
              className="text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw size={12} /> Reset Vault
            </button>
          </div>
        </div>
      )}

      {/* ─── Item editor modal ─── */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg w-full max-w-md relative overflow-visible">
            <button
              onClick={() => setEditing(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50 transition-all"
            >
              <X size={16} />
            </button>
            <h3 className="font-bold text-[#001633] text-lg tracking-tight mb-6">
              {editing.readOnly ? "View" : editing.id ? "Edit" : "New"}{" "}
              {TYPE_META[editing.type].label}
            </h3>
            <div className="space-y-4">
              {TYPE_META[editing.type].fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">
                    {f.label}
                  </label>
                  <div className="relative">
                    <input
                      type={
                        f.secret && revealField !== f.key ? "password" : "text"
                      }
                      value={editing.data[f.key] ?? ""}
                      disabled={editing.readOnly}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? {
                                ...prev,
                                data: { ...prev.data, [f.key]: e.target.value },
                              }
                            : prev,
                        )
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30 pr-10 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    {f.secret && (
                      <button
                        type="button"
                        onClick={() =>
                          setRevealField(revealField === f.key ? null : f.key)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#4253D1]"
                      >
                        {revealField === f.key ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!editing.readOnly && (
              <button
                onClick={saveItem}
                disabled={savingItem}
                className="w-full mt-7 py-3 bg-[#4253D1] text-white text-sm font-bold rounded-md hover:bg-[#001633] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingItem ? (
                  <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Save
              </button>
            )}
          </GlassPanel>
        </div>
      )}

      {/* ─── Share modal ─── */}
      {sharingItemId && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg w-full max-w-md relative overflow-visible">
            <button
              onClick={() => setSharingItemId(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50 transition-all"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-lg bg-[#4253D1]/10 flex items-center justify-center mb-6">
              <UserPlus size={22} className="text-[#4253D1]" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg tracking-tight mb-2">
              Share Item
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              Enter the recipient's Ondi ID. They'll be able to{" "}
              {sharePermission === "EDIT" ? "view and edit" : "view"} this item
              — updates stay in sync both ways.
            </p>
            <form onSubmit={handleShare} className="space-y-4">
              <input
                type="text"
                value={shareOndi}
                onChange={(e) => setShareOndi(e.target.value)}
                placeholder="Recipient's Ondi ID"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4253D1]/30"
                autoFocus
              />
              <div className="flex gap-2">
                {(["VIEW", "EDIT"] as SharePermission[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSharePermission(p)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      sharePermission === p
                        ? "bg-[#4253D1] text-white border-[#4253D1]"
                        : "border-slate-200 text-slate-500 hover:border-[#4253D1]"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {shareError && (
                <p className="text-xs text-red-500 font-medium">{shareError}</p>
              )}
              <button
                type="submit"
                disabled={shareBusy || !shareOndi.trim()}
                className="w-full py-3 bg-[#4253D1] text-white text-sm font-bold rounded-md hover:bg-[#001633] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {shareBusy ? (
                  <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Share2 size={14} />
                )}
                Share
              </button>
            </form>
          </GlassPanel>
        </div>
      )}

      {/* ─── Manage shares modal ─── */}
      {managingItemId && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg w-full max-w-md relative overflow-visible">
            <button
              onClick={() => setManagingItemId(null)}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50 transition-all"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-lg bg-slate-50 flex items-center justify-center mb-6">
              <Users size={22} className="text-slate-500" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg tracking-tight mb-6">
              Manage Shares
            </h3>

            {managingLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-[#4253D1] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : itemShares.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                Not shared with anyone
              </p>
            ) : (
              <div className="space-y-3">
                {itemShares.map((s) => (
                  <div
                    key={s.shareId}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-bold text-[#001633]">
                        {s.sharedWithOndi}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {s.permission}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeShare(s.shareId)}
                      disabled={revokingShareId === s.shareId}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                    >
                      {revokingShareId === s.shareId ? (
                        <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <X size={12} />
                      )}
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      )}

      {/* ─── Reset vault modal ─── */}
      {resetting && (
        <div className="fixed inset-0 z-50 bg-[#001633]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <GlassPanel className="p-8 bg-white border-slate-100 rounded-lg w-full max-w-md relative overflow-visible">
            <button
              onClick={() => {
                setResetting(false);
                setResetChallengeId(null);
                setResetCode("");
                setResetError("");
              }}
              className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:bg-slate-50 transition-all"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-lg bg-red-50 flex items-center justify-center mb-6">
              <ShieldAlert size={22} className="text-red-500" />
            </div>
            <h3 className="font-bold text-[#001633] text-lg tracking-tight mb-2">
              Reset Vault
            </h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              This permanently deletes every item in your Vault. It cannot be
              undone. To confirm it's really you, verify with your Ondi
              Authenticator.
            </p>

            {!resetChallengeId ? (
              <div className="space-y-4">
                {resetError && (
                  <p className="text-xs text-red-500 font-medium flex items-center gap-1.5">
                    <AlertTriangle size={12} /> {resetError}
                  </p>
                )}
                <button
                  onClick={startReset}
                  disabled={resetBusy}
                  className="w-full py-3 bg-red-500 text-white text-sm font-bold rounded-md hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resetBusy ? (
                    <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  Send Verification Request
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="text"
                  inputMode="numeric"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="Enter code from Ondi Authenticator"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  autoFocus
                />
                {resetError && (
                  <p className="text-xs text-red-500 font-medium">
                    {resetError}
                  </p>
                )}
                <button
                  onClick={confirmReset}
                  disabled={resetBusy || resetCode.length < 6}
                  className="w-full py-3 bg-red-500 text-white text-sm font-bold rounded-md hover:bg-red-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {resetBusy ? (
                    <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Confirm Reset
                </button>
              </div>
            )}
          </GlassPanel>
        </div>
      )}
    </div>
  );
}

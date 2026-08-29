// In-memory-only cache of the unlocked Vault's derived keys. Being logged
// in to Ondi and having the Vault unlocked are deliberately separate — the
// Vault Passphrase (and the key derived from it) never reaches Ondi's
// servers, which is the whole zero-knowledge guarantee the Vault promises.
//
// Without this cache, every unmount of the Vault panel (switching tabs,
// navigating to another dashboard page and back) threw away the derived
// key and forced the passphrase prompt again, even within the same login
// session. This module-level singleton — not React state, not
// localStorage/sessionStorage — lets the unlocked key survive component
// remounts for as long as the tab stays open, exactly like a real password
// manager (e.g. Bitwarden) unlocks once per browser session, not once per
// screen. It is cleared on explicit Lock and on logout, and never persists
// across a page reload or new tab, since it only ever lives in a JS
// variable.
let cachedVaultKey: CryptoKey | null = null;
let cachedPrivateKey: CryptoKey | null = null;

export function getCachedVaultSession(): {
  vaultKey: CryptoKey | null;
  privateKey: CryptoKey | null;
} {
  return { vaultKey: cachedVaultKey, privateKey: cachedPrivateKey };
}

export function setCachedVaultSession(
  vaultKey: CryptoKey | null,
  privateKey: CryptoKey | null,
): void {
  cachedVaultKey = vaultKey;
  cachedPrivateKey = privateKey;
}

export function clearCachedVaultSession(): void {
  cachedVaultKey = null;
  cachedPrivateKey = null;
}

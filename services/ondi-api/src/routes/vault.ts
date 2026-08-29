import { FastifyInstance } from 'fastify';
import { JWT_SECRET, JWT_ISSUER } from '../lib/env.js';

async function extractUserId(req: any, reply: any): Promise<string | null> {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith('Bearer '))
    return reply.code(401).send({ error: 'missing_token' }) && null;
  try {
    const jwt = await import('jsonwebtoken');
    const payload: any = jwt.default.verify(
      authHeader.slice(7),
      JWT_SECRET,
      { issuer: JWT_ISSUER },
    );
    return payload.sub as string;
  } catch {
    reply.code(401).send({ error: 'invalid_token' });
    return null;
  }
}

export async function vaultRoutes(app: FastifyInstance) {

  /**
   * GET /vault/config
   * Returns the caller's vault salt/canary if the vault has been set up, so the
   * client knows whether to show "Set Up Vault" or "Unlock Vault".
   */
  app.get('/config', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const config = await app.prisma.vaultConfig.findUnique({ where: { userId } });
    if (!config) return reply.send({ configured: false });

    const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { vaultPublicKeyJwk: true } });

    return reply.send({
      configured:          true,
      salt:                config.salt,
      kdfIterations:       config.kdfIterations,
      canaryCiphertext:    config.canaryCiphertext,
      canaryIv:            config.canaryIv,
      // Present only once the sharing keypair has been generated (fresh setup
      // or a completed PATCH /config backfill) — null tells the client a
      // lazy migration is still owed on this unlock.
      publicKeyJwk:        user?.vaultPublicKeyJwk ? JSON.parse(user.vaultPublicKeyJwk) : null,
      wrappedPrivateKey:   config.wrappedPrivateKey ?? null,
      wrappedPrivateKeyIv: config.wrappedPrivateKeyIv ?? null,
    });
  });

  /**
   * POST /vault/config
   * One-time vault setup. Body: { salt, canaryCiphertext, canaryIv }
   * All three are opaque to the server — it never sees the passphrase or a
   * decrypted value.
   */
  app.post('/config', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const existing = await app.prisma.vaultConfig.findUnique({ where: { userId } });
    if (existing) return reply.code(409).send({ error: 'vault_already_configured' });

    const {
      salt, canaryCiphertext, canaryIv,
      publicKeyJwk, wrappedPrivateKey, wrappedPrivateKeyIv,
    } = req.body as {
      salt?: string; canaryCiphertext?: string; canaryIv?: string;
      publicKeyJwk?: object; wrappedPrivateKey?: string; wrappedPrivateKeyIv?: string;
    };
    if (!salt || !canaryCiphertext || !canaryIv)
      return reply.code(400).send({ error: 'missing_fields' });

    await app.prisma.vaultConfig.create({
      data: {
        userId, salt, canaryCiphertext, canaryIv,
        ...(wrappedPrivateKey && wrappedPrivateKeyIv ? { wrappedPrivateKey, wrappedPrivateKeyIv } : {}),
      },
    });

    if (publicKeyJwk) {
      await app.prisma.user.update({
        where: { id: userId },
        data: { vaultPublicKeyJwk: JSON.stringify(publicKeyJwk) },
      });
    }

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'VAULT_CONFIGURED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     {},
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.code(201).send({ configured: true });
  });

  /**
   * PATCH /vault/config
   * One-time keypair backfill for a vault that predates sharing support.
   * Only fills wrappedPrivateKey/publicKeyJwk if not already set — safe to
   * call repeatedly, and never overwrites an already-migrated vault.
   */
  app.patch('/config', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const config = await app.prisma.vaultConfig.findUnique({ where: { userId } });
    if (!config) return reply.code(404).send({ error: 'vault_not_configured' });

    const { publicKeyJwk, wrappedPrivateKey, wrappedPrivateKeyIv } = req.body as {
      publicKeyJwk?: object; wrappedPrivateKey?: string; wrappedPrivateKeyIv?: string;
    };
    if (!publicKeyJwk || !wrappedPrivateKey || !wrappedPrivateKeyIv)
      return reply.code(400).send({ error: 'missing_fields' });

    if (!config.wrappedPrivateKey) {
      await app.prisma.vaultConfig.update({
        where: { userId },
        data: { wrappedPrivateKey, wrappedPrivateKeyIv },
      });
    }

    const user = await app.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.vaultPublicKeyJwk) {
      await app.prisma.user.update({
        where: { id: userId },
        data: { vaultPublicKeyJwk: JSON.stringify(publicKeyJwk) },
      });
    }

    return reply.send({ migrated: true });
  });

  /**
   * DELETE /vault/config
   * Destructive reset — the only recovery path when a passphrase is forgotten,
   * since the server has no way to verify or reset it otherwise. Wipes the
   * config and every item.
   */
  app.delete('/config', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    await app.prisma.vaultItem.deleteMany({ where: { userId } });
    await app.prisma.vaultConfig.deleteMany({ where: { userId } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'VAULT_ITEM_DELETED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { reason: 'vault_reset' },
      severity:     'WARNING',
      isRegulatory: false,
    });

    return reply.send({ reset: true });
  });

  /**
   * GET /vault/items
   * Lists this user's items — ciphertext, iv, type and timestamps only.
   */
  app.get('/items', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const items = await app.prisma.vaultItem.findMany({
      where:   { userId },
      orderBy: { updatedAt: 'desc' },
    });

    return reply.send({
      items: items.map(i => ({
        id:            i.id,
        type:          i.type,
        encryptedBlob: i.encryptedBlob,
        iv:            i.iv,
        // null on items that predate sharing — presence IS the per-item
        // migration marker the client checks on unlock.
        wrappedDEK:    i.wrappedDEK ?? null,
        wrappedDEKIv:  i.wrappedDEKIv ?? null,
        createdAt:     i.createdAt,
        updatedAt:     i.updatedAt,
      })),
    });
  });

  /**
   * POST /vault/items
   * Body: { type, encryptedBlob, iv, wrappedDEK?, wrappedDEKIv? } — the DEK
   * fields are optional only for backward compatibility with a client that
   * hasn't migrated to per-item keys yet; every current client sends them so
   * new items are shareable from the moment they're created.
   */
  app.post('/items', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { type, encryptedBlob, iv, wrappedDEK, wrappedDEKIv } = req.body as {
      type?: string; encryptedBlob?: string; iv?: string; wrappedDEK?: string; wrappedDEKIv?: string;
    };
    if (!type || !encryptedBlob || !iv)
      return reply.code(400).send({ error: 'missing_fields' });
    if (!['LOGIN', 'NOTE', 'CARD'].includes(type))
      return reply.code(400).send({ error: 'invalid_type' });

    const item = await app.prisma.vaultItem.create({
      data: {
        userId, type: type as any, encryptedBlob, iv,
        ...(wrappedDEK && wrappedDEKIv ? { wrappedDEK, wrappedDEKIv } : {}),
      },
    });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'VAULT_ITEM_CREATED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { itemId: item.id, type },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.code(201).send({ id: item.id });
  });

  /**
   * PATCH /vault/items/:id
   * Body: { encryptedBlob, iv, wrappedDEK?, wrappedDEKIv? } — the client must
   * re-encrypt with a fresh IV on every edit, never reuse the item's previous
   * iv. wrappedDEK/wrappedDEKIv are only ever sent by the owner performing
   * the one-time lazy migration to sharing (all four fields written
   * atomically here); a live EDIT-share recipient never sends them, since the
   * DEK itself doesn't change on an ordinary edit — only the ciphertext does.
   *
   * Three-way authorization, not a boolean:
   *  - no owner match, no VaultShare row at all           -> 404 (anti-enumeration for strangers)
   *  - a live VaultShare exists but is VIEW-only           -> 403 insufficient_permission
   *    (a VIEW recipient already knows the item exists via /shared-with-me,
   *    so this leaks nothing new — but 404 here would misdirect them into
   *    thinking the item vanished)
   *  - owner, or a live EDIT share                         -> proceed
   */
  app.patch('/items/:id', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const { encryptedBlob, iv, wrappedDEK, wrappedDEKIv } = req.body as {
      encryptedBlob?: string; iv?: string; wrappedDEK?: string; wrappedDEKIv?: string;
    };
    if (!encryptedBlob || !iv) return reply.code(400).send({ error: 'missing_fields' });

    const item = await app.prisma.vaultItem.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ error: 'item_not_found' });

    const isOwner = item.userId === userId;
    let share = null as Awaited<ReturnType<typeof app.prisma.vaultShare.findFirst>> | null;
    if (!isOwner) {
      share = await app.prisma.vaultShare.findFirst({
        where: { itemId: id, sharedWithId: userId, revokedAt: null },
      });
      if (!share) return reply.code(404).send({ error: 'item_not_found' });
      if (share.permission !== 'EDIT') return reply.code(403).send({ error: 'insufficient_permission' });
    }

    await app.prisma.vaultItem.update({
      where: { id },
      data: {
        encryptedBlob, iv,
        // Only the owner's own migration PATCH carries these — never blindly
        // trust/overwrite from a share-holder's edit.
        ...(isOwner && wrappedDEK && wrappedDEKIv ? { wrappedDEK, wrappedDEKIv } : {}),
      },
    });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'VAULT_ITEM_UPDATED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { itemId: id, viaShare: !isOwner },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ updated: true });
  });

  /**
   * DELETE /vault/items/:id
   */
  app.delete('/items/:id', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const existing = await app.prisma.vaultItem.findFirst({ where: { id, userId } });
    if (!existing) return reply.code(404).send({ error: 'item_not_found' });

    await app.prisma.vaultItem.delete({ where: { id } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'VAULT_ITEM_DELETED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { itemId: id },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.send({ deleted: true });
  });

  /**
   * GET /vault/users/lookup?ondi=...
   * Resolves a potential recipient's id + public sharing key by their public
   * Ondi ID only — never by phone number, which would make this a
   * phone-enumeration oracle. `ondi` is already the dedicated non-PII public
   * handle for exactly this kind of lookup.
   */
  app.get('/users/lookup', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { ondi } = req.query as { ondi?: string };
    if (!ondi) return reply.code(400).send({ error: 'ondi_required' });

    const user = await app.prisma.user.findUnique({
      where: { ondi },
      select: { id: true, ondi: true, vaultPublicKeyJwk: true },
    });
    if (!user) return reply.code(404).send({ error: 'user_not_found' });
    if (user.id === userId) return reply.code(400).send({ error: 'cannot_share_with_self' });
    if (!user.vaultPublicKeyJwk) return reply.code(409).send({ error: 'recipient_vault_not_ready' });

    return reply.send({
      id: user.id,
      ondi: user.ondi,
      publicKeyJwk: JSON.parse(user.vaultPublicKeyJwk),
    });
  });

  /**
   * POST /vault/items/:id/share
   * Body: { sharedWithId, permission, wrappedDEK } — wrappedDEK is wrapped
   * client-side by the owner (RSA-OAEP, recipient's public key) before this
   * ever reaches the server. Re-sharing with the same recipient updates the
   * existing live share (new permission/wrappedDEK) rather than creating a
   * duplicate row.
   */
  app.post('/items/:id/share', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const { sharedWithId, permission, wrappedDEK } = req.body as {
      sharedWithId?: string; permission?: string; wrappedDEK?: string;
    };
    if (!sharedWithId || !permission || !wrappedDEK)
      return reply.code(400).send({ error: 'missing_fields' });
    if (!['VIEW', 'EDIT'].includes(permission))
      return reply.code(400).send({ error: 'invalid_permission' });
    if (sharedWithId === userId)
      return reply.code(400).send({ error: 'cannot_share_with_self' });

    const item = await app.prisma.vaultItem.findFirst({ where: { id, userId } });
    if (!item) return reply.code(404).send({ error: 'item_not_found' });
    if (!item.wrappedDEK)
      return reply.code(409).send({ error: 'item_not_migrated' });

    const recipient = await app.prisma.user.findUnique({ where: { id: sharedWithId } });
    if (!recipient) return reply.code(404).send({ error: 'recipient_not_found' });

    const existingShare = await app.prisma.vaultShare.findFirst({
      where: { itemId: id, sharedWithId, revokedAt: null },
    });

    const share = existingShare
      ? await app.prisma.vaultShare.update({
          where: { id: existingShare.id },
          data:  { permission: permission as any, wrappedDEK },
        })
      : await app.prisma.vaultShare.create({
          data: { itemId: id, ownerId: userId, sharedWithId, permission: permission as any, wrappedDEK },
        });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'VAULT_ITEM_SHARED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { itemId: id, sharedWithId, permission },
      severity:     'INFO',
      isRegulatory: false,
    });

    return reply.code(201).send({ shareId: share.id });
  });

  /**
   * GET /vault/items/:id/shares
   * Owner-only — who this specific item is currently (live) shared with, so
   * the owner can see and revoke individual shares.
   */
  app.get('/items/:id/shares', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const item = await app.prisma.vaultItem.findFirst({ where: { id, userId } });
    if (!item) return reply.code(404).send({ error: 'item_not_found' });

    const shares = await app.prisma.vaultShare.findMany({
      where:   { itemId: id, revokedAt: null },
      include: { sharedWith: { select: { id: true, ondi: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      shares: shares.map(s => ({
        shareId:      s.id,
        sharedWithId: s.sharedWithId,
        sharedWithOndi: s.sharedWith.ondi,
        permission:   s.permission,
        createdAt:    s.createdAt,
      })),
    });
  });

  /**
   * GET /vault/shared-with-me
   * Items another user has shared with the caller — still live (not revoked).
   */
  app.get('/shared-with-me', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const shares = await app.prisma.vaultShare.findMany({
      where:   { sharedWithId: userId, revokedAt: null },
      include: { item: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      shares: shares.map(s => ({
        shareId:       s.id,
        itemId:        s.itemId,
        ownerId:       s.ownerId,
        permission:    s.permission,
        wrappedDEK:    s.wrappedDEK,
        type:          s.item.type,
        encryptedBlob: s.item.encryptedBlob,
        iv:            s.item.iv,
        updatedAt:     s.item.updatedAt,
      })),
    });
  });

  /**
   * DELETE /vault/shares/:shareId
   * Owner-only soft revoke. This is explicitly two-tier, not a full undo:
   * it stops the server serving this row from here on, but a recipient who
   * already unwrapped the DEK keeps that cryptographic capability — soft
   * revoke alone can't reach into their client and make them forget it.
   * For EDIT-permission shares specifically, that gap matters enough that
   * revoke also requires an actual DEK rotation, which only the owner's
   * unlocked client can perform (it needs the plaintext to re-encrypt). This
   * endpoint hands back what the client needs to do that: itemId and every
   * other still-live recipient's id + public key, so it can generate a fresh
   * DEK, re-encrypt, and re-wrap for everyone remaining in one client-side
   * pass, then call POST /items/:id/rotate-dek. VIEW-only revokes stay
   * soft-only — rotating on every VIEW revoke would require the owner online
   * for something with much lower blast radius.
   */
  app.delete('/shares/:shareId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { shareId } = req.params as { shareId: string };
    const share = await app.prisma.vaultShare.findFirst({ where: { id: shareId, ownerId: userId } });
    if (!share) return reply.code(404).send({ error: 'share_not_found' });

    await app.prisma.vaultShare.update({ where: { id: shareId }, data: { revokedAt: new Date() } });

    await app.audit.write({
      entityType:   'USER',
      entityId:     userId,
      action:       'VAULT_SHARE_REVOKED',
      category:     'IDENTITY',
      performedBy:  userId,
      metadata:     { itemId: share.itemId, sharedWithId: share.sharedWithId, permission: share.permission },
      severity:     'INFO',
      isRegulatory: false,
    });

    if (share.permission !== 'EDIT') {
      return reply.send({ revoked: true, rotationRequired: false });
    }

    const remaining = await app.prisma.vaultShare.findMany({
      where:   { itemId: share.itemId, revokedAt: null },
      include: { sharedWith: { select: { id: true, vaultPublicKeyJwk: true } } },
    });

    return reply.send({
      revoked:          true,
      rotationRequired: true,
      itemId:           share.itemId,
      remainingShares:  remaining
        .filter(r => r.sharedWith.vaultPublicKeyJwk)
        .map(r => ({
          shareId:      r.id,
          sharedWithId: r.sharedWithId,
          permission:   r.permission,
          publicKeyJwk: JSON.parse(r.sharedWith.vaultPublicKeyJwk as string),
        })),
    });
  });

  /**
   * POST /vault/items/:id/rotate-dek
   * Completes the rotation DELETE /shares/:shareId asked for: a fresh DEK,
   * re-encrypted content, and re-wrapped copies for the owner and every
   * remaining live recipient, written atomically so a mid-flight failure
   * can't leave some shares on the old DEK and others on the new one.
   */
  app.post('/items/:id/rotate-dek', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    const { encryptedBlob, iv, wrappedDEK, wrappedDEKIv, shares } = req.body as {
      encryptedBlob?: string; iv?: string; wrappedDEK?: string; wrappedDEKIv?: string;
      shares?: { shareId: string; wrappedDEK: string }[];
    };
    if (!encryptedBlob || !iv || !wrappedDEK || !wrappedDEKIv || !Array.isArray(shares))
      return reply.code(400).send({ error: 'missing_fields' });

    const item = await app.prisma.vaultItem.findFirst({ where: { id, userId } });
    if (!item) return reply.code(404).send({ error: 'item_not_found' });

    await app.prisma.$transaction([
      app.prisma.vaultItem.update({ where: { id }, data: { encryptedBlob, iv, wrappedDEK, wrappedDEKIv } }),
      ...shares.map(s => app.prisma.vaultShare.update({
        where: { id: s.shareId },
        data:  { wrappedDEK: s.wrappedDEK },
      })),
    ]);

    return reply.send({ rotated: true });
  });
}

import crypto from 'node:crypto';
import { dbPlatform } from '../db/client.js';
import { decryptSecret, encryptSecret } from './onsite-secrets.service.js';

export interface OndiSamlSigningKey {
  kid: string;
  privateKey: string;
  certificate: string;
  publishedCertificates: string[];
}

async function generateKeyMaterial() {
  const { default: forge } = await import('node-forge');
  const pair = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = pair.publicKey;
  cert.serialNumber = crypto.randomBytes(16).toString('hex');
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  const identity = [{ name: 'commonName', value: 'id.hudumika.tz' }, { name: 'organizationName', value: 'Hudumika' }];
  cert.setSubject(identity);
  cert.setIssuer(identity);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', critical: true, digitalSignature: true, keyEncipherment: false },
  ]);
  cert.sign(pair.privateKey, forge.md.sha256.create());
  return {
    certificate: forge.pki.certificateToPem(cert),
    privateKey: forge.pki.privateKeyToPem(pair.privateKey),
  };
}

async function createInitialKey() {
  const material = await generateKeyMaterial();
  const kid = crypto.randomBytes(12).toString('hex');
  try {
    await dbPlatform.insertInto('ondi_saml_idp_signing_keys').values({
      kid, certificate_pem: material.certificate,
      encrypted_private_key: encryptSecret(material.privateKey), status: 'active',
    }).execute();
  } catch (error) {
    // Multiple API workers may start the IdP concurrently. The partial unique
    // index elects one initial key; the loser reads the winner on retry.
    const active = await dbPlatform.selectFrom('ondi_saml_idp_signing_keys').select('kid')
      .where('status', '=', 'active').executeTakeFirst();
    if (!active) throw error;
  }
}

export async function getOndiSamlSigningKey(): Promise<OndiSamlSigningKey> {
  let active = await dbPlatform.selectFrom('ondi_saml_idp_signing_keys').selectAll()
    .where('status', '=', 'active').executeTakeFirst();
  if (!active) {
    await createInitialKey();
    active = await dbPlatform.selectFrom('ondi_saml_idp_signing_keys').selectAll()
      .where('status', '=', 'active').executeTakeFirst();
  }
  if (!active) throw new Error('Ondi SAML signing key is unavailable');
  const previous = await dbPlatform.selectFrom('ondi_saml_idp_signing_keys').select('certificate_pem')
    .where('status', '=', 'previous').orderBy('retired_at', 'desc').limit(2).execute();
  return {
    kid: active.kid,
    privateKey: decryptSecret(active.encrypted_private_key),
    certificate: active.certificate_pem,
    publishedCertificates: [active.certificate_pem, ...previous.map(row => row.certificate_pem)],
  };
}

export async function listOndiSamlSigningKeys() {
  return dbPlatform.selectFrom('ondi_saml_idp_signing_keys')
    .select(['kid', 'status', 'created_at', 'retired_at'])
    .orderBy('created_at', 'desc').execute();
}

export async function rotateOndiSamlSigningKey() {
  const material = await generateKeyMaterial();
  const kid = crypto.randomBytes(12).toString('hex');
  await dbPlatform.transaction().execute(async trx => {
    await trx.updateTable('ondi_saml_idp_signing_keys')
      .set({ status: 'previous', retired_at: new Date() }).where('status', '=', 'active').execute();
    await trx.insertInto('ondi_saml_idp_signing_keys').values({
      kid, certificate_pem: material.certificate,
      encrypted_private_key: encryptSecret(material.privateKey), status: 'active',
    }).execute();
  });
  return { kid };
}

export async function revokeOndiSamlSigningKey(kid: string) {
  const revoked = await dbPlatform.updateTable('ondi_saml_idp_signing_keys')
    .set({ status: 'revoked', retired_at: new Date() })
    .where('kid', '=', kid).where('status', '=', 'previous').returning('kid').executeTakeFirst();
  if (!revoked) throw Object.assign(new Error('Only a previous signing key can be revoked.'), { statusCode: 409 });
}

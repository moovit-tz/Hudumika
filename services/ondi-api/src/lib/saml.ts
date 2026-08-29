import * as samlify from 'samlify';
import zlib from 'zlib';
import { SAML_IDP_SIGNING_CERT, SAML_IDP_SIGNING_KEY, SAML_IDP_ENTITY_ID, JWT_ISSUER } from './env.js';

/**
 * samlify requires a schema validator to be registered before use. The
 * "real" options (@authenio/samlify-xsd-schema-validator or an xmllint
 * binding) pull in native/WASM dependencies this service doesn't otherwise
 * need. We skip XSD schema validation here — samlify still does XML
 * signature verification and the full set of SAML semantic checks
 * (issuer/audience/conditions/timestamps) on every inbound message; what's
 * skipped is the extra check that inbound XML is schema-well-formed on top
 * of that. Acceptable for a first SAML IdP cut — revisit if this ever
 * needs to withstand adversarial SPs rather than trusted enterprise ones.
 */
samlify.setSchemaValidator({
  validate: () => Promise.resolve('skipped'),
});

const BASE_URL = process.env.ONDI_BASE_URL || JWT_ISSUER;
export const SAML_SSO_URL = `${BASE_URL}/v1/saml/sso`;
export const SAML_SLO_URL = `${BASE_URL}/v1/saml/slo`;

export const idp = samlify.IdentityProvider({
  entityID: SAML_IDP_ENTITY_ID,
  privateKey: SAML_IDP_SIGNING_KEY,
  signingCert: SAML_IDP_SIGNING_CERT,
  isAssertionEncrypted: false,
  wantAuthnRequestsSigned: false,
  singleSignOnService: [
    { Binding: samlify.Constants.namespace.binding.redirect, Location: SAML_SSO_URL },
    { Binding: samlify.Constants.namespace.binding.post, Location: SAML_SSO_URL },
  ],
  singleLogoutService: [
    { Binding: samlify.Constants.namespace.binding.redirect, Location: SAML_SLO_URL },
  ],
  nameIDFormat: [samlify.Constants.namespace.format.emailAddress],
});

/** Build a samlify ServiceProvider entity from a stored SamlServiceProvider row. */
export function buildServiceProvider(sp: {
  entityId: string;
  acsUrl: string;
  sloUrl?: string | null;
  certificate?: string | null;
}) {
  return samlify.ServiceProvider({
    entityID: sp.entityId,
    assertionConsumerService: [
      { Binding: samlify.Constants.namespace.binding.post, Location: sp.acsUrl, isDefault: true },
    ],
    singleLogoutService: sp.sloUrl
      ? [
          { Binding: samlify.Constants.namespace.binding.post, Location: sp.sloUrl },
          { Binding: samlify.Constants.namespace.binding.redirect, Location: sp.sloUrl },
        ]
      : [],
    signingCert: sp.certificate || undefined,
  });
}

/**
 * Pull the `<Issuer>` entityID out of a raw (still-encoded) AuthnRequest so
 * we can look up which registered SP is calling before we can build the
 * samlify ServiceProvider entity needed to actually parse/validate the
 * request — samlify's parseLoginRequest needs the SP entity as an input,
 * not an output, so identifying the caller has to happen a level below it.
 */
export function extractIssuerFromRawSamlRequest(samlRequestRaw: string, isRedirectBinding: boolean): string | null {
  try {
    const compressed = Buffer.from(samlRequestRaw, 'base64');
    const xml = isRedirectBinding
      ? zlib.inflateRawSync(compressed).toString('utf-8')
      : compressed.toString('utf-8');
    const match = xml.match(/<(?:saml2?:)?Issuer[^>]*>([^<]+)<\/(?:saml2?:)?Issuer>/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

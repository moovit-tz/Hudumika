import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';
import 'package:web/web.dart' as web;

/// Real WebAuthn registration ceremony — `navigator.credentials.create()`.
/// Mirrors exactly what apps/web/ondi-auth's passkeys page does via
/// @simplewebauthn/browser's `startRegistration()`: decode the server's
/// base64url challenge/user.id/excludeCredentials into the ArrayBuffers the
/// browser API needs, run the ceremony, then re-encode the resulting
/// attestation back into the base64url JSON shape
/// `verifyRegistrationResponse()` (services/ondi-api/src/routes/webauthn.ts)
/// expects. Hand-rolled instead of pulling in a JS dependency — Flutter web
/// has no Dart equivalent of @simplewebauthn/browser, but the conversion
/// itself is small and entirely spec-defined, not something that benefits
/// from a third-party package's abstraction.
///
/// [optionsJson] is exactly what `POST /webauthn/register/options` returns
/// (a `PublicKeyCredentialCreationOptionsJSON`, per @simplewebauthn/server).
/// Returns the `RegistrationResponseJSON` body to POST to
/// `/webauthn/register/verify`. Throws if the ceremony is cancelled,
/// unsupported, or denied — the caller shows that as a normal error, same
/// as any other failed action.
Future<Map<String, dynamic>> createPasskeyCredential(Map<String, dynamic> optionsJson) async {
  final rp = optionsJson['rp'] as Map<String, dynamic>;
  final user = optionsJson['user'] as Map<String, dynamic>;

  final publicKey = web.PublicKeyCredentialCreationOptions(
    rp: web.PublicKeyCredentialRpEntity(name: rp['name'] as String, id: (rp['id'] as String?) ?? ''),
    user: web.PublicKeyCredentialUserEntity(
      name: user['name'] as String,
      id: _decodeBase64Url(user['id'] as String).toJS,
      displayName: user['displayName'] as String,
    ),
    challenge: _decodeBase64Url(optionsJson['challenge'] as String).toJS,
    pubKeyCredParams: (optionsJson['pubKeyCredParams'] as List)
        .map((p) {
          final m = p as Map<String, dynamic>;
          return web.PublicKeyCredentialParameters(type: m['type'] as String, alg: m['alg'] as int);
        })
        .toList()
        .toJS,
  );

  final timeout = optionsJson['timeout'];
  if (timeout is int) publicKey.timeout = timeout;
  final attestation = optionsJson['attestation'];
  if (attestation is String) publicKey.attestation = attestation;

  final excludeCredentials = optionsJson['excludeCredentials'] as List?;
  if (excludeCredentials != null && excludeCredentials.isNotEmpty) {
    publicKey.excludeCredentials = excludeCredentials
        .map((c) {
          final m = c as Map<String, dynamic>;
          final descriptor = web.PublicKeyCredentialDescriptor(
            type: (m['type'] as String?) ?? 'public-key',
            id: _decodeBase64Url(m['id'] as String).toJS,
          );
          final transports = m['transports'] as List?;
          if (transports != null) {
            descriptor.transports = transports.cast<String>().map((t) => t.toJS).toList().toJS;
          }
          return descriptor;
        })
        .toList()
        .toJS;
  }

  final authenticatorSelection = optionsJson['authenticatorSelection'] as Map<String, dynamic>?;
  if (authenticatorSelection != null) {
    final selection = web.AuthenticatorSelectionCriteria();
    final attachment = authenticatorSelection['authenticatorAttachment'];
    if (attachment is String) selection.authenticatorAttachment = attachment;
    final residentKey = authenticatorSelection['residentKey'];
    if (residentKey is String) selection.residentKey = residentKey;
    final requireResidentKey = authenticatorSelection['requireResidentKey'];
    if (requireResidentKey is bool) selection.requireResidentKey = requireResidentKey;
    final userVerification = authenticatorSelection['userVerification'];
    if (userVerification is String) selection.userVerification = userVerification;
    publicKey.authenticatorSelection = selection;
  }

  final rawCredential = await web.window.navigator.credentials.create(web.CredentialCreationOptions(publicKey: publicKey)).toDart;
  final credential = rawCredential as web.PublicKeyCredential?;
  if (credential == null) {
    throw StateError('No credential was returned.');
  }

  final response = credential.response as web.AuthenticatorAttestationResponse;
  final transports = response.getTransports().toDart.map((t) => t.toDart).toList();

  return {
    'id': credential.id,
    // Per the WebAuthn spec, PublicKeyCredential.id IS the base64url
    // encoding of rawId — no separate re-encode needed.
    'rawId': credential.id,
    'type': 'public-key',
    'authenticatorAttachment': credential.authenticatorAttachment,
    'response': {
      'clientDataJSON': _encodeBase64Url(response.clientDataJSON.toDart.asUint8List()),
      'attestationObject': _encodeBase64Url(response.attestationObject.toDart.asUint8List()),
      'transports': transports,
    },
    'clientExtensionResults': <String, dynamic>{},
  };
}

Uint8List _decodeBase64Url(String input) {
  var normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  switch (normalized.length % 4) {
    case 2:
      normalized += '==';
    case 3:
      normalized += '=';
  }
  return base64.decode(normalized);
}

String _encodeBase64Url(Uint8List bytes) => base64Url.encode(bytes).replaceAll('=', '');

/// Whether this browser exposes the WebAuthn API at all — used to
/// hide/disable "Add passkey" instead of letting someone tap it and hit an
/// opaque `create()` failure on a browser that never had the API.
bool isWebauthnSupported() {
  try {
    return web.window.has('PublicKeyCredential');
  } catch (_) {
    return false;
  }
}

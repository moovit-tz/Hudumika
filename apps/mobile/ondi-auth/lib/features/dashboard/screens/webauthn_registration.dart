// Platform-conditional export: web builds get the real
// navigator.credentials.create() ceremony (package:web is safe everywhere,
// but the browser API it wraps only exists on web) — every other platform
// gets a stub that fails clearly instead of attempting a ceremony native
// platforms don't support yet (Android Credential Manager / iOS
// ASAuthorization would need their own platform-channel implementations,
// out of scope here). Same split as login/google_button.dart.
export 'webauthn_registration_web.dart' if (dart.library.io) 'webauthn_registration_native.dart';

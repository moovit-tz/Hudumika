/// Android/iOS: no native passkey-creation ceremony is wired up yet (that
/// needs Android Credential Manager / iOS ASAuthorization platform-channel
/// code, not the browser API this web implementation uses) — fail with a
/// clear message rather than attempt something that can't work, same
/// honesty as the rest of this screen's existing "not available yet" copy.
Future<Map<String, dynamic>> createPasskeyCredential(Map<String, dynamic> optionsJson) async {
  throw UnsupportedError('Adding a passkey from this app is only available on the web version right now.');
}

bool isWebauthnSupported() => false;

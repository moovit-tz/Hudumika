// Platform-conditional export, same pattern as features/login/google_button.dart:
// the real banner needs package:web (browser-only APIs) to sniff the user
// agent, which doesn't compile the same way outside a web target. Native
// Android/iOS builds don't need to advertise "get the Android app" to
// themselves anyway, so they get a no-op.
export 'android_download_banner_web.dart' if (dart.library.io) 'android_download_banner_native.dart';

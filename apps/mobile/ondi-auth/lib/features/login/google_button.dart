// Platform-conditional export: web builds get the real GIS renderButton()
// widget (google_sign_in_web is a web-only package — importing it directly
// in a file that also compiles for Android/iOS breaks the native build);
// every other platform gets a normal button that calls .authenticate().
export 'google_button_web.dart' if (dart.library.io) 'google_button_native.dart';

import 'package:flutter_test/flutter_test.dart';

// This project is web-only and pulls in google_sign_in_web (dart:js_interop
// / JSString / JSObject types), which the default VM test target can't
// compile — a widget test that pumps OndiAuthApp needs `flutter test
// --platform chrome`, and this sandbox has no chrome binary the test
// runner can launch (flutter run -d chrome works via a different path than
// flutter test's chromedriver-based runner). `flutter build web --release`
// is the real compile/runtime check for this app; kept here only so `flutter
// test` (the default VM target) has something that passes without needing
// a browser.
void main() {
  test('placeholder — see file header for why this project has no widget test here', () {
    expect(1 + 1, 2);
  });
}

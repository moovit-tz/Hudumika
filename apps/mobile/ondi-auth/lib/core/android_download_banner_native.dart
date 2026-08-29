import 'package:flutter/widgets.dart';

/// Native Android/iOS build: nothing to show — a running native app doesn't
/// need to be told to go install the native app.
class AndroidApkBanner extends StatelessWidget {
  const AndroidApkBanner({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

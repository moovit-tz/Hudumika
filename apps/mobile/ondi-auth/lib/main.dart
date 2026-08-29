import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/flutter_web_plugins.dart';
import 'core/android_download_banner.dart';
import 'core/router.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_mode_provider.dart';

void main() {
  // Without this, Flutter web defaults to hash-based routing
  // (ondi.hudumika.tz/#/authorize?...) — but every product that sends a
  // user here to sign in (Petti, Tasks, Calendar, ClearOS, ...) builds a
  // plain-path URL (ondi.hudumika.tz/authorize?client_id=...), which the
  // hash router silently ignores, loading the home screen instead of the
  // authorize flow. usePathUrlStrategy() makes plain paths work, matching
  // what every other product already assumes.
  if (kIsWeb) usePathUrlStrategy();
  runApp(const ProviderScope(child: OndiAuthApp()));
}

class OndiAuthApp extends ConsumerWidget {
  const OndiAuthApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeModeProvider);
    final router = ref.watch(routerProvider);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      ThemeController.sync(mode, MediaQuery.platformBrightnessOf(context));
    });

    return MaterialApp.router(
      title: 'Ondi Auth',
      debugShowCheckedModeBanner: false,
      themeMode: mode,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      routerConfig: router,
      builder: (context, child) => Column(
        children: [
          const AndroidApkBanner(),
          Expanded(child: child ?? const SizedBox.shrink()),
        ],
      ),
    );
  }
}

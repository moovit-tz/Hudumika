import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _prefsKey = 'ondi_theme_mode';

/// Persisted app-wide theme mode (light / dark / system) — ported from
/// apps/mobile/ondi/lib/core/theme/theme_mode_provider.dart.
class ThemeModeNotifier extends Notifier<ThemeMode> {
  @override
  ThemeMode build() {
    _load();
    return ThemeMode.light;
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_prefsKey);
    final mode = switch (saved) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      'system' => ThemeMode.system,
      _ => ThemeMode.light,
    };
    if (mode != state) state = mode;
  }

  Future<void> setMode(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, mode.name);
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(
  ThemeModeNotifier.new,
);

/// Resolves [ThemeMode.system] against the platform brightness so
/// non-widget code (static [AppTheme] color getters) can know the
/// *effective* brightness without a BuildContext.
class ThemeController {
  ThemeController._();

  static final ValueNotifier<Brightness> brightness =
      ValueNotifier<Brightness>(Brightness.light);

  static bool get isDark => brightness.value == Brightness.dark;

  static void sync(ThemeMode mode, Brightness platformBrightness) {
    final resolved = switch (mode) {
      ThemeMode.light => Brightness.light,
      ThemeMode.dark => Brightness.dark,
      ThemeMode.system => platformBrightness,
    };
    if (brightness.value != resolved) brightness.value = resolved;
  }
}

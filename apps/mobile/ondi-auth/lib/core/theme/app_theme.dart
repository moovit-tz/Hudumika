import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:hugeicons/hugeicons.dart';
import 'theme_mode_provider.dart';

/// Ondi's Okta-styled palette — trimmed port of
/// apps/mobile/ondi/lib/core/theme/app_theme.dart for this web project.
/// Dropped from the original: QR helpers (qr_flutter) and UserAvatar's
/// dart:io FileImage path, neither of which apply to a web build and
/// aren't needed by Phase 1's screens.
class AppTheme {
  static const Color primary = Color(0xFF4253D1);
  static const Color secondary = Color(0xFF4E76E5);

  static const Color success = Color(0xFF1E8E5A);
  static const Color warning = Color(0xFFB25E00);
  static const Color error = Color(0xFFD5304F);

  static const Color _darkBackground = Color(0xFF0A0A0B);
  static const Color _darkSurface = Color(0xFF161618);
  static const Color _darkTextPrimary = Colors.white;
  static const Color _darkTextSecondary = Color(0xFFA0A0A5);
  static const Color _darkBorder = Color(0x14FFFFFF);
  static const Color _darkSuccess = Color(0xFF00C853);
  static const Color _darkWarning = Color(0xFFFFAB00);
  static const Color _darkError = Color(0xFFFF1744);

  static const Color _lightBackground = Color(0xFFF5F6F9);
  static const Color _lightSurface = Colors.white;
  static const Color _lightTextPrimary = Color(0xFF15161A);
  static const Color _lightTextSecondary = Color(0xFF6B6E76);
  static const Color _lightBorder = Color(0xFFE4E5EA);

  static bool get _dark => ThemeController.isDark;
  static bool get isDark => _dark;

  static Color get background => _dark ? _darkBackground : _lightBackground;
  static Color get surface => _dark ? _darkSurface : _lightSurface;
  static Color get textPrimary => _dark ? _darkTextPrimary : _lightTextPrimary;
  static Color get textSecondary => _dark ? _darkTextSecondary : _lightTextSecondary;
  static Color get border => _dark ? _darkBorder : _lightBorder;
  static Color get cardBorder => _dark ? Colors.white.withOpacity(0.05) : _lightBorder;

  static Color get statusSuccess => _dark ? _darkSuccess : success;
  static Color get statusWarning => _dark ? _darkWarning : warning;
  static Color get statusError => _dark ? _darkError : error;

  static ThemeData get darkTheme => _themeFor(Brightness.dark);
  static ThemeData get lightTheme => _themeFor(Brightness.light);

  static ThemeData _themeFor(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final bg = isDark ? _darkBackground : _lightBackground;
    final surf = isDark ? _darkSurface : _lightSurface;
    final onSurf = isDark ? _darkTextPrimary : _lightTextPrimary;
    final onSurfMuted = isDark ? _darkTextSecondary : _lightTextSecondary;
    final cardBorderColor = isDark ? Colors.white.withOpacity(0.05) : _lightBorder;

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: bg,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: primary,
        onPrimary: Colors.white,
        secondary: secondary,
        onSecondary: Colors.white,
        surface: surf,
        onSurface: onSurf,
        error: isDark ? _darkError : error,
        onError: Colors.white,
      ),
      textTheme: GoogleFonts.outfitTextTheme(
        TextTheme(
          displayLarge: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: onSurf),
          displayMedium: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: onSurf),
          displaySmall: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: onSurf),
          headlineMedium: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: onSurf),
          bodyLarge: TextStyle(fontSize: 16, color: onSurf),
          bodyMedium: TextStyle(fontSize: 14, color: onSurfMuted),
        ),
      ),
      cardTheme: CardThemeData(
        color: surf,
        elevation: isDark ? 0 : 1,
        shadowColor: Colors.black.withOpacity(0.06),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: cardBorderColor),
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        foregroundColor: onSurf,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          minimumSize: const Size(double.infinity, 52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        ),
      ),
      dividerTheme: DividerThemeData(color: cardBorderColor, space: 1),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surf,
        elevation: 0,
        height: 64,
        surfaceTintColor: Colors.transparent,
        indicatorColor: primary.withOpacity(isDark ? 0.18 : 0.12),
        indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? primary : onSurfMuted,
          );
        }),
      ),
    );
  }

  static void showCustomToast(BuildContext context, String message, {dynamic icon = HugeIcons.strokeRoundedCheckmarkCircle01, Color? color}) {
    final scaffoldMessenger = ScaffoldMessenger.of(context);
    scaffoldMessenger.hideCurrentSnackBar();
    scaffoldMessenger.showSnackBar(
      SnackBar(
        content: Row(
          children: [
            HugeIcon(icon: icon, color: color ?? primary).animate().scale(delay: 200.ms),
            const SizedBox(width: 12),
            Expanded(child: Text(message, style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary))),
          ],
        ),
        backgroundColor: AppTheme.surface,
        behavior: SnackBarBehavior.floating,
        margin: const EdgeInsets.only(bottom: 24, left: 20, right: 20),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: AppTheme.cardBorder),
        ),
        elevation: 2,
        duration: const Duration(seconds: 3),
      ),
    );
  }
}

/// Okta-style flat card — ported unchanged from apps/mobile/ondi.
class GlassBox extends StatelessWidget {
  final Widget child;
  final double blur;
  final double opacity;
  final Color? color;
  final double borderRadius;

  const GlassBox({
    super.key,
    required this.child,
    this.blur = 15,
    this.opacity = 0.05,
    this.color,
    this.borderRadius = 24,
  });

  @override
  Widget build(BuildContext context) {
    if (ThemeController.isDark) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
          child: Container(
            decoration: BoxDecoration(
              color: color ?? Colors.white.withOpacity(opacity),
              borderRadius: BorderRadius.circular(borderRadius),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
            ),
            child: Material(color: Colors.transparent, child: child),
          ),
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: color ?? AppTheme.surface,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: AppTheme.cardBorder),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 12, offset: const Offset(0, 2)),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(borderRadius),
        clipBehavior: Clip.antiAlias,
        child: child,
      ),
    );
  }
}

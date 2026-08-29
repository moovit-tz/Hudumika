import 'package:flutter/material.dart';

/// The dark brand gradient apps/web/ondi-auth's login/onboarding screens use
/// (see globals.css's `.auth-gradient`) — fixed regardless of the app's
/// light/dark theme toggle, since these screens always render on this
/// gradient. Approximates the CSS's four radial color blobs + base linear
/// gradient with a Stack of soft blurred circles over a base gradient.
class AuthGradientBackground extends StatelessWidget {
  final Widget child;
  const AuthGradientBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment(-0.4, -1),
          end: Alignment(0.2, 1),
          colors: [Color(0xFF14183A), Color(0xFF1B1440), Color(0xFF0B0C1F)],
          stops: [0.0, 0.45, 1.0],
        ),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          const _Blob(alignment: Alignment(-0.7, -0.85), color: Color(0x8C8C9BFF), size: 420),
          const _Blob(alignment: Alignment(0.85, -0.7), color: Color(0x4DFF8CC8), size: 380),
          const _Blob(alignment: Alignment(-0.55, 0.75), color: Color(0x4278DCC2), size: 400),
          const _Blob(alignment: Alignment(0.9, 0.85), color: Color(0x33FFC878), size: 380),
          child,
        ],
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  final Alignment alignment;
  final Color color;
  final double size;
  const _Blob({required this.alignment, required this.color, required this.size});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: alignment,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color, color.withAlpha(0)]),
        ),
      ),
    );
  }
}

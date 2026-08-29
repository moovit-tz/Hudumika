import 'package:flutter/material.dart';

/// The real Ondi brand mark (same asset as apps/web/ondi-auth's icon.svg /
/// PWA icons) — was showing a generic HugeIcons shield placeholder instead
/// at every brand-identity moment (login, overview, authorize consent).
class OndiLogo extends StatelessWidget {
  final double size;
  const OndiLogo({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) {
    return Image.asset('assets/images/ondi_logo.png', width: size, height: size);
  }
}

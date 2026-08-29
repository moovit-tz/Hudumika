import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:web/web.dart' as web;
import 'theme/app_theme.dart';

/// Persistent top banner offering the native APK — shown only when the web
/// build is running inside an Android browser (an APK download link makes
/// no sense on iOS/desktop web). The web build is what's served at the root
/// domain; an installed app is still the better experience on Android
/// specifically (push notifications for MFA approvals, no browser chrome).
/// Dismissible per session; reappears on reload.
class AndroidApkBanner extends StatefulWidget {
  const AndroidApkBanner({super.key});

  @override
  State<AndroidApkBanner> createState() => _AndroidApkBannerState();
}

class _AndroidApkBannerState extends State<AndroidApkBanner> {
  bool _dismissed = false;

  bool get _isAndroid => web.window.navigator.userAgent.toLowerCase().contains('android');

  @override
  Widget build(BuildContext context) {
    if (_dismissed || !_isAndroid) return const SizedBox.shrink();

    return Material(
      color: AppTheme.primary,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              const Icon(Icons.android, color: Colors.white, size: 20),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Get the Ondi Auth Android app',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12.5),
                ),
              ),
              TextButton(
                onPressed: () => launchUrl(
                  Uri.parse('https://ondi.hudumika.tz/downloads/ondi-auth.apk'),
                  webOnlyWindowName: '_blank',
                ),
                style: TextButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: AppTheme.primary,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Download', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12)),
              ),
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 18),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                onPressed: () => setState(() => _dismissed = true),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

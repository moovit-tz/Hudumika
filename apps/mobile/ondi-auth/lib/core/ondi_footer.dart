import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'theme/app_theme.dart';

/// Terms/Privacy links + "Ondi is a product of Hudumika" — parity with
/// apps/web/ondi-auth's Footer.tsx. Was entirely missing here.
class OndiFooter extends StatelessWidget {
  /// Login/onboarding render this over the fixed dark auth gradient
  /// (independent of the app's own light/dark theme toggle), so it needs
  /// its own always-white-on-dark palette instead of AppTheme.textSecondary.
  final bool dark;
  const OndiFooter({super.key, this.dark = false});

  @override
  Widget build(BuildContext context) {
    final color = dark ? Colors.white.withOpacity(0.55) : AppTheme.textSecondary;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Wrap(
          spacing: 16,
          alignment: WrapAlignment.center,
          children: [
            TextButton(
              onPressed: () => context.push('/terms'),
              child: Text('Terms & Conditions', style: TextStyle(color: color, fontSize: 12)),
            ),
            TextButton(
              onPressed: () => context.push('/privacy'),
              child: Text('Privacy Policy', style: TextStyle(color: color, fontSize: 12)),
            ),
          ],
        ),
        const SizedBox(height: 4),
        InkWell(
          onTap: () => launchUrl(Uri.parse('https://hudumika.tz/'), webOnlyWindowName: '_blank'),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Ondi is a product of', style: TextStyle(color: color, fontSize: 12)),
                const SizedBox(width: 6),
                // The source asset is a solid-black wordmark on a
                // transparent background — invisible on the dark auth
                // gradient without tinting it white to match.
                dark
                    ? ColorFiltered(
                        colorFilter: const ColorFilter.mode(Colors.white, BlendMode.srcIn),
                        child: Image.asset('assets/images/hudumika_logo.png', height: 16),
                      )
                    : Image.asset('assets/images/hudumika_logo.png', height: 16),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

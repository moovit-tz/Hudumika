import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/premium_widgets.dart';

/// Same content as apps/web/ondi-auth's terms/page.tsx.
class TermsScreen extends StatelessWidget {
  const TermsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Terms & Conditions')),
      body: ListView(
        padding: const EdgeInsets.all(Gap.xl),
        children: [
          Text('Last updated 15 August 2026', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: Gap.lg),
          const _Section(
            title: '1. Acceptance of these terms',
            body:
                'These Terms & Conditions ("Terms") govern your use of Ondi Auth, an authentication service '
                'provided by Hudumika ("Ondi", "we", "us"). By creating an Ondi identity or signing in with Ondi to '
                'a connected application, you agree to these Terms. If you do not agree, do not use the service.',
          ),
          const _Section(
            title: '2. What Ondi Auth is',
            body:
                'Ondi Auth lets you sign in to applications using your phone number, a Google account, a passkey, '
                'or a one-time code — and lets you manage the devices, sessions, and applications connected to your '
                'Ondi identity in one place. Ondi Auth also functions as an authenticator app, generating '
                'time-based one-time codes (TOTP) for third-party services that support it.',
          ),
          const _Section(
            title: '3. Your account',
            body:
                'You\'re responsible for keeping your Ondi identity secure — this includes your phone number, any '
                'passkeys or authenticator codes registered to your account, and the devices you\'ve trusted. '
                'Notify us immediately, and revoke the affected device or session yourself from the Devices or '
                'Sessions screens, if you believe your account has been compromised.\n\n'
                'You must provide accurate information when creating your account and keep it up to date. You may '
                'not create an account on behalf of someone else without their authorization, and you may not '
                'share your account, passkeys, or one-time codes with anyone else.',
          ),
          const _Section(
            title: '4. Connected applications',
            body:
                'When you use "Continue with Ondi" to sign in to a third-party application, that application '
                'requests access to specific pieces of your Ondi identity (such as your name or phone number) — '
                'you choose whether to grant that access, and you can review or revoke it at any time from the '
                'Apps screen. Ondi is not responsible for how a connected application uses information you\'ve '
                'chosen to share with it once access is granted.',
          ),
          const _Section(
            title: '5. Acceptable use',
            body:
                'You agree not to:\n'
                '• Attempt to gain unauthorized access to another user\'s Ondi identity or any Ondi system\n'
                '• Use Ondi Auth to facilitate fraud, impersonation, or any unlawful activity\n'
                '• Interfere with or disrupt the integrity or performance of the service\n'
                '• Reverse-engineer, scrape, or attempt to extract the source of the service beyond what public '
                'APIs allow.',
          ),
          const _Section(
            title: '6. Suspension and deletion',
            body:
                'We may suspend or terminate access to Ondi Auth if we reasonably believe your account has been '
                'used to violate these Terms or to compromise the security of Ondi or a connected application. '
                'You may delete your own account at any time from the account menu — this permanently removes '
                'your credentials, passkeys, authenticator entries, devices, and sessions, and disconnects every '
                'application signed in through Ondi.',
          ),
          const _Section(
            title: '7. Disclaimers',
            body:
                'Ondi Auth is provided "as is." While we take reasonable measures to keep the service secure and '
                'available, we don\'t guarantee uninterrupted access, and we\'re not liable for losses arising from '
                'your failure to secure your own devices, passkeys, or recovery contacts.',
          ),
          const _Section(
            title: '8. Changes to these terms',
            body:
                'We may update these Terms from time to time. Material changes will be reflected by updating the '
                'date at the top of this page. Continued use of Ondi Auth after a change takes effect constitutes '
                'acceptance of the updated Terms.',
          ),
          const _Section(
            title: '9. Governing law',
            body: 'These Terms are governed by the laws of the United Republic of Tanzania.',
          ),
          const _Section(
            title: '10. Contact',
            body: 'Questions about these Terms can be sent to support@hudumika.tz.',
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final String body;
  const _Section({required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Gap.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
          const SizedBox(height: Gap.sm),
          Text(body, style: TextStyle(fontSize: 14, height: 1.5, color: AppTheme.textSecondary)),
        ],
      ),
    );
  }
}

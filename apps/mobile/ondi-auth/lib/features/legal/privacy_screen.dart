import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/premium_widgets.dart';

/// Same content as apps/web/ondi-auth's privacy/page.tsx.
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy Policy')),
      body: ListView(
        padding: const EdgeInsets.all(Gap.xl),
        children: [
          Text('Last updated 15 August 2026', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: Gap.lg),
          const _Section(
            title: '1. What this policy covers',
            body:
                'This Privacy Policy explains what information Ondi Auth (a Hudumika product) collects when you '
                'create and use an Ondi identity, why we collect it, and the choices you have over it.',
          ),
          const _Section(
            title: '2. Information we collect',
            body:
                'Depending on how you use Ondi Auth, we collect:\n'
                '• Identity information — your phone number, and if you sign in with Google, your name, email '
                'address, and profile photo\n'
                '• Authentication data — one-time codes (never stored in plain text, only as a cryptographic '
                'hash), passkey public keys, and authenticator secrets for accounts you choose to add\n'
                '• Device & session information — a device identifier, browser/OS label, IP address, and '
                'approximate timestamps for each sign-in, so you can see and manage where you\'re signed in\n'
                '• Trust & risk signals — a trust score and risk factors we compute to detect suspicious sign-ins '
                'and protect your account\n'
                '• Connected-app data — which applications you\'ve authorized with Ondi, and which scopes (pieces '
                'of your identity) you granted each one.',
          ),
          const _Section(
            title: '3. How we use this information',
            body:
                'We use the information above to:\n'
                '• Authenticate you and keep your account secure\n'
                '• Let you review and control your own devices, sessions, and connected applications\n'
                '• Detect and respond to suspicious or fraudulent activity\n'
                '• Provide the one-time codes and passkey ceremonies that make Ondi Auth work as an authenticator\n'
                '• Meet our legal and regulatory obligations.\n\n'
                'We do not sell your personal information.',
          ),
          const _Section(
            title: '4. When we share information',
            body:
                'When you sign in to a third-party application with "Continue with Ondi," we share only the '
                'specific fields that application requested and you approved (for example, your name and phone '
                'number) — never your authentication secrets, passkeys, or full activity history. You can review '
                'exactly what each connected app has access to, and revoke it, from the Apps screen at any time.\n\n'
                'We may also disclose information where required by law, or to protect the rights, security, or '
                'property of Ondi, our users, or the public.',
          ),
          const _Section(
            title: '5. How long we keep it',
            body:
                'We retain your account information for as long as your Ondi identity is active. If you delete '
                'your account, we permanently remove your credentials, passkeys, authenticator entries, devices, '
                'and sessions; a minimal record required for security and legal purposes (such as a hashed '
                'fraud-prevention signal) may be retained where the law requires it.',
          ),
          const _Section(
            title: '6. Security',
            body:
                'One-time codes are stored only as salted cryptographic hashes, never in plain text. Passkeys use '
                'public-key cryptography — Ondi never sees or stores your private key, only a public credential it '
                'can use to verify you. All traffic to Ondi Auth is encrypted in transit.',
          ),
          const _Section(
            title: '7. Your choices and rights',
            body:
                '• Access & export — download a copy of your security activity at any time from the account menu\n'
                '• Correction — update your profile information from your account settings\n'
                '• Deletion — permanently delete your account and associated data from the account menu\n'
                '• Revocation — disconnect any third-party application, or remove any device, passkey, or '
                'authenticator entry, at any time.',
          ),
          const _Section(
            title: '8. Cookies & local storage',
            body:
                'Ondi Auth stores your session token and device identifier on your device to keep you signed in — '
                'we don\'t use third-party tracking or advertising cookies.',
          ),
          const _Section(
            title: '9. Children\'s privacy',
            body: 'Ondi Auth is not directed at children under 16, and we don\'t knowingly collect their information.',
          ),
          const _Section(
            title: '10. Changes to this policy',
            body:
                'We may update this Privacy Policy from time to time. Material changes will be reflected by '
                'updating the date at the top of this page.',
          ),
          const _Section(
            title: '11. Contact',
            body: 'Questions about this policy or your data can be sent to support@hudumika.tz.',
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

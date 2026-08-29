import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/api_error.dart';
import '../../../core/phone_utils.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/premium_widgets.dart';
import '../../auth/auth_state.dart';
import '../../legal/privacy_screen.dart';
import '../../legal/terms_screen.dart';
import 'delete_account_screen.dart';
import 'devices_screen.dart';
import 'passkeys_screen.dart';
import 'recovery_screen.dart';
import '../../organizations/organizations_screen.dart';

/// Profile — the account hub, reached via the avatar action in HomeScreen's
/// AppBar, not a bottom-nav tab. Bottom nav is deliberately 3 items
/// (Overview, Authenticator, Apps) — Security and Devices used to each be
/// their own tab, but a settings surface with only one entry point in the
/// whole app doesn't earn a permanent slot in a bar meant for daily-use
/// destinations. Security's content (passkeys, recovery, auth method,
/// security activity) is inlined here directly since it's thin; Devices is
/// heavier (per-device actions, expandable activity — the same weight as
/// the Passkeys/Recovery screens Security already hands off to), so it's a
/// NavRow here that pushes DevicesScreen, not inlined content. Same
/// information architecture as most consumer identity apps (Google/Apple
/// account settings put security and device management under the profile,
/// not in primary nav).
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _editing = false;
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  bool _saving = false;

  int? _recoveryCount;
  int? _passkeyCount;
  int? _deviceCount;
  int? _sessionCount;
  List<dynamic> _events = [];
  String? _securityError;

  @override
  void initState() {
    super.initState();
    _loadSecurity();
  }

  Future<void> _loadSecurity() async {
    setState(() => _securityError = null);
    final api = ref.read(authNotifierProvider.notifier).api;
    try {
      final results = await Future.wait([
        api.getRecoveryContacts(),
        api.getWebauthnCredentials(),
        api.getSecurityEvents(limit: 5),
        api.getDevices(),
        api.getSessions(),
      ]);
      if (!mounted) return;
      setState(() {
        _recoveryCount = results[0].length;
        _passkeyCount = results[1].length;
        _events = results[2];
        _deviceCount = results[3].length;
        _sessionCount = results[4].length;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _securityError = describeApiError(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(authNotifierProvider).profile ?? {};
    if (!_editing) {
      _firstName.text = (profile['firstName'] as String?) ?? '';
      _lastName.text = (profile['lastName'] as String?) ?? '';
    }
    final phone = profile['phoneNumber'] as String?;
    final email = profile['email'] as String?;
    final phoneVerified = hasDeliverablePhone(phone);
    final noWayBackIn = !phoneVerified && _recoveryCount == 0;
    final avatarUrl = profile['profileImage'] as String?;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(Gap.lg),
        children: [
          Container(
            padding: const EdgeInsets.all(Gap.lg),
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.cardBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: AppTheme.primary.withOpacity(0.12),
                      backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
                      child: avatarUrl == null ? Icon(Icons.person, size: 26, color: AppTheme.primary) : null,
                    ),
                    const SizedBox(width: Gap.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (email != null) Text(email, style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                          if (phoneVerified) Text('+$phone', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Gap.lg),
                TextField(controller: _firstName, decoration: const InputDecoration(labelText: 'First name'), onChanged: (_) => setState(() => _editing = true)),
                const SizedBox(height: Gap.sm),
                TextField(controller: _lastName, decoration: const InputDecoration(labelText: 'Last name'), onChanged: (_) => setState(() => _editing = true)),
                if (_editing) ...[
                  const SizedBox(height: Gap.md),
                  ElevatedButton(
                    onPressed: _saving
                        ? null
                        : () async {
                            setState(() => _saving = true);
                            await ref.read(authNotifierProvider.notifier).api.updateProfile(
                                  firstName: _firstName.text.trim(),
                                  lastName: _lastName.text.trim(),
                                );
                            if (mounted) {
                              setState(() {
                                _saving = false;
                                _editing = false;
                              });
                            }
                          },
                    child: _saving
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Save'),
                  ),
                ],
              ],
            ),
          ),

          const SizedBox(height: Gap.xxl),
          const SectionHeader(title: 'Organizations'),
          const SizedBox(height: Gap.sm),
          NavRow(
            icon: Icons.apartment_rounded,
            title: 'Organizations',
            subtitle: 'Companies you belong to, and creating a new one.',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrganizationsScreen())),
          ),

          const SizedBox(height: Gap.xxl),
          const SectionHeader(title: 'Security'),
          const SizedBox(height: Gap.sm),
          if (_securityError != null) ...[
            AlertBanner(
              tone: Tone.error,
              icon: Icons.wifi_off_rounded,
              title: "Couldn't load your security info",
              body: _securityError!,
              action: GestureDetector(
                onTap: _loadSecurity,
                child: Text('Retry', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppTheme.statusError)),
              ),
            ),
            const SizedBox(height: Gap.sm),
          ],
          if (noWayBackIn) ...[
            AlertBanner(
              tone: Tone.warning,
              icon: Icons.warning_rounded,
              title: 'No way back in',
              body: "You have no verified phone and no recovery contacts — if you lose this device, there's currently no way to recover your account.",
              action: GestureDetector(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RecoveryScreen())).then((_) => _loadSecurity()),
                child: Text('Add a recovery contact →', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppTheme.statusWarning)),
              ),
            ),
            const SizedBox(height: Gap.sm),
          ],
          NavRow(
            icon: Icons.fingerprint_rounded,
            tone: Tone.success,
            title: 'Passkeys',
            subtitle: _passkeyCount == null
                ? "Sign in without a password, using your device's biometrics or PIN."
                : (_passkeyCount == 0 ? 'Not set up yet' : '$_passkeyCount active'),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PasskeysScreen())).then((_) => _loadSecurity()),
          ),
          NavRow(
            icon: Icons.shield_rounded,
            title: 'Recovery',
            subtitle: _recoveryCount == null
                ? 'People you trust to vouch for you if you ever lose access to your account.'
                : (_recoveryCount == 0 ? 'No recovery contacts yet' : '$_recoveryCount contact${_recoveryCount == 1 ? '' : 's'}'),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RecoveryScreen())).then((_) => _loadSecurity()),
          ),
          const SizedBox(height: Gap.xs),
          InfoCard(
            title: 'Authentication',
            body: [
                  if (phoneVerified) 'You sign in with a one-time code sent to +$phone' else 'You sign in with a one-time code',
                  if (email != null) 'or with Google ($email)',
                ].join(', ') +
                '. Set up a passkey above for a faster, passwordless sign-in.',
          ),
          InfoCard(
            title: 'Multi-factor verification',
            body: 'Manage the accounts Ondi generates codes for, and Ondi Push approvals, under the Authenticator tab.',
          ),
          if (_events.isNotEmpty) ...[
            const SizedBox(height: Gap.md),
            const SectionHeader(title: 'Recent security activity'),
            const SizedBox(height: Gap.sm),
            for (final (i, e) in _events.cast<Map<String, dynamic>>().indexed)
              NavRow(
                icon: Icons.schedule_rounded,
                tone: Tone.neutral,
                title: e['label'] as String? ?? '',
                subtitle: _formatEventTime(e['timestamp']),
                trailing: const SizedBox.shrink(),
                onTap: () {},
              ).entrance(i),
          ],

          const SizedBox(height: Gap.xxl),
          const SectionHeader(title: 'Devices'),
          const SizedBox(height: Gap.sm),
          NavRow(
            icon: Icons.smartphone_rounded,
            title: 'Devices & sessions',
            subtitle: _deviceCount == null
                ? 'Manage devices and sign out remote sessions.'
                : '$_deviceCount device${_deviceCount == 1 ? '' : 's'} · $_sessionCount active session${_sessionCount == 1 ? '' : 's'}',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DevicesScreen())).then((_) => _loadSecurity()),
          ),

          const SizedBox(height: Gap.xxl),
          const SectionHeader(title: 'Support'),
          const SizedBox(height: Gap.sm),
          NavRow(
            icon: Icons.support_agent_rounded,
            title: 'Contact support',
            subtitle: 'support@hudumika.tz',
            onTap: () => launchUrl(Uri.parse('mailto:support@hudumika.tz')),
          ),
          NavRow(
            icon: Icons.description_outlined,
            title: 'Terms & Conditions',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const TermsScreen())),
          ),
          NavRow(
            icon: Icons.privacy_tip_outlined,
            title: 'Privacy Policy',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrivacyScreen())),
          ),

          const SizedBox(height: Gap.xxl),
          NavRow(
            icon: Icons.logout_rounded,
            tone: Tone.error,
            title: 'Sign out',
            trailing: const SizedBox.shrink(),
            onTap: () => ref.read(authNotifierProvider.notifier).signOut(),
          ),
          NavRow(
            icon: Icons.delete_forever_rounded,
            tone: Tone.error,
            title: 'Delete account',
            subtitle: 'Permanently delete your Ondi account',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DeleteAccountScreen())),
          ),
        ],
      ),
    );
  }

  String _formatEventTime(dynamic raw) {
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '';
    final local = dt.toLocal();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final hh = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final mm = local.minute.toString().padLeft(2, '0');
    final ampm = local.hour < 12 ? 'AM' : 'PM';
    return '${months[local.month - 1]} ${local.day}, $hh:$mm $ampm';
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/api_error.dart';
import '../../core/ondi_logo.dart';
import '../../core/phone_utils.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/premium_widgets.dart';
import '../auth/auth_state.dart';
import '../dashboard/screens/activity_tab.dart';
import '../dashboard/screens/apps_tab.dart';
import '../dashboard/screens/authenticator_tab.dart';
import '../dashboard/screens/devices_screen.dart';
import '../dashboard/screens/profile_screen.dart';

/// Dashboard shell — bottom-nav host. Three tabs (Overview, Authenticator,
/// Apps): a bar is for the destinations someone taps daily. Devices and
/// Security each only have one entry point in the app, so neither earns a
/// permanent slot — Security lives inside Profile as a section, and Devices
/// (per-device management, same weight as the Passkeys/Recovery screens
/// Security hands off to) is a screen pushed from Profile instead, exactly
/// like those two. Sessions is merged into Devices and Activity is reached
/// via "See all" links, not tabs — Profile itself is reached via the avatar
/// action below, not a tab, same as the web app's top bar.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _tab = 0;

  static const _titles = ['Overview', 'Authenticator', 'Apps'];

  void _goToTab(int index) => setState(() => _tab = index);

  void _openProfile() => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()));

  void _openDevices() => Navigator.push(context, MaterialPageRoute(builder: (_) => const DevicesScreen()));

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authNotifierProvider);

    if (auth.status == AuthStatus.checking) {
      return Scaffold(
        backgroundColor: AppTheme.background,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final profile = auth.profile;
    final avatarUrl = profile?['profileImage'] as String?;

    final tabs = [
      _OverviewTab(onNavigate: _goToTab, onOpenProfile: _openProfile, onOpenDevices: _openDevices),
      const AuthenticatorTab(),
      const AppsTab(),
    ];

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text(_titles[_tab], style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
        actions: [
          IconButton(
            onPressed: _openProfile,
            icon: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AppTheme.cardBorder, width: 1.5)),
              child: CircleAvatar(
                radius: 14,
                backgroundColor: AppTheme.primary.withOpacity(0.12),
                backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) : null,
                child: avatarUrl == null ? Icon(Icons.person, size: 16, color: AppTheme.primary) : null,
              ),
            ),
          ),
          const SizedBox(width: Gap.sm),
        ],
      ),
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: _goToTab,
        destinations: [
          NavigationDestination(
            icon: HugeIcon(icon: HugeIcons.strokeRoundedHome01, color: AppTheme.textSecondary),
            selectedIcon: HugeIcon(icon: HugeIcons.strokeRoundedHome01, color: AppTheme.primary),
            label: 'Overview',
          ),
          NavigationDestination(
            icon: HugeIcon(icon: HugeIcons.strokeRoundedQrCode, color: AppTheme.textSecondary),
            selectedIcon: HugeIcon(icon: HugeIcons.strokeRoundedQrCode, color: AppTheme.primary),
            label: "Auth'r",
          ),
          NavigationDestination(
            icon: HugeIcon(icon: HugeIcons.strokeRoundedGridView, color: AppTheme.textSecondary),
            selectedIcon: HugeIcon(icon: HugeIcons.strokeRoundedGridView, color: AppTheme.primary),
            label: 'Apps',
          ),
        ],
      ),
    );
  }
}

class _OverviewTab extends ConsumerStatefulWidget {
  final void Function(int tabIndex) onNavigate;
  final VoidCallback onOpenProfile;
  final VoidCallback onOpenDevices;
  const _OverviewTab({required this.onNavigate, required this.onOpenProfile, required this.onOpenDevices});

  @override
  ConsumerState<_OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends ConsumerState<_OverviewTab> {
  int _devices = 0;
  int _sessions = 0;
  int _passkeys = 0;
  int _authenticator = 0;
  List<dynamic> _recent = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final api = ref.read(authNotifierProvider.notifier).api;
    final phone = ref.read(authNotifierProvider).profile?['phoneNumber'] as String?;
    try {
      final results = await Future.wait([
        api.getDevices(),
        api.getSessions(),
        api.getWebauthnCredentials(),
        phone != null ? api.getMfaApps(phone) : Future.value(const []),
        api.getLogins(limit: 2),
      ]);
      if (!mounted) return;
      setState(() {
        _devices = results[0].length;
        _sessions = results[1].length;
        _passkeys = results[2].length;
        _authenticator = results[3].length;
        _recent = results[4];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = describeApiError(e);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(authNotifierProvider).profile ?? {};
    final name = [profile['firstName'], profile['lastName']].whereType<String>().join(' ').trim();
    final phone = profile['phoneNumber'] as String?;
    final email = profile['email'] as String?;
    final phoneVerified = hasDeliverablePhone(phone);

    final checks = <(String, bool)>[
      ('Phone verified', phoneVerified),
      ('Passkey enabled', _passkeys > 0),
      ('Ondi Authenticator enabled', _authenticator > 0),
    ];
    final doneCount = checks.where((c) => c.$2).length;
    final allDone = doneCount == checks.length;

    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: ErrorState(message: _error!, onRetry: _load));

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(Gap.lg),
        children: [
          Row(
            children: [
              const OndiLogo(size: 28),
              const SizedBox(width: Gap.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name.isEmpty ? 'Welcome' : 'Welcome, $name',
                      style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
                    ),
                    Text(
                      email ?? (phone != null ? '+$phone' : ''),
                      style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Gap.xl),
          Container(
            padding: const EdgeInsets.all(Gap.lg),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppTheme.primary.withOpacity(AppTheme.isDark ? 0.20 : 0.10), AppTheme.secondary.withOpacity(AppTheme.isDark ? 0.10 : 0.05)],
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppTheme.primary.withOpacity(0.18)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Your Ondi security', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: (allDone ? AppTheme.statusSuccess : AppTheme.primary).withOpacity(0.14),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '$doneCount/${checks.length} complete',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: allDone ? AppTheme.statusSuccess : AppTheme.primary),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: Gap.md),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: doneCount / checks.length,
                    minHeight: 6,
                    backgroundColor: AppTheme.primary.withOpacity(0.12),
                    color: allDone ? AppTheme.statusSuccess : AppTheme.primary,
                  ),
                ),
                const SizedBox(height: Gap.md),
                for (final c in checks)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Icon(
                          c.$2 ? Icons.check_circle_rounded : Icons.circle_outlined,
                          size: 16,
                          color: c.$2 ? AppTheme.statusSuccess : AppTheme.textSecondary.withOpacity(0.5),
                        ),
                        const SizedBox(width: Gap.sm),
                        Expanded(
                          child: Text(
                            c.$2 ? c.$1 : '${c.$1} — not set up',
                            style: TextStyle(fontSize: 13, color: c.$2 ? AppTheme.textPrimary : AppTheme.textSecondary),
                          ),
                        ),
                      ],
                    ),
                  ),
                if (!allDone) ...[
                  const SizedBox(height: Gap.sm),
                  Wrap(
                    spacing: Gap.lg,
                    runSpacing: 6,
                    children: [
                      if (_authenticator == 0)
                        TextButton(
                          style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                          onPressed: () => widget.onNavigate(1),
                          child: Text('+ Add authenticator', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppTheme.primary)),
                        ),
                      if (_passkeys == 0)
                        TextButton(
                          style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                          onPressed: widget.onOpenProfile,
                          child: Text('+ Create passkey', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppTheme.primary)),
                        ),
                      TextButton(
                        style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                        onPressed: widget.onOpenDevices,
                        child: Text('Review sessions', style: TextStyle(fontSize: 12.5, color: AppTheme.textSecondary)),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: Gap.lg),
          Container(
            padding: const EdgeInsets.symmetric(vertical: Gap.sm),
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.cardBorder),
            ),
            child: Row(
              children: [
                StatTile(icon: Icons.smartphone_rounded, label: 'Devices', value: _devices, onTap: widget.onOpenDevices),
                _statDivider(),
                StatTile(icon: Icons.history_rounded, label: 'Sessions', value: _sessions, onTap: widget.onOpenDevices),
                _statDivider(),
                StatTile(icon: Icons.fingerprint_rounded, tone: Tone.success, label: 'Passkeys', value: _passkeys, onTap: widget.onOpenProfile),
                _statDivider(),
                StatTile(icon: Icons.qr_code_rounded, label: 'Accounts', value: _authenticator, onTap: () => widget.onNavigate(1)),
              ],
            ),
          ),
          if (_recent.isNotEmpty) ...[
            const SizedBox(height: Gap.xl),
            SectionHeader(
              title: 'Recent activity',
              trailing: TextButton(
                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ActivityTab())),
                child: Text('See all', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.primary)),
              ),
            ),
            const SizedBox(height: Gap.sm),
            Text(_dayLabel(_recent.first['timestamp']), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: AppTheme.textSecondary)),
            const SizedBox(height: Gap.sm),
            for (final (i, e) in _recent.cast<Map<String, dynamic>>().indexed)
              NavRow(
                icon: e['success'] == true ? Icons.check_circle_rounded : Icons.error_rounded,
                tone: e['success'] == true ? Tone.success : Tone.error,
                title: [
                  if (e['deviceName'] != null) e['deviceName'] as String,
                  e['success'] == true ? 'Signed in' : 'Sign-in failed',
                ].join(' · '),
                subtitle: _formatTime(e['timestamp']),
                trailing: const SizedBox.shrink(),
                onTap: () {},
              ).entrance(i),
          ],
        ],
      ),
    );
  }

  String _formatTime(dynamic raw) {
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '';
    final local = dt.toLocal();
    final hh = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final mm = local.minute.toString().padLeft(2, '0');
    final ampm = local.hour < 12 ? 'AM' : 'PM';
    return '$hh:$mm $ampm';
  }

  static const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  String _dayLabel(dynamic raw) {
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return '';
    final local = dt.toLocal();
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final date = DateTime(local.year, local.month, local.day);
    if (date == today) return 'Today';
    if (date == yesterday) return 'Yesterday';
    return '${_weekdays[local.weekday - 1]}, ${_months[local.month - 1]} ${local.day}';
  }
}

Widget _statDivider() => Container(width: 1, height: 32, color: AppTheme.cardBorder);

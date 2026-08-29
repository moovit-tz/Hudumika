import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api_error.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/premium_widgets.dart';
import '../../auth/auth_state.dart';

/// Devices + sessions — parity with apps/web/ondi-auth's devices/page.tsx
/// (that page combines GET /devices and GET /sessions into one view) and
/// carries over the per-session "Sign out" action + activity/tech-details
/// expansion that live on that page, so nothing from the web /sessions page
/// (merged here intentionally) is dropped: per-session revoke, session
/// details, and "sign out everywhere" are all present below.
///
/// Pushed from Profile (see profile_screen.dart's "Devices" NavRow), not a
/// bottom-nav tab — same reasoning as Security: this is per-device
/// management with expandable activity, exactly as heavy as Passkeys or
/// Recovery, which already live as pushed screens rather than tabs. It just
/// used to be a tab before the nav went from 5 items to 4 to 3.
class DevicesScreen extends ConsumerStatefulWidget {
  const DevicesScreen({super.key});

  @override
  ConsumerState<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends ConsumerState<DevicesScreen> {
  List<dynamic> _devices = [];
  List<dynamic> _sessions = [];
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
    try {
      final devices = await api.getDevices();
      final sessions = await api.getSessions();
      if (!mounted) return;
      setState(() {
        _devices = devices;
        _sessions = sessions;
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

  Map<String, dynamic>? _sessionFor(String deviceId) {
    for (final s in _sessions.cast<Map<String, dynamic>>()) {
      if (s['device']?['deviceId'] == deviceId) return s;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Devices')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: ErrorState(message: _error!, onRetry: _load))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(Gap.lg),
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text('Devices and active sessions tied to your account.', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                          ),
                          if (_devices.isNotEmpty)
                            TextButton(
                              onPressed: () async {
                                final api = ref.read(authNotifierProvider.notifier).api;
                                final ok = await api.revokeAllSessions();
                                // Still sign out locally either way — staying signed in on
                                // *this* device just because the remote revoke call failed
                                // would be the wrong failure direction. The toast makes sure
                                // "revoke everywhere" not actually reaching every device isn't
                                // silent, even though this device signs out regardless.
                                if (!ok && context.mounted) {
                                  showActionFailure(context, "Some other sessions may not have been signed out — check your connection and try again.");
                                }
                                await ref.read(authNotifierProvider.notifier).signOut();
                              },
                              child: Text('Sign out everywhere', style: TextStyle(color: AppTheme.statusError)),
                            ),
                        ],
                      ),
                      const SizedBox(height: Gap.md),
                      if (_devices.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 40),
                          child: Column(
                            children: [
                              IconBadge(icon: Icons.devices_other_rounded, tone: Tone.neutral, size: 44),
                              const SizedBox(height: Gap.sm),
                              Text('No devices yet.', style: TextStyle(color: AppTheme.textSecondary)),
                            ],
                          ),
                        ),
                      for (final (i, d) in _devices.cast<Map<String, dynamic>>().indexed)
                        _DeviceCard(device: d, session: _sessionFor(d['deviceId'] as String), onChanged: _load).entrance(i),
                    ],
                  ),
                ),
    );
  }
}

class _DeviceCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> device;
  final Map<String, dynamic>? session;
  final VoidCallback onChanged;
  const _DeviceCard({required this.device, required this.session, required this.onChanged});

  @override
  ConsumerState<_DeviceCard> createState() => _DeviceCardState();
}

class _DeviceCardState extends ConsumerState<_DeviceCard> {
  bool _open = false;
  bool _activityLoading = false;
  List<dynamic>? _activity;

  Future<void> _toggleActivity() async {
    if (_open) {
      setState(() => _open = false);
      return;
    }
    setState(() => _open = true);
    if (_activity != null) return;
    setState(() => _activityLoading = true);
    final api = ref.read(authNotifierProvider.notifier).api;
    final events = await api.getLogins(limit: 10, deviceId: widget.device['id'] as String);
    if (!mounted) return;
    setState(() {
      _activity = events;
      _activityLoading = false;
    });
  }

  String _statusLine() {
    final session = widget.session;
    if (session != null) {
      final expiresAt = session['expiresAt'] as String?;
      final dt = expiresAt != null ? DateTime.tryParse(expiresAt) : null;
      final days = dt != null ? dt.difference(DateTime.now()).inDays.clamp(0, 9999) : 0;
      return 'Session active · expires in ${days}d';
    }
    final lastUsedAt = widget.device['lastUsedAt'] as String?;
    final dt = lastUsedAt != null ? DateTime.tryParse(lastUsedAt) : null;
    return dt != null ? 'Last used ${dt.toLocal()}' : 'Last used unknown';
  }

  @override
  Widget build(BuildContext context) {
    final device = widget.device;
    final api = ref.read(authNotifierProvider.notifier).api;
    final isTrusted = device['isTrusted'] == true;
    final isLocked = device['isLocked'] == true;
    final userAgent = device['userAgent'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: Gap.md),
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.all(Gap.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    IconBadge(
                      icon: Icons.smartphone_rounded,
                      tone: isLocked ? Tone.error : (isTrusted ? Tone.success : Tone.brand),
                    ),
                    const SizedBox(width: Gap.md),
                    Expanded(
                      child: Text(
                        (device['deviceName'] as String?)?.isNotEmpty == true ? device['deviceName'] : 'Unknown device',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
                      ),
                    ),
                    if (isTrusted) _Pill(text: 'Trusted', color: AppTheme.statusSuccess),
                    if (isLocked) _Pill(text: 'Locked', color: AppTheme.statusError),
                  ],
                ),
                const SizedBox(height: Gap.sm),
                Text(_statusLine(), style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                const SizedBox(height: Gap.md),
                Wrap(
                  spacing: Gap.sm,
                  runSpacing: Gap.sm,
                  children: [
                    OutlinedButton(
                      onPressed: _toggleActivity,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('Activity'),
                          Icon(_open ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down, size: 16),
                        ],
                      ),
                    ),
                    OutlinedButton(
                      onPressed: () async {
                        final ok = await api.trustDevice(device['id'] as String);
                        if (!context.mounted) return;
                        if (ok) {
                          widget.onChanged();
                        } else {
                          showActionFailure(context, isTrusted ? 'Could not untrust this device.' : 'Could not trust this device.');
                        }
                      },
                      child: Text(isTrusted ? 'Untrust' : 'Trust'),
                    ),
                    OutlinedButton(
                      onPressed: () async {
                        final ok = isLocked ? await api.unlockDevice(device['id'] as String) : await api.lockDevice(device['id'] as String);
                        if (!context.mounted) return;
                        if (ok) {
                          widget.onChanged();
                        } else {
                          showActionFailure(context, isLocked ? 'Could not unlock this device.' : 'Could not lock this device.');
                        }
                      },
                      child: Text(isLocked ? 'Unlock' : 'Lock'),
                    ),
                    if (widget.session != null)
                      OutlinedButton(
                        onPressed: () async {
                          final ok = await api.revokeSession(widget.session!['id'] as String);
                          if (!context.mounted) return;
                          if (ok) {
                            widget.onChanged();
                          } else {
                            showActionFailure(context, 'Could not sign out this session.');
                          }
                        },
                        child: const Text('Sign out'),
                      ),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: AppTheme.statusError),
                      onPressed: () async {
                        final ok = await api.removeDevice(device['id'] as String);
                        if (!context.mounted) return;
                        if (ok) {
                          widget.onChanged();
                        } else {
                          showActionFailure(context, 'Could not remove this device.');
                        }
                      },
                      child: const Text('Remove'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (_open)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(Gap.lg, Gap.md, Gap.lg, Gap.lg),
              decoration: BoxDecoration(
                color: AppTheme.background,
                border: Border(top: BorderSide(color: AppTheme.cardBorder)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (userAgent != null && userAgent.isNotEmpty) ...[
                    SectionHeader(title: 'Technical details'),
                    const SizedBox(height: Gap.xs),
                    Text(userAgent, style: TextStyle(fontSize: 11, fontFamily: 'monospace', color: AppTheme.textSecondary)),
                    const SizedBox(height: Gap.md),
                  ],
                  SectionHeader(title: 'Recent activity'),
                  const SizedBox(height: Gap.xs),
                  if (_activityLoading)
                    Text('Loading activity…', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary))
                  else if ((_activity ?? []).isEmpty)
                    Text('No recorded activity for this device yet.', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary))
                  else
                    for (final e in _activity!.cast<Map<String, dynamic>>())
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                [
                                  e['success'] == true ? 'Login' : 'Failed login',
                                  if (e['riskLevel'] != null) e['riskLevel'] as String,
                                  if (e['location'] != null) e['location'] as String,
                                ].join(' · '),
                                style: TextStyle(fontSize: 12, color: e['success'] == true ? AppTheme.textPrimary : AppTheme.statusError),
                              ),
                            ),
                            Text(
                              DateTime.tryParse(e['timestamp']?.toString() ?? '')?.toLocal().toString().split('.').first ?? '',
                              style: TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                            ),
                          ],
                        ),
                      ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final Color color;
  const _Pill({required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: Gap.xs + 2),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(999)),
      child: Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

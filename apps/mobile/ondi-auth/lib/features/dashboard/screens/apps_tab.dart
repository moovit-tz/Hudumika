import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api_error.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/premium_widgets.dart';
import '../../auth/auth_state.dart';

/// Connected apps — parity with apps/web/ondi-auth's apps/page.tsx
/// (GET /oauth/apps, disconnect via DELETE /oauth/consents/:clientId).
class AppsTab extends ConsumerStatefulWidget {
  const AppsTab({super.key});

  @override
  ConsumerState<AppsTab> createState() => _AppsTabState();
}

class _AppsTabState extends ConsumerState<AppsTab> {
  List<dynamic> _apps = [];
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
    try {
      final apps = await ref.read(authNotifierProvider.notifier).api.getLinkedApps();
      if (!mounted) return;
      setState(() {
        _apps = apps;
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
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: ErrorState(message: _error!, onRetry: _load));

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(Gap.lg),
        children: [
          // No repeated "Apps" heading — already the AppBar title.
          Text('Applications that use Ondi to sign you in.', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: Gap.lg),
          if (_apps.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(
                children: [
                  IconBadge(icon: Icons.apps_rounded, tone: Tone.neutral, size: 44),
                  const SizedBox(height: Gap.sm),
                  Text('No connected apps yet.', style: TextStyle(color: AppTheme.textSecondary)),
                ],
              ),
            ),
          for (final (i, app) in _apps.cast<Map<String, dynamic>>().indexed)
            _AppCard(app: app, onChanged: _load).entrance(i),
        ],
      ),
    );
  }
}

class _AppCard extends ConsumerWidget {
  final Map<String, dynamic> app;
  final VoidCallback onChanged;
  const _AppCard({required this.app, required this.onChanged});

  static const _highAccessScopes = {'credit', 'kyc', 'transactions'};

  String _connectedLabel(Map<String, dynamic> app) {
    final connectedAt = app['connectedAt'] as String?;
    final dt = connectedAt != null ? DateTime.tryParse(connectedAt) : null;
    final dateStr = dt != null ? '${dt.month}/${dt.day}/${dt.year}' : 'unknown date';
    final firstParty = app['isFirstParty'] == true;
    return 'Connected $dateStr${firstParty ? ' · Ondi' : ''}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scopes = (app['scopes'] as List?)?.cast<String>() ?? [];
    final hasHighAccess = scopes.any(_highAccessScopes.contains);

    return Container(
      margin: const EdgeInsets.only(bottom: Gap.sm),
      padding: const EdgeInsets.all(Gap.md),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.cardBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: AppTheme.primary.withOpacity(0.1),
            backgroundImage: app['logoUrl'] != null ? NetworkImage(app['logoUrl'] as String) : null,
            child: app['logoUrl'] == null ? Icon(Icons.apps_rounded, color: AppTheme.primary) : null,
          ),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(app['name'] as String? ?? 'Unknown app', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                const SizedBox(height: 2),
                Text(_connectedLabel(app), style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                if (scopes.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(scopes.join(', '), style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                ],
                if (hasHighAccess) ...[
                  const SizedBox(height: 4),
                  Text('High access', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.statusWarning)),
                ],
              ],
            ),
          ),
          if (app['isFirstParty'] != true)
            IconButton(
              icon: Icon(Icons.link_off_rounded, color: AppTheme.statusError),
              onPressed: () async {
                final confirmed = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Disconnect app?'),
                    content: Text('${app['name']} will no longer have access to your Ondi account.'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                      TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Disconnect')),
                    ],
                  ),
                );
                if (confirmed == true) {
                  final ok = await ref.read(authNotifierProvider.notifier).api.unlinkApp(app['clientId'] as String);
                  if (!context.mounted) return;
                  if (ok) {
                    onChanged();
                  } else {
                    showActionFailure(context, 'Could not disconnect this app.');
                  }
                }
              },
            ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api_error.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/premium_widgets.dart';
import '../../auth/auth_state.dart';

/// Login/activity history — parity with apps/web/ondi-auth's activity/page.tsx:
/// grouped by day with uppercase day headers, riskLevel/location subtitle
/// (not device name), and an icon+message empty state.
class ActivityTab extends ConsumerStatefulWidget {
  const ActivityTab({super.key});

  @override
  ConsumerState<ActivityTab> createState() => _ActivityTabState();
}

class _ActivityTabState extends ConsumerState<ActivityTab> {
  List<dynamic> _events = [];
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
      final events = await ref.read(authNotifierProvider.notifier).api.getLogins(limit: 50);
      if (!mounted) return;
      setState(() {
        _events = events;
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

  static const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  String _dayLabel(dynamic raw) {
    final dt = DateTime.tryParse(raw?.toString() ?? '');
    if (dt == null) return 'Unknown';
    final local = dt.toLocal();
    return '${_weekdays[local.weekday - 1]}, ${_months[local.month - 1]} ${local.day}';
  }

  List<MapEntry<String, List<Map<String, dynamic>>>> _groupByDay() {
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final e in _events.cast<Map<String, dynamic>>()) {
      final day = _dayLabel(e['timestamp']);
      groups.putIfAbsent(day, () => []).add(e);
    }
    return groups.entries.toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: ErrorState(message: _error!, onRetry: _load))
              : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(Gap.lg),
                children: [
                  Text('Sign-in activity across your identity.', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                  const SizedBox(height: Gap.lg),
                  if (_events.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      child: Column(
                        children: [
                          IconBadge(icon: Icons.history_rounded, tone: Tone.neutral, size: 44),
                          const SizedBox(height: Gap.sm),
                          Text('No recorded activity yet.', style: TextStyle(color: AppTheme.textSecondary)),
                        ],
                      ),
                    )
                  else
                    for (final group in _groupByDay()) ...[
                      Padding(
                        padding: const EdgeInsets.only(bottom: Gap.sm),
                        child: SectionHeader(title: group.key),
                      ),
                      for (final (i, e) in group.value.indexed) _EventTile(event: e).entrance(i),
                      const SizedBox(height: Gap.lg),
                    ],
                ],
              ),
            ),
    );
  }
}

class _EventTile extends StatelessWidget {
  final Map<String, dynamic> event;
  const _EventTile({required this.event});

  @override
  Widget build(BuildContext context) {
    final success = event['success'] == true;
    final riskLevel = event['riskLevel'] as String?;
    final location = event['location'] as String?;
    final title = success ? 'Signed in' : 'Sign-in failed';
    final subtitle = [riskLevel, location].whereType<String>().where((s) => s.isNotEmpty).join(' · ');

    return NavRow(
      icon: success ? Icons.login_rounded : Icons.error_outline_rounded,
      tone: success ? Tone.neutral : Tone.error,
      title: title,
      subtitle: subtitle.isEmpty ? '—' : subtitle,
      trailing: Text(_formatTime(event['timestamp']), style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
      onTap: () {},
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
}

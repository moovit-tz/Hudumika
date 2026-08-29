import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api_error.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/premium_widgets.dart';
import '../../auth/auth_state.dart';

/// Recovery contacts — parity with apps/web/ondi-auth's security/recovery/page.tsx.
class RecoveryScreen extends ConsumerStatefulWidget {
  const RecoveryScreen({super.key});

  @override
  ConsumerState<RecoveryScreen> createState() => _RecoveryScreenState();
}

class _RecoveryScreenState extends ConsumerState<RecoveryScreen> {
  List<dynamic> _contacts = [];
  List<dynamic> _pending = [];
  bool _loading = true;
  String? _error;
  final _phoneController = TextEditingController();
  String? _addError;
  bool _adding = false;

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
      final contacts = await api.getRecoveryContacts();
      final pending = await api.getPendingRecoveryInvitations();
      if (!mounted) return;
      setState(() {
        _contacts = contacts;
        _pending = pending;
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

  Future<void> _addContact() async {
    final raw = _phoneController.text.trim();
    if (raw.isEmpty) return;
    var phone = raw.replaceAll(RegExp(r'\s+'), '');
    if (phone.startsWith('0')) {
      phone = '255${phone.substring(1)}';
    } else if (!phone.startsWith('255')) {
      phone = '255$phone';
    }
    setState(() {
      _adding = true;
      _addError = null;
    });
    try {
      await ref.read(authNotifierProvider.notifier).api.addRecoveryContact(phone);
      _phoneController.clear();
      await _load();
    } catch (e) {
      if (mounted) {
        setState(() => _addError = e.toString().contains('already_added')
            ? 'Already added.'
            : e.toString().contains('user_not_found')
                ? 'No Ondi account with that number.'
                : 'Could not add that contact.');
      }
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recovery contacts')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: ErrorState(message: _error!, onRetry: _load))
              : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(Gap.lg),
                children: [
                  Text('Trusted contacts who can help you back into your account.', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                  const SizedBox(height: Gap.lg),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _phoneController,
                          keyboardType: TextInputType.phone,
                          decoration: const InputDecoration(prefixText: '+255 ', hintText: '700 000 000'),
                        ),
                      ),
                      const SizedBox(width: Gap.sm),
                      ElevatedButton(
                        onPressed: _adding ? null : _addContact,
                        child: _adding
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('Add'),
                      ),
                    ],
                  ),
                  if (_addError != null) Padding(padding: const EdgeInsets.only(top: Gap.xs + 2), child: Text(_addError!, style: TextStyle(color: AppTheme.statusError, fontSize: 12))),

                  if (_pending.isNotEmpty) ...[
                    const SizedBox(height: Gap.xxl),
                    const SectionHeader(title: 'Invitations for you'),
                    const SizedBox(height: Gap.sm),
                    for (final (i, inv) in _pending.cast<Map<String, dynamic>>().indexed)
                      NavRow(
                        icon: Icons.mail_outline_rounded,
                        title: inv['ownerName'] as String? ?? inv['ownerPhone'] as String? ?? 'Unknown',
                        subtitle: 'wants you as a recovery contact',
                        trailing: TextButton(
                          onPressed: () async {
                            final ok = await ref.read(authNotifierProvider.notifier).api.acceptRecoveryInvitation(inv['id'] as String);
                            if (!context.mounted) return;
                            if (ok) {
                              _load();
                            } else {
                              showActionFailure(context, 'Could not accept this invitation.');
                            }
                          },
                          child: const Text('Accept'),
                        ),
                        onTap: () {},
                      ).entrance(i),
                  ],

                  const SizedBox(height: Gap.xxl),
                  const SectionHeader(title: 'Your contacts'),
                  const SizedBox(height: Gap.sm),
                  if (_contacts.isEmpty)
                    Padding(padding: const EdgeInsets.all(Gap.lg), child: Text('No recovery contacts yet.', style: TextStyle(color: AppTheme.textSecondary))),
                  for (final (i, c) in _contacts.cast<Map<String, dynamic>>().indexed)
                    NavRow(
                      icon: Icons.shield_outlined,
                      tone: c['status'] == 'active' ? Tone.success : Tone.warning,
                      title: c['contactName'] as String? ?? c['contactPhone'] as String? ?? 'Unknown',
                      subtitle: c['status'] == 'active' ? 'Confirmed' : 'Pending their acceptance',
                      trailing: IconButton(
                        icon: Icon(Icons.delete_outline_rounded, color: AppTheme.statusError),
                        onPressed: () async {
                          final ok = await ref.read(authNotifierProvider.notifier).api.removeRecoveryContact(c['id'] as String);
                          if (!context.mounted) return;
                          if (ok) {
                            _load();
                          } else {
                            showActionFailure(context, 'Could not remove this contact.');
                          }
                        },
                      ),
                      onTap: () {},
                    ).entrance(i),
                ],
              ),
            ),
    );
  }
}

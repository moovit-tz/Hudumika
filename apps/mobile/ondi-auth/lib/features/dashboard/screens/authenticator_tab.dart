import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api_error.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/premium_widgets.dart';
import '../../../core/totp.dart';
import '../../auth/auth_state.dart';
import 'qr_scan_screen.dart';

/// TOTP + push-approval hub — parity with apps/web/ondi-auth's
/// authenticator/page.tsx, including real camera QR scanning (mobile_scanner
/// instead of web's browser-only BarcodeDetector, so this also works
/// natively on Android/iOS) with manual otpauth:// URI entry as the fallback
/// when scanning isn't available, same as web.
class AuthenticatorTab extends ConsumerStatefulWidget {
  const AuthenticatorTab({super.key});

  @override
  ConsumerState<AuthenticatorTab> createState() => _AuthenticatorTabState();
}

class _AuthenticatorTabState extends ConsumerState<AuthenticatorTab> {
  List<dynamic> _apps = [];
  List<dynamic> _pendingPush = [];
  bool _loading = true;
  String? _error;
  Timer? _tickTimer;
  Timer? _pushTimer;

  String? get _phone => ref.read(authNotifierProvider).profile?['phoneNumber'] as String?;

  @override
  void initState() {
    super.initState();
    _load();
    _tickTimer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
    _pushTimer = Timer.periodic(const Duration(seconds: 4), (_) => _pollPush());
  }

  @override
  void dispose() {
    _tickTimer?.cancel();
    _pushTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final phone = _phone;
    if (phone == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final apps = await ref.read(authNotifierProvider.notifier).api.getMfaApps(phone);
      if (!mounted) return;
      setState(() {
        _apps = apps;
        _loading = false;
      });
      _pollPush();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = describeApiError(e);
        _loading = false;
      });
    }
  }

  Future<void> _pollPush() async {
    final phone = _phone;
    if (phone == null) return;
    final pending = await ref.read(authNotifierProvider.notifier).api.getPendingPush(phone);
    if (mounted) setState(() => _pendingPush = pending);
  }

  Future<void> _addAccount() async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => const _AddAccountDialog(),
    );
    if (result == null) return;
    final phone = _phone;
    if (phone == null) return;
    try {
      await ref.read(authNotifierProvider.notifier).api.enrollMfaApp(
            phoneNumber: phone,
            appName: result['appName']!,
            issuer: result['issuer'],
            secret: result['secret'],
          );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().contains('already_enrolled') ? 'Already added.' : 'Could not add that account.')),
        );
      }
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
          if (_pendingPush.isNotEmpty) ...[
            const SectionHeader(title: 'Sign-in requests'),
            const SizedBox(height: Gap.sm),
            for (final s in _pendingPush.cast<Map<String, dynamic>>()) _PushCard(session: s, onDecided: _pollPush),
            const SizedBox(height: Gap.xl),
          ],
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // No repeated "Authenticator" heading — already the AppBar title.
                    Text(
                      "Accounts whose one-time codes Ondi generates for you — like Google Authenticator, built in.",
                      style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                    ),
                  ],
                ),
              ),
              TextButton(onPressed: _addAccount, child: const Text('Add account')),
            ],
          ),
          const SizedBox(height: Gap.md),
          if (_apps.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Column(
                children: [
                  IconBadge(icon: Icons.qr_code_2_rounded, tone: Tone.neutral, size: 44),
                  const SizedBox(height: Gap.sm),
                  Text('No accounts yet — add one to generate codes right here.', textAlign: TextAlign.center, style: TextStyle(color: AppTheme.textSecondary)),
                ],
              ),
            ),
          for (final (i, a) in _apps.cast<Map<String, dynamic>>().indexed) _TotpCard(app: a, onRemoved: _load).entrance(i),
        ],
      ),
    );
  }
}

class _TotpCard extends ConsumerWidget {
  final Map<String, dynamic> app;
  final VoidCallback onRemoved;
  const _TotpCard({required this.app, required this.onRemoved});

  String _addedLabel() {
    final method = (app['method'] as String? ?? 'totp').toUpperCase();
    final enrolledAt = app['enrolledAt'] as String?;
    final dt = enrolledAt != null ? DateTime.tryParse(enrolledAt) : null;
    final dateStr = dt != null ? '${dt.month}/${dt.day}/${dt.year}' : 'unknown date';
    return '$method · added $dateStr';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final secret = app['secret'] as String?;
    final isTotp = (app['method'] as String? ?? 'totp') == 'totp' && secret != null;
    final code = isTotp ? generateTotp(secret) : '------';
    final remaining = totpSecondsRemaining();

    return Container(
      margin: const EdgeInsets.only(bottom: Gap.md),
      padding: const EdgeInsets.all(Gap.md),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.cardBorder),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconBadge(icon: isTotp ? Icons.qr_code_2_rounded : Icons.notifications_active_rounded, tone: Tone.brand),
          const SizedBox(width: Gap.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(app['appName'] as String? ?? 'Account', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary)),
                const SizedBox(height: 2),
                Text(_addedLabel(), style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                const SizedBox(height: Gap.xs),
                if (isTotp)
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: code));
                      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Code copied')));
                    },
                    child: Text(
                      '${code.substring(0, 3)} ${code.substring(3)}',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 2, color: AppTheme.primary),
                    ),
                  )
                else
                  Container(
                    margin: const EdgeInsets.only(top: 2),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: AppTheme.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(999)),
                    child: Text('Push enabled', style: TextStyle(fontSize: 11, color: AppTheme.primary)),
                  ),
              ],
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (isTotp) Text('${remaining}s', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
              IconButton(
                icon: Icon(Icons.delete_outline_rounded, color: AppTheme.statusError, size: 20),
                onPressed: () async {
                  final ok = await ref.read(authNotifierProvider.notifier).api.removeMfaApp(app['id'] as String);
                  if (!context.mounted) return;
                  if (ok) {
                    onRemoved();
                  } else {
                    showActionFailure(context, 'Could not remove this account.');
                  }
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PushCard extends ConsumerWidget {
  final Map<String, dynamic> session;
  final VoidCallback onDecided;
  const _PushCard({required this.session, required this.onDecided});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      margin: const EdgeInsets.only(bottom: Gap.sm),
      padding: const EdgeInsets.all(Gap.md),
      decoration: BoxDecoration(
        color: AppTheme.primary.withOpacity(AppTheme.isDark ? 0.12 : 0.06),
        border: Border.all(color: AppTheme.primary.withOpacity(0.24)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Sign-in attempt from ${session['device'] ?? 'a device'} · ${session['location'] ?? 'Unknown location'}',
              style: TextStyle(fontSize: 13, color: AppTheme.textPrimary),
            ),
          ),
          TextButton(
            onPressed: () async {
              final ok = await ref.read(authNotifierProvider.notifier).api.approvePush(session['id'] as String, false);
              if (!context.mounted) return;
              if (ok) {
                onDecided();
              } else {
                showActionFailure(context, 'Could not deny this sign-in request.');
              }
            },
            child: Text('Deny', style: TextStyle(color: AppTheme.statusError)),
          ),
          ElevatedButton(
            onPressed: () async {
              final ok = await ref.read(authNotifierProvider.notifier).api.approvePush(session['id'] as String, true);
              if (!context.mounted) return;
              if (ok) {
                onDecided();
              } else {
                showActionFailure(context, 'Could not approve this sign-in request.');
              }
            },
            child: const Text('Approve'),
          ),
        ],
      ),
    );
  }
}

class _AddAccountDialog extends StatefulWidget {
  const _AddAccountDialog();
  @override
  State<_AddAccountDialog> createState() => _AddAccountDialogState();
}

class _AddAccountDialogState extends State<_AddAccountDialog> {
  final _uriController = TextEditingController();
  final _nameController = TextEditingController();
  final _issuerController = TextEditingController();
  final _secretController = TextEditingController();

  String? _scanError;

  void _applyUri([String? raw]) {
    final parsed = parseOtpAuthUri((raw ?? _uriController.text).trim());
    if (parsed == null) {
      if (raw != null) setState(() => _scanError = "That QR code isn't a recognized authenticator setup code.");
      return;
    }
    setState(() {
      _scanError = null;
      _uriController.text = raw ?? _uriController.text;
      _nameController.text = parsed['account'] ?? '';
      _issuerController.text = parsed['issuer'] ?? '';
      _secretController.text = parsed['secret'] ?? '';
    });
  }

  Future<void> _scanQr() async {
    final result = await Navigator.push<String>(context, MaterialPageRoute(builder: (_) => const QrScanScreen()));
    if (result != null) _applyUri(result);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add account'),
      content: SizedBox(
        width: 340,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ElevatedButton.icon(
              onPressed: _scanQr,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan QR code'),
            ),
            if (_scanError != null)
              Padding(
                padding: const EdgeInsets.only(top: Gap.sm),
                child: Text(_scanError!, style: TextStyle(color: AppTheme.statusError, fontSize: 12)),
              ),
            const SizedBox(height: Gap.md),
            TextField(
              controller: _uriController,
              decoration: const InputDecoration(labelText: 'Or paste otpauth:// setup URI'),
              onSubmitted: (_) => _applyUri(),
            ),
            TextButton(onPressed: () => _applyUri(), child: const Text('Use this URI')),
            const Divider(),
            Text('Or enter manually', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: Gap.sm),
            TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'Account name')),
            TextField(controller: _issuerController, decoration: const InputDecoration(labelText: 'Issuer')),
            TextField(controller: _secretController, decoration: const InputDecoration(labelText: 'Secret key')),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        TextButton(
          onPressed: () {
            if (_nameController.text.trim().isEmpty || _secretController.text.trim().isEmpty) return;
            Navigator.pop(context, {
              'appName': _nameController.text.trim(),
              'issuer': _issuerController.text.trim(),
              'secret': _secretController.text.trim(),
            });
          },
          child: const Text('Add'),
        ),
      ],
    );
  }
}

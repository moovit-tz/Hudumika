import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/premium_widgets.dart';
import '../../auth/auth_state.dart';

/// Account deletion — parity with apps/web/ondi-auth's profile/page.tsx
/// delete flow: type DELETE to confirm intent, request an OTP challenge,
/// confirm with the code, then the account is gone.
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

enum _Step { confirm, otp }

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  _Step _step = _Step.confirm;
  final _typedConfirm = TextEditingController();
  final _codeController = TextEditingController();
  String? _challengeId;
  String? _destination;
  bool _busy = false;
  String? _error;

  Future<void> _startDeletion() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final res = await ref.read(authNotifierProvider.notifier).api.requestAccountDeletion();
      setState(() {
        _challengeId = res['challengeId'] as String;
        _destination = res['destination'] as String?;
        _step = _Step.otp;
      });
    } catch (e) {
      setState(() => _error = 'Could not start account deletion. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirmDeletion() async {
    final challengeId = _challengeId;
    if (challengeId == null || _codeController.text.trim().length < 6) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authNotifierProvider.notifier).api.confirmAccountDeletion(challengeId, _codeController.text.trim());
      await ref.read(authNotifierProvider.notifier).signOut();
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    } catch (e) {
      setState(() => _error = 'That code didn\'t work. Try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Delete account')),
      body: Padding(
        padding: const EdgeInsets.all(Gap.xxl),
        child: _step == _Step.confirm ? _confirmStep() : _otpStep(),
      ),
    );
  }

  Widget _confirmStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AlertBanner(
          tone: Tone.error,
          icon: Icons.warning_rounded,
          title: 'This is permanent',
          body: "This can't be undone. It permanently removes your passkeys and PIN, authenticator accounts and codes, trusted devices and active sessions, and access for every connected app.",
        ),
        const SizedBox(height: Gap.lg),
        _RemovalItem(icon: Icons.vpn_key_outlined, label: 'Passkeys and your PIN'),
        _RemovalItem(icon: Icons.qr_code_2, label: 'Authenticator accounts and codes'),
        _RemovalItem(icon: Icons.devices_other_outlined, label: 'Trusted devices and active sessions'),
        _RemovalItem(icon: Icons.apps, label: 'Access for every connected app'),
        const SizedBox(height: Gap.xxl),
        Text('Type DELETE to confirm', style: TextStyle(fontSize: 13, color: AppTheme.textPrimary, fontWeight: FontWeight.w600)),
        const SizedBox(height: Gap.sm),
        TextField(controller: _typedConfirm, onChanged: (_) => setState(() {})),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: Gap.sm), child: Text(_error!, style: TextStyle(color: AppTheme.statusError))),
        const SizedBox(height: Gap.xl),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.statusError),
          onPressed: (_typedConfirm.text.trim() == 'DELETE' && !_busy) ? _startDeletion : null,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Continue'),
        ),
      ],
    );
  }

  Widget _otpStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Enter the code', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
        const SizedBox(height: Gap.sm),
        Text('Sent to ${_destination ?? 'your account'}', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
        const SizedBox(height: Gap.xl),
        TextField(
          controller: _codeController,
          keyboardType: TextInputType.number,
          maxLength: 6,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 24, letterSpacing: 8),
          decoration: const InputDecoration(counterText: ''),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: Gap.sm), child: Text(_error!, style: TextStyle(color: AppTheme.statusError))),
        const SizedBox(height: Gap.md),
        ElevatedButton(
          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.statusError),
          onPressed: _busy ? null : _confirmDeletion,
          child: _busy
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Permanently delete my account'),
        ),
      ],
    );
  }
}

class _RemovalItem extends StatelessWidget {
  final IconData icon;
  final String label;
  const _RemovalItem({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Gap.xs + 1),
      child: Row(
        children: [
          IconBadge(icon: icon, tone: Tone.neutral, size: 28),
          const SizedBox(width: Gap.sm + 2),
          Expanded(child: Text(label, style: TextStyle(fontSize: 13, color: AppTheme.textPrimary))),
        ],
      ),
    );
  }
}

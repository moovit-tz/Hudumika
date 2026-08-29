import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api_error.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/premium_widgets.dart';
import '../../auth/auth_state.dart';
import 'webauthn_registration.dart';

/// Passkeys — list, delete, and (on web) create. Creating a passkey runs a
/// real navigator.credentials.create() ceremony via
/// webauthn_registration_web.dart, mirroring apps/web/ondi-auth's
/// @simplewebauthn/browser-based flow against the same
/// /webauthn/register/options + /webauthn/register/verify endpoints.
/// Android/iOS creation isn't wired up (needs Credential Manager /
/// ASAuthorization platform channels, not this browser API) —
/// webauthn_registration_native.dart fails that clearly instead of
/// pretending to attempt it. List/delete hit real GET/DELETE
/// /webauthn/credentials endpoints on every platform.
class PasskeysScreen extends ConsumerStatefulWidget {
  const PasskeysScreen({super.key});

  @override
  ConsumerState<PasskeysScreen> createState() => _PasskeysScreenState();
}

class _PasskeysScreenState extends ConsumerState<PasskeysScreen> {
  List<dynamic> _credentials = [];
  bool _loading = true;
  String? _error;
  bool _registering = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _addPasskey() async {
    setState(() => _registering = true);
    try {
      final api = ref.read(authNotifierProvider.notifier).api;
      final options = await api.getWebauthnRegisterOptions();
      final response = await createPasskeyCredential(options);
      final ok = await api.verifyWebauthnRegistration(response, deviceName: _guessDeviceName());
      if (!mounted) return;
      if (ok) {
        await _load();
      } else {
        showActionFailure(context, 'Could not save this passkey.');
      }
    } catch (e) {
      if (!mounted) return;
      showActionFailure(context, 'Could not create a passkey: ${_describeCeremonyError(e)}');
    } finally {
      if (mounted) setState(() => _registering = false);
    }
  }

  String _describeCeremonyError(Object e) {
    final msg = e.toString();
    if (msg.contains('NotAllowedError') || msg.contains('cancelled') || msg.contains('denied')) {
      return 'cancelled or denied.';
    }
    return 'your device or browser may not support this.';
  }

  String _guessDeviceName() {
    // Best-effort label — the actual credential works regardless of what
    // this says; it's just what shows up in the list afterward, same as
    // apps/web/ondi-auth's guessDeviceName().
    return 'Passkey';
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final creds = await ref.read(authNotifierProvider.notifier).api.getWebauthnCredentials();
      if (!mounted) return;
      setState(() {
        _credentials = creds;
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

  String _fmtDate(dynamic raw) {
    final dt = raw != null ? DateTime.tryParse(raw.toString()) : null;
    if (dt == null) return '';
    final local = dt.toLocal();
    return '${local.month}/${local.day}/${local.year}';
  }

  String _subtitleFor(Map<String, dynamic> c) {
    final added = 'Added ${_fmtDate(c['createdAt'])}';
    final lastUsedAt = c['lastUsedAt'];
    if (lastUsedAt == null) return added;
    return '$added · last used ${_fmtDate(lastUsedAt)}';
  }

  @override
  Widget build(BuildContext context) {
    final supported = isWebauthnSupported();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Passkeys'),
        actions: [
          if (supported)
            TextButton.icon(
              onPressed: _registering ? null : _addPasskey,
              icon: _registering
                  ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary))
                  : const Icon(Icons.add_rounded),
              label: Text(_registering ? 'Adding…' : 'Add'),
            ),
          const SizedBox(width: Gap.sm),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: ErrorState(message: _error!, onRetry: _load))
              : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(Gap.lg),
                children: [
                  if (!supported)
                    AlertBanner(
                      tone: Tone.brand,
                      icon: Icons.info_rounded,
                      title: "Adding a new passkey isn't available on this device yet",
                      body: 'Existing passkeys can be viewed and removed below. Try this from a browser on the web version of Ondi to add one.',
                    ),
                  if (!supported) const SizedBox(height: Gap.lg),
                  if (_credentials.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      child: Column(
                        children: [
                          IconBadge(icon: Icons.fingerprint_rounded, tone: Tone.neutral, size: 44),
                          const SizedBox(height: Gap.sm),
                          Text('No passkeys registered.', style: TextStyle(color: AppTheme.textSecondary)),
                          if (supported) ...[
                            const SizedBox(height: Gap.md),
                            TextButton.icon(
                              onPressed: _registering ? null : _addPasskey,
                              icon: const Icon(Icons.add_rounded, size: 16),
                              label: Text(_registering ? 'Adding…' : 'Set up your first passkey'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  for (final (i, c) in _credentials.cast<Map<String, dynamic>>().indexed)
                    NavRow(
                      icon: Icons.fingerprint_rounded,
                      tone: Tone.success,
                      title: c['deviceName'] as String? ?? 'Passkey',
                      subtitle: _subtitleFor(c),
                      trailing: IconButton(
                        icon: Icon(Icons.delete_outline_rounded, color: AppTheme.statusError),
                        onPressed: () async {
                          final ok = await ref.read(authNotifierProvider.notifier).api.deleteWebauthnCredential(c['id'] as String);
                          if (!context.mounted) return;
                          if (ok) {
                            _load();
                          } else {
                            showActionFailure(context, 'Could not remove this passkey.');
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

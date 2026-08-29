import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/premium_widgets.dart';
import '../auth/auth_state.dart';

/// OAuth/OIDC consent screen — web port of
/// apps/mobile/ondi/lib/features/oauth/authorize_screen.dart (itself a port
/// of apps/web/ondi-auth's authorize/page.tsx). On the web there's no
/// custom-scheme deep link to translate — this screen is reached directly
/// via /authorize?client_id=... in the URL bar, and the redirect hand-off
/// navigates the current tab instead of launching an external app.
class AuthorizeScreen extends ConsumerStatefulWidget {
  final Map<String, String> queryParams;
  const AuthorizeScreen({super.key, required this.queryParams});

  @override
  ConsumerState<AuthorizeScreen> createState() => _AuthorizeScreenState();
}

class _AuthorizeScreenState extends ConsumerState<AuthorizeScreen> {
  Map<String, dynamic>? _ctx;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final api = ref.read(authNotifierProvider.notifier).api;
    try {
      final ctx = await api.getAuthorizeContext(widget.queryParams);
      if (!mounted) return;
      setState(() => _ctx = ctx);
      if (ctx['isFirstParty'] == true) await _issueCode(ctx);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = _messageFor(e));
    }
  }

  Future<void> _issueCode(Map<String, dynamic> ctx) async {
    final api = ref.read(authNotifierProvider.notifier).api;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final clientId = ctx['clientId'] as String;
      final scopes = (ctx['requestedScopes'] as List).cast<String>();
      await api.grantOauthConsent(clientId, scopes);
      final code = await api.issueOauthCode(clientId, scopes.join(' '), codeChallenge: ctx['codeChallenge'] as String?);

      final base = Uri.parse(ctx['redirectUri'] as String);
      final redirect = base.replace(queryParameters: {
        ...base.queryParameters,
        'code': code,
        if (ctx['state'] != null) 'state': ctx['state'] as String,
      });
      await launchUrl(redirect, webOnlyWindowName: '_self');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _messageFor(e);
      });
    }
  }

  Future<void> _cancel() async {
    final ctx = _ctx;
    if (ctx == null) return;
    final base = Uri.parse(ctx['redirectUri'] as String);
    final redirect = base.replace(queryParameters: {
      ...base.queryParameters,
      'error': 'access_denied',
      if (ctx['state'] != null) 'state': ctx['state'] as String,
    });
    await launchUrl(redirect, webOnlyWindowName: '_self');
  }

  String _messageFor(Object e) {
    final message = e.toString();
    if (message.contains('consent_required')) return 'This app needs your consent to continue.';
    if (message.contains('access_blocked_by_policy')) return 'Access to this app is blocked by your organization\'s policy.';
    if (message.contains('invalid_client')) return 'This app is not recognized by Ondi.';
    return 'Something went wrong. Please try again.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SafeArea(child: Center(child: Padding(padding: const EdgeInsets.all(24), child: _buildContent()))),
    );
  }

  Widget _buildContent() {
    if (_error != null) {
      return AlertBanner(
        tone: Tone.error,
        icon: Icons.error_rounded,
        title: 'Something went wrong',
        body: _error!,
      );
    }

    final ctx = _ctx;
    if (ctx == null || ctx['isFirstParty'] == true) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: Gap.lg),
          Text('Signing you in…', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
        ],
      );
    }

    final scopes = (ctx['requestedScopes'] as List).cast<String>();

    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(maxWidth: 380),
      padding: const EdgeInsets.all(Gap.xxl),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppTheme.cardBorder),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: AppTheme.primary.withOpacity(0.1),
            backgroundImage: ctx['clientLogoUrl'] != null ? NetworkImage(ctx['clientLogoUrl'] as String) : null,
            child: ctx['clientLogoUrl'] == null ? HugeIcon(icon: HugeIcons.strokeRoundedShield01, color: AppTheme.primary) : null,
          ),
          const SizedBox(height: Gap.lg),
          Text(
            '${ctx['clientName']} wants to access your Ondi account',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
          ),
          const SizedBox(height: Gap.lg),
          Align(
            alignment: Alignment.centerLeft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: scopes
                  .map((s) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Text('•  $s', style: TextStyle(fontSize: 13, color: AppTheme.textSecondary)),
                      ))
                  .toList(),
            ),
          ),
          const SizedBox(height: Gap.xxl),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : _cancel,
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: AppTheme.border),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                  ),
                  child: Text('Cancel', style: TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.w600)),
                ),
              ),
              const SizedBox(width: Gap.md),
              Expanded(
                child: ElevatedButton(
                  onPressed: _busy ? null : () => _issueCode(ctx),
                  child: _busy
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Allow access'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

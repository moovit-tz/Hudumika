import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth_gradient.dart';
import '../../core/ondi_footer.dart';
import '../../core/ondi_logo.dart';
import '../../core/otp_errors.dart';
import '../../core/theme/auth_widgets.dart';
import '../../core/theme/premium_widgets.dart';
import '../auth/auth_state.dart';
import 'google_button.dart';

enum _Step { welcome, phone, otp }

/// Login flow — welcome/phone/OTP parity with apps/web/ondi-auth's
/// login/page.tsx: same dark brand-gradient background, glass pill inputs,
/// gradient CTA button, and 6-box OTP entry (see OtpInput.tsx). Google
/// sign-in is platform-conditional (see google_button.dart): web renders
/// GIS's own button and drives sign-in via AuthNotifier's
/// authenticationEvents listener; Android/iOS use a normal button that
/// calls .authenticate() directly. Shared chrome (gradient buttons, glass
/// inputs, code boxes) lives in core/theme/auth_widgets.dart so onboarding
/// (the very next screen in this flow) reads as the same product instead of
/// handing off to a plain-themed form.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  _Step _step = _Step.welcome;
  final _phoneController = TextEditingController();
  String _otp = '';
  bool _busy = false;
  String? _error;

  Future<void> _submitPhone() async {
    final raw = _phoneController.text.trim().replaceAll(RegExp(r'\s+'), '');
    if (raw.isEmpty) return;
    var phone = raw;
    if (phone.startsWith('0')) {
      phone = '255${phone.substring(1)}';
    } else if (!phone.startsWith('255')) {
      phone = '255$phone';
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authNotifierProvider.notifier).submitPhone(phone);
      if (mounted) setState(() => _step = _Step.otp);
    } catch (e) {
      if (mounted) setState(() => _error = _describeError(e, fallback: 'Failed to send code'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitOtp() async {
    if (_otp.length < 6) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authNotifierProvider.notifier).verifyOtp(_otp);
    } catch (e) {
      if (mounted) setState(() => _error = _describeError(e, fallback: 'Verification failed'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Surfaces the backend's actual error (rate-limited vs. a real failure)
  /// instead of a single generic "could not send code" for every case —
  /// see core/otp_errors.dart.
  String _describeError(Object e, {required String fallback}) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        final code = data['error'] as String?;
        final retryAfter = data['retryAfter'] as num?;
        final friendly = formatOtpError(code, retryAfter);
        if (friendly != null) return friendly;
        if (code == 'otp_expired') return 'Code expired. Request a new one.';
        if (code == 'invalid_otp' || code == 'otp_not_found') return 'Incorrect code.';
        if (code == 'max_attempts_exceeded') return 'Too many attempts. Request a new code.';
      }
      if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
        return 'No connection. Check your network and try again.';
      }
    }
    return fallback;
  }

  @override
  Widget build(BuildContext context) {
    // AuthNotifier sets state.error for failures that happen inside its own
    // Google authenticationEvents listener (not a call this screen awaits
    // directly, e.g. submitPhone/verifyOtp are) — without mirroring it into
    // the local _error this screen actually renders, a failed Google
    // sign-in looked like nothing happened at all: picker closes, no error,
    // no navigation.
    ref.listen<AuthState>(authNotifierProvider, (previous, next) {
      if (next.error != null && next.error != previous?.error) {
        setState(() {
          _error = next.error;
          _busy = false;
        });
      }
    });
    return Scaffold(
      body: AuthGradientBackground(
        child: SafeArea(
          child: Column(
            children: [
              SizedBox(
                height: 48,
                child: _step != _Step.welcome
                    ? Align(
                        alignment: Alignment.topLeft,
                        child: IconButton(
                          onPressed: () => setState(() {
                            _error = null;
                            _step = _step == _Step.otp ? _Step.phone : _Step.welcome;
                          }),
                          icon: const Icon(Icons.arrow_back, color: Colors.white),
                        ),
                      )
                    : null,
              ),
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 400),
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        switchInCurve: Curves.easeOut,
                        transitionBuilder: (child, animation) => FadeTransition(
                          opacity: animation,
                          child: SlideTransition(
                            position: Tween<Offset>(begin: const Offset(0, 0.03), end: Offset.zero).animate(animation),
                            child: child,
                          ),
                        ),
                        child: KeyedSubtree(key: ValueKey(_step), child: _buildStep()),
                      ),
                    ),
                  ),
                ),
              ),
              const Padding(padding: EdgeInsets.only(bottom: 8), child: OndiFooter(dark: true)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStep() {
    switch (_step) {
      case _Step.welcome:
        return _welcome();
      case _Step.phone:
        return _phone();
      case _Step.otp:
        return _otpStep();
    }
  }

  Widget _welcome() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const OndiLogo(size: 56),
        const SizedBox(height: Gap.xl),
        const Text(
          'Welcome to Ondi',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        const SizedBox(height: 6),
        Text(
          'Your identity. Your access. Your control.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.7), height: 1.4),
        ),
        if (_error != null) ...[
          const SizedBox(height: Gap.xl),
          AuthErrorText(_error!),
        ],
        const SizedBox(height: 36),
        GoogleButton(onError: (msg) => setState(() => _error = msg)),
        const SizedBox(height: 10),
        GlassPillButton(
          label: 'Continue with phone number',
          onPressed: () => setState(() {
            _error = null;
            _step = _Step.phone;
          }),
        ),
      ],
    );
  }

  Widget _phone() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: Gap.sm),
        const Text(
          "What's your phone number?",
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        const SizedBox(height: 6),
        Text(
          "We'll use your number to create or find your Ondi identity.",
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.7), height: 1.4),
        ),
        const SizedBox(height: Gap.xxl),
        Container(
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.08),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withOpacity(0.22)),
          ),
          child: Row(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  '+255',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                ),
              ),
              Container(width: 1, height: 22, color: Colors.white.withOpacity(0.3)),
              Expanded(
                child: TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  autofocus: true,
                  style: const TextStyle(color: Colors.white, fontSize: 15),
                  onSubmitted: (_) => _busy ? null : _submitPhone(),
                  decoration: InputDecoration(
                    hintText: '700 000 000',
                    hintStyle: TextStyle(color: Colors.white.withOpacity(0.4)),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(vertical: 15, horizontal: 12),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 14),
          AuthErrorText(_error!),
        ],
        const SizedBox(height: 28),
        GradientPillButton(
          label: _busy ? 'Sending…' : 'Continue',
          busy: _busy,
          onPressed: _busy ? null : _submitPhone,
        ),
      ],
    );
  }

  Widget _otpStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: Gap.sm),
        const Text(
          'Verify your number',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        const SizedBox(height: 6),
        Text(
          'We sent a 6-digit code to +${_phoneController.text.trim()}.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.7), height: 1.4),
        ),
        const SizedBox(height: 28),
        CodeBoxes(
          error: _error != null,
          onChanged: (v) {
            _otp = v;
            if (v.length == 6) _submitOtp();
          },
        ),
        if (_error != null) ...[
          const SizedBox(height: Gap.lg),
          AuthErrorText(_error!),
        ],
        const SizedBox(height: 28),
        GradientPillButton(
          label: _busy ? 'Verifying…' : 'Verify',
          busy: _busy,
          onPressed: _busy ? null : _submitOtp,
        ),
      ],
    );
  }
}

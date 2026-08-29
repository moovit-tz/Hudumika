import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth_gradient.dart';
import '../../core/ondi_footer.dart';
import '../../core/ondi_logo.dart';
import '../../core/theme/auth_widgets.dart';
import '../../core/theme/premium_widgets.dart';
import '../auth/auth_state.dart';

/// Onboarding wizard — name / security-code(PIN) / device-trust, parity
/// with apps/web/ondi-auth's onboarding/page.tsx minus the passkey path
/// (deferred) and the phone-link step. Renders on the same
/// AuthGradientBackground + glass/gradient chrome as login_screen.dart
/// (core/theme/auth_widgets.dart) — this used to fall back to the app's
/// flat light/dark theme instead, so signing in handed off to what looked
/// like a different, unfinished app one screen later. Known gap: Google
/// sign-in is now wired (see AuthNotifier._initGoogle), and a Google-only
/// signup gets a non-deliverable `federated_<provider>_<sub>` placeholder
/// phone number (same as the web app — see hasDeliverablePhone in its
/// src/lib/api.ts) — nothing here re-prompts for a real phone the way
/// onboarding/page.tsx's phone-link step does, so recovery contacts and MFA
/// push (both keyed by phoneNumber) won't work for a Google-only account
/// until that step is ported too.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  String _pin = '';
  bool _busy = false;
  String? _error;

  static const _steps = [AuthStatus.onboardingName, AuthStatus.onboardingSecurity, AuthStatus.onboardingDeviceTrust];

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(authNotifierProvider).status;
    final stepIndex = _steps.indexOf(status).clamp(0, _steps.length - 1);

    return Scaffold(
      body: AuthGradientBackground(
        child: SafeArea(
          child: Column(
            children: [
              const SizedBox(height: 8),
              Expanded(
                child: Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 400),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const OndiLogo(size: 44),
                          const SizedBox(height: Gap.lg),
                          AuthStepDots(step: stepIndex, total: _steps.length),
                          const SizedBox(height: Gap.xxl),
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 220),
                            switchInCurve: Curves.easeOut,
                            transitionBuilder: (child, animation) => FadeTransition(
                              opacity: animation,
                              child: SlideTransition(
                                position: Tween<Offset>(begin: const Offset(0, 0.03), end: Offset.zero).animate(animation),
                                child: child,
                              ),
                            ),
                            child: KeyedSubtree(
                              key: ValueKey(status),
                              child: switch (status) {
                                AuthStatus.onboardingName => _nameStep(),
                                AuthStatus.onboardingSecurity => _securityStep(),
                                AuthStatus.onboardingDeviceTrust => _deviceTrustStep(),
                                _ => const SizedBox(height: 200, child: Center(child: CircularProgressIndicator(color: Colors.white))),
                              },
                            ),
                          ),
                        ],
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

  Widget _nameStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          "What's your name?",
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        const SizedBox(height: 6),
        Text(
          "So we know who's signing in.",
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.7), height: 1.4),
        ),
        const SizedBox(height: Gap.xxl),
        GlassInput(controller: _firstName, hint: 'First name', autofocus: true),
        const SizedBox(height: Gap.md),
        GlassInput(controller: _lastName, hint: 'Last name (optional)'),
        if (_error != null) ...[const SizedBox(height: Gap.md), AuthErrorText(_error!)],
        const SizedBox(height: Gap.xxl),
        GradientPillButton(
          label: _busy ? 'Saving…' : 'Continue',
          busy: _busy,
          onPressed: () async {
            if (_firstName.text.trim().isEmpty) return;
            setState(() => _busy = true);
            await ref.read(authNotifierProvider.notifier).completeName(_firstName.text.trim(), _lastName.text.trim());
            if (mounted) setState(() => _busy = false);
          },
        ),
      ],
    );
  }

  Widget _securityStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Set a security PIN',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        const SizedBox(height: 6),
        Text(
          'A 6-digit PIN for confirming sensitive actions.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.7), height: 1.4),
        ),
        const SizedBox(height: Gap.xxl),
        CodeBoxes(
          obscure: true,
          error: _error != null,
          onChanged: (v) => _pin = v,
        ),
        if (_error != null) ...[const SizedBox(height: Gap.md), AuthErrorText(_error!)],
        const SizedBox(height: Gap.xxl),
        GradientPillButton(
          label: _busy ? 'Saving…' : 'Continue',
          busy: _busy,
          onPressed: () async {
            if (_pin.length != 6) return;
            setState(() {
              _busy = true;
              _error = null;
            });
            final ok = await ref.read(authNotifierProvider.notifier).completeSecurityCode(_pin);
            if (mounted) {
              setState(() {
                _busy = false;
                if (!ok) _error = 'Could not save your PIN. Try again.';
              });
            }
          },
        ),
      ],
    );
  }

  Widget _deviceTrustStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _TrustBadge(),
        const SizedBox(height: Gap.xl),
        const Text(
          'Trust this device?',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        const SizedBox(height: 6),
        Text(
          "You won't be asked for a code again here.",
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: Colors.white.withOpacity(0.7), height: 1.4),
        ),
        const SizedBox(height: Gap.xxl),
        GradientPillButton(
          label: _busy ? 'Finishing…' : 'Done',
          busy: _busy,
          onPressed: () async {
            setState(() => _busy = true);
            await ref.read(authNotifierProvider.notifier).completeDeviceTrust();
          },
        ),
      ],
    );
  }
}

/// Soft-tint shield badge — a bit of visual weight for the final step,
/// matching the icon-in-tinted-circle language the rest of the app (see
/// IconBadge in premium_widgets.dart) already uses, scaled up for a
/// full-screen moment instead of a list row.
class _TrustBadge extends StatelessWidget {
  const _TrustBadge();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 72,
        height: 72,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.10),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withOpacity(0.22)),
        ),
        child: const Icon(Icons.shield_rounded, color: Colors.white, size: 32),
      ),
    );
  }
}

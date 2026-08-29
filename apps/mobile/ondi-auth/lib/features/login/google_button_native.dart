import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hugeicons/hugeicons.dart';
import '../auth/auth_state.dart';

/// Android/iOS Google button — unlike web (GIS owns its own click via
/// renderButton), native platforms support GoogleSignIn.authenticate()
/// directly, same as apps/mobile/ondi's login flow.
///
/// Styled as a white/translucent glass pill (not AppTheme's light/dark
/// border+text colors) because it always sits on login_screen.dart's fixed
/// dark AuthGradientBackground regardless of the app's theme toggle — the
/// same reason that screen's other controls (phone pill, OTP boxes) hardcode
/// white rather than following AppTheme.
class GoogleButton extends ConsumerStatefulWidget {
  final void Function(String message) onError;
  const GoogleButton({super.key, required this.onError});

  @override
  ConsumerState<GoogleButton> createState() => _GoogleButtonState();
}

class _GoogleButtonState extends ConsumerState<GoogleButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: _busy
            ? null
            : () async {
                setState(() => _busy = true);
                await ref.read(authNotifierProvider.notifier).ensureGoogleReady();
                await ref.read(authNotifierProvider.notifier).signInWithGoogleNative();
                if (mounted) setState(() => _busy = false);
              },
        icon: _busy
            ? const SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : const HugeIcon(icon: HugeIcons.strokeRoundedGoogle, color: Colors.white, size: 18),
        label: const Text('Continue with Google', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        style: OutlinedButton.styleFrom(
          backgroundColor: Colors.white.withOpacity(0.12),
          side: BorderSide(color: Colors.white.withOpacity(0.28)),
          padding: const EdgeInsets.symmetric(vertical: 15),
          shape: const StadiumBorder(),
        ),
      ),
    );
  }
}

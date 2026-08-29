import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in_web/web_only.dart' as gsi_web;
import '../auth/auth_state.dart';

/// Renders the real GIS button once the SDK is initialized. There's no
/// "onPressed" here — GIS owns the click and drives sign-in via the
/// authenticationEvents stream AuthNotifier already listens to.
class GoogleButton extends ConsumerWidget {
  final void Function(String message) onError;
  const GoogleButton({super.key, required this.onError});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<void>(
      future: ref.read(authNotifierProvider.notifier).ensureGoogleReady(),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const SizedBox(height: 44, child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
        }
        if (snapshot.hasError) {
          // Deferred to after this build — calling onError (which does
          // setState on LoginScreen) synchronously here throws "setState()
          // called during build" because this builder itself runs as part
          // of LoginScreen's build phase.
          WidgetsBinding.instance.addPostFrameCallback((_) => onError('Google sign-in is unavailable right now.'));
          return const SizedBox.shrink();
        }
        return Align(
          child: gsi_web.renderButton(
            configuration: gsi_web.GSIButtonConfiguration(
              type: gsi_web.GSIButtonType.standard,
              theme: gsi_web.GSIButtonTheme.outline,
              size: gsi_web.GSIButtonSize.large,
              shape: gsi_web.GSIButtonShape.pill,
              text: gsi_web.GSIButtonText.continueWith,
              logoAlignment: gsi_web.GSIButtonLogoAlignment.left,
            ),
          ),
        );
      },
    );
  }
}

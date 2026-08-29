import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/auth_state.dart';
import '../features/legal/privacy_screen.dart';
import '../features/legal/terms_screen.dart';
import '../features/login/login_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/oauth/authorize_screen.dart';
import '../features/home/home_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = _AuthRefreshListenable(ref);

  return GoRouter(
    refreshListenable: refreshNotifier,
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/onboarding', builder: (context, state) => const OnboardingScreen()),
      GoRoute(
        path: '/authorize',
        builder: (context, state) => AuthorizeScreen(queryParams: state.uri.queryParameters),
      ),
      GoRoute(path: '/terms', builder: (context, state) => const TermsScreen()),
      GoRoute(path: '/privacy', builder: (context, state) => const PrivacyScreen()),
    ],
    redirect: (context, state) {
      // Android/iOS only: the ondiauth://authorize deep link (see the
      // AndroidManifest.xml intent-filter) arrives with "authorize" parsed
      // as the URI host, not a path — normalize to the in-app route our
      // GoRoute below matches. This never fires on web, where the app is
      // reached by URL path directly. Once rewritten to a relative path,
      // state.uri.scheme is empty on the next pass, so this doesn't loop.
      if (state.uri.scheme == 'ondiauth') {
        final normalized = Uri(
          path: '/${state.uri.host}${state.uri.path}',
          query: state.uri.query.isEmpty ? null : state.uri.query,
        );
        return normalized.toString();
      }

      final status = ref.read(authNotifierProvider).status;
      final loc = state.matchedLocation;
      final fullPath = state.uri.toString();

      // Terms/Privacy are legal pages, not part of the auth flow — reachable
      // (via the footer) from the login screen before signing in just as
      // much as from an authenticated Profile screen, so they're exempt
      // from every status check below.
      if (loc == '/terms' || loc == '/privacy') return null;

      if (status == AuthStatus.checking) return null;

      // A visitor who deep-links straight to e.g. /authorize?client_id=...
      // (a relying-party sign-in request, including via the ondiauth://
      // scheme normalized above) while logged out must land back on that
      // exact destination once they finish login+onboarding — mirrors
      // apps/web/ondi-auth's login/page.tsx & onboarding/page.tsx threading
      // a `redirect` search param through the same detour. Without this,
      // the destination was silently dropped and the visitor landed on '/'
      // with the relying-party's request lost.
      // /, /login and /onboarding are the auth-flow routes themselves —
      // never worth capturing as a "redirect back to" target (that caused a
      // real bug: signing in from /login captured '/login' itself as the
      // target, bouncing back through /login again post-onboarding instead
      // of going straight home).
      bool isAuthFlowRoute(String l) => l == '/' || l == '/login' || l == '/onboarding';

      if (status == AuthStatus.loggedOut) {
        if (loc == '/login') return null;
        final target = isAuthFlowRoute(loc) ? null : fullPath;
        return target == null ? '/login' : '/login?redirect=${Uri.encodeComponent(target)}';
      }
      if (status == AuthStatus.onboardingName ||
          status == AuthStatus.onboardingSecurity ||
          status == AuthStatus.onboardingDeviceTrust) {
        if (loc == '/onboarding') return null;
        // Carry forward whatever /login was given (e.g. /login?redirect=...)
        // rather than deriving fresh from the current location, since by
        // this point the current location usually already IS /login.
        final existing = state.uri.queryParameters['redirect'];
        final target = existing ?? (isAuthFlowRoute(loc) ? null : fullPath);
        return target == null ? '/onboarding' : '/onboarding?redirect=${Uri.encodeComponent(target)}';
      }
      // authenticated: keep /authorize reachable, bounce away from /login
      // and /onboarding — to the carried-forward redirect target if there
      // was one, otherwise home.
      if (loc == '/login' || loc == '/onboarding') {
        final redirect = state.uri.queryParameters['redirect'];
        return (redirect != null && redirect.isNotEmpty) ? Uri.decodeComponent(redirect) : '/';
      }
      return null;
    },
  );
});

class _AuthRefreshListenable extends ChangeNotifier {
  _AuthRefreshListenable(Ref ref) {
    ref.listen(authNotifierProvider, (_, __) => notifyListeners());
  }
}

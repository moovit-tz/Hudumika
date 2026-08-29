import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/api_client.dart';

/// Same Google OAuth Web client ID used by apps/web/ondi-auth and
/// apps/mobile/ondi (see web/index.html's google-signin-client_id meta tag,
/// which google_sign_in_web also auto-detects — passed explicitly here too
/// so init doesn't depend on the meta tag alone).
const _googleWebClientId = '749387198315-495oj9aejbmhnvahvphpiq3o4f2e53v1.apps.googleusercontent.com';

enum AuthStatus {
  checking,
  loggedOut,
  onboardingName,
  onboardingSecurity,
  onboardingDeviceTrust,
  authenticated,
}

class AuthState {
  final AuthStatus status;
  final String? pendingPhone;
  final Map<String, dynamic>? profile;
  final String? error;

  const AuthState({this.status = AuthStatus.checking, this.pendingPhone, this.profile, this.error});

  AuthState copyWith({AuthStatus? status, String? pendingPhone, Map<String, dynamic>? profile, String? error}) {
    return AuthState(
      status: status ?? this.status,
      pendingPhone: pendingPhone ?? this.pendingPhone,
      profile: profile ?? this.profile,
      error: error,
    );
  }
}

/// Onboarding-completion is tracked with a local flag rather than
/// re-deriving it from credential/device signals every load (the web app's
/// onboarding/page.tsx checks GET /webauthn/credentials + GET /devices for
/// this; those calls aren't ported into this trimmed Phase 1 client) — good
/// enough for a build meant to be cross-checked manually, revisit once
/// WebAuthn/devices support lands.
const _onboardingCompleteKey = 'ondi_onboarding_complete';

class AuthNotifier extends Notifier<AuthState> {
  late final OndiApiClient _api;
  final GoogleSignIn _googleSignIn = GoogleSignIn.instance;
  Future<void>? _googleReadyFuture;
  StreamSubscription<GoogleSignInAuthenticationEvent>? _googleEventsSub;

  @override
  AuthState build() {
    _api = OndiApiClient();
    _bootstrap();
    ref.onDispose(() => _googleEventsSub?.cancel());
    return const AuthState();
  }

  OndiApiClient get api => _api;

  /// On web, GIS's renderButton() needs the SDK initialized first — the
  /// login screen awaits this before rendering the real Google button, and
  /// authenticationEvents fires when the user completes sign-in via that
  /// button. On Android/iOS, the same init is needed before calling
  /// .authenticate() explicitly (see GoogleSignInButton in
  /// features/login/google_button_native.dart) — authenticationEvents
  /// fires there too once that call completes, so this listener handles
  /// both platforms without branching.
  Future<void> ensureGoogleReady() {
    return _googleReadyFuture ??= _initGoogle();
  }

  Future<void> _initGoogle() async {
    // clientId is what web's GIS SDK needs; serverClientId is what the
    // native Android/iOS flow needs to mint a verifiable ID token — same
    // underlying OAuth Web client either way (services/ondi-api verifies
    // the token's `aud` against this one value regardless of platform).
    await _googleSignIn.initialize(clientId: _googleWebClientId, serverClientId: _googleWebClientId);
    // Listener must be attached before attemptLightweightAuthentication()
    // below fires, since a successful lightweight auth pushes onto this
    // same stream (GoogleSignIn's own implementation) rather than returning
    // its result directly to the caller.
    _googleEventsSub = _googleSignIn.authenticationEvents.listen((event) async {
      if (event is! GoogleSignInAuthenticationEventSignIn) return;
      // A stream listener's async callback has no caller to propagate an
      // exception to — an unhandled throw here (a flaky /auth/me call, a
      // null field, anything) previously just died silently mid-flow,
      // leaving the person on the welcome screen with the Google picker
      // already dismissed and no error shown, no way to tell what happened.
      try {
        final idToken = event.user.authentication.idToken;
        if (idToken == null) {
          state = state.copyWith(error: 'Google sign-in failed: no ID token received.');
          return;
        }
        final result = await _api.federatedLoginGoogle(idToken);
        if (result == null) {
          state = state.copyWith(error: 'Google sign-in failed. Please try again.');
          return;
        }
        final profile = await _api.getProfile() ?? (result['user'] as Map<String, dynamic>? ?? {});
        await _routeAfterLogin(profile);
      } catch (_) {
        state = state.copyWith(error: 'Google sign-in failed. Please try again.');
      }
    });
    // Silently signs the person back in if the browser/device already has
    // an active Google session (the "Continue as [account]" experience) —
    // without this call, GIS never offers that fast path and every visit
    // requires going through the full picker from scratch.
    unawaited(_googleSignIn.attemptLightweightAuthentication());
  }

  Future<void> _bootstrap() async {
    final token = await _api.getAccessToken();
    if (token == null) {
      state = state.copyWith(status: AuthStatus.loggedOut);
      return;
    }
    final profile = await _api.getProfile();
    if (profile == null) {
      await _api.clearTokens();
      state = state.copyWith(status: AuthStatus.loggedOut);
      return;
    }
    await _routeAfterLogin(profile);
  }

  Future<void> _routeAfterLogin(Map<String, dynamic> profile) async {
    if ((profile['firstName'] as String?)?.isNotEmpty != true) {
      state = state.copyWith(status: AuthStatus.onboardingName, profile: profile);
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_onboardingCompleteKey) != true) {
      state = state.copyWith(status: AuthStatus.onboardingSecurity, profile: profile);
      return;
    }
    state = state.copyWith(status: AuthStatus.authenticated, profile: profile);
  }

  Future<void> submitPhone(String phone) async {
    final fingerprint = await _api.getDeviceFingerprint();
    await _api.initiateAuth(phone, fingerprint: fingerprint);
    state = state.copyWith(pendingPhone: phone, error: null);
  }

  /// Throws on failure — callers show the error inline.
  Future<void> verifyOtp(String otp) async {
    final phone = state.pendingPhone;
    if (phone == null) throw StateError('No pending phone number');
    final data = await _api.verifyOtp(phone, otp);
    final profile = await _api.getProfile() ?? (data['user'] as Map<String, dynamic>? ?? {});
    await _routeAfterLogin(profile);
  }

  Future<void> completeName(String firstName, String lastName) async {
    final profile = await _api.updateProfile(firstName: firstName, lastName: lastName) ?? state.profile;
    state = state.copyWith(status: AuthStatus.onboardingSecurity, profile: profile);
  }

  Future<bool> completeSecurityCode(String code) async {
    final userId = state.profile?['id'] as String?;
    if (userId == null) return false;
    final ok = await _api.setSecurityCode(userId, code);
    if (ok) state = state.copyWith(status: AuthStatus.onboardingDeviceTrust);
    return ok;
  }

  Future<void> completeDeviceTrust() async {
    // The Device row's `deviceId` column IS our fingerprint (see
    // services/ondi-api's schema.prisma Device.deviceId + the upsert in
    // /auth/otp/verify) — `d['id']` is a different, internal row id used
    // for the trust PATCH's URL param.
    final fingerprint = await _api.getDeviceFingerprint();
    final devices = await _api.getDevices();
    final current = devices.cast<Map<String, dynamic>>().where((d) => d['deviceId'] == fingerprint);
    if (current.isNotEmpty) {
      await _api.trustDevice(current.first['id'] as String);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardingCompleteKey, true);
    state = state.copyWith(status: AuthStatus.authenticated);
  }

  /// Android/iOS only — web's login screen never calls this since GIS owns
  /// its own button UI there (see google_button_web.dart vs
  /// google_button_native.dart).
  Future<void> signInWithGoogleNative() async {
    try {
      await ensureGoogleReady();
      await _googleSignIn.authenticate();
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return;
      state = state.copyWith(error: 'Google sign-in failed. Please try again.');
    }
  }

  Future<void> signOut() async {
    await _api.clearTokens();
    state = const AuthState(status: AuthStatus.loggedOut);
  }
}

final authNotifierProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

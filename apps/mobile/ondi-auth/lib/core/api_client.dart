import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';
import 'dev_host.dart';

/// Dio client for services/ondi-api — Phase 1 surface only (login, onboarding,
/// OAuth authorize). Interceptor pattern (Bearer-attach + 401 refresh) ported
/// from apps/mobile/ondi/lib/core/api_client.dart.
class OndiApiClient {
  // 'localhost' only resolves to the API on Flutter Web (same-machine dev
  // server) — a real Android/iOS device has no such loopback to the dev
  // Mac, hence devHostIp (see dev_host.dart + scripts/dev_host.sh, same
  // pattern as apps/mobile/ondi): an adb-reverse tunnel or LAN IP,
  // regenerated per run since it can change across devices/networks.
  static final String _baseUrl = () {
    const envUrl = String.fromEnvironment('API_BASE_URL');
    if (envUrl.isNotEmpty) return envUrl;
    return 'http://$devHostIp:7020/v1';
  }();
  late final Dio _dio;
  final _storage = const FlutterSecureStorage();

  OndiApiClient() {
    _dio = Dio(BaseOptions(baseUrl: _baseUrl));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        final path = error.requestOptions.path;
        final isAuthRoute = path.contains('/auth/');
        if (error.response?.statusCode == 401 && !isAuthRoute) {
          await _refreshToken();
          try {
            return handler.resolve(await _dio.fetch(error.requestOptions));
          } catch (e) {
            handler.next(error);
          }
        }
        handler.next(error);
      },
    ));
  }

  Future<void> _refreshToken() async {
    final refresh = await _storage.read(key: 'refresh_token');
    if (refresh == null) return;
    final res = await _dio.post('/auth/token/refresh', data: {'refreshToken': refresh});
    await _storage.write(key: 'access_token', value: res.data['access_token']);
    if (res.data['refresh_token'] != null) {
      await _storage.write(key: 'refresh_token', value: res.data['refresh_token']);
    }
  }

  Future<void> saveTokens({required String accessToken, required String? refreshToken}) async {
    await _storage.write(key: 'access_token', value: accessToken);
    if (refreshToken != null) await _storage.write(key: 'refresh_token', value: refreshToken);
  }

  Future<void> clearTokens() async {
    await _storage.delete(key: 'access_token');
    await _storage.delete(key: 'refresh_token');
  }

  Future<String?> getAccessToken() => _storage.read(key: 'access_token');

  /// Browser has no hardware ID — persist a UUID on first run, same role as
  /// `ondi_device_id` in the Next.js app's localStorage.
  Future<String> getDeviceFingerprint() async {
    final existing = await _storage.read(key: 'device_fingerprint');
    if (existing != null) return existing;
    final id = const Uuid().v4();
    await _storage.write(key: 'device_fingerprint', value: id);
    return id;
  }

  // --- Login ---

  Future<dynamic> initiateAuth(String phone, {required String fingerprint, String channel = 'sms'}) async {
    final res = await _dio.post('/auth/initiate', data: {
      'phone': phone,
      'deviceFingerprint': fingerprint,
      'channel': channel,
    });
    return res.data;
  }

  /// deviceFingerprint matters here: the backend defaults it to the literal
  /// string 'mobile' when omitted (services/ondi-api/src/routes/auth.ts
  /// otp/verify), which would silently collide every browser that forgets
  /// to send one onto the same shared Device row.
  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) async {
    final fingerprint = await getDeviceFingerprint();
    final res = await _dio.post('/auth/otp/verify', data: {
      'phone': phone,
      'otp': otp,
      'deviceFingerprint': fingerprint,
      'deviceName': 'Ondi Web',
    });
    final data = res.data as Map<String, dynamic>;
    if (data['access_token'] != null) {
      await saveTokens(accessToken: data['access_token'], refreshToken: data['refresh_token']);
    }
    return data;
  }

  Future<Map<String, dynamic>?> federatedLoginGoogle(String idToken) async {
    try {
      final res = await _dio.post('/auth/federated/google', data: {'idToken': idToken});
      if (res.data['success'] == true) {
        await saveTokens(accessToken: res.data['access_token'], refreshToken: res.data['refresh_token']);
        return res.data as Map<String, dynamic>;
      }
      return null;
    } on DioException {
      return null;
    }
  }

  // --- Onboarding ---

  Future<Map<String, dynamic>?> getProfile() async {
    try {
      final res = await _dio.get('/auth/me');
      return res.data as Map<String, dynamic>;
    } catch (e) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> updateProfile({String? firstName, String? lastName}) async {
    try {
      final body = <String, dynamic>{};
      if (firstName != null) body['firstName'] = firstName;
      if (lastName != null) body['lastName'] = lastName;
      final res = await _dio.patch('/auth/me', data: body);
      return res.data as Map<String, dynamic>;
    } catch (e) {
      return null;
    }
  }

  Future<bool> setSecurityCode(String userId, String code) async {
    try {
      await _dio.post('/auth/security-code/set', data: {'userId': userId, 'code': code});
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<List<dynamic>> getDevices() async {
    final res = await _dio.get('/devices');
    return (res.data['devices'] ?? res.data) as List<dynamic>;
  }

  Future<bool> trustDevice(String deviceId) async {
    try {
      await _dio.patch('/devices/$deviceId/trust', data: {'trusted': true});
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> lockDevice(String deviceId) async {
    try {
      await _dio.post('/devices/$deviceId/lock');
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> unlockDevice(String deviceId) async {
    try {
      await _dio.post('/devices/$deviceId/unlock');
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> removeDevice(String deviceId) async {
    try {
      await _dio.delete('/devices/$deviceId');
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Sessions ---

  Future<List<dynamic>> getSessions() async {
    final res = await _dio.get('/sessions');
    return (res.data['sessions'] ?? []) as List<dynamic>;
  }

  Future<bool> revokeSession(String sessionId) async {
    try {
      await _dio.delete('/sessions/$sessionId');
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> revokeAllSessions() async {
    try {
      await _dio.delete('/sessions');
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Activity log ---

  Future<List<dynamic>> getLogins({int limit = 50, String? deviceId}) async {
    final res = await _dio.get('/auth/logins', queryParameters: {
      'limit': limit,
      if (deviceId != null) 'deviceId': deviceId,
    });
    return (res.data['events'] ?? res.data['items'] ?? []) as List<dynamic>;
  }

  // --- Security hub ---

  Future<List<dynamic>> getSecurityEvents({int limit = 5}) async {
    final res = await _dio.get('/auth/security-events', queryParameters: {'limit': limit});
    return (res.data['events'] ?? []) as List<dynamic>;
  }

  // --- Connected (OAuth) apps ---

  Future<List<dynamic>> getLinkedApps() async {
    final res = await _dio.get('/oauth/apps');
    return (res.data['apps'] ?? []) as List<dynamic>;
  }

  Future<bool> unlinkApp(String clientId) async {
    try {
      await _dio.delete('/oauth/consents/$clientId');
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Organizations (services/ondi-api/src/routes/organizations.ts) ---

  Future<List<dynamic>> getMyOrganizations() async {
    final res = await _dio.get('/organizations/mine');
    return (res.data['organizations'] ?? []) as List<dynamic>;
  }

  /// `subdomain` is optional — this is what will become the org's
  /// company.hudumika.tz address once wildcard routing is in use.
  Future<Map<String, dynamic>> createOrganization({
    required String businessName,
    required String registrationNumber,
    String country = 'TZ',
    String? subdomain,
  }) async {
    final res = await _dio.post('/organizations', data: {
      'businessName': businessName,
      'registrationNumber': registrationNumber,
      'country': country,
      if (subdomain != null && subdomain.isNotEmpty) 'subdomain': subdomain,
    });
    return res.data as Map<String, dynamic>;
  }

  /// True if `subdomain` is free to claim — a 404 from
  /// GET /organizations/by-subdomain/:subdomain means nobody has it yet.
  Future<bool> isSubdomainAvailable(String subdomain) async {
    try {
      await _dio.get('/organizations/by-subdomain/$subdomain');
      return false;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return true;
      rethrow;
    }
  }

  /// Live BRELA lookup (proxied server-side) so a real registered business
  /// name/number can be found instead of trusting free-text entry.
  Future<List<dynamic>> brelaSearch({required String objectType, String? number, String? name}) async {
    final res = await _dio.post('/organizations/brela-search', data: {
      'objectType': objectType,
      if (number != null && number.isNotEmpty) 'number': number,
      if (name != null && name.isNotEmpty) 'name': name,
    });
    return (res.data['results'] ?? []) as List<dynamic>;
  }

  /// Owner/Admin-only. Pending self-service "join as a corporate" requests
  /// awaiting a decision — see services/ondi-api's
  /// GET /organizations/:id/join-requests.
  Future<List<dynamic>> getJoinRequests(String organizationId) async {
    final res = await _dio.get('/organizations/$organizationId/join-requests');
    return (res.data['requests'] ?? []) as List<dynamic>;
  }

  Future<void> approveJoinRequest(String organizationId, String requestId) async {
    await _dio.post('/organizations/$organizationId/join-requests/$requestId/approve');
  }

  Future<void> declineJoinRequest(String organizationId, String requestId) async {
    await _dio.post('/organizations/$organizationId/join-requests/$requestId/decline');
  }

  // --- Authenticator (TOTP + push) ---

  /// GET /mfa/apps is keyed by phoneNumber, not the Bearer token — matches
  /// the existing contract every other Ondi client (mobile, web) already
  /// relies on for this endpoint.
  Future<List<dynamic>> getMfaApps(String phoneNumber) async {
    final res = await _dio.get('/mfa/apps', queryParameters: {'phoneNumber': phoneNumber});
    return (res.data['apps'] ?? []) as List<dynamic>;
  }

  Future<Map<String, dynamic>?> enrollMfaApp({
    required String phoneNumber,
    required String appName,
    String? issuer,
    String? secret,
  }) async {
    try {
      final res = await _dio.post('/mfa/enroll', data: {
        'phoneNumber': phoneNumber,
        'appName': appName,
        if (issuer != null) 'issuer': issuer,
        if (secret != null) 'secret': secret,
        'method': 'totp',
      });
      return res.data as Map<String, dynamic>;
    } on DioException catch (e) {
      final err = e.response?.data?['error'] as String?;
      throw Exception(err ?? 'enroll_failed');
    }
  }

  Future<bool> removeMfaApp(String enrollmentId) async {
    try {
      await _dio.delete('/mfa/apps/$enrollmentId');
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<List<dynamic>> getPendingPush(String phoneNumber) async {
    try {
      final res = await _dio.get('/auth/push/pending/$phoneNumber');
      return (res.data['sessions'] ?? []) as List<dynamic>;
    } catch (e) {
      return [];
    }
  }

  Future<bool> approvePush(String sessionId, bool approved) async {
    try {
      await _dio.post('/auth/push/approve', data: {'sessionId': sessionId, 'approved': approved});
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- OAuth authorize (mirrors apps/mobile/ondi's authorize_screen.dart methods) ---

  Future<Map<String, dynamic>> getAuthorizeContext(Map<String, String> queryParams) async {
    final res = await _dio.get('/oauth/authorize', queryParameters: queryParams);
    return (res.data['context'] as Map).cast<String, dynamic>();
  }

  Future<void> grantOauthConsent(String clientId, List<String> scopes) async {
    await _dio.post('/oauth/consent', data: {'clientId': clientId, 'scopes': scopes});
  }

  Future<String> issueOauthCode(String clientId, String scope, {String? codeChallenge}) async {
    final res = await _dio.post('/oauth/code', data: {
      'clientId': clientId,
      'scope': scope,
      if (codeChallenge != null) 'codeChallenge': codeChallenge,
    });
    return res.data['code'] as String;
  }

  // --- WebAuthn / passkeys (list + delete only — see webauthn_web.dart for
  // the register ceremony, which needs browser JS interop) ---

  Future<List<dynamic>> getWebauthnCredentials() async {
    final res = await _dio.get('/webauthn/credentials');
    return (res.data['credentials'] ?? []) as List<dynamic>;
  }

  Future<bool> deleteWebauthnCredential(String id) async {
    try {
      await _dio.delete('/webauthn/credentials/$id');
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<Map<String, dynamic>> getWebauthnRegisterOptions() async {
    final res = await _dio.post('/webauthn/register/options');
    return res.data as Map<String, dynamic>;
  }

  Future<bool> verifyWebauthnRegistration(Map<String, dynamic> response, {String? deviceName}) async {
    try {
      await _dio.post('/webauthn/register/verify', data: {'response': response, 'deviceName': deviceName});
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Recovery contacts ---

  Future<List<dynamic>> getRecoveryContacts() async {
    final res = await _dio.get('/auth/recovery-contacts');
    return (res.data['contacts'] ?? []) as List<dynamic>;
  }

  Future<List<dynamic>> getPendingRecoveryInvitations() async {
    final res = await _dio.get('/auth/recovery-contacts/pending');
    return (res.data['invitations'] ?? []) as List<dynamic>;
  }

  Future<bool> addRecoveryContact(String phoneNumber) async {
    try {
      await _dio.post('/auth/recovery-contacts', data: {'phoneNumber': phoneNumber});
      return true;
    } on DioException catch (e) {
      throw Exception(e.response?.data?['error'] as String? ?? 'add_failed');
    }
  }

  Future<bool> acceptRecoveryInvitation(String id) async {
    try {
      await _dio.post('/auth/recovery-contacts/$id/accept');
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<bool> removeRecoveryContact(String id) async {
    try {
      await _dio.delete('/auth/recovery-contacts/$id');
      return true;
    } catch (e) {
      return false;
    }
  }

  // --- Account deletion ---

  Future<Map<String, dynamic>> requestAccountDeletion() async {
    final res = await _dio.post('/auth/account/delete/request');
    return res.data as Map<String, dynamic>;
  }

  Future<void> confirmAccountDeletion(String challengeId, String code) async {
    await _dio.post('/auth/account/delete/confirm', data: {'challengeId': challengeId, 'code': code});
  }
}

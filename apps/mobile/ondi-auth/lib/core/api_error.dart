import 'package:dio/dio.dart';

/// A real failure (network down, 401, 500, a changed response shape) used to
/// be indistinguishable from "you genuinely have none of these" — every
/// list-fetching method in api_client.dart caught its own exception and
/// returned `[]`. That's why Devices/Authenticator/etc. could render a
/// clean "No devices yet" empty state while actually failing to load at
/// all — the exact bug an enterprise-grade authenticator can't have,
/// since it hides the one thing worth telling the person (their identity
/// data didn't load) behind the one message that tells them nothing is
/// wrong. api_client.dart's list methods now let the real exception
/// propagate; every screen's `_load()` catches it here instead and shows
/// this text with a retry action rather than silently rendering empty.
String describeApiError(Object error) {
  if (error is DioException) {
    switch (error.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
        return 'No connection. Check your network and try again.';
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'The server took too long to respond. Try again.';
      default:
        break;
    }
    final status = error.response?.statusCode;
    if (status == 401 || status == 403) {
      return "Your session couldn't be verified. Try signing in again.";
    }
    if (status != null && status >= 500) {
      return "Ondi's servers had a problem loading this. Try again shortly.";
    }
    return 'Something went wrong loading this.';
  }
  return 'Something went wrong loading this.';
}

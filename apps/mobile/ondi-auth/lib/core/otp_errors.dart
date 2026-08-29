/// Mirrors apps/web/ondi-auth's formatOtpRateLimitError/inDuration in
/// src/lib/api.ts — services/ondi-api's /auth/initiate enforces a 5-code/5min
/// and 10-code/day budget per phone (see enforceOtpBudget in auth.ts), so a
/// generic "could not send code" swallowed the real, actionable reason
/// (rate-limited vs. a genuine failure) that web already surfaces.
String _inDuration(num seconds) {
  if (seconds < 90) return 'in ${seconds.round().clamp(1, 999)} seconds';
  if (seconds < 3600) {
    final mins = (seconds / 60).round();
    return 'in $mins minute${mins == 1 ? '' : 's'}';
  }
  if (seconds < 86400) {
    final hours = (seconds / 3600).round();
    return 'in $hours hour${hours == 1 ? '' : 's'}';
  }
  final days = (seconds / 86400).round();
  return 'in $days day${days == 1 ? '' : 's'}';
}

/// Returns a friendly message for known OTP error codes, or null if
/// [error] isn't one of them (caller should fall back to a generic message).
String? formatOtpError(String? error, num? retryAfter) {
  final when = retryAfter != null ? _inDuration(retryAfter) : 'shortly';
  switch (error) {
    case 'rate_limit':
      return 'Too many codes requested. You can request another $when.';
    case 'daily_rate_limit':
      return "You've hit today's limit for this number. Try again $when.";
    case 'ip_rate_limit':
      return 'Too many requests from this connection. Try again $when.';
    case 'phone_required':
      return 'Enter a valid phone number.';
    default:
      return null;
  }
}

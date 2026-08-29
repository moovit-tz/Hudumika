const API_URL = process.env.NEXT_PUBLIC_ONDI_API_URL ?? "http://localhost:7020/v1";

export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("ondi_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("ondi_device_id", id);
  }
  return id;
}

/**
 * A short "Browser on OS" label computed from the UA string client-side
 * (e.g. "Chrome on macOS", "Safari on iPhone") — sent as `deviceName` at
 * login so devices show up as something readable instead of "Unknown
 * device". Deliberately simple regex matching rather than a full UA-parser
 * dependency; good enough for a label, not for feature-detection.
 */
export function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;

  let os = "Unknown OS";
  if (/iPhone/.test(ua)) os = "iPhone";
  else if (/iPad/.test(ua)) os = "iPad";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Linux/.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/CriOS\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari";

  return `${browser} on ${os}`;
}

export function formatPhone(raw: string): string {
  let cleaned = raw.trim().replace(/\s+/g, "");
  if (cleaned.startsWith("0")) cleaned = "255" + cleaned.substring(1);
  else if (!cleaned.startsWith("255")) cleaned = "255" + cleaned;
  return cleaned;
}

/** "in 5 minutes" / "in about 2 hours" / "in about 1 day" from a retryAfter in seconds. */
function inDuration(seconds: number): string {
  if (seconds < 90) return `in ${Math.max(1, Math.round(seconds))} seconds`;
  if (seconds < 3600) {
    const mins = Math.round(seconds / 60);
    return `in ${mins} minute${mins === 1 ? "" : "s"}`;
  }
  if (seconds < 86_400) {
    const hours = Math.round(seconds / 3600);
    return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.round(seconds / 86_400);
  return `in about ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Turns the OTP-issuing endpoints' 429 body ({ error, retryAfter }) into a
 * message that actually tells the person when they can try again, instead
 * of a bare "rate_limit" error code — retryAfter reflects the real time
 * until the oldest counted OTP ages out of its window (see
 * enforceOtpBudget in services/ondi-api/src/routes/auth.ts), so this can
 * genuinely read "in 5 minutes" one moment and "in about 22 hours" the next
 * for the same error code.
 */
export function formatOtpRateLimitError(error: string, retryAfter: number | undefined): string | null {
  const when = typeof retryAfter === "number" ? inDuration(retryAfter) : "shortly";
  switch (error) {
    case "rate_limit":
      return `Too many codes requested. You can request another ${when}.`;
    case "daily_rate_limit":
      return `You've hit today's limit for this number. Try again ${when}.`;
    case "ip_rate_limit":
      return `Too many requests from this connection. Try again ${when}.`;
    default:
      return null;
  }
}

/**
 * A federated (Google/Microsoft/Apple) signup with no phone linked yet gets
 * a non-deliverable `federated_<provider>_<sub>` placeholder in
 * User.phoneNumber (see services/ondi-api/src/routes/federated.ts) rather
 * than null — mirrors the backend's hasDeliverablePhone in lib/mailer.ts.
 * Any UI showing "phone verified" status or the phone itself must check
 * this first, or it'll render the raw placeholder / claim a channel that
 * doesn't actually exist.
 */
export function hasDeliverablePhone(phoneNumber: string | null | undefined): boolean {
  return !!phoneNumber && !phoneNumber.startsWith("federated_") && !phoneNumber.startsWith("deleted_");
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export interface StoredUser {
  id: string;
  ondi?: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  avatarUrl?: string | null;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("user") ?? "null");
  } catch {
    return null;
  }
}

export function setSession(accessToken: string, refreshToken?: string, user?: unknown) {
  localStorage.setItem("access_token", accessToken);
  if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
  if (user) localStorage.setItem("user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
}

/**
 * Bearer-token client for services/ondi-api. On 401, tries one refresh via
 * /auth/token/refresh (same contract apps/web/ondi's src/lib/api.ts relies
 * on) before giving up and clearing the session.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(options.headers);
  // Fastify's JSON body parser rejects `Content-Type: application/json`
  // paired with an empty body (FST_ERR_CTP_EMPTY_JSON_BODY -> 400), which
  // bit body-less POSTs like /webauthn/register/options — only set it when
  // there's actually a body to parse.
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && token) {
    const refreshToken = localStorage.getItem("refresh_token");
    if (refreshToken) {
      const refreshRes = await fetch(`${API_URL}/auth/token/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setSession(data.access_token, data.refresh_token);
        headers.set("Authorization", `Bearer ${data.access_token}`);
        res = await fetch(`${API_URL}${path}`, { ...options, headers });
      } else {
        clearSession();
        if (typeof window !== "undefined") window.location.href = "/login";
        throw new Error("session_expired");
      }
    }
  }

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : undefined;

  if (!res.ok) {
    const errorBody = body as { error?: string; retryAfter?: number } | undefined;
    const message = errorBody?.error ?? `request_failed_${res.status}`;
    const err = new Error(message) as Error & { retryAfter?: number };
    // 429s from the OTP-budget endpoints carry a retryAfter (seconds) —
    // surfaced here so callers can show "try again in ~X hours" instead of
    // the bare error code (see formatOtpRateLimitError).
    if (typeof errorBody?.retryAfter === "number") err.retryAfter = errorBody.retryAfter;
    throw err;
  }

  return body as T;
}

export { API_URL };

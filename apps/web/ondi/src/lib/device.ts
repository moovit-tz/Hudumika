// Parses a browser's User-Agent string into a readable OS/browser/device-type
// summary for the Devices page. This is the actual ceiling of what's
// available: browsers do not expose real hardware serial numbers to
// JavaScript on any platform (a permanent, universal privacy restriction —
// not an Ondi limitation), and "model name" only exists via a Client Hints
// API supported on some Android Chrome builds, nowhere else. What IS stable
// and real is the device fingerprint already generated in session.ts
// (getDeviceFingerprint) — shown as a labeled "Device ID", not a fake
// serial number.
export interface ParsedDevice {
  os: string;
  browser: string;
  deviceType: "Mobile" | "Tablet" | "Desktop";
  summary: string; // "macOS · Chrome · Desktop"
}

export function parseUserAgent(userAgent?: string | null): ParsedDevice {
  const ua = userAgent ?? "";

  let os = "Unknown OS";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os x/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "Unknown browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/crios\//i.test(ua)) browser = "Chrome";
  else if (/fxios\//i.test(ua)) browser = "Firefox";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome|chromium/i.test(ua)) browser = "Safari";

  const deviceType: ParsedDevice["deviceType"] = /ipad|tablet/i.test(ua)
    ? "Tablet"
    : /mobi|iphone|android/i.test(ua)
      ? "Mobile"
      : "Desktop";

  return { os, browser, deviceType, summary: `${os} · ${browser} · ${deviceType}` };
}

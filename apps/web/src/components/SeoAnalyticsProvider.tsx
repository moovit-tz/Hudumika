import React from 'react';
import { useSeoAnalytics } from '../hooks/useSeoAnalytics.js';

// Mounted once at the app root (App.tsx), inside BrowserRouter but above auth,
// so tracking tags and verification meta tags apply on every page — including
// pre-login screens (/signup, /track/shared/:token) — not just SuperAdmin.
export function SeoAnalyticsProvider({ children }: { children: React.ReactNode }) {
  useSeoAnalytics();
  return <>{children}</>;
}

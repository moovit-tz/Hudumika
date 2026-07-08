import React from 'react';
import { useDesignSystem } from '../hooks/useDesignSystem.js';

// Mounted once at the app root (App.tsx) so every page — not just the
// SuperAdmin builder — hydrates from the backend, applies the injected
// stylesheet, and stays in sync via same-tab/cross-tab events.
export function DesignSystemProvider({ children }: { children: React.ReactNode }) {
  useDesignSystem();
  return <>{children}</>;
}

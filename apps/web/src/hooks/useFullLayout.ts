import { useState, useEffect } from 'react';

// Mirrors the boxed/full-width toggle in AppHeader.tsx, which is the single
// source of truth (localStorage key 'layout', data-layout attribute on
// <html>). Pages that box their own content width read this instead of
// duplicating the toggle's state.
function readFullLayout(): boolean {
  return localStorage.getItem('layout') === 'full';
}

export function useFullLayout(): boolean {
  const [full, setFull] = useState(readFullLayout);
  useEffect(() => {
    const handler = () => setFull(readFullLayout());
    window.addEventListener('hudumika-layout-updated', handler);
    return () => window.removeEventListener('hudumika-layout-updated', handler);
  }, []);
  return full;
}

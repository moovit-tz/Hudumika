import { useState, useEffect } from 'react';

function readIsDark(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

/**
 * Tracks the `data-theme` attribute AppSidebar's toggleTheme() writes
 * directly onto <html> — a MutationObserver (not a custom event) is the
 * only reliable signal since that toggle doesn't dispatch one.
 */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(readIsDark);

  useEffect(() => {
    const observer = new MutationObserver(() => setIsDark(readIsDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

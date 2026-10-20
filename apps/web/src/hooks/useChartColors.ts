import { useEffect, useState } from 'react';

function readColors() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim() || 'transparent';
  return { brand: token('--teal'), success: token('--green'), warning: token('--gold'), error: token('--red'), info: token('--blue'), purple: token('--purple'), neutral: token('--ink3') };
}

/** Canvas charts need resolved colours; CSS var() strings are not canvas colours. */
export function useChartColors() {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const update = () => setColors(previous => { const next = readColors(); return JSON.stringify(previous) === JSON.stringify(next) ? previous : next; });
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    update();
    return () => observer.disconnect();
  }, []);
  return colors;
}

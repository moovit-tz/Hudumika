/**
 * Helper to toggle light/dark theme with the Katalyst View Transitions expanding circular wave reveal animation.
 */
export function toggleThemeWithAnimation(
  event?: React.MouseEvent | MouseEvent | { clientX: number; clientY: number },
  explicitDark?: boolean
) {
  const currentDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const nextDark = explicitDark !== undefined ? explicitDark : !currentDark;

  const applyTheme = () => {
    if (nextDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  };

  // Check if browser supports View Transitions API and prefers-reduced-motion isn't set
  if (
    typeof document === 'undefined' ||
    !(document as any).startViewTransition ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    applyTheme();
    return;
  }

  // Determine click coordinates (or default to top-right area if triggered without event)
  let x = window.innerWidth - 40;
  let y = 40;

  if (event) {
    if ('clientX' in event && typeof event.clientX === 'number' && (event.clientX > 0 || event.clientY > 0)) {
      x = event.clientX;
      y = event.clientY;
    } else if ('currentTarget' in event && event.currentTarget) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
  }

  // Calculate distance from click point to furthest corner of screen
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  const transition = (document as any).startViewTransition(() => {
    applyTheme();
  });

  transition.ready.then(() => {
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`
    ];

    document.documentElement.animate(
      {
        clipPath: clipPath
      },
      {
        duration: 480,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)'
      }
    );
  });
}

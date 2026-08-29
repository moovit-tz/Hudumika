"use client";

import { useEffect, useState } from "react";

/**
 * True while the on-screen keyboard is covering a meaningful chunk of the
 * viewport (tracked via visualViewport shrinking, not just any resize —
 * rotation/devtools would also fire `resize` but shouldn't count). Used to
 * flip full-screen forms from vertically-centered to top-anchored the
 * moment the keyboard opens, Pinterest-style, so the field being typed into
 * lands near the top of the remaining visible space instead of staying
 * centered in a viewport half-covered by the keyboard.
 */
export function useKeyboardOpen(threshold = 120): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function onResize() {
      const heightDiff = window.innerHeight - vv!.height;
      setOpen(heightDiff > threshold);
    }

    vv.addEventListener("resize", onResize);
    onResize();
    return () => vv.removeEventListener("resize", onResize);
  }, [threshold]);

  return open;
}

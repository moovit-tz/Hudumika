import React from 'react';

/**
 * React.lazy for a page's named export, so a shell's routes load only the page
 * being opened instead of every page in the app on first visit.
 *
 * Point `load` at the module that defines the page, not at a barrel file that
 * re-exports many pages (pages/HRM.tsx, for example) — importing through the
 * barrel pulls all of them back into the same chunk.
 *
 * The suspense fallback comes from PageLayout, which wraps its <Outlet> so the
 * sidebar and header stay up while a page's chunk loads.
 */
export function lazyPage<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return React.lazy(async () => {
    const mod = await load();
    return { default: mod[name] as unknown as React.ComponentType<any> };
  });
}

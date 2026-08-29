// Hudumika's first-party apps that support "Sign in with Ondi" — the
// catalog behind the App Launcher's "Add apps" CTA, and the source of each
// app's category for grouping the launcher grid. Ondi has no directory of
// arbitrary third-party apps to browse (those only ever appear after a real
// OAuth consent), so this list is scoped to the same first-party clients
// registered in clientLogos.ts. URLs match the dev ports used by every
// other app's local apps-drawer registry (e.g.
// apps/web/clearos/src/lib/products.ts) — there are no production URLs
// configured anywhere in the repo yet.
export type AppCategory = "Work" | "Social" | "Other";

export interface CatalogApp {
  name: string;
  url: string;
  category: AppCategory;
}

export const APP_CATALOG: CatalogApp[] = [
  { name: "ClearOS", url: "http://localhost:3004", category: "Work" },
  { name: "ComplyOS", url: "http://localhost:3006", category: "Work" },
  { name: "HuduFreight", url: "http://localhost:3008", category: "Work" },
  {
    name: "Hudumika Workspace",
    url: "http://localhost:3010",
    category: "Work",
  },
];

/** Every connected app not in the curated catalog (any third-party OAuth
 *  client) falls back to "Other" — there's no real taxonomy for apps Ondi
 *  doesn't publish itself. */
export function categoryFor(name: string): AppCategory {
  const entry = APP_CATALOG.find(
    (a) => a.name.toLowerCase() === name.toLowerCase(),
  );
  return entry?.category ?? "Other";
}

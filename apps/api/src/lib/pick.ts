/**
 * Narrows an object down to exactly the given keys — the runtime enforcement
 * a `req.body as Partial<{...}>` type assertion doesn't actually provide.
 *
 * `const body = req.body as Partial<{name: string; ...}>` only tells
 * TypeScript what shape to expect; it does nothing at runtime. A client can
 * still send `{name: "x", tenant_id: "someone-else's-tenant"}`, and
 * `.set({ ...body })` would spread tenant_id straight into the UPDATE along
 * with everything the route actually meant to allow — the WHERE tenant_id
 * clause stops the row from being *found* under another tenant, not the
 * update from *re-parenting* the row it already found. pick() is the
 * allowlist that closes that gap: only fields named here ever reach `.set()`,
 * regardless of what else arrived in the request body.
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

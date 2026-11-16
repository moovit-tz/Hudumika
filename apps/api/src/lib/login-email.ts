/**
 * The email of an account that signs in.
 *
 * users.email became optional with Axis workers who never sign in (migration
 * 911), but a CHECK keeps it required whenever can_login is true. Code that
 * builds a session, a token or an SSO assertion only ever runs for such an
 * account, so a missing email there is a broken invariant, not a case to
 * paper over with an empty string — it fails loudly instead.
 */
export function loginEmail(user: { email: string | null }): string {
  if (!user.email) throw Object.assign(new Error('This account has no sign-in email.'), { statusCode: 409 });
  return user.email;
}

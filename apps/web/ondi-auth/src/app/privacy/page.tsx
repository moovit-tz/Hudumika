import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold text-foreground">
        <img src="/icon.svg" alt="" className="h-6 w-6" />
        Ondi Auth
      </Link>

      <h1 className="text-2xl font-semibold text-foreground">Privacy Policy</h1>
      <p className="mt-1 text-sm text-ondi-muted">Last updated 15 August 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-foreground [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_p]:text-ondi-muted [&_li]:text-ondi-muted">
        <section>
          <h2>1. What this policy covers</h2>
          <p>
            This Privacy Policy explains what information Ondi Auth (a Hudumika product) collects when you create and
            use an Ondi identity, why we collect it, and the choices you have over it.
          </p>
        </section>

        <section>
          <h2>2. Information we collect</h2>
          <p>Depending on how you use Ondi Auth, we collect:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li>
              <strong className="text-foreground">Identity information</strong> — your phone number, and if you sign in
              with Google, your name, email address, and profile photo;
            </li>
            <li>
              <strong className="text-foreground">Authentication data</strong> — one-time codes (never stored in
              plain text, only as a cryptographic hash), passkey public keys, and authenticator secrets for accounts
              you choose to add;
            </li>
            <li>
              <strong className="text-foreground">Device &amp; session information</strong> — a device identifier,
              browser/OS label, IP address, and approximate timestamps for each sign-in, so you can see and manage
              where you&apos;re signed in;
            </li>
            <li>
              <strong className="text-foreground">Trust &amp; risk signals</strong> — a trust score and risk factors
              we compute to detect suspicious sign-ins and protect your account;
            </li>
            <li>
              <strong className="text-foreground">Connected-app data</strong> — which applications you&apos;ve
              authorized with Ondi, and which scopes (pieces of your identity) you granted each one.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. How we use this information</h2>
          <p>We use the information above to:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li>Authenticate you and keep your account secure;</li>
            <li>Let you review and control your own devices, sessions, and connected applications;</li>
            <li>Detect and respond to suspicious or fraudulent activity;</li>
            <li>Provide the one-time codes and passkey ceremonies that make Ondi Auth work as an authenticator;</li>
            <li>Meet our legal and regulatory obligations.</li>
          </ul>
          <p className="mt-2">We do not sell your personal information.</p>
        </section>

        <section>
          <h2>4. When we share information</h2>
          <p>
            When you sign in to a third-party application with &ldquo;Continue with Ondi,&rdquo; we share only the
            specific fields that application requested and you approved (for example, your name and phone number) —
            never your authentication secrets, passkeys, or full activity history. You can review exactly what each
            connected app has access to, and revoke it, from the Apps screen at any time.
          </p>
          <p className="mt-2">
            We may also disclose information where required by law, or to protect the rights, security, or property
            of Ondi, our users, or the public.
          </p>
        </section>

        <section>
          <h2>5. How long we keep it</h2>
          <p>
            We retain your account information for as long as your Ondi identity is active. If you delete your
            account, we permanently remove your credentials, passkeys, authenticator entries, devices, and sessions;
            a minimal record required for security and legal purposes (such as a hashed fraud-prevention signal) may
            be retained where the law requires it.
          </p>
        </section>

        <section>
          <h2>6. Security</h2>
          <p>
            One-time codes are stored only as salted cryptographic hashes, never in plain text. Passkeys use
            public-key cryptography — Ondi never sees or stores your private key, only a public credential it can use
            to verify you. All traffic to Ondi Auth is encrypted in transit.
          </p>
        </section>

        <section>
          <h2>7. Your choices and rights</h2>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li>
              <strong className="text-foreground">Access &amp; export</strong> — download a copy of your security
              activity at any time from the account menu;
            </li>
            <li>
              <strong className="text-foreground">Correction</strong> — update your profile information from your
              account settings;
            </li>
            <li>
              <strong className="text-foreground">Deletion</strong> — permanently delete your account and associated
              data from the account menu;
            </li>
            <li>
              <strong className="text-foreground">Revocation</strong> — disconnect any third-party application, or
              remove any device, passkey, or authenticator entry, at any time.
            </li>
          </ul>
        </section>

        <section>
          <h2>8. Cookies &amp; local storage</h2>
          <p>
            Ondi Auth stores your session token and device identifier in your browser&apos;s local storage to keep
            you signed in — we don&apos;t use third-party tracking or advertising cookies.
          </p>
        </section>

        <section>
          <h2>9. Children&apos;s privacy</h2>
          <p>Ondi Auth is not directed at children under 16, and we don&apos;t knowingly collect their information.</p>
        </section>

        <section>
          <h2>10. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be reflected by updating the
            date at the top of this page.
          </p>
        </section>

        <section>
          <h2>11. Contact</h2>
          <p>
            Questions about this policy or your data can be sent to{" "}
            <a href="mailto:support@hudumika.tz" className="text-ondi-primary hover:underline">
              support@hudumika.tz
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}

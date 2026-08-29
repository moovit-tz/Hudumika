import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold text-foreground">
        <img src="/icon.svg" alt="" className="h-6 w-6" />
        Ondi Auth
      </Link>

      <h1 className="text-2xl font-semibold text-foreground">Terms &amp; Conditions</h1>
      <p className="mt-1 text-sm text-ondi-muted">Last updated 15 August 2026</p>

      <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-foreground [&_h2]:mt-2 [&_h2]:text-base [&_h2]:font-semibold [&_p]:text-ondi-muted [&_li]:text-ondi-muted">
        <section>
          <h2>1. Acceptance of these terms</h2>
          <p>
            These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your use of Ondi Auth, an authentication service
            provided by Hudumika (&ldquo;Ondi&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an Ondi identity
            or signing in with Ondi to a connected application, you agree to these Terms. If you do not agree, do not
            use the service.
          </p>
        </section>

        <section>
          <h2>2. What Ondi Auth is</h2>
          <p>
            Ondi Auth lets you sign in to applications using your phone number, a Google account, a passkey, or a
            one-time code — and lets you manage the devices, sessions, and applications connected to your Ondi
            identity in one place. Ondi Auth also functions as an authenticator app, generating time-based one-time
            codes (TOTP) for third-party services that support it.
          </p>
        </section>

        <section>
          <h2>3. Your account</h2>
          <p>
            You&apos;re responsible for keeping your Ondi identity secure — this includes your phone number, any
            passkeys or authenticator codes registered to your account, and the devices you&apos;ve trusted. Notify us
            immediately, and revoke the affected device or session yourself from the Devices or Sessions screens, if
            you believe your account has been compromised.
          </p>
          <p className="mt-2">
            You must provide accurate information when creating your account and keep it up to date. You may not
            create an account on behalf of someone else without their authorization, and you may not share your
            account, passkeys, or one-time codes with anyone else.
          </p>
        </section>

        <section>
          <h2>4. Connected applications</h2>
          <p>
            When you use &ldquo;Continue with Ondi&rdquo; to sign in to a third-party application, that application
            requests access to specific pieces of your Ondi identity (such as your name or phone number) — you choose
            whether to grant that access, and you can review or revoke it at any time from the Apps screen. Ondi is
            not responsible for how a connected application uses information you&apos;ve chosen to share with it once
            access is granted.
          </p>
        </section>

        <section>
          <h2>5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            <li>Attempt to gain unauthorized access to another user&apos;s Ondi identity or any Ondi system;</li>
            <li>Use Ondi Auth to facilitate fraud, impersonation, or any unlawful activity;</li>
            <li>Interfere with or disrupt the integrity or performance of the service;</li>
            <li>Reverse-engineer, scrape, or attempt to extract the source of the service beyond what public APIs allow.</li>
          </ul>
        </section>

        <section>
          <h2>6. Suspension and deletion</h2>
          <p>
            We may suspend or terminate access to Ondi Auth if we reasonably believe your account has been used to
            violate these Terms or to compromise the security of Ondi or a connected application. You may delete your
            own account at any time from the account menu — this permanently removes your credentials, passkeys,
            authenticator entries, devices, and sessions, and disconnects every application signed in through Ondi.
          </p>
        </section>

        <section>
          <h2>7. Disclaimers</h2>
          <p>
            Ondi Auth is provided &ldquo;as is.&rdquo; While we take reasonable measures to keep the service secure
            and available, we don&apos;t guarantee uninterrupted access, and we&apos;re not liable for losses arising
            from your failure to secure your own devices, passkeys, or recovery contacts.
          </p>
        </section>

        <section>
          <h2>8. Changes to these terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be reflected by updating the date at
            the top of this page. Continued use of Ondi Auth after a change takes effect constitutes acceptance of
            the updated Terms.
          </p>
        </section>

        <section>
          <h2>9. Governing law</h2>
          <p>These Terms are governed by the laws of the United Republic of Tanzania.</p>
        </section>

        <section>
          <h2>10. Contact</h2>
          <p>
            Questions about these Terms can be sent to{" "}
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

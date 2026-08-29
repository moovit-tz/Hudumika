"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  CheckmarkBadge01Icon,
  Clock01Icon,
  ContactBookIcon,
  Delete02Icon,
  PlusSignIcon,
  Shield01Icon,
} from "@hugeicons/core-free-icons";
import { apiFetch } from "@/lib/api";

interface RecoveryContact {
  id: string;
  status: "pending" | "active";
  contactName: string | null;
  contactPhone: string;
  addedAt: string;
}

interface PendingInvitation {
  id: string;
  ownerName: string | null;
  ownerPhone: string;
  requestedAt: string;
}

export default function RecoveryPage() {
  const [contacts, setContacts] = useState<RecoveryContact[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    Promise.all([
      apiFetch<{ contacts: RecoveryContact[] }>("/auth/recovery-contacts"),
      apiFetch<{ invitations: PendingInvitation[] }>("/auth/recovery-contacts/pending"),
    ])
      .then(([c, i]) => {
        setContacts(c.contacts);
        setInvitations(i.invitations);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load recovery contacts"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function addContact(e: FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/auth/recovery-contacts", { method: "POST", body: JSON.stringify({ phoneNumber: phone }) });
      setPhone("");
      setShowAdd(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recovery contact");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeContact(id: string) {
    try {
      await apiFetch(`/auth/recovery-contacts/${id}`, { method: "DELETE" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove contact");
    }
  }

  async function acceptInvitation(id: string) {
    try {
      await apiFetch(`/auth/recovery-contacts/${id}/accept`, { method: "POST" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          href="/security"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ondi-muted transition hover:text-ondi-primary"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
          Back to Security Hub
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Account Recovery Mesh</h1>
          <p className="mt-1 text-sm text-ondi-muted">
            Appoint trusted contacts to vouch for your identity if you ever lose your phone or keys.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-xs transition active:scale-95 ${
            showAdd
              ? "border border-ondi-border bg-ondi-card text-foreground hover:bg-ondi-mist"
              : "bg-ondi-primary text-white hover:bg-ondi-secondary"
          }`}
        >
          {!showAdd && <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2.5} />}
          {showAdd ? "Cancel" : "Add Trusted Contact"}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-600 dark:text-red-400">
          <HugeiconsIcon icon={Alert02Icon} size={16} strokeWidth={2} />
          <span>{error}</span>
        </div>
      )}

      {/* Add Contact Inline Panel */}
      {showAdd && (
        <form
          onSubmit={addContact}
          className="flex flex-col gap-4 rounded-3xl border border-ondi-primary/40 bg-ondi-card p-6 shadow-md dark:border-ondi-primary/30"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ContactBookIcon} size={18} strokeWidth={2} className="text-ondi-primary" />
            <h2 className="text-sm font-bold text-foreground">Invite a Trusted Contact</h2>
          </div>
          <p className="text-xs text-ondi-muted">
            Enter the mobile phone number (with country code) of someone you trust in real life.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              required
              type="tel"
              placeholder="+255 700 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 rounded-2xl border border-ondi-border bg-background px-4 py-2.5 text-sm font-medium text-foreground outline-none transition focus:border-ondi-primary focus:ring-2 focus:ring-ondi-primary/20"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-2xl bg-ondi-primary px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ondi-secondary disabled:opacity-60"
            >
              {submitting ? "Sending invite…" : "Send Recovery Invite"}
            </button>
          </div>
        </form>
      )}

      {/* Pending Incoming Invitations */}
      {invitations.length > 0 && (
        <div className="rounded-3xl border border-purple-500/30 bg-purple-500/5 p-6 dark:border-purple-500/20 dark:bg-purple-950/20">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">Invitations For You</h2>
            <span className="rounded-full bg-purple-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
              {invitations.length} Pending
            </span>
          </div>

          <div className="divide-y divide-purple-500/20">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-3.5">
                <div>
                  <p className="text-sm font-bold text-foreground">{inv.ownerName ?? inv.ownerPhone}</p>
                  <p className="text-xs text-ondi-muted">wants to appoint you as their trusted recovery contact</p>
                </div>
                <button
                  onClick={() => acceptInvitation(inv.id)}
                  className="rounded-full bg-purple-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-purple-700 active:scale-95"
                >
                  Accept Role
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Your Recovery Contacts List */}
      <div className="rounded-3xl border border-ondi-border/80 bg-ondi-card p-6 dark:border-ondi-border/50">
        <div className="mb-4 flex items-center justify-between border-b border-ondi-border/60 pb-3 dark:border-ondi-border/40">
          <h2 className="text-sm font-bold text-foreground">Your Trusted Contacts</h2>
          <span className="text-xs text-ondi-muted">{contacts.length} Contacts</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-ondi-muted">
            Loading recovery contacts…
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ondi-mist text-ondi-primary dark:bg-ondi-mist/80">
              <HugeiconsIcon icon={ContactBookIcon} size={28} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">No recovery contacts yet</p>
              <p className="mt-1 text-xs text-ondi-muted">
                Add at least one trusted friend or family member to ensure you never lose access.
              </p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ondi-primary/10 px-4 py-2 text-xs font-bold text-ondi-primary transition hover:bg-ondi-primary/20"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2.5} />
              Add first contact
            </button>
          </div>
        ) : (
          <div className="divide-y divide-ondi-border/50 dark:divide-ondi-border/30">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between py-4 transition hover:bg-ondi-mist/10">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
                    <HugeiconsIcon icon={ContactBookIcon} size={20} strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">
                        {contact.contactName ?? contact.contactPhone}
                      </p>
                      {contact.status === "active" ? (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                          <HugeiconsIcon icon={CheckmarkBadge01Icon} size={11} strokeWidth={2} />
                          Active Guardian
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                          <HugeiconsIcon icon={Clock01Icon} size={11} strokeWidth={2} />
                          Invitation Sent
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ondi-muted">
                      Added {new Date(contact.addedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => removeContact(contact.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-ondi-muted transition hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/20"
                  aria-label="Remove recovery contact"
                  title="Remove recovery contact"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={17} strokeWidth={1.8} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Explanatory Info Card */}
      <div className="flex items-start gap-3.5 rounded-3xl border border-ondi-border/80 bg-ondi-mist/30 p-5 dark:border-ondi-border/40 dark:bg-ondi-mist/10">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-ondi-primary/10 text-ondi-primary dark:bg-ondi-primary/20">
          <HugeiconsIcon icon={Shield01Icon} size={18} strokeWidth={2} />
        </div>
        <div className="text-xs leading-relaxed text-ondi-muted">
          <p className="font-semibold text-foreground">Zero-knowledge recovery mesh</p>
          <p className="mt-1">
            Recovery contacts cannot access your data or sign in on your behalf. During an emergency recovery request,
            Ondi asks your contacts to vouch for you, proving your ownership without central backdoors.
          </p>
        </div>
      </div>
    </div>
  );
}


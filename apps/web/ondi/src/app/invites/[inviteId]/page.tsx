"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ShieldLogo } from "@/components/OneUI";
import { apiFetch } from "@/lib/api";
import { Loader2, ShieldAlert, Users, Check, X } from "lucide-react";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

interface InviteDetail {
  id: string;
  organizationId: string;
  organizationName: string;
  roleName: string;
  invitedByName: string | null;
  status: "pending" | "accepted" | "declined";
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const inviteId = String(params?.inviteId ?? "");

  const [invite, setInvite] = useState<InviteDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  // Same guard pattern as /authorize: this is the "specific Ondi onboarding
  // section" an invite link lands on — bounce to login first (carrying this
  // page as the return URL) if there's no session yet, then load the real
  // invite once there is one.
  useEffect(() => {
    if (!inviteId) return;
    const token = localStorage.getItem("access_token");
    if (!token) {
      const currentUrl = window.location.pathname + window.location.search;
      router.push(`/login?redirect=${encodeURIComponent(currentUrl)}`);
      return;
    }

    apiFetch(`/organizations/invites/${inviteId}`)
      .then((data) => setInvite(data))
      .catch((err: any) => {
        setError(
          err?.message === "invite_not_found"
            ? "This invite doesn't exist, wasn't addressed to this account, or has already been used."
            : "Couldn't load this invite. Please try again.",
        );
      });
  }, [inviteId, router]);

  async function handleAccept() {
    if (!invite) return;
    setBusy("accept");
    setError("");
    try {
      const res = await apiFetch(`/organizations/invites/${invite.id}/accept`, {
        method: "POST",
      });
      localStorage.setItem(ACTIVE_ORG_KEY, res.organizationId ?? invite.organizationId);
      router.push("/dashboard/enterprise");
    } catch (err: any) {
      setBusy(null);
      setError(err.message || "Couldn't accept this invite. Please try again.");
    }
  }

  async function handleDecline() {
    if (!invite) return;
    setBusy("decline");
    setError("");
    try {
      await apiFetch(`/organizations/invites/${invite.id}/decline`, {
        method: "POST",
      });
      router.push("/dashboard/personal");
    } catch (err: any) {
      setBusy(null);
      setError(err.message || "Couldn't decline this invite. Please try again.");
    }
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] text-[#001633] flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-5 rounded-lg border border-slate-200 bg-white p-8 shadow-sm text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#001633]">
              Invite unavailable
            </h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/personal")}
            className="w-full rounded-md bg-[#001633] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4253D1]"
          >
            Go to my dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center text-sm text-slate-400">
        Loading invite…
      </div>
    );
  }

  if (invite.status !== "pending") {
    return (
      <div className="min-h-screen bg-[#F7F9FC] text-[#001633] flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-5 rounded-lg border border-slate-200 bg-white p-8 shadow-sm text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Users size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#001633]">
              Invite already {invite.status}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              This invite to join <strong>{invite.organizationName}</strong>{" "}
              has already been {invite.status}.
            </p>
          </div>
          <button
            onClick={() =>
              router.push(
                invite.status === "accepted"
                  ? "/dashboard/enterprise"
                  : "/dashboard/personal",
              )
            }
            className="w-full rounded-md bg-[#001633] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4253D1]"
          >
            Go to my dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#001633] flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        {error && (
          <div className="flex gap-3 rounded-md border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
            <ShieldAlert size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-[#001633] text-white">
            <ShieldLogo size={24} />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4253D1] text-white">
            <Users size={16} />
          </div>
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-xl font-semibold text-[#001633]">
            {invite.organizationName[0]}
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-semibold leading-snug text-[#001633]">
            Join <span className="text-[#4253D1]">{invite.organizationName}</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {invite.invitedByName ? `${invite.invitedByName} has` : "You've been"}{" "}
            invited you to join their organization workspace on Ondi.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-[#4253D1]/10 bg-[#ECEEFF] p-3.5">
          <span className="text-xs font-medium text-[#4253D1]">Your role</span>
          <span className="rounded-full border border-[#4253D1]/10 bg-white px-3 py-1 text-xs font-semibold text-[#001633]">
            {invite.roleName}
          </span>
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          <button
            onClick={handleAccept}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#001633] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4253D1] disabled:opacity-60"
          >
            {busy === "accept" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check size={15} /> Accept & join
              </>
            )}
          </button>
          <button
            onClick={handleDecline}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#001633] disabled:opacity-60"
          >
            {busy === "decline" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <X size={15} /> Decline
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

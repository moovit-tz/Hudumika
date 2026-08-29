"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

export default function EnterpriseGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch("/organizations/mine")
      .then((res) => {
        if (cancelled) return;
        const orgs = res.organizations ?? [];
        if (orgs.length === 0) {
          setStatus("denied");
          router.replace("/register/enterprise/kyb");
          return;
        }
        const activeId = localStorage.getItem(ACTIVE_ORG_KEY);
        if (!activeId || !orgs.some((o: any) => o.id === activeId)) {
          localStorage.setItem(ACTIVE_ORG_KEY, orgs[0].id);
        }
        setStatus("allowed");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("denied");
        router.replace("/register/enterprise/kyb");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (status !== "allowed") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#4253D1]" />
          <p className="text-xs font-bold text-slate-400">
            Checking organization access...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

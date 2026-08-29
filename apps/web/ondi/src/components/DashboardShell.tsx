"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Briefcase,
  LayoutDashboard,
  ShieldCheck,
  Smartphone,
  FileText,
  Settings,
  LogOut,
  Users,
  ChevronRight,
  ChevronLeft,
  Bell,
  Zap,
  Lock,
  Clock,
  Key,
  Grid,
  CheckSquare,
  Award,
  Search,
  ChevronDown,
  HelpCircle,
  Share2,
  Check,
  X,
  Copy,
  Send,
  Scale,
  Menu,
} from "lucide-react";
import { logoutCurrentSession } from "@/lib/session";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";
import { TopbarAppsDrawer } from "@/components/TopbarAppsDrawer";
import { onOrgsChanged } from "@/lib/orgEvents";
import { GlobalSearchProvider } from "@/lib/globalSearch";

const PERSONAL_WORKSPACE = {
  id: "personal",
  label: "",
  sub: "Personal Identity",
  avatar: "",
  picture: undefined as string | undefined,
  color: "#4253D1",
  path: "/dashboard/personal",
};

interface OrgWorkspace {
  id: string;
  label: string;
  sub: string;
  avatar: string;
  picture?: string;
  color: string;
  path: string;
}

const ACTIVE_ORG_KEY = "ondi_active_org_id";

function formatRelativeTime(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardShell({
  children,
  type = "personal",
}: {
  children: React.ReactNode;
  type?: "personal" | "enterprise";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Below `lg` the sidebar renders as a slide-in drawer instead of the
  // fixed rail — closed by default so it doesn't cover the page on load.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const globalSearchRef = useRef<HTMLDivElement>(null);
  const globalSearchInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // Help Drawer States
  const [showHelpDrawer, setShowHelpDrawer] = useState(false);
  const [helpTicketCategory, setHelpTicketCategory] = useState<
    "tech" | "auth" | "billing" | "general"
  >("tech");
  const [helpSubject, setHelpSubject] = useState("");
  const [helpDescription, setHelpDescription] = useState("");
  const [isSubmittingHelp, setIsSubmittingHelp] = useState(false);
  const [submittedHelpCode, setSubmittedHelpCode] = useState<string | null>(
    null,
  );

  // Share Modal States
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareItems, setShareItems] = useState({
    score: true,
    gov: true,
    devices: true,
    contact: false,
  });
  const [sharePurpose, setSharePurpose] = useState<
    "view" | "comment" | "review"
  >("view");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Member");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Real per-user sign-in events (GET /auth/logins) — this used to be 3
  // fabricated entries that never changed no matter what the account
  // actually did. "Read" state has no backing table yet, so it's tracked
  // client-side against the event's real id and persisted to localStorage
  // (not just in-memory) so it survives a reload.
  const READ_EVENTS_KEY = "ondi_read_auth_events";
  const [notifications, setNotifications] = useState<
    { id: string; title: string; desc: string; time: string; read: boolean }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/auth/logins?limit=8")
      .then((res) => {
        if (cancelled) return;
        let readIds: string[] = [];
        try {
          readIds = JSON.parse(localStorage.getItem(READ_EVENTS_KEY) ?? "[]");
        } catch {
          readIds = [];
        }
        const readSet = new Set(readIds);
        const items = (res.events ?? []).map((e: any) => ({
          id: e.id,
          title: e.success ? "Sign-in successful" : "Sign-in blocked",
          desc:
            [
              e.location,
              e.deviceId ? `Device ${String(e.deviceId).slice(0, 8)}` : null,
              e.riskLevel && e.riskLevel !== "LOW" ? `${e.riskLevel} risk` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No further details on file",
          time: formatRelativeTime(e.timestamp),
          read: readSet.has(e.id),
        }));
        setNotifications(items);
      })
      .catch(() => setNotifications([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const persistReadIds = (ids: string[]) => {
    try {
      localStorage.setItem(READ_EVENTS_KEY, JSON.stringify(ids));
    } catch {
      /* best-effort */
    }
  };

  const wsMenuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const triggerToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const { user } = useAuth(false);
  const personalName =
    user?.name || (user?.phone ? `+${user.phone}` : "Your Identity");
  const personalInitials = user?.name
    ? user.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("")
    : user?.phone
      ? user.phone.slice(-2)
      : "ON";
  const personalContact = user?.email || (user?.phone ? `+${user.phone}` : "");

  // Real organizations the user belongs to (GET /organizations/mine) —
  // previously a hardcoded "NKK Tech" / "Acme Bank" fake workspace list with
  // no backend behind it at all.
  const [orgWorkspaces, setOrgWorkspaces] = useState<OrgWorkspace[]>([]);
  const loadOrgWorkspaces = () => {
    apiFetch("/organizations/mine")
      .then((res) => {
        const orgs = (res.organizations ?? []).map(
          (o: any, i: number): OrgWorkspace => ({
            id: o.id,
            label: o.businessName,
            sub: `${o.role} · Organization`,
            avatar: o.businessName
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((w: string) => w[0]!.toUpperCase())
              .join(""),
            color: ["#10B981", "#F59E0B", "#8B5CF6", "#EF4444"][i % 4],
            path: "/dashboard/enterprise",
          }),
        );
        setOrgWorkspaces(orgs);
      })
      .catch(() => setOrgWorkspaces([]));
  };
  useEffect(() => {
    loadOrgWorkspaces();
    // The create-organization page lives outside this shell instance (it's
    // a full page, not a modal owned here), so it can't call
    // loadOrgWorkspaces directly — it fires this event instead once the org
    // exists, since ClientLayout deliberately never remounts the shell on
    // /dashboard/* navigations.
    return onOrgsChanged(loadOrgWorkspaces);
  }, []);

  const personalWorkspace = {
    ...PERSONAL_WORKSPACE,
    label: personalName,
    avatar: personalInitials,
    picture: user?.profileImage,
  };
  const workspaces = [personalWorkspace, ...orgWorkspaces];

  // Close the mobile drawer whenever navigation happens (link tap, back
  // button, etc.) — otherwise it stays open over the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const activeOrgId =
    typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ORG_KEY) : null;
  const currentWorkspace =
    type === "enterprise"
      ? (orgWorkspaces.find((w) => w.id === activeOrgId) ??
        orgWorkspaces[0] ??
        personalWorkspace)
      : personalWorkspace;

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wsMenuRef.current && !wsMenuRef.current.contains(target)) {
        setShowWorkspaceMenu(false);
      }
      if (
        notificationsMenuRef.current &&
        !notificationsMenuRef.current.contains(target)
      ) {
        setShowNotificationsMenu(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setShowProfileMenu(false);
      }
      if (
        globalSearchRef.current &&
        !globalSearchRef.current.contains(target)
      ) {
        setGlobalSearchOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // This is the ⌘K the search box has always advertised but never
      // actually bound — the only search surface in the app now, so it has
      // to work from anywhere, not just while already focused in it.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setGlobalSearchOpen(true);
        globalSearchInputRef.current?.focus();
        globalSearchInputRef.current?.select();
        return;
      }
      if (e.key === "Escape") {
        if (document.activeElement === globalSearchInputRef.current) {
          setGlobalSearchQuery("");
          setGlobalSearchOpen(false);
          globalSearchInputRef.current?.blur();
          return;
        }
        setShowHelpDrawer(false);
        setShowShareModal(false);
      }
    }

    document.addEventListener("mousedown", onOutside);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function handleLogout() {
    await logoutCurrentSession(router);
  }

  const switchWorkspace = (ws: OrgWorkspace | typeof PERSONAL_WORKSPACE) => {
    setShowWorkspaceMenu(false);
    if (ws.id !== "personal") localStorage.setItem(ACTIVE_ORG_KEY, ws.id);
    router.push(ws.path);
  };

  const markAllRead = () => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      persistReadIds(next.map((n) => n.id));
      return next;
    });
  };

  const toggleRead = (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, read: !n.read } : n));
      persistReadIds(next.filter((n) => n.read).map((n) => n.id));
      return next;
    });
  };

  const clearNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getGeneratedLink = () => {
    const activeItems = [];
    if (shareItems.score) activeItems.push("score");
    if (shareItems.gov) activeItems.push("gov");
    if (shareItems.devices) activeItems.push("devices");
    if (shareItems.contact) activeItems.push("contact");

    const host =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://ondi.go.tz";
    const username =
      type === "personal"
        ? "makame"
        : type === "enterprise"
          ? "nkktech"
          : "acmebank";
    return `${host}/share/${username}?items=${activeItems.join(",")}&purpose=${sharePurpose}`;
  };

  const handleSubmitHelp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpSubject.trim() || !helpDescription.trim()) {
      triggerToast("Please fill in all fields", "error");
      return;
    }
    setIsSubmittingHelp(true);
    setTimeout(() => {
      setIsSubmittingHelp(false);
      const code = `ONED-${Math.floor(100000 + Math.random() * 900000)}`;
      setSubmittedHelpCode(code);
      triggerToast("Support ticket submitted!", "success");
    }, 1000);
  };

  const handleResetHelp = () => {
    setSubmittedHelpCode(null);
    setHelpSubject("");
    setHelpDescription("");
  };

  // Real invite: POST /organizations/:id/invite, body { ondi, roleName } —
  // Ondi invites teammates by their Ondi ID, not email (services/ondi-api/src/routes/organizations.ts).
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError("");
    if (!activeOrgId) {
      setInviteError("Switch to an enterprise workspace to invite teammates.");
      return;
    }
    if (!inviteEmail.trim()) {
      setInviteError("Enter the teammate's Ondi ID.");
      return;
    }
    setIsSendingInvite(true);
    try {
      await apiFetch(`/organizations/${activeOrgId}/invite`, {
        method: "POST",
        body: JSON.stringify({
          ondi: inviteEmail.trim(),
          roleName: inviteRole,
        }),
      });
      setInviteSent(true);
      triggerToast("Invite sent successfully!", "success");
    } catch (err: any) {
      const message =
        err.message === "user_not_found"
          ? "No Ondi user found with that ID."
          : err.message === "user_already_member"
            ? "That user is already a member of this organization."
            : err.message === "invite_already_pending"
              ? "An invite is already pending for that user."
              : err.message === "insufficient_permission"
                ? "Only Owners and Admins can send invites."
                : "Could not send invite. Please try again.";
      setInviteError(message);
      triggerToast(message, "error");
    } finally {
      setIsSendingInvite(false);
    }
  };

  const linksMap = {
    enterprise: [
      {
        label: "Overview",
        icon: LayoutDashboard,
        path: "/dashboard/enterprise",
        group: "MAIN MENU",
      },
      {
        label: "Workforce Directory",
        icon: Users,
        path: "/dashboard/enterprise/directory",
        group: "WORKFORCE & ACCESS",
      },
      {
        label: "Access Management",
        icon: Key,
        path: "/dashboard/enterprise/access",
        group: "WORKFORCE & ACCESS",
      },
      {
        label: "Lifecycle Automation",
        icon: Zap,
        path: "/dashboard/enterprise/automation",
        group: "WORKFORCE & ACCESS",
      },
      {
        label: "Security Center",
        icon: ShieldCheck,
        path: "/dashboard/enterprise/security",
        group: "SECURITY & COMPLIANCE",
      },
      {
        label: "Compliance",
        icon: FileText,
        path: "/dashboard/enterprise/compliance",
        group: "SECURITY & COMPLIANCE",
      },
      {
        label: "Policies",
        icon: FileText,
        path: "/dashboard/enterprise/policies",
        group: "SECURITY & COMPLIANCE",
      },
      {
        label: "Trust Intelligence",
        icon: ShieldCheck,
        path: "/dashboard/enterprise/trust",
        group: "SECURITY & COMPLIANCE",
      },
      {
        label: "Visitor Logbook",
        icon: Users,
        path: "/dashboard/enterprise/visitors",
        group: "OPERATIONS",
      },
      {
        label: "Devices & Assets",
        icon: Smartphone,
        path: "/dashboard/enterprise/assets",
        group: "OPERATIONS",
      },
      {
        label: "Integrations",
        icon: Grid,
        path: "/dashboard/enterprise/integrations",
        group: "OPERATIONS",
      },
      {
        label: "Audit Logs",
        icon: Clock,
        path: "/dashboard/enterprise/activity",
        group: "OPERATIONS",
      },
    ],
    personal: [
      {
        label: "Overview",
        icon: LayoutDashboard,
        path: "/dashboard/personal",
        group: "MAIN MENU",
      },
      {
        label: "Identity Wallet",
        icon: FileText,
        path: "/dashboard/personal/wallet",
        group: "MAIN MENU",
      },
      {
        label: "Trust Center",
        icon: ShieldCheck,
        path: "/dashboard/personal/trust",
        group: "MAIN MENU",
      },

      {
        label: "Security",
        icon: Lock,
        path: "/dashboard/personal/security",
        group: "FEATURES",
      },
      {
        label: "Connected Devices",
        icon: Smartphone,
        path: "/dashboard/personal/devices",
        group: "FEATURES",
      },
      {
        label: "App Launcher",
        icon: Grid,
        path: "/dashboard/personal/apps",
        group: "FEATURES",
      },
      {
        label: "Credentials",
        icon: Award,
        path: "/dashboard/personal/credentials",
        group: "FEATURES",
      },
      {
        label: "Privacy Rights",
        icon: Scale,
        path: "/dashboard/personal/privacy",
        group: "FEATURES",
      },

      {
        label: "Activity Logs",
        icon: Clock,
        path: "/dashboard/personal/activity",
        group: "GENERAL",
      },
      {
        label: "Settings",
        icon: Settings,
        path: "/dashboard/personal/settings",
        group: "GENERAL",
      },
    ],
  };

  const navLinks = linksMap[type] || [];
  const activeLink = navLinks.find(
    (link) =>
      pathname === link.path ||
      (link.path === "/dashboard/personal" &&
        pathname === "/dashboard/personal"),
  );

  const pageTitle = activeLink ? activeLink.label : "Dashboard";

  const groupsMap = {
    personal: ["MAIN MENU", "FEATURES", "GENERAL"],
    enterprise: [
      "MAIN MENU",
      "WORKFORCE & ACCESS",
      "SECURITY & COMPLIANCE",
      "OPERATIONS",
    ],
  };
  const groups = groupsMap[type] || groupsMap.personal;

  // Global search — "across all Ondi", not just the current workspace's own
  // nav, so results include both personal and enterprise destinations no
  // matter which one you're currently viewing.
  const allNavItems = [
    ...linksMap.personal.map((l) => ({ ...l, section: "Personal" })),
    ...linksMap.enterprise.map((l) => ({ ...l, section: "Enterprise" })),
  ];
  const globalSearchQueryNormalized = globalSearchQuery.trim().toLowerCase();
  const globalSearchResults = globalSearchQueryNormalized
    ? allNavItems.filter((l) =>
        l.label.toLowerCase().includes(globalSearchQueryNormalized),
      )
    : [];

  // Okta's own console nav: a light sidebar, a tinted-background + left-
  // accent-border for the active item (not a dark "pill"), sentence case.
  const NavItem = ({
    link,
    isActive,
  }: {
    link: (typeof navLinks)[0];
    isActive: boolean;
  }) => {
    const Icon = link.icon;
    const itemRef = useRef<HTMLDivElement>(null);
    const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

    // The nav list scrolls (overflow-y-auto), which clips any absolutely
    // positioned tooltip that extends outside it via CSS alone — per the
    // CSS overflow spec, setting overflow-y to a non-visible value forces
    // overflow-x to auto too, so it clips horizontally as well. Rendering
    // the tooltip in a portal, positioned from the trigger's real screen
    // coordinates, is what actually keeps it visible when collapsed.
    const showTooltip = () => {
      if (!isCollapsed || !itemRef.current) return;
      const rect = itemRef.current.getBoundingClientRect();
      setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + 12 });
    };
    const hideTooltip = () => setTooltipPos(null);

    return (
      <div ref={itemRef} className="relative" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
        <div
          onClick={() => router.push(link.path)}
          className={`
            relative z-10 flex items-center cursor-pointer transition-colors duration-150 group rounded-md
            ${isCollapsed ? "justify-center w-10 h-10" : "gap-3 px-3.5 py-2"}
            ${isActive ? "bg-[#4253D1]/[0.08] text-[#4253D1]" : "text-slate-600 hover:bg-slate-100"}
          `}
        >
          <Icon
            size={16}
            className={isActive ? "text-[#4253D1]" : "text-slate-400"}
            strokeWidth={2}
          />
          {!isCollapsed && (
            <span
              className={`text-sm ${isActive ? "font-semibold" : "font-medium"}`}
            >
              {link.label}
            </span>
          )}
        </div>
        {isCollapsed && tooltipPos && createPortal(
          <div
            className="fixed -translate-y-1/2 px-2.5 py-1.5 bg-[#001633] text-white text-xs font-medium rounded-md whitespace-nowrap shadow-md z-[1000] pointer-events-none before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-4 before:border-transparent before:border-r-[#001633]"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            {link.label}
          </div>,
          document.body
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1D2939] font-dm-sans flex overflow-hidden">
      {/* ── MOBILE BACKDROP — dims the page behind the drawer; tapping it
          (or navigating) closes the sidebar. Desktop never renders this
          since the sidebar sits in-flow there, not as an overlay. ────── */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── SIDEBAR — Okta's console nav: flush white panel with a right
          border, not a floating dark card. Below `lg` it's a fixed
          slide-in drawer (translate-x) instead of an in-flow column, so
          it's reachable via the topbar's hamburger button instead of
          being permanently hidden. ───────────────────────────────────── */}
      <aside
        style={{ width: isCollapsed ? 76 : 264 }}
        className={`bg-white text-[#1D2939] flex flex-col shrink-0 z-50 fixed lg:relative inset-y-0 left-0 border-r border-slate-200 transition-transform lg:transition-[width] duration-300 ease-in-out ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* ── Workspace Switcher ───────────────────────────────────────── */}
        <div className="relative z-[400] shrink-0" ref={wsMenuRef}>
          <button
            onClick={() => setShowWorkspaceMenu((v) => !v)}
            className={`w-full flex items-center gap-3 border-b border-slate-200 transition-colors hover:bg-slate-50 h-[76px] ${
              isCollapsed ? "justify-center px-0" : "px-5"
            }`}
          >
            {/* Workspace Avatar — real photo when Ondi has one on file
                (e.g. from Google sign-in), same as every Hudumika product */}
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center overflow-hidden font-semibold text-sm shrink-0"
              style={{
                background: `${currentWorkspace.color}15`,
                border: `1px solid ${currentWorkspace.color}30`,
                color: currentWorkspace.color,
              }}
            >
              {currentWorkspace.picture ? (
                <img
                  src={currentWorkspace.picture}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                currentWorkspace.avatar
              )}
            </div>

            {!isCollapsed && (
              <>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-[#001633] truncate leading-none">
                    {currentWorkspace.label}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {currentWorkspace.sub}
                  </p>
                </div>
                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform duration-200 shrink-0 ${showWorkspaceMenu ? "rotate-180" : ""}`}
                />
              </>
            )}
          </button>

          {/* Workspace Dropdown */}
          {showWorkspaceMenu && (
            <div
              className={`absolute top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-[200] ${
                isCollapsed ? "left-full ml-3 w-56" : "left-3 right-3"
              }`}
            >
              <div className="p-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400 px-3 py-2">
                  Workspaces
                </p>
                {workspaces.map((ws) => {
                  const isCurrent = ws.id === currentWorkspace.id;
                  return (
                    <button
                      key={ws.id}
                      onClick={() => switchWorkspace(ws)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors group ${
                        isCurrent ? "bg-slate-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-md flex items-center justify-center overflow-hidden font-semibold text-xs shrink-0"
                        style={{
                          background: `${ws.color}15`,
                          border: `1px solid ${ws.color}30`,
                          color: ws.color,
                        }}
                      >
                        {ws.picture ? (
                          <img
                            src={ws.picture}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          ws.avatar
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium text-[#001633] truncate leading-none">
                          {ws.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{ws.sub}</p>
                      </div>
                      {isCurrent && (
                        <Check size={14} className="text-[#4253D1] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-slate-100 p-2">
                <button
                  onClick={() => {
                    setShowWorkspaceMenu(false);
                    router.push("/dashboard/personal/create-organization");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-[#001633] hover:bg-slate-50 rounded-md transition-colors"
                >
                  <span className="w-4 h-4 rounded-full border border-dashed border-slate-400 flex items-center justify-center text-slate-400 text-[10px]">
                    +
                  </span>
                  Add organization
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Area — no stagger animation to prevent blank flash on remount */}
        <div className="flex-1 overflow-y-auto py-5 px-3 relative z-10">
          <div className="space-y-6">
            {groups.map((groupName) => {
              const groupLinks = navLinks.filter(
                (l) => (l as any).group === groupName,
              );
              if (groupLinks.length === 0) return null;
              return (
                <div key={groupName} className="space-y-0.5">
                  {!isCollapsed && (
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 px-3.5 mb-1.5">
                      {groupName
                        .toLowerCase()
                        .replace(/(^|\s)\S/g, (c) => c.toUpperCase())}
                    </p>
                  )}
                  {groupLinks.map((link, idx) => {
                    const isActive =
                      pathname === link.path ||
                      (link.path === `/dashboard/${type}` &&
                        pathname === `/dashboard/${type}`);
                    return (
                      <NavItem key={idx} link={link} isActive={isActive} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Enterprise Card — promotes the real org-creation flow
            (POST-backed KYB registration, same one used by "Add
            organization" in the workspace switcher above), only shown
            from the personal workspace since it's not relevant once
            you're already in an enterprise one. */}
        {!isCollapsed && type === "personal" && (
          <div className="px-3 py-4 border-t border-slate-200 relative z-10 shrink-0">
            <div className="p-4 rounded-md border border-slate-200 bg-slate-50">
              <div className="w-8 h-8 rounded-md bg-[#4253D1]/10 flex items-center justify-center text-[#4253D1] mb-3">
                <Briefcase size={16} />
              </div>
              <p className="text-sm font-semibold text-[#001633]">
                Bring your organization
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Set up an enterprise workspace to manage your team's identity,
                access, and compliance in one place.
              </p>
              <button
                onClick={() =>
                  router.push("/dashboard/personal/create-organization")
                }
                className="w-full mt-3 py-1.5 bg-[#001633] hover:bg-[#4253D1] text-white rounded-md text-xs font-semibold transition-colors"
              >
                Create enterprise workspace
              </button>
            </div>
          </div>
        )}

        {/* Footer / Logout */}
        <div className="p-3 border-t border-slate-200 relative z-10 shrink-0 flex justify-center">
          <button
            onClick={handleLogout}
            title="Log Out"
            className={`
              flex items-center gap-3 text-slate-500 hover:text-[#001633] hover:bg-slate-100 rounded-md transition-colors text-sm font-medium
              ${isCollapsed ? "w-10 h-10 justify-center px-0 py-0" : "w-full px-3.5 py-2"}
            `}
          >
            <LogOut size={16} />
            {!isCollapsed && <span>Log out</span>}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ─────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto relative h-screen bg-[#F8F9FA] z-10">
        {/* Topbar — Okta's console header: a flat, full-width bar with a
            bottom border, not a floating blurred pill. */}
        <header className="sticky top-0 z-[100] shrink-0 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between px-5 h-[76px]">
            {/* Left: Collapse Toggle + Breadcrumbs */}
            <div className="flex items-center gap-4">
              {/* Mobile: opens the slide-in drawer. Desktop: the drawer is
                  always in-flow, so this button doesn't apply there. */}
              <button
                onClick={() => setMobileNavOpen(true)}
                className="p-1.5 text-slate-500 hover:text-[#001633] hover:bg-slate-100 rounded-md transition-colors border border-slate-200 flex items-center justify-center shrink-0 lg:hidden"
                title="Open menu"
              >
                <Menu size={16} />
              </button>

              {/* Desktop: collapses the sidebar to an icon rail. Hidden on
                  mobile, where the drawer is either fully open or fully
                  closed — there's no in-between rail state there. */}
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1.5 text-slate-500 hover:text-[#001633] hover:bg-slate-100 rounded-md transition-colors border border-slate-200 hidden lg:flex items-center justify-center shrink-0"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? (
                  <ChevronRight size={14} />
                ) : (
                  <ChevronLeft size={14} />
                )}
              </button>

              <div className="flex items-center gap-1.5 text-sm">
                <span
                  onClick={() => router.push("/")}
                  className="text-slate-400 hover:text-[#001633] cursor-pointer transition-colors"
                >
                  Ondi
                </span>
                <span className="text-slate-300">/</span>
                <span
                  onClick={() =>
                    router.push(
                      type === "enterprise"
                        ? "/dashboard/enterprise"
                        : "/dashboard/personal",
                    )
                  }
                  className="text-slate-400 hover:text-[#001633] cursor-pointer transition-colors"
                >
                  {currentWorkspace.label}
                </span>
                <span className="text-slate-300">/</span>
                <span className="font-medium text-[#001633]">{pageTitle}</span>
              </div>
            </div>

            {/* Global Search — the one search box in the whole app. It
                jumps to matching destinations (personal + enterprise nav,
                not just the current workspace's own) via the dropdown
                below, and every page's own list (members, activity, etc.)
                filters live against this same query through
                useGlobalSearch() — no more per-page search boxes. */}
            <div ref={globalSearchRef} className="relative flex-1 max-w-sm mx-6 hidden md:block">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                ref={globalSearchInputRef}
                type="text"
                value={globalSearchQuery}
                onChange={(e) => {
                  setGlobalSearchQuery(e.target.value);
                  setGlobalSearchOpen(true);
                }}
                onFocus={() => setGlobalSearchOpen(true)}
                placeholder="Search across Ondi"
                className="w-full pl-9 pr-12 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm text-[#001633] placeholder-slate-400 focus:outline-none focus:border-[#4253D1] focus:bg-white transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                ⌘K
              </span>

              {globalSearchOpen && globalSearchQueryNormalized && (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[500] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  {globalSearchResults.length === 0 ? (
                    <p className="px-4 py-4 text-center text-sm text-slate-400">
                      No matches for &ldquo;{globalSearchQuery.trim()}&rdquo;
                    </p>
                  ) : (
                    <div className="max-h-80 overflow-y-auto py-1.5">
                      {globalSearchResults.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.path}
                            onClick={() => {
                              setGlobalSearchOpen(false);
                              setGlobalSearchQuery("");
                              router.push(item.path);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 transition-colors"
                          >
                            <Icon size={15} className="text-slate-400 shrink-0" />
                            <span className="flex-1 text-sm font-medium text-[#001633]">
                              {item.label}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0">
                              {item.section}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Utilities */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHelpDrawer(true)}
                className="p-2 text-slate-500 hover:text-[#001633] hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                title="Help Center"
              >
                <HelpCircle size={17} />
              </button>

              {/* Notifications Dropdown */}
              <div className="relative" ref={notificationsMenuRef}>
                <button
                  onClick={() => setShowNotificationsMenu((v) => !v)}
                  className={`p-2 text-slate-500 hover:text-[#001633] hover:bg-slate-100 rounded-md transition-colors relative ${
                    showNotificationsMenu ? "bg-slate-100 text-[#001633]" : ""
                  }`}
                  title="Notifications"
                >
                  <Bell size={17} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#4253D1] rounded-full" />
                  )}
                </button>

                {showNotificationsMenu && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-[500]">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#001633]">
                        Notifications
                      </span>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllRead}
                          className="text-xs font-medium text-[#4253D1] hover:text-[#1A4C93] transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400 font-medium">
                          No notifications to show.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => toggleRead(n.id)}
                            className={`p-3 text-left transition-colors cursor-pointer group flex items-start gap-2.5 ${
                              n.read
                                ? "hover:bg-slate-50/50"
                                : "bg-blue-50/20 hover:bg-blue-50/40"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${n.read ? "bg-transparent" : "bg-[#4253D1]"}`}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <p
                                  className={`text-sm font-semibold ${n.read ? "text-[#001633]" : "text-[#4253D1]"}`}
                                >
                                  {n.title}
                                </p>
                                <span className="text-xs text-slate-400 whitespace-nowrap">
                                  {n.time}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 leading-normal mt-0.5">
                                {n.desc}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                clearNotification(n.id);
                              }}
                              className="text-slate-300 hover:text-red-500 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Dismiss"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
                      <button
                        onClick={() => {
                          setShowNotificationsMenu(false);
                          router.push(
                            type === "enterprise"
                              ? "/dashboard/enterprise/activity"
                              : "/dashboard/personal/activity",
                          );
                        }}
                        className="w-full py-1.5 text-xs font-medium text-slate-500 hover:text-[#001633] transition-colors block"
                      >
                        View all logs
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Share Button */}
              <button
                onClick={() => setShowShareModal(true)}
                className="px-3.5 py-1.5 bg-[#001633] hover:bg-[#4253D1] text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
                title="Share Profile Options"
              >
                <Share2 size={13} />
                Share
              </button>

              <TopbarAppsDrawer />

              <span className="h-5 w-[1px] bg-slate-200" />

              {/* User Profile Dropdown */}
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setShowProfileMenu((v) => !v)}
                  className={`flex items-center gap-2 cursor-pointer group p-1 rounded-full hover:bg-slate-100 transition-colors ${
                    showProfileMenu ? "bg-slate-100" : ""
                  }`}
                  title="Profile Menu"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden font-semibold text-xs transition-transform"
                    style={{
                      background: `${currentWorkspace.color}15`,
                      border: `1px solid ${currentWorkspace.color}30`,
                      color: currentWorkspace.color,
                    }}
                  >
                    {currentWorkspace.picture ? (
                      <img
                        src={currentWorkspace.picture}
                        alt=""
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      currentWorkspace.avatar
                    )}
                  </div>
                </button>
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-[500]">
                    {/* User Info Header */}
                    <div className="px-4 py-4 border-b border-slate-100 flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden font-semibold text-sm"
                        style={{
                          background: `${currentWorkspace.color}15`,
                          border: `1px solid ${currentWorkspace.color}30`,
                          color: currentWorkspace.color,
                        }}
                      >
                        {currentWorkspace.picture ? (
                          <img
                            src={currentWorkspace.picture}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          currentWorkspace.avatar
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#001633] truncate">
                          {type === "enterprise"
                            ? `${currentWorkspace.label} · ${(currentWorkspace as OrgWorkspace).sub ?? ""}`
                            : currentWorkspace.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {personalContact || "No contact on file"}
                        </p>
                      </div>
                    </div>

                    {/* Navigation links */}
                    <div className="p-1.5 border-b border-slate-100">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          router.push("/dashboard/personal/settings");
                        }}
                        className="w-full flex items-center gap-3.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#001633] hover:bg-slate-50 rounded-md transition-colors"
                      >
                        <Settings size={14} className="text-slate-400" />
                        Settings
                      </button>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          router.push("/dashboard/personal/security");
                        }}
                        className="w-full flex items-center gap-3.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#001633] hover:bg-slate-50 rounded-md transition-colors"
                      >
                        <Lock size={14} className="text-slate-400" />
                        Security center
                      </button>
                    </div>

                    {/* Workspace Switching list */}
                    <div className="p-1.5 border-b border-slate-100">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400 px-3 py-1.5">
                        Switch workspace
                      </p>
                      {workspaces.map((ws) => {
                        const isCurrent = ws.id === type;
                        return (
                          <button
                            key={ws.id}
                            onClick={() => {
                              setShowProfileMenu(false);
                              switchWorkspace(ws);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md transition-colors ${
                              isCurrent
                                ? "bg-[#4253D1]/5 text-[#4253D1]"
                                : "hover:bg-slate-50 text-slate-600"
                            }`}
                          >
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center font-semibold text-[9px]"
                              style={{
                                background: `${ws.color}15`,
                                color: ws.color,
                              }}
                            >
                              {ws.avatar}
                            </div>
                            <span className="text-sm font-medium flex-1 text-left truncate">
                              {ws.label}
                            </span>
                            {isCurrent && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#4253D1]" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Log Out */}
                    <div className="p-1.5">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3.5 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
                      >
                        <LogOut size={14} />
                        Log out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content Canvas */}
        <div className="relative pb-24 min-h-[calc(100vh-80px)] pt-4">
          <div className="relative z-10">
            <GlobalSearchProvider
              value={{
                query: globalSearchQuery,
                clear: () => {
                  setGlobalSearchQuery("");
                  setGlobalSearchOpen(false);
                },
              }}
            >
              {children}
            </GlobalSearchProvider>
          </div>
        </div>
      </main>
      {toast && (
        <div className="fixed bottom-6 right-6 z-[999] px-4 py-3 rounded-xl shadow-2xl border border-slate-200 bg-white flex items-center gap-3">
          {toast.type === "success" && (
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs font-bold">
              ✓
            </div>
          )}
          {toast.type === "error" && (
            <div className="w-5 h-5 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center text-xs font-bold">
              ✕
            </div>
          )}
          {toast.type === "info" && (
            <div className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs font-bold">
              i
            </div>
          )}
          <span className="text-xs font-bold text-[#001633]">
            {toast.message}
          </span>
        </div>
      )}

      {/* Support / Help Drawer */}
      {showHelpDrawer && (
        <div
          onClick={() => setShowHelpDrawer(false)}
          className="fixed inset-0 bg-[#001633]/30 backdrop-blur-sm z-[800] pointer-events-auto"
        />
      )}
      {showHelpDrawer && (
        <div className="fixed top-0 right-0 h-full w-full sm:w-[460px] bg-white shadow-2xl z-[850] pointer-events-auto border-l border-slate-100 flex flex-col">
          {/* Drawer Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-[#001633] text-white">
            <div className="flex items-center gap-2.5">
              <HelpCircle size={18} className="text-[#4253D1]" />
              <span className="text-sm font-semibold">Help Center</span>
            </div>
            <button
              onClick={() => setShowHelpDrawer(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Support Desk Form */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-[#001633]">
                Support Desk Ticket
              </h3>

              {submittedHelpCode ? (
                <div className="bg-blue-50/30 border border-[#D5D9F5] rounded-lg p-5 text-center space-y-4">
                  <div className="w-10 h-10 rounded-full bg-[#ECEEFF] text-[#4253D1] flex items-center justify-center mx-auto text-lg">
                    ✓
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#001633]">
                      Ticket Created Successfully
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                      Our consultative architects will review your ticket and
                      respond within 15 minutes.
                    </p>
                  </div>
                  <div className="py-2.5 px-4 bg-white border border-[#D5D9F5] rounded-xl inline-block">
                    <p className="text-[10px] text-slate-400 font-bold">
                      Ticket Code
                    </p>
                    <p className="text-sm font-semibold text-[#4253D1] mt-0.5">
                      {submittedHelpCode}
                    </p>
                  </div>
                  <button
                    onClick={handleResetHelp}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Submit Another Ticket
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitHelp} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 block">
                      Category
                    </label>
                    <select
                      value={helpTicketCategory}
                      onChange={(e) =>
                        setHelpTicketCategory(e.target.value as any)
                      }
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-[#001633] focus:outline-none focus:border-[#4253D1] focus:bg-white transition-colors"
                    >
                      <option value="tech">Technical & API Support</option>
                      <option value="auth">Account & Verification</option>
                      <option value="billing">Workspace Billing</option>
                      <option value="general">General Inquiry</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 block">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={helpSubject}
                      onChange={(e) => setHelpSubject(e.target.value)}
                      placeholder="Brief summary of the issue"
                      required
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-[#001633] placeholder-slate-400 focus:outline-none focus:border-[#4253D1] focus:bg-white transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 block">
                      Description
                    </label>
                    <textarea
                      value={helpDescription}
                      onChange={(e) => setHelpDescription(e.target.value)}
                      placeholder="Provide details about your query or error messages"
                      required
                      rows={4}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-[#001633] placeholder-slate-400 focus:outline-none focus:border-[#4253D1] focus:bg-white transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingHelp}
                    className="w-full py-2.5 bg-[#4253D1] hover:bg-[#1A4C93] disabled:bg-slate-300 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-[#4253D1]/10 active:scale-[0.98] cursor-pointer"
                  >
                    <Send size={12} />
                    {isSubmittingHelp
                      ? "Submitting..."
                      : "Submit Support Ticket"}
                  </button>
                </form>
              )}
            </div>

            {/* Frequently Asked Questions */}
            <div className="space-y-3.5 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-[#001633]">
                FAQ Guidelines
              </h3>
              <div className="space-y-2.5">
                {[
                  {
                    q: "How to upgrade verification to L2?",
                    a: "Go to Settings > Verification Hub and upload a valid government ID or connect your NIDA registry keys.",
                  },
                  {
                    q: "SSO & webhook integration guide",
                    a: "Check the Developer Docs under the Webhooks section. Webhook secrets can be generated in connected apps.",
                  },
                  {
                    q: "Troubleshooting Tra Connection",
                    a: "Ensure your tax certificate numbers match your workspace entity registrations before linking Tra keys.",
                  },
                ].map((faq, i) => (
                  <div
                    key={i}
                    className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1"
                  >
                    <p className="text-[11px] font-bold text-[#001633]">
                      {faq.q}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Profile Modal */}
      {showShareModal && (
        <div
          onClick={() => setShowShareModal(false)}
          className="fixed inset-0 bg-[#001633]/40 backdrop-blur-sm z-[800] pointer-events-auto flex items-center justify-center"
        >
          {/* Modal Container */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg p-6 sm:p-8 w-[92%] sm:w-[500px] max-w-lg shadow-2xl border border-slate-200 flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Share2 size={16} className="text-[#4253D1]" />
                <h3 className="text-sm font-semibold text-[#001633]">
                  Share Ondi Profile
                </h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-5 space-y-5 flex-1 overflow-y-auto">
              {/* Share Items Checkboxes */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400">
                  Select Shared Attributes
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={shareItems.score}
                      onChange={(e) =>
                        setShareItems({
                          ...shareItems,
                          score: e.target.checked,
                        })
                      }
                      className="mt-0.5 accent-[#4253D1]"
                    />
                    <div>
                      <p className="text-[11px] font-bold text-[#001633]">
                        Trust Score
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium">
                        Verify score analytics
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={shareItems.gov}
                      onChange={(e) =>
                        setShareItems({
                          ...shareItems,
                          gov: e.target.checked,
                        })
                      }
                      className="mt-0.5 accent-[#4253D1]"
                    />
                    <div>
                      <p className="text-[11px] font-bold text-[#001633]">
                        KYC Level
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium">
                        L2 Gov. verified badge
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={shareItems.devices}
                      onChange={(e) =>
                        setShareItems({
                          ...shareItems,
                          devices: e.target.checked,
                        })
                      }
                      className="mt-0.5 accent-[#4253D1]"
                    />
                    <div>
                      <p className="text-[11px] font-bold text-[#001633]">
                        Devices
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium">
                        Active sessions overview
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={shareItems.contact}
                      onChange={(e) =>
                        setShareItems({
                          ...shareItems,
                          contact: e.target.checked,
                        })
                      }
                      className="mt-0.5 accent-[#4253D1]"
                    />
                    <div>
                      <p className="text-[11px] font-bold text-[#001633]">
                        Contact Info
                      </p>
                      <p className="text-[9px] text-slate-500 font-medium">
                        Email & phone verification
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Share Purpose & Permissions */}
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold text-slate-400">
                  Select Share Purpose & Actions
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: "view",
                      label: "View Only",
                      desc: "Read-only access",
                    },
                    {
                      id: "comment",
                      label: "Comments",
                      desc: "Ask for feedback",
                    },
                    {
                      id: "review",
                      label: "Review / Audit",
                      desc: "Audit & verification",
                    },
                  ].map((purpose) => (
                    <button
                      key={purpose.id}
                      type="button"
                      onClick={() => setSharePurpose(purpose.id as any)}
                      className={`p-2.5 rounded-xl border text-center transition-colors cursor-pointer ${
                        sharePurpose === purpose.id
                          ? "border-[#4253D1] bg-[#4253D1]/5 text-[#4253D1]"
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <p className="text-[11px] font-bold">{purpose.label}</p>
                      <p className="text-[8px] opacity-80 mt-0.5 leading-none">
                        {purpose.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Generated URL Box */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400">
                  Secure Sharing Link
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getGeneratedLink()}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(getGeneratedLink());
                      triggerToast("Secure share link copied!", "success");
                    }}
                    className="px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center transition-colors cursor-pointer"
                    title="Copy Link"
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>

              {/* Team Invite Box — real POST /organizations/:id/invite */}
              <div className="space-y-1.5 border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-400">
                  Invite Teammate to Workspace
                </p>
                {!activeOrgId ? (
                  <p className="text-[11px] text-slate-400 font-medium bg-slate-50 border border-slate-100 rounded-xl p-3">
                    Switch to an enterprise workspace to invite teammates by
                    their Ondi ID.
                  </p>
                ) : inviteSent ? (
                  <div className="bg-emerald-50/50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-[11px] font-medium flex items-center justify-between">
                    <span>
                      Invite sent to <strong>{inviteEmail}</strong>!
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setInviteSent(false);
                        setInviteEmail("");
                      }}
                      className="text-xs font-bold text-[#4253D1] hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSendInvite} className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Teammate's Ondi ID"
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-[#001633] placeholder-slate-400 focus:outline-none focus:border-[#4253D1] focus:bg-white transition-colors"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-[#001633] focus:outline-none focus:border-[#4253D1] focus:bg-white transition-colors"
                      >
                        <option value="Member">Member</option>
                        <option value="Admin">Admin</option>
                      </select>
                      <button
                        type="submit"
                        disabled={isSendingInvite}
                        className="px-4 py-2 bg-[#4253D1] hover:bg-[#1A4C93] disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                      >
                        {isSendingInvite ? "Sending..." : "Send"}
                      </button>
                    </div>
                    {inviteError && (
                      <p className="text-[10px] text-red-600 font-medium">
                        {inviteError}
                      </p>
                    )}
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

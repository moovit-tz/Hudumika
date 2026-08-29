"use client";

import { useState } from "react";
import { DocumentsPanel } from "./DocumentsPanel";
import { PasswordVaultPanel } from "./PasswordVaultPanel";

const WALLET_TABS = [
  { id: "documents", label: "Documents" },
  { id: "passwords", label: "Passwords" },
] as const;
type WalletTab = (typeof WALLET_TABS)[number]["id"];

export default function WalletPage() {
  const [activeTab, setActiveTab] = useState<WalletTab>("documents");

  return (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-10">
      <div className="space-y-3">
        <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
          Identity <span className="text-[#4253D1]">Wallet</span>
        </h1>
        <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
          Your secure decentralized digital vault. Manage, inspect, and share
          your verified documents, and store logins, cards and notes,
          encrypted end-to-end with a passphrase only you know.
        </p>
      </div>

      {/* Tab Bar */}
      <div className="relative border-b border-slate-100 flex items-center gap-8">
        {WALLET_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative shrink-0 pb-4 text-xs font-bold tracking-wide transition-colors ${
                isActive
                  ? "text-[#4253D1]"
                  : "text-slate-400 hover:text-[#001633]"
              }`}
            >
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4253D1]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Both panels stay mounted — switching tabs shouldn't re-fetch
          documents or force the Vault to be unlocked again. */}
      <div className={activeTab === "documents" ? "" : "hidden"}>
        <DocumentsPanel />
      </div>
      <div className={activeTab === "passwords" ? "" : "hidden"}>
        <PasswordVaultPanel />
      </div>
    </div>
  );
}

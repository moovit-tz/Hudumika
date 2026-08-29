"use client";

import { useState, useEffect } from "react";
import { GlassPanel } from "@/components/OneUI";
import { apiFetch } from "@/lib/api";
import { buildDocuments, type DocumentEntry } from "@/lib/identity";
import { FileText, ShieldCheck, ShieldAlert, Lock } from "lucide-react";
import { Sk } from "@/components/Skeleton";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/auth/me")
      .then((me) => setDocuments(buildDocuments(me)))
      .catch(() => setDocuments(buildDocuments(null)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 lg:p-12 max-w-7xl mx-auto space-y-12">
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
          My <span className="text-[#4253D1]">Documents</span>
        </h1>
        <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
          The verification status of your government-issued identity documents
          on file with Ondi.
        </p>
      </div>

      {/* Documents Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-6 bg-white border border-slate-100 rounded-lg">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <Sk className="w-12 h-12 rounded-lg" />
                  <div className="space-y-2">
                    <Sk className="h-3.5 w-28" />
                    <Sk className="h-2.5 w-20" />
                  </div>
                </div>
                <Sk className="h-6 w-20 rounded-full" />
              </div>
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-50">
                <Sk className="h-2.5 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {documents.map((doc) => {
            const isVerified = doc.status === "verified";
            const isMissing = doc.status === "missing";

            return (
              <GlassPanel
                key={doc.documentType}
                className="p-6 bg-white border-slate-100 rounded-lg"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center ${isVerified ? "bg-blue-50 text-[#4253D1]" : "bg-slate-50 text-slate-400"}`}
                    >
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#001633] tracking-tight">
                        {doc.name}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium">
                        {doc.source ?? "Government ID"}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                      isVerified
                        ? "bg-emerald-50 text-emerald-600"
                        : isMissing
                          ? "bg-slate-50 text-slate-400"
                          : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {isVerified ? (
                      <ShieldCheck size={12} />
                    ) : (
                      <ShieldAlert size={12} />
                    )}
                    {isVerified
                      ? "Verified"
                      : isMissing
                        ? "Missing"
                        : "Pending"}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-50">
                  <span className="text-xs text-slate-400 font-medium">
                    {doc.date
                      ? new Date(doc.date).toLocaleDateString("en", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Not provided"}
                  </span>
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-slate-50 border border-slate-100 rounded-lg p-6 flex gap-4">
        <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-[#4253D1] shrink-0">
          <Lock size={20} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-[#001633] mb-1">
            Zero-Knowledge Storage
          </h4>
          <p className="text-xs text-slate-500 font-normal leading-relaxed">
            Documents are encrypted with keys derived from your device passkey.
            Ondi cannot read or share your documents without your explicit
            permission.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GlassPanel } from "@/components/OneUI";
import { apiFetch } from "@/lib/api";
import { runKycSubmission } from "@/lib/kyc";
import { buildDocuments } from "@/lib/identity";
import { useGlobalSearch, useClearGlobalSearch } from "@/lib/globalSearch";
import {
  FileText,
  GraduationCap,
  Briefcase,
  Wallet,
  Heart,
  Plus,
  Filter,
  Download,
  Share2,
  Eye,
  Lock,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ChevronRight,
  X,
  HardDrive,
  FileImage,
  AlertCircle,
  Loader2,
  Upload,
} from "lucide-react";

const MAX_FILE_MB = 10;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type))
    return "Unsupported file type. Use PNG, JPG, PDF, or DOC.";
  const mb = file.size / (1024 * 1024);
  if (mb > MAX_FILE_MB)
    return `File too large (${mb.toFixed(1)} MB). Max ${MAX_FILE_MB} MB per file.`;
  return null;
}

// ── OCR text parser ─────────────────────────────────────────────────────────
const ISSUER_KWORDS = [
  "university",
  "college",
  "ministry",
  "government",
  "authority",
  "board",
  "institute",
  "bank",
  "agency",
  "nida",
  "rita",
  "necta",
  "tra",
  "nhif",
  "republic",
  "hospital",
  "commission",
  "council",
];

function parseOcrText(raw: string): {
  name?: string;
  issuer?: string;
  details?: string;
} {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  // Title: first line with significant content (likely a doc heading)
  let name: string | undefined;
  for (const line of lines.slice(0, 10)) {
    const upper = line.replace(/[^A-Z\s]/g, "").trim();
    if (upper.length >= 6 && upper.split(" ").length >= 2) {
      name = line
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      break;
    }
  }

  // Issuer: line containing known institutional keywords
  let issuer: string | undefined;
  for (const line of lines) {
    if (ISSUER_KWORDS.some((k) => line.toLowerCase().includes(k))) {
      issuer = line
        .replace(/[^\w\s.]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 50);
      break;
    }
  }

  // Details: pull date patterns + ID-like codes
  const dateM = raw.match(
    /\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/i,
  );
  const idM = raw.match(/\b[A-Z]{2,5}[-\s]?\d{4,12}\b/);
  const parts = [dateM?.[0], idM?.[0]].filter(Boolean);
  const details = parts.length ? parts.join(" · ") : undefined;

  return { name, issuer, details };
}

export function DocumentsPanel() {
  const [activeTab, setActiveTab] = useState("personal_docs");
  // Filters against the topbar's search box (⌘K) — see useGlobalSearch().
  const searchQuery = useGlobalSearch();
  const clearSearch = useClearGlobalSearch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [aiPrediction, setAiPrediction] = useState<string | null>(null);
  const [userOverride, setUserOverride] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "personal_docs",
    issuer: "",
    details: "",
    documentType: "NIN" as "NIN" | "PASSPORT" | "DRIVER_LICENSE",
    documentNumber: "",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<{
    name: string;
    type: string;
    status: string;
    date: string;
    details: string;
    issuer: string;
    fileUrl?: string;
  } | null>(null);
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [ocrState, setOcrState] = useState<
    "idle" | "reading" | "done" | "error"
  >("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrAutofilled, setOcrAutofilled] = useState<Set<string>>(new Set());

  // ── AI Category Prediction Engine ──────────────────────────────────────
  const CATEGORY_KEYWORDS: Record<
    string,
    { words: string[]; weight: number }[]
  > = {
    personal_docs: [
      {
        words: [
          "nida",
          "national id",
          "passport",
          "birth",
          "certificate of birth",
          "citizenship",
          "driving",
          "licence",
          "license",
          "permit",
          "voter",
          "id card",
          "identity",
          "identification",
          "death",
          "marriage",
          "rita",
        ],
        weight: 3,
      },
      {
        words: ["card", "document", "proof", "personal", "resident"],
        weight: 1,
      },
    ],
    education: [
      {
        words: [
          "degree",
          "diploma",
          "bachelor",
          "master",
          "phd",
          "doctorate",
          "transcript",
          "academic",
          "university",
          "college",
          "school",
          "necta",
          "udsm",
          "muhas",
          "saut",
          "udom",
          "result",
          "grade",
          "certificate of completion",
          "a-level",
          "o-level",
          "form four",
          "form six",
        ],
        weight: 3,
      },
      {
        words: [
          "education",
          "qualification",
          "study",
          "course",
          "training",
          "scholarship",
        ],
        weight: 2,
      },
    ],
    career_business: [
      {
        words: [
          "employment",
          "contract",
          "offer letter",
          "appointment",
          "work",
          "job",
          "reference",
          "experience",
          "employer",
          "company",
          "nss",
          "pension",
          "tin",
          "business registration",
          "brela",
          "trade license",
          "nssf",
          "labour",
        ],
        weight: 3,
      },
      {
        words: [
          "career",
          "professional",
          "business",
          "corporate",
          "salary",
          "payslip",
          "resignation",
          "promotion",
        ],
        weight: 2,
      },
    ],
    financial: [
      {
        words: [
          "bank",
          "account",
          "statement",
          "ledger",
          "mpesa",
          "m-pesa",
          "airtel money",
          "tigo pesa",
          "tax clearance",
          "tra",
          "tax",
          "revenue",
          "loan",
          "mortgage",
          "insurance policy",
          "investment",
          "dividend",
          "utility bill",
          "financial",
        ],
        weight: 3,
      },
      {
        words: [
          "payment",
          "receipt",
          "invoice",
          "money",
          "savings",
          "credit",
          "debit",
        ],
        weight: 2,
      },
    ],
    healthcare: [
      {
        words: [
          "nhif",
          "hospital",
          "medical",
          "health",
          "vaccine",
          "vaccination",
          "prescription",
          "doctor",
          "clinic",
          "lab",
          "test result",
          "blood",
          "dental",
          "eye",
          "mental health",
          "disability",
          "insurance card",
        ],
        weight: 3,
      },
      {
        words: [
          "health",
          "medicine",
          "treatment",
          "therapy",
          "patient",
          "covid",
          "chronic",
        ],
        weight: 2,
      },
    ],
  };

  const predictCategory = (title: string): string | null => {
    if (!title.trim() || title.trim().length < 3) return null;
    const lower = title.toLowerCase();
    const scores: Record<string, number> = {};
    for (const [cat, groups] of Object.entries(CATEGORY_KEYWORDS)) {
      scores[cat] = 0;
      for (const { words, weight } of groups) {
        for (const word of words) {
          if (lower.includes(word)) scores[cat] += weight;
        }
      }
    }
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : null;
  };

  // Debounced prediction effect
  useEffect(() => {
    if (userOverride) return;
    const timer = setTimeout(() => {
      const predicted = predictCategory(formData.name);
      if (predicted) {
        setAiPrediction(predicted);
        setFormData((prev) => ({ ...prev, category: predicted }));
      } else {
        setAiPrediction(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.name, userOverride]);

  // OCR autofill — triggers when an image file is attached
  useEffect(() => {
    if (!attachedFile || !attachedFile.type.startsWith("image/")) {
      setOcrState("idle");
      setOcrAutofilled(new Set());
      return;
    }

    let cancelled = false;
    setOcrState("reading");
    setOcrProgress(0);
    setOcrAutofilled(new Set());

    import("tesseract.js")
      .then((mod) => {
        if (cancelled) return Promise.resolve(null);
        const recognize = (mod as any).recognize ?? mod.default?.recognize;
        return recognize(attachedFile, "eng", {
          logger: (m: { status: string; progress: number }) => {
            if (!cancelled && m.status === "recognizing text") {
              setOcrProgress(Math.round(m.progress * 100));
            }
          },
        });
      })
      .then((result: any) => {
        if (cancelled || !result) return;
        const parsed = parseOcrText(result.data.text);
        const filled = new Set<string>();

        setFormData((prev) => {
          const next = { ...prev };
          if (parsed.name && !prev.name) {
            next.name = parsed.name;
            filled.add("name");
          }
          if (parsed.issuer && !prev.issuer) {
            next.issuer = parsed.issuer;
            filled.add("issuer");
          }
          if (parsed.details && !prev.details) {
            next.details = parsed.details;
            filled.add("details");
          }
          return next;
        });

        if (filled.has("name")) setUserOverride(false);
        setOcrAutofilled(filled);
        setOcrState("done");
      })
      .catch(() => {
        if (!cancelled) setOcrState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [attachedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      return;
    }
    setFileError(null);
    setUploadError(null);
    setAttachedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      return;
    }
    setFileError(null);
    setUploadError(null);
    setAttachedFile(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const tabs = [
    { id: "personal_docs", label: "Personal Docs", icon: FileText },
    { id: "education", label: "Education", icon: GraduationCap },
    { id: "career_business", label: "Career & Business", icon: Briefcase },
    { id: "financial", label: "Financial", icon: Wallet },
    { id: "healthcare", label: "Healthcare", icon: Heart },
  ];

  // Only "Personal Docs" is backed by real data today (Ondi's KYC records).
  // The other categories have no backing system yet, so they stay empty rather than showing invented documents.
  const [docList, setDocList] = useState<
    Record<
      string,
      Array<{
        name: string;
        type: string;
        status: string;
        date: string;
        details: string;
        issuer: string;
        fileUrl?: string;
      }>
    >
  >({
    education: [],
    career_business: [],
    personal_docs: [],
    financial: [],
    healthcare: [],
  });
  const [docsLoading, setDocsLoading] = useState(true);
  const [verificationLevel, setVerificationLevel] =
    useState<string>("L0_UNVERIFIED");
  const [missingDocsCount, setMissingDocsCount] = useState(0);

  const loadPersonalDocs = () => {
    setDocsLoading(true);
    apiFetch("/auth/me")
      .then((me) => {
        const allDocs = buildDocuments(me);
        const docs = allDocs
          .filter((d) => d.status !== "missing")
          .map((d) => ({
            name: d.name,
            type: "Government ID",
            status: d.status === "verified" ? "Verified" : "Pending",
            date: d.date
              ? new Date(d.date).toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Just now",
            details: d.source ?? "Submitted for verification",
            issuer: d.source ?? "Government Registry",
          }));
        setDocList((prev) => ({ ...prev, personal_docs: docs }));
        setMissingDocsCount(
          allDocs.filter((d) => d.status === "missing").length,
        );
        setVerificationLevel(me?.verificationLevel ?? "L0_UNVERIFIED");
      })
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  };

  useEffect(() => {
    loadPersonalDocs();
  }, []);

  const isSupportedCategory = activeTab === "personal_docs";
  const currentDocs = docList[activeTab as keyof typeof docList] || [];

  const filteredDocs = currentDocs.filter(
    (doc) =>
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.type.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadState === "uploading") return;

    if (formData.category !== "personal_docs") {
      setSubmitError(
        "Only Personal Docs can be submitted for verification right now — other categories are coming soon.",
      );
      return;
    }
    if (!formData.name || !formData.documentNumber) return;

    setSubmitError(null);
    setUploadError(null);
    setUploadState("uploading");
    setUploadProgress(20);

    try {
      const nameParts = formData.name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? formData.name;
      const lastName = nameParts.slice(1).join(" ") || firstName;

      // Upload whatever file was attached — the backend stores it either
      // way. Only image files feed the OCR/MRZ auto-verification pipeline;
      // PDFs/DOCs still get stored and reach a human in manual REVIEW,
      // rather than being silently discarded before upload. No file
      // attached is also a valid submission — same manual-REVIEW fallback
      // as the mobile app's manual-KYC mode.
      setUploadProgress(40);
      const { status } = await runKycSubmission({
        firstName,
        lastName,
        nin: formData.documentNumber,
        documentType: formData.documentType,
        file: attachedFile,
      });

      if (status === "REJECTED") {
        setUploadState("idle");
        setUploadProgress(0);
        setUploadError(
          "Your document could not be verified. Check your details and try again.",
        );
        return;
      }

      setUploadProgress(100);
      setUploadState("success");
      loadPersonalDocs();
      setTimeout(() => closeModal(), 1100);
    } catch (err: any) {
      setUploadState("idle");
      setUploadProgress(0);
      setUploadError(err.message || "Failed to submit document. Try again.");
    }
  };

  const closeModal = () => {
    setFormData({
      name: "",
      category: "personal_docs",
      issuer: "",
      details: "",
      documentType: "NIN",
      documentNumber: "",
    });
    setSubmitError(null);
    setAttachedFile(null);
    setAiPrediction(null);
    setUserOverride(false);
    setUploadState("idle");
    setUploadProgress(0);
    setUploadError(null);
    setFileError(null);
    setOcrState("idle");
    setOcrProgress(0);
    setOcrAutofilled(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
    setIsModalOpen(false);
  };

  return (
    <>
      <div className="space-y-10">
        {/* ── ACTION ROW ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-5 py-2.5 bg-[#001633] hover:bg-[#4253D1] text-white rounded-md text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add credential
          </button>
        </div>

        {/* ── SUMMARY STATS ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Primary Gradient Wallet Card */}
          <div className="p-6 bg-[#001633] rounded-lg text-white relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-blue-300">
                  Verification Level
                </p>
                <h3 className="text-2xl font-bold mt-2 tracking-tight">
                  {verificationLevel.replace(/_/g, " ")}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-[8px] bg-white/10 flex items-center justify-center text-blue-200">
                <ShieldCheck size={20} />
              </div>
            </div>
          </div>

          {/* Secondary White Cards */}
          <div className="p-6 bg-white border border-slate-100 rounded-lg flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400">
                  Verified Files
                </p>
                <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                  {
                    Object.values(docList)
                      .flat()
                      .filter((d) => d.status === "Verified").length
                  }{" "}
                  Documents
                </h3>
              </div>
              <div className="w-10 h-10 rounded-[8px] bg-blue-50 text-[#4253D1] flex items-center justify-center">
                <CheckCircle2 size={20} />
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-100 rounded-lg flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400">
                  Pending Verification
                </p>
                <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                  {
                    Object.values(docList)
                      .flat()
                      .filter((d) => d.status === "Pending").length
                  }{" "}
                  Requests
                </h3>
              </div>
              <div className="w-10 h-10 rounded-[8px] bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock size={20} />
              </div>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-100 rounded-lg flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-slate-400">
                  Not Yet Provided
                </p>
                <h3 className="text-3xl font-bold text-[#001633] mt-2 tracking-tight">
                  {missingDocsCount} Missing
                </h3>
              </div>
              <div className="w-10 h-10 rounded-[8px] bg-violet-50 text-violet-600 flex items-center justify-center">
                <HardDrive size={20} />
              </div>
            </div>
          </div>
        </div>

        {/* ── CUSTOM TABS BAR (OripioFin style navigation pills) ───────────────── */}
        <div className="flex flex-wrap gap-2 bg-slate-100/50 p-1.5 rounded-lg border border-slate-200/40 w-fit">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2.5 px-5 py-2.5 rounded-[8px] text-xs font-bold transition-all duration-200
                  ${
                    isActive
                      ? "bg-white text-[#001633] shadow-sm border border-slate-200/50"
                      : "text-slate-500 hover:text-[#001633] hover:bg-white/40"
                  }
                `}
              >
                <Icon
                  size={14}
                  className={isActive ? "text-[#4253D1]" : "text-slate-500"}
                />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── FILTERS & ACTIONS — search now lives only in the topbar (⌘K) ─── */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 border border-slate-100 rounded-lg shadow-sm">
          {searchQuery ? (
            <span className="text-[10px] font-bold text-slate-400">
              Filtered by topbar search: &ldquo;{searchQuery}&rdquo;
            </span>
          ) : (
            <span className="text-[10px] text-slate-300">
              Use the search box in the topbar to filter this folder
            </span>
          )}
          <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end">
            <button className="px-4 py-2.5 bg-white border border-slate-200 rounded-[8px] text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
              <Filter size={14} />
              Filter
            </button>
            <button className="px-4 py-2.5 bg-white border border-slate-200 rounded-[8px] text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-2">
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        {/* ── DOCUMENTS GRID ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {docsLoading && activeTab === "personal_docs" ? (
            <div className="col-span-full py-16 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#4253D1] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredDocs.length > 0 ? (
            filteredDocs.map((doc, i) => {
              const isVerified = doc.status === "Verified";

              return (
                <GlassPanel
                  key={i}
                  className="p-6 bg-white border-slate-100 rounded-lg hover:shadow-md hover:border-slate-200/60 transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center ${isVerified ? "bg-[#4253D1]/10 text-[#4253D1]" : "bg-amber-50 text-amber-600"}`}
                        >
                          <FileText size={22} strokeWidth={2} />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-[#001633] tracking-tight leading-tight">
                            {doc.name}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-bold mt-1">
                            {doc.type}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                          isVerified
                            ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                            : "bg-amber-50 text-amber-600 border border-amber-100"
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${isVerified ? "bg-[#0F9755]" : "bg-amber-600"} mr-1`}
                        />
                        {doc.status}
                      </div>
                    </div>

                    <div className="py-4 border-y border-slate-50 space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">
                          Issuer:
                        </span>
                        <span className="font-bold text-[#001633] text-[10px]">
                          {doc.issuer}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">
                          Details:
                        </span>
                        <span className="text-slate-600 font-medium">
                          {doc.details}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-2">
                    <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                      <Clock size={12} /> {doc.date}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setViewingDoc(doc as typeof viewingDoc)}
                        className="p-2 rounded-[8px] bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-500 hover:text-[#4253D1] transition-all"
                        title="View Details"
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  </div>
                </GlassPanel>
              );
            })
          ) : (
            <div className="col-span-full py-16 text-center bg-white border border-slate-100 rounded-lg space-y-4">
              <p className="text-slate-400 text-sm font-medium">
                {!isSupportedCategory
                  ? "Not available yet — only Personal Docs are verified today."
                  : searchQuery
                    ? `No documents found matching "${searchQuery}"`
                    : 'No documents submitted yet — click "Add Credential" to get started.'}
              </p>
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="text-xs font-bold text-[#4253D1] hover:underline"
                >
                  Clear Search Query
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── SECURITY NOTE (ZERO-KNOWLEDGE STORAGE) ─────────────────────── */}
        <div className="bg-white border border-slate-100 rounded-lg p-6 flex gap-5 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-[#4253D1] flex items-center justify-center shrink-0 border border-blue-100">
            <Lock size={22} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-[#001633] tracking-tight">
              Zero-Knowledge Secure Cryptographic Vault
            </h4>
            <p className="text-xs text-slate-500 font-normal leading-relaxed max-w-4xl">
              All documents, qualifications, credentials, and portfolios in your
              Identity Wallet are encrypted locally on your client machine
              before getting uploaded to our secure decentralized network.
              Neither Ondi nor Hudumika can view your documents without your
              explicit permission. You are the sole controller of your digital
              keys.
            </p>
          </div>
        </div>
      </div>

      {mounted && (
        <>
          {createPortal(
            viewingDoc ? (
              <>
                <div
                  onClick={() => setViewingDoc(null)}
                  className="fixed inset-0 bg-[#001633]/40 backdrop-blur-sm z-[9999]"
                />
                <div className="fixed inset-4 md:inset-8 lg:inset-12 bg-white rounded-lg shadow-xl z-[10000] border border-slate-200 flex flex-col overflow-hidden">
                  {/* Viewer Header */}
                  <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 shrink-0">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center ${viewingDoc.status === "Verified" ? "bg-[#4253D1]/10 text-[#4253D1]" : "bg-amber-50 text-amber-600"}`}
                      >
                        <FileText size={20} />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-[#001633] tracking-tight">
                          {viewingDoc.name}
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400">
                            {viewingDoc.type}
                          </span>
                          <span className="text-slate-200">·</span>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${viewingDoc.status === "Verified" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}
                          >
                            {viewingDoc.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewingDoc(null)}
                        className="p-2 rounded-lg text-slate-400 hover:text-[#001633] hover:bg-slate-100 transition-all ml-2"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Viewer Body */}
                  <div className="flex flex-1 min-h-0">
                    {/* Preview area */}
                    <div className="flex-1 bg-slate-50 flex items-center justify-center p-8 min-h-0 overflow-auto">
                      {viewingDoc.fileUrl ? (
                        viewingDoc.fileUrl.startsWith("blob:") &&
                        (viewingDoc.name.match(/\.(png|jpg|jpeg|webp)$/i) ? (
                          <img
                            src={viewingDoc.fileUrl}
                            alt={viewingDoc.name}
                            className="max-h-full max-w-full rounded-xl shadow-lg object-contain"
                          />
                        ) : (
                          <iframe
                            src={viewingDoc.fileUrl}
                            className="w-full h-full rounded-xl border border-slate-200 bg-white"
                            title={viewingDoc.name}
                          />
                        ))
                      ) : (
                        <div className="flex flex-col items-center gap-5 text-center max-w-xs">
                          <div className="w-24 h-28 rounded-lg bg-white border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 shadow-sm">
                            <FileImage size={28} className="text-slate-300" />
                            <div className="w-10 h-1.5 bg-slate-100 rounded" />
                            <div className="w-7 h-1.5 bg-slate-100 rounded" />
                            <div className="w-9 h-1.5 bg-slate-100 rounded" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-500">
                              No file attached
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Upload a scan or PDF to preview this document
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setViewingDoc(null);
                              setIsModalOpen(true);
                            }}
                            className="px-5 py-2 bg-[#001633] hover:bg-[#4253D1] text-white rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5"
                          >
                            <Plus size={11} strokeWidth={2.5} /> Upload file
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Metadata sidebar */}
                    <div className="w-72 shrink-0 border-l border-slate-100 p-6 space-y-6 overflow-y-auto">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 mb-3">
                          Document Details
                        </p>
                        <div className="space-y-3">
                          {[
                            { label: "Issuer", value: viewingDoc.issuer },
                            { label: "Type", value: viewingDoc.type },
                            { label: "Date", value: viewingDoc.date },
                            { label: "Details", value: viewingDoc.details },
                            { label: "Status", value: viewingDoc.status },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold text-slate-400">
                                {label}
                              </span>
                              <span className="text-xs font-medium text-[#001633]">
                                {value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 mb-3">
                          Security
                        </p>
                        <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl">
                          <ShieldCheck
                            size={14}
                            className="text-emerald-600 shrink-0"
                          />
                          <p className="text-[9px] text-emerald-700 font-bold leading-snug">
                            Zero-knowledge encrypted · Only you can view this
                            document
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null,
            document.body,
          )}
        </>
      )}

      {/* ── ADD CREDENTIAL SLIDE-OVER MODAL — Portal renders above ALL layers ── */}
      {mounted && (
        <>
          {createPortal(
            isModalOpen ? (
              <>
                {/* Backdrop */}
                <div
                  onClick={() => closeModal()}
                  className="fixed inset-0 bg-[#001633]/40 backdrop-blur-sm z-[9999]"
                />

                {/* Slide-over drawer */}
                <div className="fixed right-4 top-4 bottom-4 w-full max-w-[560px] bg-white rounded-lg shadow-xl z-[10000] border border-slate-200 flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="relative px-7 pt-7 pb-6 shrink-0 bg-[#001633]">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                          <ShieldCheck size={20} className="text-white" />
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-white leading-tight">
                            Add credential
                          </h2>
                          <p className="text-xs text-white/50 mt-0.5">
                            Secure a new asset to your encrypted vault
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => closeModal()}
                        className="p-2 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors mt-0.5"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Form Content */}
                  <form
                    onSubmit={handleSubmit}
                    className="flex-1 flex flex-col overflow-hidden min-h-0"
                  >
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400">
                            Credential Name
                          </label>
                          {ocrAutofilled.has("name") && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-50 border border-violet-100">
                              <CheckCircle2
                                size={8}
                                className="text-violet-500"
                              />
                              <span className="text-[8px] font-bold text-violet-600">
                                OCR
                              </span>
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          required
                          placeholder="e.g. TRA Tax Clearance Certificate"
                          value={formData.name}
                          onChange={(e) => {
                            setFormData({ ...formData, name: e.target.value });
                            setUserOverride(false);
                            setOcrAutofilled((prev) => {
                              const s = new Set(prev);
                              s.delete("name");
                              return s;
                            });
                          }}
                          className={`w-full px-4 py-2.5 bg-slate-50 border rounded-[8px] text-xs text-[#001633] placeholder-slate-400 focus:outline-none focus:bg-white transition-all font-medium ${ocrAutofilled.has("name") ? "border-violet-200 focus:border-violet-400" : "border-slate-200 focus:border-[#4253D1]"}`}
                        />
                        {/* AI thinking indicator */}
                        {formData.name.length >= 3 && !userOverride && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex gap-0.5">
                              <span
                                className="w-1 h-1 rounded-full bg-[#4253D1] animate-bounce"
                                style={{ animationDelay: "0ms" }}
                              />
                              <span
                                className="w-1 h-1 rounded-full bg-[#4253D1] animate-bounce"
                                style={{ animationDelay: "150ms" }}
                              />
                              <span
                                className="w-1 h-1 rounded-full bg-[#4253D1] animate-bounce"
                                style={{ animationDelay: "300ms" }}
                              />
                            </div>
                            <span className="text-[9px] text-slate-400">
                              {aiPrediction
                                ? "AI category applied"
                                : "AI analysing…"}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400">
                            Category
                          </label>
                          <div className="flex items-center gap-2">
                            {aiPrediction && !userOverride && (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4253D1]/10 border border-[#4253D1]/20">
                                <svg
                                  width="8"
                                  height="8"
                                  viewBox="0 0 24 24"
                                  fill="currentColor"
                                  className="text-[#4253D1]"
                                >
                                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                                </svg>
                                <span className="text-[9px] text-[#4253D1] font-bold">
                                  AI Suggested
                                </span>
                              </span>
                            )}
                            {userOverride && (
                              <span className="text-[9px] text-slate-400">
                                Manual
                              </span>
                            )}
                            <span className="text-[10px] text-[#4253D1] font-bold">
                              {
                                [
                                  {
                                    value: "personal_docs",
                                    label: "Personal Docs",
                                  },
                                  { value: "education", label: "Education" },
                                  {
                                    value: "career_business",
                                    label: "Career & Business",
                                  },
                                  { value: "financial", label: "Financial" },
                                  { value: "healthcare", label: "Healthcare" },
                                ].find((c) => c.value === formData.category)
                                  ?.label
                              }
                            </span>
                          </div>
                        </div>

                        {/* 2-column card grid selector */}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            {
                              value: "personal_docs",
                              label: "Personal Docs",
                              desc: "NIDA, passport, birth cert",
                              icon: FileText,
                              color: "text-violet-600",
                              bg: "bg-violet-50",
                              ring: "ring-violet-400/40",
                              activeBg: "bg-violet-50",
                            },
                            {
                              value: "education",
                              label: "Education",
                              desc: "Degrees, diplomas & certs",
                              icon: GraduationCap,
                              color: "text-blue-600",
                              bg: "bg-blue-50",
                              ring: "ring-blue-400/40",
                              activeBg: "bg-blue-50",
                            },
                            {
                              value: "career_business",
                              label: "Career & Business",
                              desc: "Work history, contracts",
                              icon: Briefcase,
                              color: "text-amber-600",
                              bg: "bg-amber-50",
                              ring: "ring-amber-400/40",
                              activeBg: "bg-amber-50",
                            },
                            {
                              value: "financial",
                              label: "Financial",
                              desc: "Bank accounts, ledgers",
                              icon: Wallet,
                              color: "text-emerald-600",
                              bg: "bg-emerald-50",
                              ring: "ring-emerald-400/40",
                              activeBg: "bg-emerald-50",
                            },
                            {
                              value: "healthcare",
                              label: "Healthcare",
                              desc: "NHIF, medical records",
                              icon: Heart,
                              color: "text-rose-500",
                              bg: "bg-rose-50",
                              ring: "ring-rose-400/40",
                              activeBg: "bg-rose-50",
                            },
                          ].map(
                            ({
                              value,
                              label,
                              desc,
                              icon: Icon,
                              color,
                              bg,
                              ring,
                              activeBg,
                            }) => {
                              const isActive = formData.category === value;
                              const isAiPick =
                                isActive &&
                                aiPrediction === value &&
                                !userOverride;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => {
                                    setFormData({
                                      ...formData,
                                      category: value,
                                    });
                                    setUserOverride(true);
                                    setAiPrediction(null);
                                  }}
                                  className={`relative flex flex-col items-start gap-2 p-3.5 rounded-xl border text-left transition-all duration-200 group ${
                                    isActive
                                      ? isAiPick
                                        ? "border-[#4253D1]/40 bg-[#4253D1]/[0.05] ring-2 ring-[#4253D1]/20 shadow-sm"
                                        : "border-[#4253D1]/30 bg-[#4253D1]/[0.04] ring-2 ring-[#4253D1]/15 shadow-sm"
                                      : "border-slate-200/70 bg-slate-50/50 hover:border-slate-300 hover:bg-white hover:shadow-sm"
                                  }`}
                                >
                                  {/* Active checkmark — or AI star badge */}
                                  {isActive && (
                                    <span className="absolute top-2.5 right-2.5 flex items-center gap-1">
                                      {isAiPick && (
                                        <span className="w-4 h-4 rounded-full bg-[#4253D1]/15 border border-[#4253D1]/30 flex items-center justify-center">
                                          <svg
                                            width="7"
                                            height="7"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            className="text-[#4253D1]"
                                          >
                                            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                                          </svg>
                                        </span>
                                      )}
                                      <span className="w-4 h-4 rounded-full bg-[#4253D1] flex items-center justify-center">
                                        <svg
                                          width="8"
                                          height="8"
                                          viewBox="0 0 8 8"
                                          fill="none"
                                        >
                                          <path
                                            d="M1 4L3 6L7 2"
                                            stroke="white"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          />
                                        </svg>
                                      </span>
                                    </span>
                                  )}

                                  {/* Icon tile */}
                                  <div
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200 ${
                                      isActive
                                        ? `${bg} ${color}`
                                        : `bg-slate-100 text-slate-400 group-hover:${bg} group-hover:${color}`
                                    }`}
                                  >
                                    <Icon
                                      size={15}
                                      strokeWidth={isActive ? 2.5 : 2}
                                    />
                                  </div>

                                  {/* Text */}
                                  <div>
                                    <p
                                      className={`text-[11px] font-bold leading-none ${isActive ? "text-[#001633]" : "text-slate-600"}`}
                                    >
                                      {label}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-medium mt-1 leading-snug">
                                      {desc}
                                    </p>
                                  </div>
                                </button>
                              );
                            },
                          )}
                        </div>
                      </div>

                      {formData.category === "personal_docs" ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400">
                              Document Type
                            </label>
                            <select
                              value={formData.documentType}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  documentType: e.target
                                    .value as typeof formData.documentType,
                                })
                              }
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-[8px] text-xs text-[#001633] focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium"
                            >
                              <option value="NIN">NIDA / National ID</option>
                              <option value="PASSPORT">Passport</option>
                              <option value="DRIVER_LICENSE">
                                Driving Licence
                              </option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400">
                              Document Number
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. 19901231-XXXX-X"
                              value={formData.documentNumber}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  documentNumber: e.target.value,
                                })
                              }
                              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-[8px] text-xs text-[#001633] placeholder-slate-400 focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                          <AlertCircle
                            size={12}
                            className="text-amber-500 shrink-0"
                          />
                          <p className="text-[10px] font-bold text-amber-700">
                            This category isn't available for submission yet —
                            only Personal Docs are verified today.
                          </p>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400">
                            Issuer
                          </label>
                          {ocrAutofilled.has("issuer") && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-50 border border-violet-100">
                              <CheckCircle2
                                size={8}
                                className="text-violet-500"
                              />
                              <span className="text-[8px] font-bold text-violet-600">
                                OCR
                              </span>
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. TRA Authority"
                          value={formData.issuer}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              issuer: e.target.value,
                            });
                            setOcrAutofilled((prev) => {
                              const s = new Set(prev);
                              s.delete("issuer");
                              return s;
                            });
                          }}
                          className={`w-full px-4 py-2.5 bg-slate-50 border rounded-[8px] text-xs text-[#001633] placeholder-slate-400 focus:outline-none focus:bg-white transition-all font-medium ${ocrAutofilled.has("issuer") ? "border-violet-200 focus:border-violet-400" : "border-slate-200 focus:border-[#4253D1]"}`}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400">
                            Description / Details
                          </label>
                          {ocrAutofilled.has("details") && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-50 border border-violet-100">
                              <CheckCircle2
                                size={8}
                                className="text-violet-500"
                              />
                              <span className="text-[8px] font-bold text-violet-600">
                                OCR
                              </span>
                            </span>
                          )}
                        </div>
                        <textarea
                          rows={3}
                          placeholder="Provide details about this credential..."
                          value={formData.details}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              details: e.target.value,
                            });
                            setOcrAutofilled((prev) => {
                              const s = new Set(prev);
                              s.delete("details");
                              return s;
                            });
                          }}
                          className={`w-full px-4 py-2.5 bg-slate-50 border rounded-[8px] text-xs text-[#001633] placeholder-slate-400 focus:outline-none focus:bg-white transition-all resize-none font-medium ${ocrAutofilled.has("details") ? "border-violet-200 focus:border-violet-400" : "border-slate-200 focus:border-[#4253D1]"}`}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400">
                            File Attachment (optional — helps autofill via OCR)
                          </label>
                          <span className="text-[9px] text-slate-400">
                            Max {MAX_FILE_MB} MB
                          </span>
                        </div>

                        {/* Validation error */}
                        {fileError && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                            <AlertCircle
                              size={12}
                              className="text-red-500 shrink-0"
                            />
                            <p className="text-[10px] font-bold text-red-600">
                              {fileError}
                            </p>
                          </div>
                        )}

                        {/* Hidden native file input */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,application/pdf,.doc,.docx"
                          onChange={handleFileChange}
                          className="hidden"
                          disabled={
                            uploadState === "uploading" ||
                            uploadState === "success"
                          }
                        />

                        {attachedFile ? (
                          /* Attached file card */
                          <div
                            className={`border rounded-xl p-4 flex items-center gap-3 transition-colors ${
                              uploadState === "uploading"
                                ? "border-[#4253D1]/30 bg-[#4253D1]/[0.03]"
                                : uploadState === "success"
                                  ? "border-emerald-200 bg-emerald-50/60"
                                  : "border-emerald-200/80 bg-gradient-to-r from-emerald-50/60 to-emerald-50/20"
                            }`}
                          >
                            {/* File type icon */}
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center shrink-0 text-sm">
                              {attachedFile.type.startsWith("image/")
                                ? "🖼️"
                                : attachedFile.type === "application/pdf"
                                  ? "📄"
                                  : "📎"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-[#001633] truncate">
                                {attachedFile.name}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {formatFileSize(attachedFile.size)} ·{" "}
                                {attachedFile.type
                                  .split("/")[1]
                                  ?.toUpperCase() ?? "FILE"}
                              </p>
                              {/* OCR status */}
                              {ocrState === "reading" && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Loader2
                                    size={10}
                                    className="animate-spin text-violet-500 shrink-0"
                                  />
                                  <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-violet-400 rounded-full transition-all duration-200"
                                      style={{ width: `${ocrProgress}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-violet-500 font-bold shrink-0">
                                    {ocrProgress}%
                                  </span>
                                </div>
                              )}
                              {ocrState === "reading" && (
                                <p className="text-[9px] text-violet-500 font-bold mt-0.5">
                                  Reading document…
                                </p>
                              )}
                              {ocrState === "done" &&
                                ocrAutofilled.size > 0 && (
                                  <p className="text-[9px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                                    <CheckCircle2 size={9} />{" "}
                                    {ocrAutofilled.size} field
                                    {ocrAutofilled.size > 1 ? "s" : ""}{" "}
                                    autofilled from document
                                  </p>
                                )}
                              {ocrState === "done" &&
                                ocrAutofilled.size === 0 && (
                                  <p className="text-[9px] text-slate-400 mt-0.5">
                                    No text detected — fill in details manually
                                  </p>
                                )}
                              {ocrState === "error" && (
                                <p className="text-[9px] text-amber-500 mt-0.5">
                                  OCR unavailable — fill in details manually
                                </p>
                              )}
                              {/* Upload progress bar */}
                              {uploadState === "uploading" && (
                                <div className="mt-2 space-y-1">
                                  <div className="h-1 bg-slate-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#4253D1] rounded-full" />
                                  </div>
                                  <p className="text-[9px] text-[#4253D1] font-bold">
                                    {uploadProgress}% uploaded
                                  </p>
                                </div>
                              )}
                            </div>
                            {uploadState === "idle" && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="p-1.5 text-slate-400 hover:text-[#4253D1] rounded-lg hover:bg-slate-100 transition-all"
                                  title="Replace file"
                                >
                                  <Upload size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAttachedFile(null);
                                    setFileError(null);
                                    if (fileInputRef.current)
                                      fileInputRef.current.value = "";
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"
                                  title="Remove file"
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            )}
                            {uploadState === "uploading" && (
                              <Loader2
                                size={16}
                                className="text-[#4253D1] animate-spin shrink-0"
                              />
                            )}
                            {uploadState === "success" && (
                              <CheckCircle2
                                size={16}
                                className="text-emerald-500 shrink-0"
                              />
                            )}
                          </div>
                        ) : (
                          /* Drop zone */
                          <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsDragging(true);
                            }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-2 ${
                              isDragging
                                ? "border-[#4253D1] bg-[#4253D1]/[0.04] scale-[1.01]"
                                : fileError
                                  ? "border-red-200 bg-red-50/30"
                                  : "border-slate-200 bg-slate-50/50 hover:border-[#4253D1]/40 hover:bg-[#4253D1]/[0.02]"
                            }`}
                          >
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                                isDragging
                                  ? "bg-[#4253D1]/10 text-[#4253D1]"
                                  : fileError
                                    ? "bg-red-50 text-red-400"
                                    : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              <Upload size={16} />
                            </div>
                            <div>
                              <p
                                className={`text-xs font-bold ${
                                  isDragging
                                    ? "text-[#4253D1]"
                                    : fileError
                                      ? "text-red-500"
                                      : "text-slate-500"
                                }`}
                              >
                                {isDragging
                                  ? "Drop file here"
                                  : "Click to upload or & drop"}
                              </p>
                              <p className="text-[9px] text-slate-400 mt-0.5">
                                PNG · JPG — OCR autofill · PDF · DOC — max{" "}
                                {MAX_FILE_MB} MB
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions Footer */}
                    <div className="px-6 py-5 border-t border-slate-100/80 bg-gradient-to-t from-white to-transparent shrink-0 space-y-3">
                      {/* Submit error (unsupported category, missing fields) */}
                      {submitError && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                          <AlertCircle
                            size={12}
                            className="text-red-500 shrink-0"
                          />
                          <p className="text-[10px] font-bold text-red-600 flex-1">
                            {submitError}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSubmitError(null)}
                            className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      )}

                      {/* Upload error */}
                      {uploadError && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                          <AlertCircle
                            size={12}
                            className="text-red-500 shrink-0"
                          />
                          <p className="text-[10px] font-bold text-red-600 flex-1">
                            {uploadError}
                          </p>
                          <button
                            type="button"
                            onClick={() => setUploadError(null)}
                            className="text-red-400 hover:text-red-600 transition-colors shrink-0"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      )}

                      {/* Progress bar — shown during upload when no file card is visible */}
                      {uploadState === "uploading" && !attachedFile && (
                        <div className="space-y-1">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#4253D1] rounded-full" />
                          </div>
                          <p className="text-[9px] text-slate-400 text-right">
                            {uploadProgress}%
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => closeModal()}
                          disabled={uploadState === "uploading"}
                          className="flex-1 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 border border-slate-200 rounded-md text-sm font-medium transition-colors"
                        >
                          Cancel
                        </button>

                        {uploadState === "success" ? (
                          <div className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-md text-sm font-semibold">
                            <CheckCircle2 size={14} />
                            Submitted for verification
                          </div>
                        ) : uploadState === "uploading" ? (
                          <div className="flex items-center gap-2 px-6 py-2.5 bg-[#4253D1] text-white rounded-md text-sm font-semibold">
                            <Loader2 size={13} className="animate-spin" />
                            Submitting {uploadProgress}%
                          </div>
                        ) : (
                          <button
                            type="submit"
                            disabled={
                              !isSupportedCategory ||
                              !formData.name ||
                              !formData.documentNumber
                            }
                            className="flex-none px-8 py-2.5 bg-[#001633] hover:bg-[#4253D1] disabled:opacity-40 text-white rounded-md text-sm font-semibold transition-colors whitespace-nowrap"
                          >
                            Submit for verification
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                </div>
              </>
            ) : null,
            document.body,
          )}
        </>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Upload,
  Check,
  ChevronLeft,
  Loader2,
  AlertCircle,
  Globe,
  Search,
  Building2,
  MapPin,
  CalendarDays,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { notifyOrgsChanged } from "@/lib/orgEvents";
import { searchBrela, type BrelaObjectType, type BrelaRecord } from "@/lib/brela";

const ACTIVE_ORG_KEY = "ondi_active_org_id";

const STEPS = [
  { id: "company", label: "Company" },
  { id: "registry", label: "Registry numbers" },
  { id: "document", label: "Certificate" },
  { id: "review", label: "Review" },
] as const;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function CreateOrganizationPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [entityType, setEntityType] = useState<BrelaObjectType>("ET-COMPANY");
  const [companyName, setCompanyName] = useState("");
  const [incorpNumber, setIncorpNumber] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // ── Live BRELA lookup — confirms the real registered legal name for the
  // incorporation/registration number entered, instead of trusting whatever
  // the user typed as the company name. ─────────────────────────────────
  const [brelaResults, setBrelaResults] = useState<BrelaRecord[]>([]);
  const [brelaLoading, setBrelaLoading] = useState(false);
  const [brelaError, setBrelaError] = useState("");
  const [brelaSearched, setBrelaSearched] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<BrelaRecord | null>(
    null,
  );
  const brelaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelectedRecord(null);
    setBrelaResults([]);
    setBrelaError("");
    setBrelaSearched(false);
    if (brelaTimer.current) clearTimeout(brelaTimer.current);

    const number = incorpNumber.trim();
    if (number.length < 5) return;

    brelaTimer.current = setTimeout(async () => {
      setBrelaLoading(true);
      try {
        const results = await searchBrela({ objectType: entityType, number });
        setBrelaResults(results);
      } catch {
        setBrelaError("Couldn't reach BRELA right now. Try again shortly.");
      } finally {
        setBrelaLoading(false);
        setBrelaSearched(true);
      }
    }, 500);

    return () => {
      if (brelaTimer.current) clearTimeout(brelaTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incorpNumber, entityType]);

  const selectRecord = (record: BrelaRecord) => {
    setSelectedRecord(record);
    setCompanyName(record.legal_name);
  };

  const stepValid = () => {
    if (step === 0) return companyName.trim().length >= 2;
    if (step === 1)
      return incorpNumber.trim().length >= 5 && tinNumber.trim().length === 9;
    return true;
  };

  const handleNext = () => {
    if (!stepValid()) return;
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setError("");
    if (step === 0) {
      router.push("/dashboard/personal");
      return;
    }
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const org = await apiFetch("/organizations", {
        method: "POST",
        body: JSON.stringify({
          businessName: companyName,
          registrationNumber: incorpNumber,
          country: "TZ",
        }),
      });
      await apiFetch(`/organizations/${org.id}/kyb`, {
        method: "POST",
        body: JSON.stringify({
          verificationSource: "BRELA",
          certificateOfIncorporation: certFile?.name,
          taxCertificate: tinNumber,
        }),
      });
      localStorage.setItem(ACTIVE_ORG_KEY, org.id);
      notifyOrgsChanged();
      setDone(true);
      setTimeout(() => router.push("/dashboard/enterprise"), 1100);
    } catch (err: any) {
      setError(
        err?.message === "registration_number_already_used"
          ? "That BRELA incorporation number is already registered with Ondi."
          : "Could not submit for verification. Try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8 lg:p-12 max-w-5xl mx-auto space-y-8">
      <button
        onClick={() => router.push("/dashboard/personal")}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-[#001633] transition-colors"
      >
        <ChevronLeft size={14} /> Back to Overview
      </button>

      <div className="space-y-3">
        <h1 className="text-3xl lg:text-5xl font-bold text-[#001633] tracking-tight">
          Create <span className="text-[#4253D1]">enterprise workspace</span>
        </h1>
        <p className="text-slate-500 text-sm font-normal leading-relaxed max-w-2xl">
          Verify your business to unlock enterprise features — manage your
          team's identity, access, and compliance in one place.
        </p>
      </div>

      <div className="bg-white border border-slate-100 rounded-lg overflow-hidden">
        {/* Stepper */}
        <div className="flex items-center gap-2 px-6 py-5 border-b border-slate-100">
          {STEPS.map((s, i) => {
            const isDone = i < step || done;
            const isActive = i === step && !done;
            return (
              <div
                key={s.id}
                className="flex items-center flex-1 last:flex-none"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                      isDone
                        ? "bg-[#4253D1] text-white"
                        : isActive
                          ? "bg-[#001633] text-white"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {isDone ? <Check size={12} /> : i + 1}
                  </div>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap hidden sm:inline ${
                      isActive || isDone ? "text-[#001633]" : "text-slate-400"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-[2px] mx-2 rounded-full ${isDone ? "bg-[#4253D1]" : "bg-slate-100"}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="px-6 py-8">
          {done ? (
            <div className="flex flex-col items-center text-center py-10 gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <Check size={26} className="text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-[#001633]">
                Workspace created
              </h3>
              <p className="text-sm text-slate-500">
                Taking you to {companyName}&apos;s dashboard...
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {step === 0 && (
                <div className="max-w-xl space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400">
                    Company name
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Hudumika Technologies Ltd"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-[#001633] placeholder-slate-400 focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium"
                  />
                  <p className="text-[10px] text-slate-400 pt-1">
                    Don't worry about exact spelling — the next step confirms
                    the real registered name against BRELA.
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left — entry form */}
                  <div className="space-y-4">
                    <div className="inline-flex p-1 bg-slate-100 rounded-md">
                      {(
                        [
                          { id: "ET-COMPANY", label: "Company" },
                          { id: "ET-BUSINESS", label: "Business name" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setEntityType(opt.id)}
                          className={`px-3.5 py-1.5 rounded text-xs font-bold transition-colors ${
                            entityType === opt.id
                              ? "bg-white text-[#001633] shadow-sm"
                              : "text-slate-500 hover:text-[#001633]"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400">
                        {entityType === "ET-COMPANY"
                          ? "BRELA incorporation/compliance no."
                          : "Business name registration no."}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          autoFocus
                          value={incorpNumber}
                          onChange={(e) => setIncorpNumber(e.target.value)}
                          placeholder="137644169"
                          className="w-full px-4 py-2.5 pr-9 bg-slate-50 border border-slate-200 rounded-md text-sm text-[#001633] placeholder-slate-400 focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2">
                          {brelaLoading ? (
                            <Loader2
                              size={14}
                              className="animate-spin text-slate-400"
                            />
                          ) : (
                            <Search size={14} className="text-slate-300" />
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400">
                        TRA TIN number
                      </label>
                      <input
                        type="text"
                        value={tinNumber}
                        onChange={(e) => setTinNumber(e.target.value)}
                        placeholder="111222333"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-md text-sm text-[#001633] placeholder-slate-400 focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium"
                      />
                      <p className="text-[10px] text-slate-400">9 digits</p>
                    </div>

                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 flex gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-[#4253D1] shrink-0">
                        <Globe size={16} />
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Cross-referenced live against the BRELA registry as
                        you type — pick your business from the results to
                        confirm its registered name.
                      </p>
                    </div>
                  </div>

                  {/* Right — organisation profile card */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-400">
                      Organisation profile
                    </p>

                    {selectedRecord ? (
                      <div className="border border-[#4253D1]/20 bg-[#4253D1]/[0.03] rounded-lg p-5 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-[#4253D1] shrink-0">
                            <Building2 size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#001633] leading-tight">
                              {selectedRecord.legal_name}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {selectedRecord.subtype_name ??
                                selectedRecord.object_type}
                            </p>
                          </div>
                          <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-bold shrink-0">
                            <Check size={10} /> Verified
                          </span>
                        </div>

                        <div className="space-y-2.5 pt-3 border-t border-slate-100">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">
                              Cert. number
                            </span>
                            <span className="font-semibold text-[#001633]">
                              {selectedRecord.cert_number}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Status</span>
                            <span className="font-semibold text-[#001633]">
                              {selectedRecord.reg_status_name}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs items-start gap-3">
                            <span className="text-slate-400 flex items-center gap-1 shrink-0">
                              <CalendarDays size={11} /> Incorporated
                            </span>
                            <span className="font-semibold text-[#001633] text-right">
                              {formatDate(selectedRecord.incorporation_date)}
                            </span>
                          </div>
                          {selectedRecord.address && (
                            <div className="flex justify-between text-xs items-start gap-3">
                              <span className="text-slate-400 flex items-center gap-1 shrink-0">
                                <MapPin size={11} /> Address
                              </span>
                              <span className="font-medium text-[#001633] text-right">
                                {selectedRecord.address}
                              </span>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => setSelectedRecord(null)}
                          className="text-[10px] font-bold text-[#4253D1] hover:text-[#001633] transition-colors"
                        >
                          Choose a different match
                        </button>
                      </div>
                    ) : brelaLoading ? (
                      <div className="border border-slate-100 rounded-lg p-5 space-y-3">
                        <div className="h-3 w-2/3 bg-slate-100 rounded animate-pulse" />
                        <div className="h-2.5 w-1/3 bg-slate-100 rounded animate-pulse" />
                        <div className="h-2.5 w-full bg-slate-100 rounded animate-pulse mt-4" />
                        <div className="h-2.5 w-full bg-slate-100 rounded animate-pulse" />
                      </div>
                    ) : brelaError ? (
                      <div className="border border-red-100 bg-red-50 rounded-lg p-5 flex gap-2.5">
                        <AlertCircle
                          size={14}
                          className="text-red-500 shrink-0 mt-0.5"
                        />
                        <p className="text-xs text-red-600 font-medium">
                          {brelaError}
                        </p>
                      </div>
                    ) : brelaResults.length > 0 ? (
                      <div className="space-y-2">
                        {brelaResults.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => selectRecord(r)}
                            className="w-full text-left border border-slate-100 hover:border-[#4253D1]/30 hover:bg-[#4253D1]/[0.02] rounded-lg p-4 transition-colors"
                          >
                            <p className="text-xs font-bold text-[#001633]">
                              {r.legal_name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-slate-400">
                                {r.cert_number}
                              </span>
                              <span className="text-slate-200">·</span>
                              <span className="text-[10px] text-slate-400">
                                {r.reg_status_name}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : brelaSearched ? (
                      <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center">
                        <p className="text-xs font-bold text-slate-500">
                          No match found
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Double-check the number, or continue and verify
                          manually later.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center">
                        <Building2
                          size={22}
                          className="mx-auto text-slate-300 mb-2"
                        />
                        <p className="text-xs font-bold text-slate-500">
                          Enter a registration number
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Your organisation's BRELA profile will appear here.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="max-w-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400">
                      Certificate of Incorporation
                    </label>
                    <span className="text-[9px] text-slate-400">
                      Optional
                    </span>
                  </div>
                  <div
                    onClick={() =>
                      document.getElementById("kyb-cert-input")?.click()
                    }
                    className="border-2 border-dashed border-slate-200 hover:border-[#4253D1]/40 rounded-lg p-8 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-colors bg-slate-50/50"
                  >
                    <input
                      id="kyb-cert-input"
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) =>
                        setCertFile(e.target.files?.[0] ?? null)
                      }
                      className="hidden"
                    />
                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400">
                      <Upload size={18} />
                    </div>
                    {certFile ? (
                      <p className="text-xs font-bold text-[#001633]">
                        {certFile.name}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-slate-500">
                          Click to upload
                        </p>
                        <p className="text-[10px] text-slate-400">
                          PDF or image, up to 15MB
                        </p>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 pt-1">
                    You can add this later — verification proceeds either
                    way, staying in manual review until a document is on
                    file.
                  </p>
                </div>
              )}

              {step === 3 && (
                <div className="max-w-xl space-y-3">
                  <p className="text-[10px] font-bold text-slate-400">
                    Review before submitting
                  </p>
                  {[
                    {
                      label: "Company name",
                      value: companyName,
                      verified: !!selectedRecord,
                    },
                    {
                      label: "BRELA incorporation no.",
                      value: incorpNumber,
                    },
                    { label: "TRA TIN number", value: tinNumber },
                    {
                      label: "Certificate",
                      value: certFile?.name ?? "Not attached",
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-100 rounded-lg"
                    >
                      <span className="text-[10px] font-bold text-slate-400">
                        {row.label}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#001633] truncate max-w-[60%] text-right">
                        {row.verified && (
                          <Check size={12} className="text-emerald-500 shrink-0" />
                        )}
                        {row.value}
                      </span>
                    </div>
                  ))}

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                    <ShieldCheck
                      size={16}
                      className="text-[#4253D1] shrink-0 mt-0.5"
                    />
                    <p className="text-[10px] text-[#001633]/70 leading-relaxed">
                      Submitting creates your enterprise workspace
                      immediately — verification against BRELA/TRA continues
                      in the background.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="max-w-xl flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle size={12} className="text-red-500 shrink-0" />
                  <p className="text-[10px] font-bold text-red-600">
                    {error}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="px-6 py-5 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={submitting}
              className="px-5 py-2.5 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 border border-slate-200 rounded-md text-sm font-medium transition-colors"
            >
              Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={!stepValid()}
                className="px-8 py-2.5 bg-[#001633] hover:bg-[#4253D1] disabled:opacity-40 text-white rounded-md text-sm font-semibold transition-colors"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-8 py-2.5 bg-[#001633] hover:bg-[#4253D1] disabled:opacity-60 text-white rounded-md text-sm font-semibold transition-colors flex items-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? "Submitting..." : "Create workspace"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

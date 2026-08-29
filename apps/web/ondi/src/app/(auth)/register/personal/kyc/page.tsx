'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  Camera,
  ShieldCheck,
  Lock,
  RefreshCw,
  XCircle,
  Clock,
} from 'lucide-react';
import { GridBackground, OndiBrand, BrandWatermark } from '@/components/OneUI';
import { runKycSubmission } from '@/lib/kyc';

const kycSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  nin:       z.string().min(14, 'Document number must be exactly 14 characters').max(14, 'Document number must be exactly 14 characters'),
  docType:   z.enum(['nida', 'passport', 'driving_licence']),
});

type KYCData = z.infer<typeof kycSchema>;

// Web form values -> real backend enum (services/ondi-api/src/routes/kyc.ts).
const DOC_TYPE_MAP: Record<KYCData['docType'], 'NIN' | 'PASSPORT' | 'DRIVER_LICENSE'> = {
  nida:            'NIN',
  passport:        'PASSPORT',
  driving_licence: 'DRIVER_LICENSE',
};

type Stage = 'form' | 'submitting' | 'verifying' | 'rejected';

export default function KYCFlow() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<KYCData>({
    resolver: zodResolver(kycSchema),
  });

  const [stage, setStage] = useState<Stage>('form');
  const [submitError, setSubmitError] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // /v1/kyc/submit requires a Bearer token — this screen assumes the user
    // already created an account (register/page.tsx -> OTP login) before
    // landing here, same as the mobile onboarding flow.
    if (typeof window !== 'undefined' && !localStorage.getItem('access_token')) {
      router.replace(`/login?redirect=${encodeURIComponent('/register/personal/kyc')}`);
    }
  }, [router]);

  useEffect(() => {
    if (!documentFile) { setDocumentPreview(null); return; }
    const url = URL.createObjectURL(documentFile);
    setDocumentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [documentFile]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFileError('');
    setDocumentFile(file);
  }

  const onSubmit = async (data: KYCData) => {
    if (!documentFile) {
      setFileError('A photo of your document is required.');
      return;
    }
    setSubmitError('');
    setStage('submitting');
    try {
      setStage('verifying');
      const { status } = await runKycSubmission({
        firstName: data.firstName,
        lastName: data.lastName,
        nin: data.nin,
        documentType: DOC_TYPE_MAP[data.docType],
        file: documentFile,
      });

      if (status === 'REJECTED') {
        setStage('rejected');
        setSubmitError('Your document could not be verified. Check your details and the photo, then try again.');
      } else {
        // VERIFIED, or still under review after polling — either way this is
        // a real, non-fabricated state. Let the user into the dashboard;
        // their identity completion will reflect PENDING until an admin
        // resolves it or the async verification job completes.
        router.push('/dashboard/personal');
      }
    } catch (err: any) {
      setStage('rejected');
      setSubmitError(
        err?.message === 'document_upload_failed'
          ? 'Could not upload your document photo. Please try again.'
          : 'Could not submit for verification. Please try again.'
      );
    }
  };

  const isBusy = stage === 'submitting' || stage === 'verifying';

  return (
    <div className="min-h-screen flex font-dm-sans bg-white text-[#001633]">

      {/* ── LEFT — Brand Panel ─────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[40%] bg-[#001633] flex-col justify-between p-16 relative overflow-hidden">
        <GridBackground />
        <BrandWatermark opacity={0.04} size="750px" className="-right-1/4 -bottom-1/4" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        {/* Logo */}
        <div className="relative z-10">
          <div
            onClick={() => router.push('/')}
            className="flex items-center cursor-pointer w-fit group"
          >
            <OndiBrand size={26} theme="dark" className="group-hover:scale-105 transition-all duration-500" />
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-blue-400">
            <ShieldCheck size={14} />
            <span className="text-sm font-bold uppercase tracking-wider font-space">Step 2: Identity Verification</span>
          </div>
          <h1 className="text-4xl font-bold text-white font-barlow uppercase leading-tight">
            Secure your <br />digital wallet.
          </h1>
          <p className="text-base text-white/50 font-normal leading-relaxed max-w-sm">
            We verify your identity to protect your account and comply with regional regulations. Your data is always encrypted.
          </p>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <p className="text-xs text-white/20 font-bold uppercase tracking-widest font-space">
            © {new Date().getFullYear()} Hudumika Group · Built in Tanzania
          </p>
        </div>
      </div>

      {/* ── RIGHT — Form ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 bg-white relative overflow-hidden">
        <GridBackground />

        <motion.div
          className="w-full max-w-2xl relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <AnimatePresence mode="wait">
            {stage === 'verifying' ? (
              <motion.div
                key="verifying"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-8 py-12"
              >
                <div className="w-20 h-20 rounded-full bg-[#ECEEFF] flex items-center justify-center mx-auto">
                  <Clock size={32} className="text-[#4253D1] animate-pulse" />
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-[#001633] font-barlow uppercase tracking-tight">Verifying your identity</h2>
                  <p className="text-sm text-slate-400 font-normal max-w-sm mx-auto">
                    Your document is being checked against government records. This takes a few seconds — do not close this page.
                  </p>
                </div>
                <RefreshCw size={20} className="text-slate-300 animate-spin mx-auto" />
              </motion.div>
            ) : (
              <motion.div key="form">
                {/* Header */}
                <div className="mb-10 space-y-2">
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-[#001633] transition-colors uppercase tracking-wider font-space mb-4"
                  >
                    <ChevronLeft size={16} /> Back
                  </button>
                  <h2 className="text-3xl font-bold text-[#001633] font-barlow uppercase tracking-tight">Identity Verification</h2>
                  <p className="text-sm text-slate-400 font-normal">Please provide your government-issued document details.</p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">First Name</label>
                      <input
                        type="text"
                        {...register('firstName')}
                        className="w-full bg-slate-50 border border-slate-100 rounded-[10px] py-4 px-5 text-[#001633] text-sm focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium placeholder:text-slate-300"
                        placeholder="Amara"
                      />
                      {errors.firstName && <p className="text-red-500 text-xs mt-2 font-medium">{errors.firstName.message}</p>}
                    </div>
                    <div>
                      <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">Last Name</label>
                      <input
                        type="text"
                        {...register('lastName')}
                        className="w-full bg-slate-50 border border-slate-100 rounded-[10px] py-4 px-5 text-[#001633] text-sm focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium placeholder:text-slate-300"
                        placeholder="Mwangi"
                      />
                      {errors.lastName && <p className="text-red-500 text-xs mt-2 font-medium">{errors.lastName.message}</p>}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">Document Type</label>
                      <div className="relative">
                        <select
                          {...register('docType')}
                          className="w-full bg-slate-50 border border-slate-100 rounded-[10px] py-4 pl-5 pr-12 text-[#001633] text-sm appearance-none focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium"
                        >
                          <option value="nida">Tanzania NIDA ID</option>
                          <option value="passport">Passport</option>
                          <option value="driving_licence">Driving Licence</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                          <ChevronDown size={16} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">Document Number (NIN)</label>
                      <input
                        type="text"
                        maxLength={14}
                        {...register('nin')}
                        className="w-full bg-slate-50 border border-slate-100 rounded-[10px] py-4 px-5 text-[#001633] text-sm focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium placeholder:text-slate-300"
                        placeholder="19900101-12345-0"
                      />
                      {errors.nin && <p className="text-red-500 text-xs mt-2 font-medium">{errors.nin.message}</p>}
                    </div>
                  </div>

                  {/* Real document photo capture — feeds the server's OCR/MRZ pipeline */}
                  <div>
                    <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">Document Photo</label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="relative w-full h-56 border-2 border-dashed border-slate-100 hover:border-[#4253D1]/50 rounded-[10px] overflow-hidden bg-slate-50 transition-all group cursor-pointer"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <AnimatePresence mode="wait">
                        {documentPreview ? (
                          <motion.div
                            key="preview"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 w-full h-full"
                          >
                            <img src={documentPreview} alt="Document Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-[#001633]/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                              <span className="px-4 py-2 bg-white/10 text-white rounded-[10px] text-xs font-bold uppercase tracking-wider font-space">
                                Tap to Retake
                              </span>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="upload"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 flex flex-col items-center justify-center text-center p-6"
                          >
                            <div className="w-12 h-12 rounded-[10px] bg-white border border-slate-100 flex items-center justify-center mb-3 text-slate-400 group-hover:text-[#4253D1] group-hover:border-[#4253D1]/20 transition-all duration-300">
                              <Camera size={20} />
                            </div>
                            <span className="text-sm font-bold text-[#001633] font-space uppercase tracking-wider">Capture or Upload Document</span>
                            <span className="text-xs text-slate-400 mt-1">Place it flat, in good light · PNG, JPG up to 10MB</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    {fileError && <p className="text-red-500 text-xs mt-2 font-medium">{fileError}</p>}
                  </div>

                  {/* Security Note */}
                  <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-6 flex gap-4 mt-8">
                    <div className="w-10 h-10 rounded-[10px] bg-white border border-slate-100 flex items-center justify-center text-[#4253D1] shrink-0">
                      <Lock size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#001633] uppercase font-space mb-1">End-to-End Encrypted</h4>
                      <p className="text-xs text-slate-500 font-normal leading-relaxed">Your identity document is encrypted in transit and verified by our real OCR/MRZ pipeline — no fabricated results.</p>
                    </div>
                  </div>

                  {stage === 'rejected' && submitError && (
                    <div className="bg-red-50 border border-red-100 rounded-[10px] p-4 flex items-start gap-3">
                      <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                      <p className="text-red-600 text-xs font-medium leading-relaxed">{submitError}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="w-full py-5 bg-[#001633] text-white rounded-[10px] font-bold text-sm uppercase tracking-wider font-space hover:bg-[#4253D1] transition-all active:scale-95 shadow-xl shadow-slate-200 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-8"
                  >
                    {isBusy ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Complete Verification'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

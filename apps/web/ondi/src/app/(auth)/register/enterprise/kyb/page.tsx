'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronDown, 
  Shield, 
  Upload,
  Lock,
  Building2,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { ShieldLogo, GridBackground, GlassPanel, OndiBrand, BrandWatermark } from '@/components/OneUI';
import { apiFetch } from '@/lib/api';
import { useEffect, useState } from 'react';

const kybSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  incorpNumber: z.string().min(5, 'BRELA Incorporation Number required'),
  tinNumber: z.string().min(9, 'TRA TIN must be 9 digits').max(9),
  certUrl: z.any(),
});

type KYBData = z.infer<typeof kybSchema>;

export default function KYBFlow() {
  const router = useRouter();
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<KYBData>({
    resolver: zodResolver(kybSchema)
  });
  const [submitError, setSubmitError] = useState('');

  // Pick up the company name entered at signup, if the user arrived here
  // straight from a business registration, so it isn't re-typed.
  useEffect(() => {
    const pending = localStorage.getItem('pending_company_name');
    if (pending) setValue('companyName', pending);
  }, [setValue]);

  // Real submission: creates an actual Organization, then a real KYBRecord
  // against it (services/ondi-api/src/routes/organizations.ts) — this used
  // to only log to the console and redirect. There is no live document
  // upload backend yet (same limitation as personal KYC), so the certificate
  // field is recorded by filename only, not actually stored.
  const onSubmit = async (data: KYBData) => {
    setSubmitError('');
    try {
      const org = await apiFetch('/organizations', {
        method: 'POST',
        body: JSON.stringify({
          businessName: data.companyName,
          registrationNumber: data.incorpNumber,
          country: 'TZ',
        }),
      });
      await apiFetch(`/organizations/${org.id}/kyb`, {
        method: 'POST',
        body: JSON.stringify({
          verificationSource: 'BRELA',
          certificateOfIncorporation: data.certUrl?.[0]?.name,
          taxCertificate: data.tinNumber,
        }),
      });
      localStorage.removeItem('pending_company_name');
      router.push('/dashboard/enterprise');
    } catch (err: any) {
      setSubmitError(
        err?.message === 'registration_number_already_used'
          ? 'That BRELA incorporation number is already registered with Ondi.'
          : 'Could not submit for verification. Please try again.'
      );
    }
  };

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
            <span className="text-sm font-bold uppercase tracking-wider font-space">Step 2: Business Verification</span>
          </div>
          <h1 className="text-4xl font-bold text-white font-barlow uppercase leading-tight">
            Verify your <br />enterprise.
          </h1>
          <p className="text-base text-white/50 font-normal leading-relaxed max-w-sm">
            We verify your business details with official registries to issue your Corporate Token and unlock enterprise features.
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
          {/* Header */}
          <div className="mb-12 space-y-2">
            <button 
              onClick={() => router.back()} 
              className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-[#001633] transition-colors uppercase tracking-wider font-space mb-4"
            >
              <ChevronLeft size={16} /> Back
            </button>
            <h2 className="text-3xl font-bold text-[#001633] font-barlow uppercase tracking-tight">Enterprise Verification</h2>
            <p className="text-sm text-slate-400 font-normal">Please provide your company details for registry verification.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">Company Name</label>
              <input 
                type="text" 
                {...register('companyName')} 
                className="w-full bg-slate-50 border border-slate-100 rounded-[10px] py-4 px-5 text-[#001633] text-sm focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium placeholder:text-slate-300"
                placeholder="Hudumika Technologies Ltd" 
              />
              {errors.companyName && <p className="text-red-500 text-xs mt-2 font-medium">{errors.companyName.message}</p>}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">BRELA Incorporation No.</label>
                <input 
                  type="text" 
                  {...register('incorpNumber')} 
                  className="w-full bg-slate-50 border border-slate-100 rounded-[10px] py-4 px-5 text-[#001633] text-sm focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium placeholder:text-slate-300"
                  placeholder="12345678" 
                />
                {errors.incorpNumber && <p className="text-red-500 text-xs mt-2 font-medium">{errors.incorpNumber.message}</p>}
              </div>

              <div>
                <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">TRA TIN Number</label>
                <input 
                  type="text" 
                  {...register('tinNumber')} 
                  className="w-full bg-slate-50 border border-slate-100 rounded-[10px] py-4 px-5 text-[#001633] text-sm focus:outline-none focus:border-[#4253D1] focus:bg-white transition-all font-medium placeholder:text-slate-300"
                  placeholder="111222333" 
                />
                {errors.tinNumber && <p className="text-red-500 text-xs mt-2 font-medium">{errors.tinNumber.message}</p>}
              </div>
            </div>

            <div className="mt-6">
              <UploadZone label="Certificate of Incorporation" register={register} name="certUrl" error={errors.certUrl?.message?.toString()} />
            </div>

            {/* Registry Sync Note */}
            <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-6 flex gap-4 mt-8">
              <div className="w-10 h-10 rounded-[10px] bg-white border border-slate-100 flex items-center justify-center text-[#4253D1] shrink-0">
                <Globe size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#001633] uppercase font-space mb-1">Live Registry Sync</h4>
                <p className="text-xs text-slate-500 font-normal leading-relaxed">Your details are cross-referenced directly with the BRELA and TRA databases for instant Enterprise verification.</p>
              </div>
            </div>

            {submitError && (
              <p className="text-red-500 text-xs font-medium bg-red-50 border border-red-100 rounded-[10px] p-4">{submitError}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-5 bg-[#001633] text-white rounded-[10px] font-bold text-sm uppercase tracking-wider font-space hover:bg-[#4253D1] transition-all active:scale-95 shadow-xl shadow-slate-200 flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed mt-8"
            >
              {isSubmitting ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Complete Enterprise Verification'}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

function UploadZone({ label, register, name, error }: { label: string, register: any, name: string, error?: string }) {
  return (
    <div>
      <label className="block mb-2 text-xs font-bold text-slate-400 uppercase tracking-widest font-space">{label}</label>
      <div className="relative border-2 border-dashed border-slate-100 hover:border-[#4253D1]/50 rounded-[10px] p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-50 group">
        <input 
          type="file" 
          accept="application/pdf,image/*" 
          {...register(name)} 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
        />
        <div className="w-12 h-12 rounded-[10px] bg-white border border-slate-100 flex items-center justify-center mb-3 text-slate-400 group-hover:text-[#4253D1] group-hover:border-[#4253D1]/20 transition-all duration-300">
          <Upload size={20} />
        </div>
        <span className="text-sm font-bold text-[#001633] font-space uppercase tracking-wider">Upload Document</span>
        <span className="text-xs text-slate-400 mt-1">PDF, PNG up to 15MB</span>
      </div>
      {error && <p className="text-red-500 text-xs mt-2 font-medium">{error}</p>}
    </div>
  );
}

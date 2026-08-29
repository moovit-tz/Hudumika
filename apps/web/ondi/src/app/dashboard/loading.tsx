export default function DashboardLoading() {
  return (
    <div className="p-6 lg:p-10 space-y-6 max-w-[1400px] animate-pulse">
      {/* Header bar */}
      <div className="h-14 bg-slate-100 rounded-2xl" />

      {/* Hero card */}
      <div className="bg-white border border-slate-100 rounded-2xl p-8">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-xl" />
              <div className="space-y-2">
                <div className="h-2.5 w-20 bg-slate-100 rounded" />
                <div className="h-4 w-36 bg-slate-100 rounded" />
              </div>
            </div>
            <div className="space-y-2 max-w-xs">
              <div className="h-2 w-48 bg-slate-100 rounded" />
              <div className="h-1.5 w-full bg-slate-100 rounded-full" />
            </div>
          </div>
          <div className="w-[140px] h-[140px] bg-slate-100 rounded-full shrink-0" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-white border border-slate-100 rounded-[10px] p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div className="h-2 w-24 bg-slate-100 rounded" />
              <div className="w-9 h-9 bg-slate-100 rounded-[8px]" />
            </div>
            <div className="h-7 w-28 bg-slate-100 rounded" />
            <div className="h-2 w-20 bg-slate-100 rounded" />
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-100 rounded-[10px] p-6 space-y-4">
          <div className="h-4 w-40 bg-slate-100 rounded" />
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-slate-50">
              <div className="w-8 h-8 bg-slate-100 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-36 bg-slate-100 rounded" />
                <div className="h-2 w-24 bg-slate-100 rounded" />
              </div>
              <div className="h-5 w-16 bg-slate-100 rounded-full" />
            </div>
          ))}
        </div>
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-100 rounded-[10px] p-6 space-y-4">
            <div className="h-4 w-28 bg-slate-100 rounded" />
            <div className="h-10 w-24 bg-slate-100 rounded" />
            <div className="h-2 w-full bg-slate-100 rounded" />
          </div>
          <div className="bg-white border border-slate-100 rounded-[10px] p-6 space-y-4">
            <div className="h-4 w-28 bg-slate-100 rounded" />
            {[1, 2].map(i => (
              <div key={i} className="flex gap-3">
                <div className="w-2 h-2 bg-slate-100 rounded-full mt-1 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-32 bg-slate-100 rounded" />
                  <div className="h-2 w-48 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

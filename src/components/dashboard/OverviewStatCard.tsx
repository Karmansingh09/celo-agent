import React from 'react';

interface OverviewStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: {
    text: string;
    variant: 'emerald' | 'amber' | 'slate' | 'sky';
  };
  isLoading?: boolean;
}

export default function OverviewStatCard({
  title,
  value,
  subtitle,
  badge,
  isLoading = false,
}: OverviewStatCardProps) {
  const badgeStyles = {
    emerald: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
    amber: 'bg-amber-950/80 text-amber-300 border-amber-800',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    sky: 'bg-sky-950/80 text-sky-300 border-sky-800',
  };

  if (isLoading) {
    return (
      <div className="p-5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3 animate-pulse">
        <div className="h-3 w-24 bg-slate-700 rounded" />
        <div className="h-8 w-16 bg-slate-700 rounded" />
        <div className="h-3 w-28 bg-slate-700/50 rounded" />
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl bg-slate-800/70 border border-slate-700/70 shadow-sm space-y-2 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {title}
        </span>
        {badge && (
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-mono border ${badgeStyles[badge.variant]}`}
          >
            {badge.text}
          </span>
        )}
      </div>

      <div>
        <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
          {value}
        </div>
        {subtitle && (
          <div className="text-xs text-slate-400 mt-1">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

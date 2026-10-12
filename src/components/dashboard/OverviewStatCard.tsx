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
    emerald: 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_-2px_rgba(134,227,176,0.2)]',
    amber: 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
    slate: 'bg-[rgba(20,29,42,0.8)] text-slate-300 border border-[rgba(180,205,220,0.14)]',
    sky: 'bg-sky-500/10 text-sky-300 border border-sky-500/30',
  };

  if (isLoading) {
    return (
      <div className="p-5 rounded-2xl glass-panel space-y-3 animate-pulse">
        <div className="h-3 w-24 bg-slate-800/80 rounded" />
        <div className="h-8 w-16 bg-slate-800/80 rounded" />
        <div className="h-3 w-28 bg-slate-800/50 rounded" />
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl glass-panel glass-card-interactive space-y-3 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
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
        <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
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

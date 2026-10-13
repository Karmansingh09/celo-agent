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
  const badgeClasses = {
    emerald: 'st ok',
    amber: 'st w',
    slate: 'st p',
    sky: 'st p',
  };

  if (isLoading) {
    return (
      <div className="p-6 rounded-3xl glass space-y-3 animate-pulse">
        <div className="h-3 w-24 bg-black/10 dark:bg-white/10 rounded" />
        <div className="h-8 w-20 bg-black/10 dark:bg-white/10 rounded" />
        <div className="h-3 w-28 bg-black/5 dark:bg-white/5 rounded" />
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl glass space-y-3 flex flex-col justify-between transition-transform hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--muted)] font-mono uppercase tracking-wider">
          {title}
        </span>
        {badge && (
          <span className={badgeClasses[badge.variant]}>
            {badge.text}
          </span>
        )}
      </div>

      <div>
        <div className="num">
          {value}
        </div>
        {subtitle && (
          <div className="text-xs text-[var(--muted)] mt-1">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

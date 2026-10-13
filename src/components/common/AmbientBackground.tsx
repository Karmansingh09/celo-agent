'use client';

import React, { useEffect, useState } from 'react';

export default function AmbientBackground() {
  const [palette, setPalette] = useState<'dawn' | 'sunset' | 'ocean'>('dawn');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  useEffect(() => {
    // Scroll progress handler
    const onScroll = () => {
      const root = document.documentElement;
      const h = root.scrollHeight - window.innerHeight;
      const prog = document.getElementById('prog');
      if (prog) {
        prog.style.transform = `scaleX(${h > 0 ? window.scrollY / h : 0})`;
      }
      root.style.setProperty('--sy', String(window.scrollY));
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Mouse glow handler on glass cards
    const onMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const g = target?.closest?.('.glass') as HTMLElement | null;
      if (g) {
        const r = g.getBoundingClientRect();
        g.style.setProperty('--mx', `${e.clientX - r.left}px`);
        g.style.setProperty('--my', `${e.clientY - r.top}px`);
      }
    };

    document.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  const switchPalette = (p: 'dawn' | 'sunset' | 'ocean') => {
    setPalette(p);
    const root = document.documentElement;
    if (p === 'dawn') {
      root.removeAttribute('data-pal');
    } else {
      root.setAttribute('data-pal', p);
    }
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const currentTheme = root.getAttribute('data-theme');
    const isDark = currentTheme === 'dark' || (!currentTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const nextTheme = isDark ? 'light' : 'dark';
    root.setAttribute('data-theme', nextTheme);
    setTheme(nextTheme);
  };

  return (
    <>
      {/* Ambient Animated Blurred Blobs */}
      <div className="field" aria-hidden="true">
        <div className="blob a" />
        <div className="blob b" />
        <div className="blob c" />
      </div>

      {/* SVG Grain Overlay */}
      <div className="grain" aria-hidden="true" />

      {/* Scroll Progress Line */}
      <div className="prog" id="prog" aria-hidden="true" />

      {/* Fixed Palette & Theme Controls */}
      <div className="glass pal" role="group" aria-label="Color Palette Controls">
        <button
          type="button"
          data-p="dawn"
          aria-pressed={palette === 'dawn'}
          aria-label="Dawn Palette"
          onClick={() => switchPalette('dawn')}
          style={{ background: 'linear-gradient(135deg,#FF9E6B,#6FD3B4)' }}
          title="Dawn Palette"
        />
        <button
          type="button"
          data-p="sunset"
          aria-pressed={palette === 'sunset'}
          aria-label="Sunset Palette"
          onClick={() => switchPalette('sunset')}
          style={{ background: 'linear-gradient(135deg,#FF7A6B,#FFC15C,#F58FA8)' }}
          title="Sunset Palette"
        />
        <button
          type="button"
          data-p="ocean"
          aria-pressed={palette === 'ocean'}
          aria-label="Ocean Palette"
          onClick={() => switchPalette('ocean')}
          style={{ background: 'linear-gradient(135deg,#2BB8C9,#5B8CFF)' }}
          title="Ocean Palette"
        />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle Light/Dark Theme"
          title="Toggle Light/Dark Theme"
          className="flex items-center justify-center text-[11px] font-mono font-bold text-[var(--ink)] bg-[var(--glass)] border border-[var(--glass-b)] hover:scale-110 transition-transform"
        >
          ◐
        </button>
      </div>
    </>
  );
}

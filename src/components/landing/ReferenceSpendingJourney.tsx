'use client';

import React, { useState, useEffect, useRef } from 'react';

const STEPS_DATA = [
  { label: 'Received', sub: 'idempotent', msg: 'Request received with an idempotency key.', bud: '—', fun: 'No', rec: '—' },
  { label: 'Policy', sub: 'checked', msg: 'Policy evaluated: allow, require approval, or deny.', bud: '—', fun: 'No', rec: '—' },
  { label: 'Reserved', sub: 'no funds moved', msg: 'Budget reserved. No funds have moved.', bud: 'Held', fun: 'No', rec: '—' },
  { label: 'Approval', sub: 'if required', msg: 'Waiting for your decision, when policy requires one.', bud: 'Held', fun: 'No', rec: '—' },
  { label: 'Submitted', sub: 'not final', msg: 'Transaction submitted. Not final yet.', bud: 'Held', fun: 'Pending', rec: 'Awaiting' },
  { label: 'Settled', sub: 'receipt verified', msg: 'Receipt verified. Only now is it settled.', bud: 'Committed', fun: 'Yes', rec: 'Verified' },
];

export default function ReferenceSpendingJourney() {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const sectionRef = useRef<HTMLElement>(null);
  const userInteractionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // IntersectionObserver to only auto-advance when the section is visible in the viewport
  useEffect(() => {
    if (!sectionRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.2 }
    );
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // Auto-advance animation timer loop
  useEffect(() => {
    if (!isPlaying || !isVisible) return;

    // Longer pause on the final "Settled" step so the user can inspect the settled state
    const delay = currentStep === STEPS_DATA.length - 1 ? 3800 : 2500;

    const timer = setTimeout(() => {
      setCurrentStep((prev) => (prev + 1) % STEPS_DATA.length);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentStep, isPlaying, isVisible]);

  const handleStepClick = (idx: number) => {
    setCurrentStep(idx);
    setIsPlaying(false);
    if (userInteractionTimeoutRef.current) {
      clearTimeout(userInteractionTimeoutRef.current);
    }
    // Resume auto-advance after 6s of user inactivity
    userInteractionTimeoutRef.current = setTimeout(() => {
      setIsPlaying(true);
    }, 6000);
  };

  const handleMouseEnter = () => {
    setIsPlaying(false);
  };

  const handleMouseLeave = () => {
    if (userInteractionTimeoutRef.current) {
      clearTimeout(userInteractionTimeoutRef.current);
    }
    setIsPlaying(true);
  };

  const active = STEPS_DATA[currentStep];
  const fillWidthPercent = (92 * currentStep) / 5;

  return (
    <section ref={sectionRef} id="journey" className="py-16 sm:py-24">
      <div className="wrap">
        <h2>Six steps. Never blurred together.</h2>
        <p className="sub">A reserved budget is not a sent payment, and a sent payment is not a settled one.</p>

        {/* 6 Steps Progress Track */}
        <div
          className="glass track"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="steps" id="steps">
            <div className="fill" style={{ width: `${fillWidthPercent}%` }} />
            {STEPS_DATA.map((step, idx) => {
              const isOn = idx <= currentStep;
              const isCurrent = idx === currentStep;
              return (
                <div
                  key={step.label}
                  className={`s ${isOn ? 'on' : ''} ${isCurrent ? 'active' : ''}`}
                  onClick={() => handleStepClick(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') handleStepClick(idx);
                  }}
                  title={`Step ${idx + 1}: ${step.label} — Click to inspect`}
                >
                  <i />
                  <span>{step.label}</span>
                  <small>{step.sub}</small>
                </div>
              );
            })}
          </div>

          <p className="capt" id="capt" key={currentStep}>
            <span className="inline-block animate-[rise_0.35s_cubic-bezier(0.2,0.8,0.2,1)]">
              {active.msg}
            </span>
          </p>
        </div>

        {/* Interaction / Control Hint */}
        <div className="flex items-center justify-center gap-3 font-mono text-[11px] text-[var(--muted)] mt-3">
          <button
            type="button"
            onClick={() => setIsPlaying((prev) => !prev)}
            className="hover:text-[var(--ink)] transition-colors flex items-center gap-1.5 focus:outline-none"
            title={isPlaying ? 'Pause auto-advance' : 'Resume auto-advance'}
          >
            <span>{isPlaying ? '⏸ Pause' : '▶ Play'}</span>
          </button>
          <span>·</span>
          <span>Click any step to inspect lifecycle state transitions</span>
        </div>

        {/* Dynamic Verification Ticket */}
        <div
          className="glass ticket mt-5"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div>
            <div className="num">
              42.00 <small>cUSD</small>
            </div>
            <div className="lab">to 0x9a3…c41e · example request</div>
          </div>

          <div>
            <span className="tl">Budget</span>
            <b
              style={{
                color: currentStep >= 2 ? 'var(--ink)' : 'var(--muted)',
              }}
            >
              {active.bud}
            </b>
          </div>

          <div>
            <span className="tl">Funds moved</span>
            <b
              style={{
                color:
                  currentStep === 5
                    ? 'var(--ok)'
                    : currentStep === 4
                    ? 'var(--warn)'
                    : 'var(--muted)',
              }}
            >
              {active.fun}
            </b>
          </div>

          <div>
            <span className="tl">Receipt</span>
            <b
              style={{
                color:
                  currentStep === 5
                    ? 'var(--ok)'
                    : currentStep === 4
                    ? 'var(--warn)'
                    : 'var(--muted)',
              }}
            >
              {active.rec}
            </b>
          </div>
        </div>
      </div>
    </section>
  );
}

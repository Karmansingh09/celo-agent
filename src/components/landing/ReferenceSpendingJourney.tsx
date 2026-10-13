'use client';

import React, { useState } from 'react';

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

  const active = STEPS_DATA[currentStep];
  const fillWidthPercent = (92 * currentStep) / 5;

  return (
    <section id="journey" className="py-16 sm:py-24">
      <div className="wrap">
        <h2>Six steps. Never blurred together.</h2>
        <p className="sub">A reserved budget is not a sent payment, and a sent payment is not a settled one.</p>

        {/* 6 Steps Progress Track */}
        <div className="glass track">
          <div className="steps" id="steps">
            <div className="fill" style={{ width: `${fillWidthPercent}%` }} />
            {STEPS_DATA.map((step, idx) => {
              const isOn = idx <= currentStep;
              return (
                <div
                  key={step.label}
                  className={`s ${isOn ? 'on' : ''}`}
                  onClick={() => setCurrentStep(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setCurrentStep(idx);
                  }}
                  title={`Step ${idx + 1}: ${step.label}`}
                >
                  <i />
                  <span>{step.label}</span>
                  <small>{step.sub}</small>
                </div>
              );
            })}
          </div>

          <p className="capt" id="capt">
            {active.msg}
          </p>
        </div>

        <p className="text-center font-mono text-[11px] text-[var(--muted)] mt-3">
          Click any step above to inspect lifecycle state transitions
        </p>

        {/* Dynamic Verification Ticket */}
        <div className="glass ticket mt-5">
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

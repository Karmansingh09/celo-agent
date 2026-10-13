'use client';

import React, { useEffect, useRef, useState } from 'react';

interface SimulatedRequest {
  amount: string;
  who: string;
  phases: Array<{ text: string; statusClass: string }>;
}

const SIMULATION_SCENARIOS: SimulatedRequest[] = [
  {
    amount: '4.20',
    who: 'research-bot → 0x71e…09b2',
    phases: [
      { text: 'Checking', statusClass: 'st p' },
      { text: 'Reserved', statusClass: 'st ok' },
    ],
  },
  {
    amount: '18.00',
    who: 'research-bot → 0xc2d…4a17',
    phases: [
      { text: 'Checking', statusClass: 'st p' },
      { text: 'Needs approval', statusClass: 'st w' },
    ],
  },
  {
    amount: '60.00',
    who: 'research-bot → 0x5f0…e3a8',
    phases: [
      { text: 'Checking', statusClass: 'st p' },
      { text: 'Denied · over limit', statusClass: 'st d' },
    ],
  },
  {
    amount: '7.50',
    who: 'research-bot → 0x71e…09b2',
    phases: [
      { text: 'Checking', statusClass: 'st p' },
      { text: 'Reserved', statusClass: 'st ok' },
    ],
  },
];

interface ActiveFeedItem {
  id: number;
  amount: string;
  who: string;
  status: string;
  statusClass: string;
}

export default function ReferenceHeroStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [usedAmount, setUsedAmount] = useState<number>(0);
  const [targetAmount, setTargetAmount] = useState<number>(62.4);
  const [feedItems, setFeedItems] = useState<ActiveFeedItem[]>([]);
  const nextIdRef = useRef(1);
  const scenarioIdxRef = useRef(0);

  // 3D tilt on hover
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setRotate({
      x: -y * 10,
      y: x * 10,
    });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
  };

  // Animate ring and counter
  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1800;
    const initialTarget = 62.4;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setUsedAmount(Number((initialTarget * ease).toFixed(2)));
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    const timer = setTimeout(() => {
      requestAnimationFrame(step);
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  // Periodic simulation feed
  useEffect(() => {
    const addScenario = () => {
      const scenario = SIMULATION_SCENARIOS[scenarioIdxRef.current % SIMULATION_SCENARIOS.length];
      scenarioIdxRef.current++;
      const id = nextIdRef.current++;

      const newItem: ActiveFeedItem = {
        id,
        amount: scenario.amount,
        who: scenario.who,
        status: 'Received',
        statusClass: 'st p',
      };

      setFeedItems((prev) => [newItem, ...prev.slice(0, 2)]);

      // Transition through phases
      scenario.phases.forEach((phase, idx) => {
        setTimeout(() => {
          setFeedItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, status: phase.text, statusClass: phase.statusClass } : item
            )
          );
          if (phase.statusClass === 'st ok') {
            setTargetAmount((cur) => {
              const next = cur + parseFloat(scenario.amount);
              return next > 100 ? parseFloat(scenario.amount) : next;
            });
          }
        }, 700 * (idx + 1));
      });
    };

    addScenario();
    const interval = setInterval(addScenario, 3400);
    return () => clearInterval(interval);
  }, []);

  // Calculate ring stroke dash offset
  const circumference = 289;
  const dashOffset = circumference * (1 - Math.min(targetAmount, 100) / 100);

  return (
    <div
      ref={stageRef}
      id="stage"
      className="stage"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating Pill Badges matching reference */}
      <div className="glass fl a">
        <i />
        <span>Policy passed</span>
      </div>
      <div className="glass fl b">
        <i style={{ background: 'var(--warn)' }} />
        <span>Idempotency key set</span>
      </div>
      <div className="glass fl c">
        <i style={{ background: 'var(--b3)' }} />
        <span>Reserved ≠ settled</span>
      </div>

      {/* 3D Perspective Card Deck */}
      <div
        ref={deckRef}
        id="deck"
        className="deck"
        style={{
          transform: `rotateY(${rotate.y}deg) rotateX(${rotate.x}deg)`,
        }}
      >
        <div className="glass ghost g1" />
        <div className="glass ghost g2" />
        <div className="glass card" id="card">
          <div className="flex items-center justify-between">
            <span className="addr">agent · 0x9a3…c41e</span>
            <span className="chip">ACTIVE</span>
          </div>
          <div className="name">research-bot</div>
          <div className="addr">Policy: 25 per tx · 100 per day · approval above 10</div>

          <div className="ringwrap">
            <svg className="ring" viewBox="0 0 112 112" aria-hidden="true">
              <circle className="t" cx="56" cy="56" r="46" />
              <circle
                className="v"
                id="ringv"
                cx="56"
                cy="56"
                r="46"
                style={{ strokeDashoffset: dashOffset }}
              />
            </svg>
            <div>
              <div className="num">
                <span id="used">{usedAmount.toFixed(2)}</span> <small>cUSD</small>
              </div>
              <div className="lab">reserved today of 100.00</div>
            </div>
          </div>
        </div>
      </div>

      {/* Live Simulation Requests Feed */}
      <div className="glass feed" aria-live="polite">
        <h4>
          <span>Live requests</span>
          <span className="text-[10px] font-mono text-[var(--accent)] font-semibold">simulation</span>
        </h4>
        <div id="list" className="space-y-1">
          {feedItems.map((item) => (
            <div key={item.id} className="item">
              <span className="amt">{item.amount}</span>
              <span className="who">{item.who}</span>
              <span className={item.statusClass}>{item.status}</span>
            </div>
          ))}
        </div>
        <p className="disc">Illustrative simulation. Not real transactions.</p>
      </div>
    </div>
  );
}

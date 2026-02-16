"use client";

import { useEffect, useState, useRef } from "react";
import { RoundAccount, RoundStatusLabels, RoundResultLabels } from "@/lib/program";

interface Props {
  round: RoundAccount;
  roundId: number;
}

const ROUND_DURATION = 120; // total seconds for the round
const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function RoundTimer({ round, roundId }: Props) {
  const [timeLeft, setTimeLeft] = useState(0);
  const prevPriceRef = useRef<string | null>(null);
  const [priceDelta, setPriceDelta] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = Date.now() / 1000;
      const end = Number(round.endTs);
      const remaining = Math.max(0, end - now);
      setTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [round.endTs]);

  const statusLabel = RoundStatusLabels[round.status] || "Unknown";
  const resultLabel = RoundResultLabels[round.result] || "";

  const formatPrice = (price: bigint | number, expo: number) => {
    const p = Number(price);
    const factor = Math.pow(10, expo);
    return (p * factor).toFixed(2);
  };

  const isSettled = round.status === 2;
  const isLocked = round.status === 1;
  const isOpen = round.status === 0;

  // Progress for ring (0 = full, 1 = empty)
  const progress = Math.min(timeLeft / ROUND_DURATION, 1);
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  // Color transitions based on time
  const ringColor = isLocked
    ? "#f59e0b"
    : timeLeft <= 5
      ? "#ef4444"
      : timeLeft <= 10
        ? "#f59e0b"
        : "#9945FF";

  const urgencyClass =
    timeLeft <= 5 && !isSettled
      ? "animate-shake"
      : timeLeft <= 10 && !isSettled
        ? "animate-pulse-urgent"
        : "";

  // Price delta on settle + edge flash
  useEffect(() => {
    if (isSettled && Number(round.endPrice) !== 0) {
      const startP =
        Number(round.startPrice) * Math.pow(10, round.priceExpo);
      const endP = Number(round.endPrice) * Math.pow(10, round.priceExpo);
      const delta = endP - startP;
      setPriceDelta(delta);
      prevPriceRef.current = endP.toFixed(2);
      setShowFlash(true);
      const timer = setTimeout(() => setShowFlash(false), 800);
      return () => clearTimeout(timer);
    } else {
      setPriceDelta(null);
    }
  }, [isSettled, round.endPrice, round.startPrice, round.priceExpo]);

  // Status dot color
  const statusDotColor = isOpen
    ? "bg-up"
    : isLocked
      ? "bg-amber-400"
      : "bg-gray-400";

  return (
    <>
      {/* Settlement edge flash */}
      {showFlash && (
        <div
          className={`fixed inset-0 pointer-events-none z-50 animate-edge-flash ${
            round.result === 1
              ? "bg-up/20"
              : round.result === 2
                ? "bg-down/20"
                : "bg-amber-400/20"
          }`}
        />
      )}
    <div className="glass gradient-border rounded-xl p-6 text-center space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span className="font-mono">Round #{roundId}</span>
        <span className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${statusDotColor} ${
              isOpen ? "animate-pulse" : isLocked ? "animate-pulse" : ""
            }`}
          />
          <span
            className={`px-2 py-0.5 rounded text-xs font-semibold ${
              isOpen
                ? "bg-up/15 text-up"
                : isLocked
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-gray-500/15 text-gray-300"
            }`}
          >
            {statusLabel}
          </span>
        </span>
      </div>

      {/* Circular timer / result */}
      <div className={`flex justify-center ${urgencyClass}`}>
        <div className="relative w-36 h-36">
          {/* SVG ring */}
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            {/* Track */}
            <circle
              cx="60"
              cy="60"
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(153,69,255,0.15)"
              strokeWidth="6"
            />
            {/* Progress */}
            {!isSettled && (
              <circle
                cx="60"
                cy="60"
                r={RING_RADIUS}
                fill="none"
                stroke={ringColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className={isLocked ? "locked-pulse" : ""}
                style={{
                  transition: "stroke-dashoffset 0.1s linear, stroke 0.3s ease",
                  filter:
                    isLocked || timeLeft <= 10
                      ? `drop-shadow(0 0 6px ${ringColor})`
                      : "none",
                }}
              />
            )}
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isSettled ? (
              <span
                className={`text-3xl font-bold animate-bounce-in ${
                  round.result === 1
                    ? "text-up"
                    : round.result === 2
                      ? "text-down"
                      : "text-gray-400"
                }`}
              >
                {resultLabel}
              </span>
            ) : isLocked ? (
              <>
                <svg className="w-8 h-8 text-amber-400 mb-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-bold text-amber-400 tracking-wider">LOCKED</span>
              </>
            ) : (
              <>
                <span
                  className={`text-4xl font-mono font-bold tabular-nums ${
                    timeLeft <= 5
                      ? "text-down"
                      : timeLeft <= 10
                        ? "text-amber-400"
                        : "text-white"
                  }`}
                >
                  {timeLeft.toFixed(1)}
                </span>
                <span className="text-xs text-gray-500 mt-0.5">seconds</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* SOL Price display */}
      <div className="space-y-1">
        <div className="text-3xl font-mono font-bold tracking-tight">
          <span className="text-gray-400 text-lg">$</span>
          {formatPrice(
            isSettled && Number(round.endPrice) !== 0
              ? round.endPrice
              : round.startPrice,
            round.priceExpo
          )}
        </div>
        {/* Price delta badge */}
        {isSettled && priceDelta !== null && (
          <div className="animate-bounce-in">
            <span
              className={`inline-flex items-center gap-1 text-sm font-mono font-semibold px-2 py-0.5 rounded-full ${
                priceDelta > 0
                  ? "bg-up/15 text-up"
                  : priceDelta < 0
                    ? "bg-down/15 text-down"
                    : "bg-gray-500/15 text-gray-400"
              }`}
            >
              {priceDelta > 0 ? "+" : ""}
              {priceDelta.toFixed(2)}
              <span className="text-xs">
                {priceDelta > 0 ? "\u2191" : priceDelta < 0 ? "\u2193" : "="}
              </span>
            </span>
          </div>
        )}
        {isLocked && (
          <div className="text-xs text-amber-400/70">
            Awaiting settlement...
          </div>
        )}
        {isOpen && (
          <div className="text-xs text-gray-500">
            Start: ${formatPrice(round.startPrice, round.priceExpo)}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  RoundAccount,
  RoundResultLabels,
  findPlayerBet,
  calculatePayout,
  formatCredits,
} from "@/lib/program";
import { usePlaceBet, useClaim } from "@/lib/hooks";

interface Props {
  round: RoundAccount;
  roundId: number;
  feeBps: number;
  onBetPlaced?: (amountCredits: number) => void;
}

const PRESET_AMOUNTS = [10, 50, 100, 500];
const CONFETTI_COLORS = [
  "#9945FF",
  "#14F195",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
];

function ConfettiEffect() {
  const pieces = Array.from({ length: 25 }, (_, i) => {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const left = Math.random() * 100;
    const delay = Math.random() * 0.8;
    const duration = 1.5 + Math.random() * 1;
    const size = 4 + Math.random() * 6;
    const rotation = Math.random() * 360;

    return (
      <div
        key={i}
        className="absolute top-0 rounded-sm"
        style={{
          left: `${left}%`,
          width: `${size}px`,
          height: `${size * 1.5}px`,
          backgroundColor: color,
          transform: `rotate(${rotation}deg)`,
          animation: `confettiDrop ${duration}s ease-in ${delay}s forwards`,
          opacity: 0,
          animationFillMode: "forwards",
        }}
      />
    );
  });

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces}
    </div>
  );
}

export default function BetPanel({ round, roundId, feeBps, onBetPlaced }: Props) {
  const wallet = useWallet();
  const [amount, setAmount] = useState("50");
  const [placing, setPlacing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [betSuccess, setBetSuccess] = useState<string | null>(null);
  const placeBet = usePlaceBet();
  const claim = useClaim();

  const isOpen = round.status === 0;
  const isLocked = round.status === 1;
  const isSettled = round.status === 2;

  const userBet = wallet.publicKey
    ? findPlayerBet(round, wallet.publicKey)
    : null;

  const userBetUp = userBet ? Number(userBet.upAmount) / 1_000_000_000 : 0;
  const userBetDown = userBet
    ? Number(userBet.downAmount) / 1_000_000_000
    : 0;

  const payout =
    isSettled && userBet ? calculatePayout(round, userBet, feeBps) : 0;
  const payoutDisplay = payout / 1_000_000_000;
  const isWinner = payout > 0;

  // Trigger confetti on win
  useEffect(() => {
    if (isSettled && isWinner) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSettled, isWinner]);

  // Ripple effect handler
  const createRipple = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const button = e.currentTarget;
      const circle = document.createElement("span");
      const diameter = Math.max(button.clientWidth, button.clientHeight);
      const radius = diameter / 2;
      const rect = button.getBoundingClientRect();

      circle.style.width = circle.style.height = `${diameter}px`;
      circle.style.left = `${e.clientX - rect.left - radius}px`;
      circle.style.top = `${e.clientY - rect.top - radius}px`;
      circle.classList.add("ripple-circle");

      const existing = button.querySelector(".ripple-circle");
      if (existing) existing.remove();
      button.appendChild(circle);
    },
    []
  );

  const handleBet = async (
    direction: "up" | "down",
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    createRipple(e);
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) return;

    setPlacing(true);
    try {
      const amountCredits = Math.floor(amtNum * 1_000_000_000);
      await placeBet(roundId, direction, amountCredits);
      onBetPlaced?.(amountCredits);
      const label = `${amtNum} ${direction.toUpperCase()}`;
      setBetSuccess(label);
      setTimeout(() => setBetSuccess(null), 2500);
    } catch (err: any) {
      console.error("Bet failed:", err);
      alert("Bet failed: " + (err.message || err));
    } finally {
      setPlacing(false);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await claim(roundId);
    } catch (err: any) {
      console.error("Claim failed:", err);
      alert("Claim failed: " + (err.message || err));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="glass gradient-border rounded-xl p-4 space-y-4 relative">
      {showConfetti && <ConfettiEffect />}

      {/* Bet success toast */}
      {betSuccess && (
        <div className="bet-success-toast absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-10 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-up/15 border border-up/30 backdrop-blur-sm">
            <svg className="w-4 h-4 text-up" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-up font-semibold text-sm whitespace-nowrap">
              Bet placed! {betSuccess}
            </span>
          </div>
        </div>
      )}

      {/* User's current bet display */}
      {userBet && (isOpen || isLocked) && (
        <div className="glass-surface rounded-lg p-3 space-y-1">
          <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
            Your Bet
          </div>
          <div className="flex items-center gap-3">
            {userBetUp > 0 && (
              <span className="text-up font-mono font-bold">
                {userBetUp.toFixed(2)} UP
              </span>
            )}
            {userBetDown > 0 && (
              <span className="text-down font-mono font-bold">
                {userBetDown.toFixed(2)} DOWN
              </span>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <>
          {/* Amount input */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Bet Amount</label>
            <input
              type="number"
              min="1"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-surface/60 border border-gray-700/50 rounded-lg px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-sol-purple/50 focus:border-sol-purple/50 transition-all"
              placeholder="Enter amount"
            />
            <div className="flex gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(String(preset))}
                  className={`flex-1 py-1.5 text-sm rounded-full transition-all font-medium ${
                    amount === String(preset)
                      ? "bg-sol-purple/25 text-sol-purple ring-1 ring-sol-purple/40"
                      : "bg-surface/50 hover:bg-surface text-gray-300"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Bet buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={(e) => handleBet("up", e)}
              disabled={placing}
              className="btn-ripple py-4 rounded-xl bg-gradient-to-br from-up/25 to-up/10 hover:from-up/35 hover:to-up/20 border border-up/40 hover:border-up/60 text-up font-bold text-lg transition-all disabled:opacity-50 active:scale-95 hover:shadow-up-glow"
            >
              {placing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="css-spinner" />
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="text-xl">{"\u2191"}</span> UP
                </span>
              )}
            </button>
            <button
              onClick={(e) => handleBet("down", e)}
              disabled={placing}
              className="btn-ripple py-4 rounded-xl bg-gradient-to-br from-down/25 to-down/10 hover:from-down/35 hover:to-down/20 border border-down/40 hover:border-down/60 text-down font-bold text-lg transition-all disabled:opacity-50 active:scale-95 hover:shadow-down-glow"
            >
              {placing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="css-spinner" />
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="text-xl">{"\u2193"}</span> DOWN
                </span>
              )}
            </button>
          </div>
        </>
      )}

      {isLocked && (
        <div className="text-center py-6 space-y-2">
          <div className="text-2xl animate-pulse-urgent">
            {"\uD83D\uDD12"}
          </div>
          <div className="text-amber-400 font-semibold">
            Round Locked
          </div>
          <div className="text-sm text-gray-500 animate-pulse">
            Awaiting result...
          </div>
        </div>
      )}

      {isSettled && (
        <div className="space-y-3">
          {/* Round result */}
          <div className="text-center">
            <span className="text-sm text-gray-400">Result: </span>
            <span
              className={`font-bold ${
                round.result === 1
                  ? "text-up"
                  : round.result === 2
                    ? "text-down"
                    : "text-yellow-400"
              }`}
            >
              {RoundResultLabels[round.result]}
            </span>
          </div>

          {userBet ? (
            <div className="glass-surface rounded-lg p-3 space-y-2">
              {/* User's bet summary */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Your bet</span>
                <span className="font-mono">
                  {userBetUp > 0 && (
                    <span className="text-up">{userBetUp.toFixed(2)} UP</span>
                  )}
                  {userBetUp > 0 && userBetDown > 0 && " + "}
                  {userBetDown > 0 && (
                    <span className="text-down">
                      {userBetDown.toFixed(2)} DOWN
                    </span>
                  )}
                </span>
              </div>

              {/* Payout info */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Payout</span>
                <span
                  className={`font-mono font-bold ${isWinner ? "text-sol-teal" : "text-red-400"}`}
                >
                  {isWinner
                    ? `+${payoutDisplay.toFixed(2)}`
                    : "0.00"}
                </span>
              </div>

              {/* Claim button */}
              {isWinner && (
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="claim-shimmer w-full py-3 rounded-lg bg-sol-gradient font-semibold transition-all hover:shadow-claim active:scale-[0.98] disabled:opacity-50 mt-1 animate-pulse-glow shadow-claim"
                >
                  {claiming ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="css-spinner" />
                      Claiming...
                    </span>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="text-xs opacity-80">
                        Claim Winnings
                      </span>
                      <span className="text-lg font-bold font-mono">
                        +{payoutDisplay.toFixed(2)}
                      </span>
                    </div>
                  )}
                </button>
              )}

              {/* Loss state */}
              {!isWinner && (
                <div className="text-center py-2 text-sm text-red-400/70">
                  Better luck next round
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500">
              No bet in this round
            </div>
          )}
        </div>
      )}
    </div>
  );
}

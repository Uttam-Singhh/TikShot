"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useGame, useRound, usePlayer, useRegisterPlayer } from "@/lib/hooks";
import RoundTimer from "./RoundTimer";
import PriceChart from "./PriceChart";
import BetPanel from "./BetPanel";
import PoolBar from "./PoolBar";
import History from "./History";
import { useState } from "react";

function SolanaLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 397 312"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"
        fill="url(#sol-a)"
      />
      <path
        d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
        fill="url(#sol-b)"
      />
      <path
        d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
        fill="url(#sol-c)"
      />
      <defs>
        <linearGradient
          id="sol-a"
          x1="0"
          y1="0"
          x2="397"
          y2="312"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
        <linearGradient
          id="sol-b"
          x1="0"
          y1="0"
          x2="397"
          y2="312"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
        <linearGradient
          id="sol-c"
          x1="0"
          y1="0"
          x2="397"
          y2="312"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function GameBoard() {
  const wallet = useWallet();
  const game = useGame();
  const { player, refresh: refreshPlayer, deductCredits } = usePlayer();
  const registerPlayer = useRegisterPlayer();
  const [registering, setRegistering] = useState(false);

  const currentRoundId =
    game && Number(game.roundCount) > 0 ? Number(game.roundCount) - 1 : null;
  const round = useRound(currentRoundId);

  const handleRegister = async () => {
    setRegistering(true);
    try {
      await registerPlayer();
    } catch (err: any) {
      console.error("Registration failed:", err);
      alert("Registration failed: " + (err.message || err));
    } finally {
      setRegistering(false);
    }
  };

  const formatCredits = (credits: bigint | number) => {
    return (Number(credits) / 1_000_000_000).toFixed(2);
  };

  return (
    <div className="relative w-full max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Floating particles */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute w-64 h-64 rounded-full bg-sol-purple/10 blur-3xl"
          style={{ top: "10%", left: "-5%", animation: "particleFloat 12s ease-in-out infinite" }}
        />
        <div
          className="absolute w-48 h-48 rounded-full bg-sol-teal/8 blur-3xl"
          style={{ top: "50%", right: "-8%", animation: "particleFloat 15s ease-in-out infinite 3s" }}
        />
        <div
          className="absolute w-32 h-32 rounded-full bg-sol-purple/6 blur-2xl"
          style={{ bottom: "15%", left: "20%", animation: "particleFloat 10s ease-in-out infinite 6s" }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div className="flex items-center gap-2.5">
          <SolanaLogo className="w-7 h-7" />
          <h1 className="text-2xl font-bold tracking-tight sol-text">TikShot</h1>
        </div>
        <WalletMultiButton />
      </div>

      {/* Player credits bar */}
      {wallet.connected && (
        <div
          className="glass gradient-border rounded-xl p-4 animate-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          {player ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Play Credits · USDC</span>
              <span className="text-lg font-mono font-bold text-sol-teal">
                ${formatCredits(player.credits)}
              </span>
            </div>
          ) : (
            <button
              onClick={handleRegister}
              disabled={registering}
              className="w-full py-3 rounded-lg bg-sol-gradient font-semibold transition-all hover:shadow-sol active:scale-[0.98] disabled:opacity-50"
            >
              {registering ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="css-spinner" />
                  Registering...
                </span>
              ) : (
                "Register & Get 1000 Credits"
              )}
            </button>
          )}
        </div>
      )}

      {!wallet.connected && (
        <div
          className="glass gradient-border rounded-xl p-10 text-center animate-slide-up space-y-4"
          style={{ animationDelay: "0.1s" }}
        >
          <SolanaLogo className="w-16 h-16 mx-auto animate-float" />
          <p className="text-gray-400">Connect your wallet to start playing</p>
        </div>
      )}

      {/* Game area */}
      {wallet.connected && player && (
        <>
          {currentRoundId !== null && round ? (
            <>
              <div className="animate-slide-up" style={{ animationDelay: "0.15s" }}>
                <RoundTimer round={round} roundId={currentRoundId} />
              </div>
              <div className="animate-slide-up" style={{ animationDelay: "0.175s" }}>
                <PriceChart />
              </div>
              <div className="animate-slide-up" style={{ animationDelay: "0.225s" }}>
                <PoolBar round={round} />
              </div>
              <div className="animate-slide-up" style={{ animationDelay: "0.275s" }}>
                <BetPanel
                  round={round}
                  roundId={currentRoundId}
                  feeBps={game!.feeBps}
                  onBetPlaced={(amount) => { deductCredits(amount); refreshPlayer(); }}
                />
              </div>
            </>
          ) : (
            <div
              className="glass gradient-border rounded-xl p-8 text-center text-gray-400 animate-slide-up"
              style={{ animationDelay: "0.15s" }}
            >
              <div className="css-spinner mx-auto mb-3" />
              Waiting for the next round to start...
            </div>
          )}

          <div className="animate-slide-up" style={{ animationDelay: "0.325s" }}>
            <History currentRoundId={currentRoundId} />
          </div>
        </>
      )}
    </div>
  );
}

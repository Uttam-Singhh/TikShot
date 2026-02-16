"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  RoundAccount,
  RoundResultLabels,
  findPlayerBet,
  calculatePayout,
} from "@/lib/program";
import { useSettledRounds, useGame, useClaim } from "@/lib/hooks";

interface Props {
  currentRoundId: number | null;
}

export default function History({ currentRoundId }: Props) {
  const wallet = useWallet();
  const game = useGame();
  const { rounds, refresh } = useSettledRounds(currentRoundId);

  if (!wallet.publicKey || rounds.length === 0) return null;

  const feeBps = game?.feeBps ?? 0;

  return (
    <div className="glass gradient-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-400">Past Rounds</h3>
      <div className="space-y-2">
        {rounds.map(({ id, data }, index) => (
          <HistoryRow
            key={id}
            roundId={id}
            round={data}
            walletPubkey={wallet.publicKey!}
            feeBps={feeBps}
            onClaimed={refresh}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryRow({
  roundId,
  round,
  walletPubkey,
  feeBps,
  onClaimed,
  index,
}: {
  roundId: number;
  round: RoundAccount;
  walletPubkey: import("@solana/web3.js").PublicKey;
  feeBps: number;
  onClaimed: () => void;
  index: number;
}) {
  const claim = useClaim();
  const [claiming, setClaiming] = useState(false);

  const isSettled = round.status === 2;
  const userBet = findPlayerBet(round, walletPubkey);
  const payout =
    isSettled && userBet ? calculatePayout(round, userBet, feeBps) : 0;
  const payoutDisplay = payout / 1_000_000_000;
  const canClaim = isSettled && userBet && payout > 0;
  const isLoss = isSettled && userBet && payout === 0;

  const resultColor =
    round.result === 1
      ? "text-up"
      : round.result === 2
        ? "text-down"
        : round.result === 3
          ? "text-yellow-400"
          : "text-gray-500";

  const resultDotColor =
    round.result === 1
      ? "bg-up"
      : round.result === 2
        ? "bg-down"
        : round.result === 3
          ? "bg-yellow-400"
          : "bg-gray-500";

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await claim(roundId);
      onClaimed();
    } catch (err: any) {
      console.error("Claim failed:", err);
      alert("Claim failed: " + (err.message || err));
    } finally {
      setClaiming(false);
    }
  };

  const userBetUp = userBet ? Number(userBet.upAmount) / 1_000_000_000 : 0;
  const userBetDown = userBet
    ? Number(userBet.downAmount) / 1_000_000_000
    : 0;

  // Color-coded left border
  const borderClass = canClaim
    ? "border-l-2 border-l-sol-teal"
    : isLoss
      ? "border-l-2 border-l-red-500/30"
      : "";

  return (
    <div
      className={`glass-surface py-2.5 px-3 rounded-lg text-sm space-y-1 animate-slide-up ${borderClass}`}
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 font-mono">#{roundId}</span>
          {isSettled && (
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${resultDotColor}`} />
              <span className={`font-bold ${resultColor}`}>
                {RoundResultLabels[round.result]}
              </span>
            </span>
          )}
          {!isSettled && (
            <span className="text-gray-500">
              {round.status === 0
                ? "Open"
                : round.status === 1
                  ? "Locked"
                  : ""}
            </span>
          )}
        </div>

        {/* Claim button or status */}
        {canClaim && (
          <button
            onClick={handleClaim}
            disabled={claiming}
            className="claim-shimmer px-3 py-1 text-xs rounded-md bg-sol-gradient font-semibold transition-all hover:shadow-sol active:scale-95 disabled:opacity-50"
          >
            {claiming ? (
              <span className="flex items-center gap-1">
                <span className="css-spinner !w-3 !h-3" />
              </span>
            ) : (
              `Claim ${payoutDisplay.toFixed(2)}`
            )}
          </button>
        )}
        {isLoss && (
          <span className="text-xs text-red-400/60">Lost</span>
        )}
        {isSettled && !userBet && (
          <span className="text-xs text-gray-600">{"\u2014"}</span>
        )}
      </div>

      {/* User's bet detail row */}
      {userBet && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Bet:</span>
          {userBetUp > 0 && (
            <span className="text-up">{userBetUp.toFixed(2)} UP</span>
          )}
          {userBetUp > 0 && userBetDown > 0 && <span>+</span>}
          {userBetDown > 0 && (
            <span className="text-down">{userBetDown.toFixed(2)} DOWN</span>
          )}
          {isSettled && payout > 0 && (
            <>
              <span className="text-gray-600">|</span>
              <span className="text-sol-teal font-medium">
                +{payoutDisplay.toFixed(2)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

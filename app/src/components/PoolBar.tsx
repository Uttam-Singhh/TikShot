"use client";

import { RoundAccount } from "@/lib/program";

interface Props {
  round: RoundAccount;
}

export default function PoolBar({ round }: Props) {
  const totalUp = Number(round.totalUp);
  const totalDown = Number(round.totalDown);
  const total = totalUp + totalDown;

  const upPct = total > 0 ? (totalUp / total) * 100 : 50;
  const downPct = total > 0 ? (totalDown / total) * 100 : 50;

  const upMultiplier = totalUp > 0 ? total / totalUp : 0;
  const downMultiplier = totalDown > 0 ? total / totalDown : 0;

  const formatAmount = (amt: number) => {
    return (amt / 1_000_000_000).toFixed(1);
  };

  return (
    <div className="glass gradient-border rounded-xl p-4 space-y-3">
      {/* Labels row */}
      <div className="flex justify-between text-sm">
        <span className="text-up font-semibold">
          UP {formatAmount(totalUp)}
        </span>
        <span className="text-gray-400 text-xs">
          {total > 0 ? `Pool: ${formatAmount(total)}` : "No bets yet"}
        </span>
        <span className="text-down font-semibold">
          {formatAmount(totalDown)} DOWN
        </span>
      </div>

      {/* Animated bar */}
      <div className="flex h-5 rounded-full overflow-hidden bg-surface/50 relative">
        <div
          className="bg-gradient-to-r from-up/80 to-up pool-bar-up rounded-l-full origin-left animate-bar-fill"
          style={{ width: `${upPct}%` }}
        />
        {/* Solana gradient divider */}
        <div className="w-1 bg-sol-gradient-h flex-shrink-0 shadow-sol" />
        <div
          className="bg-gradient-to-l from-down/80 to-down pool-bar-down rounded-r-full origin-right animate-bar-fill"
          style={{ width: `${downPct}%` }}
        />
      </div>

      {/* Percentage + multiplier row */}
      <div className="flex justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{upPct.toFixed(0)}%</span>
          {total > 0 && upMultiplier > 0 && (
            <span className="text-up/70 font-mono">
              {upMultiplier.toFixed(1)}x
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && downMultiplier > 0 && (
            <span className="text-down/70 font-mono">
              {downMultiplier.toFixed(1)}x
            </span>
          )}
          <span className="text-gray-500">{downPct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

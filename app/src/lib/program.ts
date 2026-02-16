import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, GAME_SEED, ROUND_SEED, PLAYER_SEED } from "./constants";

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------
export function getGamePDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([GAME_SEED], PROGRAM_ID);
  return pda;
}

export function getRoundPDA(roundId: number | bigint): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(roundId));
  const [pda] = PublicKey.findProgramAddressSync([ROUND_SEED, buf], PROGRAM_ID);
  return pda;
}

export function getPlayerPDA(wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [PLAYER_SEED, wallet.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

// ---------------------------------------------------------------------------
// Round status / result decoding
// ---------------------------------------------------------------------------
export const RoundStatusLabels: Record<number, string> = {
  0: "Open",
  1: "Locked",
  2: "Settled",
};

export const RoundResultLabels: Record<number, string> = {
  0: "Pending",
  1: "Up",
  2: "Down",
  3: "Tie",
};

// ---------------------------------------------------------------------------
// IDL type — loaded at runtime
// ---------------------------------------------------------------------------
export type RoundAccount = {
  roundId: bigint;
  startTs: bigint;
  lockTs: bigint;
  endTs: bigint;
  startPrice: bigint;
  endPrice: bigint;
  priceExpo: number;
  totalUp: bigint;
  totalDown: bigint;
  status: number;
  result: number;
  numBets: number;
  bets: Array<{
    player: PublicKey;
    upAmount: bigint;
    downAmount: bigint;
  }>;
};

export type GameAccount = {
  authority: PublicKey;
  feeBps: number;
  roundCount: bigint;
};

export type PlayerAccount = {
  owner: PublicKey;
  credits: bigint;
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

export function formatCredits(credits: bigint | number): string {
  return (Number(credits) / 1_000_000_000).toFixed(2);
}

export function findPlayerBet(
  round: RoundAccount,
  wallet: PublicKey
): { upAmount: bigint; downAmount: bigint } | null {
  const walletStr = wallet.toBase58();
  for (let i = 0; i < round.numBets; i++) {
    if (round.bets[i].player.toBase58() === walletStr) {
      return round.bets[i];
    }
  }
  return null;
}

export function calculatePayout(
  round: RoundAccount,
  bet: { upAmount: bigint; downAmount: bigint },
  feeBps: number
): number {
  const totalPool = Number(round.totalUp) + Number(round.totalDown);

  // Tie: full refund, no fee
  if (round.result === 3) {
    return Number(bet.upAmount) + Number(bet.downAmount);
  }

  // Up wins
  if (round.result === 1) {
    if (Number(bet.upAmount) === 0) return 0;
    const fee = Math.floor((totalPool * feeBps) / 10_000);
    const poolAfterFee = totalPool - fee;
    return Math.floor(
      (poolAfterFee * Number(bet.upAmount)) / Number(round.totalUp)
    );
  }

  // Down wins
  if (round.result === 2) {
    if (Number(bet.downAmount) === 0) return 0;
    const fee = Math.floor((totalPool * feeBps) / 10_000);
    const poolAfterFee = totalPool - fee;
    return Math.floor(
      (poolAfterFee * Number(bet.downAmount)) / Number(round.totalDown)
    );
  }

  return 0;
}

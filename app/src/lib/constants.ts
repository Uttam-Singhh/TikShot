import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ||
    "33MmuiaGXz9yngFx7kLTEWPmqaALZirSwsNeFF5DJDxX"
);

export const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";

export const ER_RPC =
  process.env.NEXT_PUBLIC_ER_RPC || "https://devnet.magicblock.app";

export const MAGIC_ROUTER_RPC =
  process.env.NEXT_PUBLIC_MAGIC_ROUTER_RPC ||
  "https://devnet-router.magicblock.app";

export const PYTH_PRICE_ACCOUNT = new PublicKey(
  process.env.NEXT_PUBLIC_PYTH_PRICE_ACCOUNT ||
    "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
);

export const GAME_SEED = Buffer.from("game");
export const ROUND_SEED = Buffer.from("round");
export const PLAYER_SEED = Buffer.from("player");

export const ROUND_DURATION = 120; // seconds (2 minutes)
export const POLL_INTERVAL = 500; // ms

// Pyth Hermes SSE streaming
export const PYTH_SOL_USD_FEED_HEX =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
export const PYTH_HERMES_SSE_URL = `https://hermes.pyth.network/v2/updates/price/stream?ids[]=${PYTH_SOL_USD_FEED_HEX}&parsed=true&allow_unordered=true&benchmarks_only=false`;

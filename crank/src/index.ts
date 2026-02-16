import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { HermesClient } from "@pythnetwork/hermes-client";
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const ER_RPC = process.env.ER_RPC || "https://devnet.magicblock.app";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "33MmuiaGXz9yngFx7kLTEWPmqaALZirSwsNeFF5DJDxX"
);

const SOL_USD_FEED_ID =
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

const ROUND_SEED = Buffer.from("round");
const GAME_SEED = Buffer.from("game");

const BETTING_WINDOW_MS = 115_000; // 1m55s betting window (2min round - 5s lock)
const LOCK_DURATION_MS = 5_000; // 5s lock period
const COMMIT_WAIT_MS = 2_000;

// ---------------------------------------------------------------------------
// Load authority keypair
// ---------------------------------------------------------------------------
function loadKeypair(): Keypair {
  const walletPath =
    process.env.ANCHOR_WALLET ||
    path.join(
      process.env.HOME || "~",
      ".config",
      "solana",
      "id.json"
    );
  const raw = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ---------------------------------------------------------------------------
// PDA helpers
// ---------------------------------------------------------------------------
function getGamePDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [GAME_SEED],
    PROGRAM_ID
  );
  return pda;
}

function getRoundPDA(roundId: number | bigint): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(roundId));
  const [pda] = PublicKey.findProgramAddressSync(
    [ROUND_SEED, buf],
    PROGRAM_ID
  );
  return pda;
}

// ---------------------------------------------------------------------------
// IDL loading
// ---------------------------------------------------------------------------
async function loadIDL(): Promise<any> {
  const idlPaths = [
    path.join(__dirname, "../../target/idl/tikshot.json"),
    path.join(__dirname, "../idl/tikshot.json"),
  ];

  for (const idlPath of idlPaths) {
    try {
      return JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    } catch {
      continue;
    }
  }

  throw new Error(
    "IDL not found. Run `anchor build` first to generate the IDL."
  );
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Fetch fresh Pyth price, post it on-chain, call consumer, then close account
// Uses low-level buildPostPriceUpdateAtomicInstructions to avoid jito-ts dep
// ---------------------------------------------------------------------------
async function postPriceAndExecute(
  pythSolanaReceiver: PythSolanaReceiver,
  hermesClient: HermesClient,
  connection: Connection,
  wallet: anchor.Wallet,
  instructionBuilder: (priceUpdateAccount: PublicKey) => Promise<anchor.web3.TransactionInstruction>,
): Promise<void> {
  // 1. Fetch fresh price VAA from Hermes
  const priceUpdates = await hermesClient.getLatestPriceUpdates(
    [SOL_USD_FEED_ID],
    { encoding: "base64" }
  );
  const priceUpdateData: string[] = priceUpdates.binary.data;

  // 2. Build post instructions using atomic (partially verified) approach
  const {
    postInstructions,
    priceFeedIdToPriceUpdateAccount,
    closeInstructions,
  } = await pythSolanaReceiver.buildPostPriceUpdateAtomicInstructions(priceUpdateData);

  const priceUpdateAccount = priceFeedIdToPriceUpdateAccount[SOL_USD_FEED_ID];

  // Collect ephemeral signers from post instructions
  const ephemeralSigners: Keypair[] = [];
  for (const p of postInstructions) {
    for (const s of p.signers) {
      ephemeralSigners.push(s as Keypair);
    }
  }

  // 3. TX1: Post the price update on-chain (creates the PriceUpdateV2 account)
  // No compute budget instructions — the atomic post is already near the tx size limit
  {
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    for (const p of postInstructions) {
      tx.add(p.instruction);
    }
    tx.sign(wallet.payer, ...ephemeralSigners);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  Price posted. Sig: ${sig.slice(0, 20)}...`);
  }

  // 4. TX2: Call the consumer instruction (reads the price account)
  {
    const consumerIx = await instructionBuilder(priceUpdateAccount);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    );
    tx.add(consumerIx);
    tx.sign(wallet.payer);
    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(sig, "confirmed");
    console.log(`  Instruction executed. Sig: ${sig.slice(0, 20)}...`);
  }

  // 5. TX3: Close the price update account to reclaim rent
  if (closeInstructions.length > 0) {
    try {
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      for (const c of closeInstructions) {
        tx.add(c.instruction);
      }
      tx.sign(wallet.payer);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");
    } catch {
      // Non-critical: close failed, rent is lost but round continues
    }
  }
}

// ---------------------------------------------------------------------------
// Main crank loop
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== TikShot Crank Starting ===");
  console.log(`Base RPC: ${SOLANA_RPC}`);
  console.log(`ER RPC:   ${ER_RPC}`);
  console.log(`Program:  ${PROGRAM_ID.toBase58()}`);

  const authority = loadKeypair();
  console.log(`Authority: ${authority.publicKey.toBase58()}`);

  const baseConnection = new Connection(SOLANA_RPC, "confirmed");
  const erConnection = new Connection(ER_RPC, "confirmed");

  const idl = await loadIDL();

  // Set up Anchor providers for both endpoints
  const baseWallet = new anchor.Wallet(authority);
  const baseProvider = new anchor.AnchorProvider(baseConnection, baseWallet, {
    commitment: "confirmed",
  });
  const erProvider = new anchor.AnchorProvider(erConnection, baseWallet, {
    commitment: "confirmed",
  });

  const baseProgram = new anchor.Program(idl, baseProvider);
  const erProgram = new anchor.Program(idl, erProvider);

  // Set up Pyth clients
  const hermesClient = new HermesClient("https://hermes.pyth.network", {});
  const pythSolanaReceiver = new PythSolanaReceiver({
    connection: baseConnection,
    wallet: baseWallet,
  });

  const gamePDA = getGamePDA();
  console.log(`Game PDA: ${gamePDA.toBase58()}`);

  // Check if game is initialized
  try {
    const gameAccount = await (baseProgram.account as any).game.fetch(gamePDA);
    console.log(
      `Game initialized. Current round count: ${gameAccount.roundCount}`
    );
  } catch {
    console.log("Game not initialized. Initializing with 1% fee...");
    await baseProgram.methods
      .initGame(100) // 1% fee = 100 bps
      .accounts({
        game: gamePDA,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    console.log("Game initialized!");
  }

  // Main loop
  while (true) {
    try {
      // Fetch current round count from game
      const gameAccount = await (baseProgram.account as any).game.fetch(gamePDA);
      const roundId = gameAccount.roundCount as number;
      const roundPDA = getRoundPDA(roundId);

      console.log(`\n--- Round ${roundId} ---`);

      // 1. Start round on base layer with FRESH Pyth price
      console.log("Fetching fresh Pyth price & starting round...");
      await postPriceAndExecute(
        pythSolanaReceiver,
        hermesClient,
        baseConnection,
        baseWallet,
        async (priceUpdateAccount: PublicKey) => {
          return await baseProgram.methods
            .startRound()
            .accounts({
              game: gamePDA,
              round: roundPDA,
              priceUpdate: priceUpdateAccount,
              authority: authority.publicKey,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .instruction();
        }
      );
      console.log(`Round ${roundId} started. PDA: ${roundPDA.toBase58()}`);

      // 2. Delegate round to ER
      console.log("Delegating round to ER...");
      await baseProgram.methods
        .delegateRound()
        .accounts({
          payer: authority.publicKey,
          round: roundPDA,
        })
        .rpc();
      console.log("Round delegated.");

      // 3. Betting window
      console.log(`Betting open for ${BETTING_WINDOW_MS / 1000}s...`);
      await sleep(BETTING_WINDOW_MS);

      // 4. Lock round on ER
      console.log("Locking round...");
      await erProgram.methods
        .lockRound()
        .accounts({
          round: roundPDA,
          game: gamePDA,
          authority: authority.publicKey,
        })
        .rpc();
      console.log("Round locked.");

      // 5. Wait for lock period
      await sleep(LOCK_DURATION_MS);

      // 6. Commit round back to base layer
      console.log("Committing round to base layer...");
      await erProgram.methods
        .commitRound()
        .accounts({
          payer: authority.publicKey,
          round: roundPDA,
        })
        .rpc();
      console.log("Round committed.");

      // 7. Wait for commitment finality
      await sleep(COMMIT_WAIT_MS);

      // 8. Settle round on base layer with FRESH Pyth price
      console.log("Fetching fresh Pyth price & settling round...");
      await postPriceAndExecute(
        pythSolanaReceiver,
        hermesClient,
        baseConnection,
        baseWallet,
        async (priceUpdateAccount: PublicKey) => {
          return await baseProgram.methods
            .settleRound()
            .accounts({
              round: roundPDA,
              game: gamePDA,
              priceUpdate: priceUpdateAccount,
              authority: authority.publicKey,
            })
            .instruction();
        }
      );

      // Read settled round data
      const roundData = await (baseProgram.account as any).round.fetch(roundPDA);
      const resultMap: Record<number, string> = {
        0: "PENDING",
        1: "UP",
        2: "DOWN",
        3: "TIE",
      };
      console.log(
        `Round ${roundId} settled! ` +
          `Start: ${roundData.startPrice} | End: ${roundData.endPrice} | ` +
          `Result: ${resultMap[roundData.result as number] || "UNKNOWN"} | ` +
          `Pool: ${roundData.totalUp} UP / ${roundData.totalDown} DOWN`
      );
    } catch (err: any) {
      console.error("Crank error:", err.message || err);
      if (err.logs) {
        console.error("Logs:", err.logs.join("\n"));
      }
      console.log("Retrying in 5 seconds...");
      await sleep(5_000);
    }
  }
}

main().catch(console.error);

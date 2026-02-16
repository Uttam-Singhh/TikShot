"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  PROGRAM_ID,
  ER_RPC,
  PYTH_PRICE_ACCOUNT,
  POLL_INTERVAL,
  PYTH_HERMES_SSE_URL,
} from "./constants";
import {
  getGamePDA,
  getRoundPDA,
  getPlayerPDA,
  GameAccount,
  RoundAccount,
  PlayerAccount,
} from "./program";

// We'll load the IDL dynamically — for now use a placeholder.
// After `anchor build`, copy target/idl/tikshot.json to app/public/tikshot.json
let cachedIdl: any = null;

async function fetchIdl(): Promise<any> {
  if (cachedIdl) return cachedIdl;
  const resp = await fetch("/tikshot.json");
  cachedIdl = await resp.json();
  return cachedIdl;
}

function useProgram(connection: Connection) {
  const wallet = useWallet();
  const [program, setProgram] = useState<anchor.Program | null>(null);

  useEffect(() => {
    if (!wallet.publicKey) return;

    fetchIdl().then((idl) => {
      const provider = new anchor.AnchorProvider(
        connection,
        wallet as any,
        { commitment: "confirmed" }
      );
      const prog = new anchor.Program(idl, provider);
      setProgram(prog);
    });
  }, [connection, wallet, wallet.publicKey]);

  return program;
}

// ---------------------------------------------------------------------------
// useGame — fetches Game account
// ---------------------------------------------------------------------------
export function useGame() {
  const { connection } = useConnection();
  const program = useProgram(connection);
  const [game, setGame] = useState<GameAccount | null>(null);

  useEffect(() => {
    if (!program) return;
    const gamePDA = getGamePDA();

    const load = async () => {
      try {
        const data = await program.account.game.fetch(gamePDA);
        setGame(data as any);
      } catch {
        setGame(null);
      }
    };

    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [program]);

  return game;
}

// ---------------------------------------------------------------------------
// useRound — polls current round from ER
// ---------------------------------------------------------------------------
export function useRound(roundId: number | null) {
  const { connection } = useConnection();
  const erConnection = useRef(new Connection(ER_RPC, "confirmed"));
  const program = useProgram(connection);
  const erProgram = useProgram(erConnection.current);
  const [round, setRound] = useState<RoundAccount | null>(null);

  useEffect(() => {
    if (!program || roundId === null || roundId < 0) return;

    const roundPDA = getRoundPDA(roundId);

    const poll = async () => {
      try {
        // Try ER first (for live updates during open round)
        const data = await (erProgram || program).account.round.fetch(roundPDA);
        setRound(data as any);
      } catch {
        try {
          // Fallback to base layer
          const data = await program.account.round.fetch(roundPDA);
          setRound(data as any);
        } catch {
          setRound(null);
        }
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [program, erProgram, roundId]);

  return round;
}

// ---------------------------------------------------------------------------
// usePlayer — fetches Player account
// ---------------------------------------------------------------------------
export function usePlayer() {
  const { connection } = useConnection();
  const erConnection = useRef(new Connection(ER_RPC, "confirmed"));
  const wallet = useWallet();
  const program = useProgram(connection);
  const erProgram = useProgram(erConnection.current);
  const [player, setPlayer] = useState<PlayerAccount | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const optimisticUntilRef = useRef(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Optimistically subtract credits locally (instant UI feedback)
  // Suppresses poll overwrites for 5s so the deduction sticks
  const deductCredits = useCallback((amount: number) => {
    optimisticUntilRef.current = Date.now() + 5000;
    setPlayer((prev) => {
      if (!prev) return prev;
      const current = BigInt(prev.credits as any);
      const newCredits = current - BigInt(amount);
      return { ...prev, credits: newCredits < 0n ? 0n : newCredits };
    });
  }, []);

  useEffect(() => {
    if (!program || !wallet.publicKey) return;

    const playerPDA = getPlayerPDA(wallet.publicKey);

    const load = async () => {
      // Skip poll while optimistic update is active
      if (Date.now() < optimisticUntilRef.current) return;

      try {
        // Try ER first (has latest credits during active round)
        const data = await (erProgram || program).account.player.fetch(playerPDA);
        setPlayer(data as any);
      } catch {
        try {
          // Fallback to base layer
          const data = await program.account.player.fetch(playerPDA);
          setPlayer(data as any);
        } catch {
          setPlayer(null);
        }
      }
    };

    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [program, erProgram, wallet.publicKey, refreshKey]);

  return { player, refresh, deductCredits };
}

// ---------------------------------------------------------------------------
// useRegisterPlayer
// ---------------------------------------------------------------------------
export function useRegisterPlayer() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useProgram(connection);

  return useCallback(async () => {
    if (!program || !wallet.publicKey) throw new Error("Not connected");

    const playerPDA = getPlayerPDA(wallet.publicKey);

    await program.methods
      .registerPlayer()
      .accounts({
        player: playerPDA,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }, [program, wallet.publicKey]);
}

// ---------------------------------------------------------------------------
// usePlaceBet — sends bet tx to ER endpoint
// ---------------------------------------------------------------------------
export function usePlaceBet() {
  const wallet = useWallet();
  const erConnection = useRef(new Connection(ER_RPC, "confirmed"));

  return useCallback(
    async (
      roundId: number,
      direction: "up" | "down",
      amount: number
    ) => {
      if (!wallet.publicKey) throw new Error("Not connected");

      const idl = await fetchIdl();
      const provider = new anchor.AnchorProvider(
        erConnection.current,
        wallet as any,
        { commitment: "confirmed" }
      );
      const program = new anchor.Program(idl, provider);

      const roundPDA = getRoundPDA(roundId);
      const playerPDA = getPlayerPDA(wallet.publicKey);

      const directionArg = direction === "up" ? { up: {} } : { down: {} };
      const amountBN = new anchor.BN(amount);

      await program.methods
        .placeBet(directionArg, amountBN)
        .accounts({
          round: roundPDA,
          player: playerPDA,
          payer: wallet.publicKey,
        })
        .rpc();
    },
    [wallet]
  );
}

// ---------------------------------------------------------------------------
// useSettledRounds — fetches past rounds for history + claiming
// ---------------------------------------------------------------------------
export function useSettledRounds(
  currentRoundId: number | null,
  count: number = 5
) {
  const { connection } = useConnection();
  const program = useProgram(connection);
  const [rounds, setRounds] = useState<
    Array<{ id: number; data: RoundAccount }>
  >([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!program || currentRoundId === null || currentRoundId < 1) {
      setRounds([]);
      return;
    }

    const fetchRounds = async () => {
      const ids: number[] = [];
      for (
        let i = currentRoundId - 1;
        i >= Math.max(0, currentRoundId - count);
        i--
      ) {
        ids.push(i);
      }

      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const roundPDA = getRoundPDA(id);
          const data = await program.account.round.fetch(roundPDA);
          return { id, data: data as any as RoundAccount };
        })
      );

      setRounds(
        results
          .filter(
            (
              r
            ): r is PromiseFulfilledResult<{
              id: number;
              data: RoundAccount;
            }> => r.status === "fulfilled"
          )
          .map((r) => r.value)
      );
    };

    fetchRounds();
    const interval = setInterval(fetchRounds, 5000);
    return () => clearInterval(interval);
  }, [program, currentRoundId, count, refreshKey]);

  return { rounds, refresh };
}

// ---------------------------------------------------------------------------
// useClaim — claims winnings on base layer
// ---------------------------------------------------------------------------
export function useClaim() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const program = useProgram(connection);

  return useCallback(
    async (roundId: number) => {
      if (!program || !wallet.publicKey) throw new Error("Not connected");

      const roundPDA = getRoundPDA(roundId);
      const playerPDA = getPlayerPDA(wallet.publicKey);
      const gamePDA = getGamePDA();

      await program.methods
        .claim(new anchor.BN(roundId))
        .accounts({
          round: roundPDA,
          player: playerPDA,
          game: gamePDA,
          payer: wallet.publicKey,
        })
        .rpc();
    },
    [program, wallet.publicKey]
  );
}

// ---------------------------------------------------------------------------
// usePythStream — live SOL/USD price via Pyth Hermes SSE
// ---------------------------------------------------------------------------
export interface PricePoint {
  time: number;
  price: number;
}

type StreamStatus = "connecting" | "connected" | "disconnected";

const MAX_POINTS = 90;
const RECONNECT_DELAY = 2000;

export function usePythStream() {
  const bufferRef = useRef<PricePoint[]>([]);
  const rafRef = useRef<number>(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const [points, setPoints] = useState<PricePoint[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!mountedRef.current) return;
      const snapshot = bufferRef.current.slice();
      setPoints(snapshot);
      setCurrentPrice(snapshot.length > 0 ? snapshot[snapshot.length - 1].price : null);
    });
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const es = new EventSource(PYTH_HERMES_SSE_URL);
    esRef.current = es;
    setStatus("connecting");

    es.onopen = () => {
      if (mountedRef.current) setStatus("connected");
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const parsed = data.parsed?.[0]?.price;
        if (!parsed) return;

        const price = Number(parsed.price) * Math.pow(10, Number(parsed.expo));
        const point: PricePoint = { time: Date.now(), price };

        const buf = bufferRef.current;
        buf.push(point);
        if (buf.length > MAX_POINTS) {
          bufferRef.current = buf.slice(buf.length - MAX_POINTS);
        }
        scheduleUpdate();
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      if (!mountedRef.current) return;
      setStatus("disconnected");
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY);
    };
  }, [scheduleUpdate]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  return { points, currentPrice, status };
}

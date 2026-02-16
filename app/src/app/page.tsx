"use client";

import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with wallet adapter
const GameBoard = dynamic(() => import("@/components/GameBoard"), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <GameBoard />
    </main>
  );
}

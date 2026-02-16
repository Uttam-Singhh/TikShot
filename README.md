# TikShot

> **[Live App](https://tikshot-eight.vercel.app)**

Parimutuel betting game on SOL/USD price direction with 2-minute rounds. Built on Solana with [MagicBlock Ephemeral Rollups](https://www.magicblock.gg/) for high-throughput betting and [Pyth Network](https://pyth.network/) for real-time price feeds.

## How It Works

1. **A round opens** — the crank posts the current SOL/USD price via Pyth and starts a 2-minute countdown
2. **Players bet UP or DOWN** — place bets with play credits during the open window
3. **Round locks** — betting closes, the round awaits settlement
4. **Round settles** — the end price is fetched, result is computed (UP / DOWN / TIE)
5. **Winners claim** — payouts are distributed proportionally from the losing pool (minus a fee)

## Architecture

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  Next.js 14 │◄───────►│  Solana Devnet   │◄───────►│    Crank     │
│  Frontend   │         │  (Base Layer)    │         │ Orchestrator │
└──────┬──────┘         └────────┬─────────┘         └──────┬──────┘
       │                         │                          │
       │    ┌────────────────────┴────────────────┐         │
       │    │   MagicBlock Ephemeral Rollups (ER) │         │
       └───►│   devnet.magicblock.app             │◄────────┘
            └─────────────────────────────────────┘
```

| Layer | Operations |
|-------|------------|
| **Base Layer** (Solana Devnet) | `start_round`, `delegate_round`, `settle_round`, `claim` |
| **Ephemeral Rollups** (MagicBlock) | `place_bet`, `lock_round`, `commit_round` |

## MagicBlock Ephemeral Rollups

TikShot uses MagicBlock ER to move high-frequency betting operations off the base layer while maintaining full security through eventual settlement.

### Why Ephemeral Rollups?

- **Speed** — bets confirm in sub-second on ER vs. waiting for Solana slots
- **Throughput** — multiple concurrent bets without network congestion
- **Cost** — lower transaction fees during the betting phase
- **Security** — all state commits back to Solana base layer each round

### Round Lifecycle with ER

```
Base Layer                    Ephemeral Rollups
──────────                    ─────────────────
start_round()
     │
delegate_round()  ──────►  Round PDA now writable on ER
                                    │
                              place_bet() × N  (115s window)
                                    │
                              lock_round()
                                    │
                              commit_round()  ──────►  State synced back
     │
settle_round()  (reads Pyth end price)
     │
claim()  (winners collect)
```

### How Delegation Works

The Anchor program uses three macros from `ephemeral-rollups-sdk`:

**`#[ephemeral]`** — placed on the program module, enables ER support:
```rust
#[ephemeral]
#[program]
pub mod tikshot { ... }
```

**`#[delegate]`** — marks an accounts struct for delegation. The `del` flag on a field generates a `delegate_{field}()` method:
```rust
#[delegate]
#[derive(Accounts)]
pub struct DelegateRound<'info> {
    #[account(mut, del, seeds = [...], bump)]
    pub round: Account<'info, Round>,
    ...
}
```

**`#[commit]`** — marks an accounts struct for committing back to base layer. Auto-injects `magic_context` and `magic_program`:
```rust
#[commit]
#[derive(Accounts)]
pub struct CommitRound<'info> {
    #[account(mut, seeds = [...], bump)]
    pub round: Account<'info, Round>,
    ...
}

// In the handler:
commit_and_undelegate_accounts(
    &ctx.accounts.payer,
    vec![&round_info],
    &ctx.accounts.magic_context,   // auto-injected
    &ctx.accounts.magic_program,   // auto-injected
)?;
```

### Hybrid State Model

| Account | Delegated to ER? | Why |
|---------|:-:|-----|
| **Round** | Yes | Transient — modified by every bet, needs high throughput |
| **Player** | No | Persistent — credits deducted only at claim time on base layer |
| **Game** | No | Config — rarely changes, stays on base layer |

### Frontend Dual-RPC Pattern

The frontend maintains two connections and tries ER first for live data:

```typescript
const baseConnection = useConnection();          // Solana Devnet
const erConnection = new Connection(ER_RPC);     // MagicBlock ER

// Reading round state: ER first (live), base layer fallback (settled)
// Placing bets: always sent to ER endpoint
```

## Tech Stack

- **Program**: Anchor 0.32 (Rust)
- **Frontend**: Next.js 14, Tailwind CSS
- **Ephemeral Rollups**: MagicBlock ER SDK 0.6.6
- **Price Oracle**: Pyth Solana Receiver SDK 1.1
- **Wallet**: Solana Wallet Adapter

## Project Structure

```
TikShot/
├── programs/tikshot/       # Anchor program (Rust)
│   └── src/lib.rs
├── app/                    # Next.js frontend
│   └── src/
│       ├── components/     # GameBoard, BetPanel, RoundTimer, etc.
│       └── lib/            # Hooks, program helpers, constants
├── crank/                  # Round orchestration service
│   └── src/index.ts
├── Anchor.toml
└── Cargo.toml
```

## Getting Started

### Prerequisites

- Rust + Anchor CLI 0.32
- Node.js 18+
- Solana CLI (configured for devnet)

### Setup

```bash
# Build the Anchor program
anchor build

# Deploy to devnet
anchor deploy

# Install frontend dependencies
cd app && npm install

# Install crank dependencies
cd ../crank && npm install

# Copy .env.example to .env and fill in your keys
cp .env.example .env
```

### Running

```bash
# Terminal 1: Start the frontend
cd app && npm run dev

# Terminal 2: Start the crank
cd crank && npm run dev
```

Open http://localhost:3000, connect your wallet, register for play credits, and start betting.

## License

MIT

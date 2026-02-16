use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2, VerificationLevel};

declare_id!("33MmuiaGXz9yngFx7kLTEWPmqaALZirSwsNeFF5DJDxX");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
pub const ROUND_DURATION: i64 = 120;       // 2 minute rounds
pub const LOCK_BEFORE_END: i64 = 5;        // lock 5s before end
pub const MAX_PRICE_AGE: u64 = 600; // 10 min — relaxed for devnet where Pyth updates are sparse
pub const MAX_PLAYERS: usize = 8;
pub const STARTING_CREDITS: u64 = 1_000_000_000_000; // 1000 credits (with 9 decimals)

pub const GAME_SEED: &[u8] = b"game";
pub const ROUND_SEED: &[u8] = b"round";
pub const PLAYER_SEED: &[u8] = b"player";

pub const SOL_USD_FEED_HEX: &str =
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------
#[ephemeral]
#[program]
pub mod tikshot {
    use super::*;

    /// Initialize the global Game account. Authority-only, called once.
    pub fn init_game(ctx: Context<InitGame>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= 10_000, TikShotError::InvalidFee);

        let game = &mut ctx.accounts.game;
        game.authority = ctx.accounts.authority.key();
        game.fee_bps = fee_bps;
        game.round_count = 0;
        Ok(())
    }

    /// Register a new player with starting play credits.
    pub fn register_player(ctx: Context<RegisterPlayer>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.owner = ctx.accounts.payer.key();
        player.credits = STARTING_CREDITS;
        Ok(())
    }

    /// Start a new round. Authority-only. Reads Pyth for start_price.
    pub fn start_round(ctx: Context<StartRound>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let round = &mut ctx.accounts.round;
        let clock = Clock::get()?;

        // Read Pyth price
        let price_update = &ctx.accounts.price_update;
        let feed_id = get_feed_id_from_hex(SOL_USD_FEED_HEX)?;
        let price_data = price_update.get_price_no_older_than_with_custom_verification_level(
            &clock,
            MAX_PRICE_AGE,
            &feed_id,
            VerificationLevel::Partial { num_signatures: 5 },
        )?;

        let round_id = game.round_count;
        game.round_count = game.round_count.checked_add(1).unwrap();

        round.round_id = round_id;
        round.start_ts = clock.unix_timestamp;
        round.lock_ts = clock.unix_timestamp + ROUND_DURATION - LOCK_BEFORE_END;
        round.end_ts = clock.unix_timestamp + ROUND_DURATION;
        round.start_price = price_data.price;
        round.price_expo = price_data.exponent;
        round.end_price = 0;
        round.total_up = 0;
        round.total_down = 0;
        round.status = RoundStatus::Open as u8;
        round.result = RoundResult::Pending as u8;
        round.num_bets = 0;
        round.bets = [BetEntry::default(); MAX_PLAYERS];

        Ok(())
    }

    /// Delegate the Round PDA to the Ephemeral Rollup validator.
    pub fn delegate_round(ctx: Context<DelegateRound>) -> Result<()> {
        ctx.accounts.delegate_round(
            &ctx.accounts.payer,
            &[
                ROUND_SEED,
                &ctx.accounts.round.round_id.to_le_bytes(),
            ],
            DelegateConfig::default(),
        )?;
        Ok(())
    }

    /// Place a bet (UP or DOWN) on the current round. Runs on ER.
    pub fn place_bet(ctx: Context<PlaceBet>, direction: Direction, amount: u64) -> Result<()> {
        let round = &mut ctx.accounts.round;
        let player = &ctx.accounts.player;
        let clock = Clock::get()?;

        // Validate round is open and within betting window
        require!(
            round.status == RoundStatus::Open as u8,
            TikShotError::RoundNotOpen
        );
        require!(
            clock.unix_timestamp < round.lock_ts,
            TikShotError::BettingClosed
        );

        // Validate player has enough credits
        require!(amount > 0, TikShotError::InvalidAmount);
        require!(player.credits >= amount, TikShotError::InsufficientCredits);

        let bettor = ctx.accounts.payer.key();

        // Find existing bet entry or create new one
        let mut found_idx: Option<usize> = None;
        for i in 0..round.num_bets as usize {
            if round.bets[i].player == bettor {
                found_idx = Some(i);
                break;
            }
        }

        let idx = match found_idx {
            Some(i) => i,
            None => {
                require!(
                    (round.num_bets as usize) < MAX_PLAYERS,
                    TikShotError::RoundFull
                );
                let i = round.num_bets as usize;
                round.bets[i].player = bettor;
                round.num_bets += 1;
                i
            }
        };

        match direction {
            Direction::Up => {
                round.bets[idx].up_amount = round.bets[idx]
                    .up_amount
                    .checked_add(amount)
                    .ok_or(TikShotError::Overflow)?;
                round.total_up = round
                    .total_up
                    .checked_add(amount)
                    .ok_or(TikShotError::Overflow)?;
            }
            Direction::Down => {
                round.bets[idx].down_amount = round.bets[idx]
                    .down_amount
                    .checked_add(amount)
                    .ok_or(TikShotError::Overflow)?;
                round.total_down = round
                    .total_down
                    .checked_add(amount)
                    .ok_or(TikShotError::Overflow)?;
            }
        }

        // Note: credits are deducted at settlement/claim time to keep Player on base layer
        // ER can read Player but not write to it (not delegated)

        Ok(())
    }

    /// Lock the round (no more bets). Authority-only. Runs on ER.
    pub fn lock_round(ctx: Context<LockRound>) -> Result<()> {
        let round = &mut ctx.accounts.round;
        require!(
            round.status == RoundStatus::Open as u8,
            TikShotError::RoundNotOpen
        );
        round.status = RoundStatus::Locked as u8;
        Ok(())
    }

    /// Commit the Round back to the base layer and undelegate.
    pub fn commit_round(ctx: Context<CommitRound>) -> Result<()> {
        let round_account_info = ctx.accounts.round.to_account_info();
        commit_and_undelegate_accounts(
            &ctx.accounts.payer,
            vec![&round_account_info],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
        )?;
        Ok(())
    }

    /// Settle the round. Authority-only. Reads Pyth for end_price.
    pub fn settle_round(ctx: Context<SettleRound>) -> Result<()> {
        let round = &mut ctx.accounts.round;
        let clock = Clock::get()?;

        require!(
            round.status == RoundStatus::Locked as u8,
            TikShotError::RoundNotLocked
        );

        // Read Pyth price for settlement
        let price_update = &ctx.accounts.price_update;
        let feed_id = get_feed_id_from_hex(SOL_USD_FEED_HEX)?;
        let price_data = price_update.get_price_no_older_than_with_custom_verification_level(
            &clock,
            MAX_PRICE_AGE,
            &feed_id,
            VerificationLevel::Partial { num_signatures: 5 },
        )?;

        round.end_price = price_data.price;
        round.status = RoundStatus::Settled as u8;

        // Determine result
        if round.end_price > round.start_price {
            round.result = RoundResult::Up as u8;
        } else if round.end_price < round.start_price {
            round.result = RoundResult::Down as u8;
        } else {
            round.result = RoundResult::Tie as u8;
        }

        Ok(())
    }

    /// Claim winnings for a settled round. Computes payout and credits player.
    pub fn claim(ctx: Context<Claim>, _round_id: u64) -> Result<()> {
        let round = &ctx.accounts.round;
        let player = &mut ctx.accounts.player;
        let game = &ctx.accounts.game;

        require!(
            round.status == RoundStatus::Settled as u8,
            TikShotError::RoundNotSettled
        );

        let claimant = ctx.accounts.payer.key();

        // Find player's bet entry
        let mut bet_idx: Option<usize> = None;
        for i in 0..round.num_bets as usize {
            if round.bets[i].player == claimant {
                bet_idx = Some(i);
                break;
            }
        }
        let idx = bet_idx.ok_or(TikShotError::NoBetFound)?;
        let bet = &round.bets[idx];

        // Check not already claimed (player set to default = claimed)
        require!(
            bet.player != Pubkey::default(),
            TikShotError::AlreadyClaimed
        );

        let total_pool = round
            .total_up
            .checked_add(round.total_down)
            .ok_or(TikShotError::Overflow)?;

        let result = RoundResult::try_from(round.result)?;

        let payout: u64 = match result {
            RoundResult::Tie => {
                // Refund everyone their total bet (no fee on ties)
                bet.up_amount
                    .checked_add(bet.down_amount)
                    .ok_or(TikShotError::Overflow)?
            }
            RoundResult::Up => {
                if bet.up_amount == 0 {
                    // Loser: lose bet on the down side, refund any up bets
                    // Actually on loss they lose their losing side bet
                    0
                } else {
                    // Winner: proportional share of total pool minus fee
                    let fee = total_pool
                        .checked_mul(game.fee_bps as u64)
                        .ok_or(TikShotError::Overflow)?
                        / 10_000;
                    let pool_after_fee = total_pool.checked_sub(fee).ok_or(TikShotError::Overflow)?;
                    // payout = (player_up / total_up) * pool_after_fee
                    (pool_after_fee as u128)
                        .checked_mul(bet.up_amount as u128)
                        .ok_or(TikShotError::Overflow)?
                        .checked_div(round.total_up as u128)
                        .ok_or(TikShotError::Overflow)? as u64
                }
            }
            RoundResult::Down => {
                if bet.down_amount == 0 {
                    0
                } else {
                    let fee = total_pool
                        .checked_mul(game.fee_bps as u64)
                        .ok_or(TikShotError::Overflow)?
                        / 10_000;
                    let pool_after_fee = total_pool.checked_sub(fee).ok_or(TikShotError::Overflow)?;
                    (pool_after_fee as u128)
                        .checked_mul(bet.down_amount as u128)
                        .ok_or(TikShotError::Overflow)?
                        .checked_div(round.total_down as u128)
                        .ok_or(TikShotError::Overflow)? as u64
                }
            }
            RoundResult::Pending => return Err(TikShotError::RoundNotSettled.into()),
        };

        // Credit player
        player.credits = player
            .credits
            .checked_add(payout)
            .ok_or(TikShotError::Overflow)?;

        // Mark as claimed by zeroing the player field in the round
        // We need a mutable reference to round for this
        let round = &mut ctx.accounts.round;
        round.bets[idx].player = Pubkey::default();

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Up,
    Down,
}

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum RoundStatus {
    Open = 0,
    Locked = 1,
    Settled = 2,
}

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum RoundResult {
    Pending = 0,
    Up = 1,
    Down = 2,
    Tie = 3,
}

impl TryFrom<u8> for RoundResult {
    type Error = anchor_lang::error::Error;

    fn try_from(value: u8) -> std::result::Result<Self, Self::Error> {
        match value {
            0 => Ok(RoundResult::Pending),
            1 => Ok(RoundResult::Up),
            2 => Ok(RoundResult::Down),
            3 => Ok(RoundResult::Tie),
            _ => Err(TikShotError::InvalidResult.into()),
        }
    }
}

// ---------------------------------------------------------------------------
// Accounts (state)
// ---------------------------------------------------------------------------
#[account]
pub struct Game {
    pub authority: Pubkey,
    pub fee_bps: u16,
    pub round_count: u64,
}

impl Game {
    pub const SIZE: usize = 8 + 32 + 2 + 8; // discriminator + pubkey + u16 + u64
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct BetEntry {
    pub player: Pubkey,
    pub up_amount: u64,
    pub down_amount: u64,
}

impl BetEntry {
    pub const SIZE: usize = 32 + 8 + 8;
}

#[account]
pub struct Round {
    pub round_id: u64,
    pub start_ts: i64,
    pub lock_ts: i64,
    pub end_ts: i64,
    pub start_price: i64,
    pub end_price: i64,
    pub price_expo: i32,
    pub total_up: u64,
    pub total_down: u64,
    pub status: u8,
    pub result: u8,
    pub num_bets: u8,
    pub bets: [BetEntry; MAX_PLAYERS],
}

impl Round {
    pub const SIZE: usize = 8  // discriminator
        + 8   // round_id
        + 8   // start_ts
        + 8   // lock_ts
        + 8   // end_ts
        + 8   // start_price
        + 8   // end_price
        + 4   // price_expo
        + 8   // total_up
        + 8   // total_down
        + 1   // status
        + 1   // result
        + 1   // num_bets
        + (BetEntry::SIZE * MAX_PLAYERS); // bets
}

#[account]
pub struct Player {
    pub owner: Pubkey,
    pub credits: u64,
}

impl Player {
    pub const SIZE: usize = 8 + 32 + 8; // discriminator + pubkey + u64
}

// ---------------------------------------------------------------------------
// Instruction Contexts
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct InitGame<'info> {
    #[account(
        init,
        payer = authority,
        space = Game::SIZE,
        seeds = [GAME_SEED],
        bump,
    )]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterPlayer<'info> {
    #[account(
        init,
        payer = payer,
        space = Player::SIZE,
        seeds = [PLAYER_SEED, payer.key().as_ref()],
        bump,
    )]
    pub player: Account<'info, Player>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartRound<'info> {
    #[account(
        mut,
        seeds = [GAME_SEED],
        bump,
        has_one = authority,
    )]
    pub game: Account<'info, Game>,

    #[account(
        init,
        payer = authority,
        space = Round::SIZE,
        seeds = [ROUND_SEED, game.round_count.to_le_bytes().as_ref()],
        bump,
    )]
    pub round: Account<'info, Round>,

    pub price_update: Account<'info, PriceUpdateV2>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        del,
        seeds = [ROUND_SEED, round.round_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub round: Account<'info, Round>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub round: Account<'info, Round>,

    /// Player account on base layer. Readable in ER (not delegated).
    pub player: Account<'info, Player>,

    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct LockRound<'info> {
    #[account(mut)]
    pub round: Account<'info, Round>,

    #[account(
        seeds = [GAME_SEED],
        bump,
        has_one = authority,
    )]
    pub game: Account<'info, Game>,

    pub authority: Signer<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitRound<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [ROUND_SEED, round.round_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub round: Account<'info, Round>,
}

#[derive(Accounts)]
pub struct SettleRound<'info> {
    #[account(mut)]
    pub round: Account<'info, Round>,

    #[account(
        seeds = [GAME_SEED],
        bump,
        has_one = authority,
    )]
    pub game: Account<'info, Game>,

    pub price_update: Account<'info, PriceUpdateV2>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct Claim<'info> {
    #[account(
        mut,
        seeds = [ROUND_SEED, round_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub round: Account<'info, Round>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, payer.key().as_ref()],
        bump,
    )]
    pub player: Account<'info, Player>,

    #[account(
        seeds = [GAME_SEED],
        bump,
    )]
    pub game: Account<'info, Game>,

    pub payer: Signer<'info>,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
#[error_code]
pub enum TikShotError {
    #[msg("Invalid fee basis points")]
    InvalidFee,
    #[msg("Round is not open for betting")]
    RoundNotOpen,
    #[msg("Betting window has closed")]
    BettingClosed,
    #[msg("Insufficient credits")]
    InsufficientCredits,
    #[msg("Invalid bet amount")]
    InvalidAmount,
    #[msg("Round is full")]
    RoundFull,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Round is not locked")]
    RoundNotLocked,
    #[msg("Round is not settled")]
    RoundNotSettled,
    #[msg("No bet found for this player")]
    NoBetFound,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Invalid result")]
    InvalidResult,
}

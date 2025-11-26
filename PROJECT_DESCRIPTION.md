# Project Description

**Deployed Frontend URL:** https://escrow-dapp-ecru.vercel.app/

**Solana Program ID:** 42BhMbKF4ogTCqcnbmfS22XBD2f2i5NehWvAC3oeif4Q

## Project Overview

### Description
A decentralized SOL escrow dApp that enables trust-minimized swaps between two parties (maker and taker).  
The maker locks a specified amount of SOL (`amount_a`) into an escrow account, defines how much SOL they expect from the taker (`amount_b_expected`), specifies a taker wallet, and sets an expiry time.  
The taker can then fund the escrow with their side of the trade. Once funded, either the taker completes the swap (both sides receive the agreed amounts) or the maker can cancel/refund under specific conditions.  
This project demonstrates secure value locking with PDAs, time-based conditions, and fund release logic without requiring a centralized intermediary.

### Key Features
- **Create Escrow**: Maker initializes an escrow with custom `escrow_id`, deposit amount, expected amount, specified taker, and expiry.
- **Fund Escrow**: Designated taker funds the escrow with the agreed `amount_b_expected`.
- **Complete Swap**: Taker finalizes the trade, transferring maker’s deposit to the taker and taker’s funds to the maker.
- **Cancel Escrow**: Maker can cancel an unfunded escrow and reclaim their deposit before it is funded.
- **Refund After Expiry**: Maker can reclaim locked funds from an unfunded escrow after the expiry timestamp.
- **Event Emission**: Events (`EscrowCreated`, `EscrowFunded`, `EscrowCompleted`, `EscrowCancelled`, `EscrowRefunded`) track the full escrow lifecycle.

### How to Use the dApp
1. **Connect Wallet**  
   Connect your Solana wallet (as the **maker** or **taker**) to the frontend.

2. **Create Escrow (Maker)**  
   - Enter:
     - `escrow_id` (any unique u64 identifier)
     - `amount_a` (SOL you deposit)
     - `amount_b_expected` (SOL you expect from the taker)
     - Taker wallet address
     - Expiry time (Unix timestamp or via UI)  
   - Click **Create Escrow** to:
     - Derive a PDA for the escrow
     - Create the on-chain `EscrowAccount`
     - Transfer `amount_a` from maker to the escrow PDA

3. **Share Escrow with Taker**  
   Share the escrow ID or link with the designated taker so they can review and fund it from the UI.

4. **Fund Escrow (Taker)**  
   - Taker connects their wallet.
   - Reviews the escrow parameters (amounts, maker, expiry).  
   - Clicks **Fund Escrow**.  
   - The program verifies:
     - Escrow is active and not funded
     - Caller matches the stored taker
     - Escrow has not expired  
   - Transfers `amount_b_expected` SOL from taker to the escrow PDA.

5. **Complete Swap (Taker)**  
   - Once funded, the taker clicks **Complete Swap**.  
   - The program:
     - Confirms escrow is active and funded
     - Confirms caller is the recorded taker
     - Sends:
       - `amount_a` from escrow PDA to taker
       - `amount_b_expected` from escrow PDA to maker
     - Marks escrow as completed and inactive.

6. **Cancel or Refund (Maker)**  
   - **Cancel Escrow**: Maker cancels an **unfunded** active escrow and reclaims `amount_a`.  
   - **Refund After Expiry**: If an escrow remains **unfunded** past expiry, maker calls **Refund After Expiry** to reclaim the deposit.

---

## Program Architecture

The escrow program is built with Anchor and uses a PDA-based account for each escrow instance.  
All core state for a trade lives inside a single `EscrowAccount` derived from the maker and `escrow_id`.

### PDA Usage

Each escrow instance is represented by a single PDA that is uniquely derived from the maker’s public key and a user-chosen `escrow_id`.  
This prevents spoofing, creates deterministic addresses for frontends/indexers, and safely holds SOL during the trade.

**PDAs Used:**
- **Escrow PDA**  
  - **Seeds:** `["escrow", maker_pubkey, escrow_id_le_bytes]`  
  - **Bump:** Stored in the account (`bump` field)  
  - **Purpose:**  
    - Holds SOL from both maker and taker during the escrow.  
    - Stores metadata: maker, taker, amounts, expiry, status flags.  
    - Serves as the source of lamport transfers back to users when swaps, cancellations, or refunds occur.

### Program Instructions

**Instructions Implemented:**

- **`create_escrow`**  
  - **Args:**  
    - `escrow_id: u64`  
    - `amount_a: u64`  
    - `amount_b_expected: u64`  
    - `expiry_ts: i64`  
    - `taker_pubkey: Pubkey`  
  - **Accounts:**  
    - `escrow` (PDA, init with seeds above)  
    - `maker` (signer, payer)  
    - `system_program`  
  - **Behavior:**  
    - Validates non-zero amounts and expiry in the future.  
    - Initializes `EscrowAccount` PDA with all fields set and `is_active = true`.  
    - Transfers `amount_a` lamports from maker to the escrow PDA.  
    - Emits `EscrowCreated`.

- **`fund_escrow`**  
  - **Args:** none  
  - **Accounts:**  
    - `escrow` (mut, has_one = maker)  
    - `taker` (signer)  
    - `maker` (unchecked)  
    - `system_program`  
  - **Behavior:**  
    - Ensures escrow is active, not already funded, and that signer is the designated taker.  
    - Ensures current time is before expiry.  
    - Transfers `amount_b_expected` lamports from taker to the escrow PDA.  
    - Marks `is_funded = true` and confirms taker.  
    - Emits `EscrowFunded`.

- **`complete_swap`**  
  - **Args:** none  
  - **Accounts:**  
    - `escrow` (mut, has_one = maker)  
    - `taker` (signer)  
    - `maker` (mut, unchecked)  
    - `system_program`  
  - **Behavior:**  
    - Requires escrow to be active and funded, and caller to match the stored taker.  
    - Transfers:
      - `amount_a` from escrow PDA to taker.  
      - `amount_b_expected` from escrow PDA to maker.  
    - Marks escrow inactive, not funded, completed, and clears the taker field.  
    - Emits `EscrowCompleted`.

- **`cancel_escrow`**  
  - **Args:** none  
  - **Accounts:**  
    - `escrow` (mut, has_one = maker)  
    - `maker` (signer)  
    - `system_program`  
  - **Behavior:**  
    - Ensures caller is maker, escrow is active, and not funded.  
    - Returns `amount_a` from escrow PDA back to maker.  
    - Sets `is_active = false`.  
    - Emits `EscrowCancelled`.

- **`refund_after_expiry`**  
  - **Args:** none  
  - **Accounts:**  
    - `escrow` (mut, has_one = maker)  
    - `maker` (signer)  
    - `system_program`  
  - **Behavior:**  
    - Ensures caller is maker, escrow is active, and not funded.  
    - Requires current time to be strictly greater than `expiry_ts`.  
    - Transfers `amount_a` from escrow PDA back to maker.  
    - Sets `is_active = false`.  
    - Emits `EscrowRefunded`.

### Account Structure

#[account]
pub struct EscrowAccount {
    pub maker: Pubkey,             // Escrow creator and deposit owner
    pub taker: Option<Pubkey>,     // Designated taker; must match signer for fund/complete
    pub escrow_id: u64,            // User-defined ID to distinguish escrows for a maker
    pub amount_a: u64,             // Maker’s deposited SOL
    pub amount_b_expected: u64,    // Taker’s required SOL to fund the escrow
    pub is_funded: bool,           // True once taker has funded the escrow
    pub is_active: bool,           // True while escrow is open
    pub is_completed: bool,        // True after a successful swap
    pub expiry_ts: i64,            // Unix timestamp for expiry
    pub bump: u8,                  // PDA bump seed
}A helper `calculate_max_space()` is implemented to compute the required account size, including discriminator, options, booleans, and padding.

---

## Testing

### Test Coverage

The program is tested using Anchor’s Mocha-based TypeScript test framework (`tests/escrow.ts`).  
Tests cover the full escrow lifecycle and time-based behaviors.

**Happy Path Tests:**
- **Create Escrow and Lock Maker Funds**  
  - Derives PDA via the same seeds as on-chain.  
  - Calls `create_escrow` and verifies:
    - Correct `maker`, `taker`, `amount_a`, `amount_b_expected`, `escrow_id`.  
    - Flags: `is_active = true`, `is_funded = false`.  
    - `bump` matches PDA derivation.
- **Fund Escrow by Taker**  
  - Calls `fund_escrow` as the designated taker.  
  - Asserts `is_funded = true` and taker is set correctly.  
  - Checks escrow PDA balance increased by `amount_b_expected`.
- **Complete Swap and Release Funds**  
  - Calls `complete_swap` as taker.  
  - Asserts:
    - `is_completed = true`, `is_active = false`, `is_funded = false`.  
    - `taker` field is cleared.  
  - Confirms that the net lamports removed from the escrow PDA equals `amount_a + amount_b_expected`.
- **Cancel Unfunded Escrow**  
  - Creates an escrow that remains unfunded.  
  - Maker calls `cancel_escrow`.  
  - Asserts escrow becomes inactive and not funded.
- **Refund After Expiry for Unfunded Escrow**  
  - Creates an escrow with a short expiry.  
  - Waits for expiry to pass.  
  - Maker calls `refund_after_expiry`.  
  - Asserts escrow is inactive and not funded.

**Unhappy Path Tests / Logic Guarantees:**
Even when not explicitly tested in all combinations, the program ensures:
- **Zero amounts are rejected** (`InvalidAmount`).  
- **Past expiry timestamps are rejected** on creation (`InvalidExpiry`).  
- **Only the specified taker can fund or complete** (`Unauthorized`, `TakerNotSet`).  
- **Incorrect state transitions fail** (e.g., trying to fund inactive or already funded escrows, or refund before expiry) with `NotActive`, `AlreadyFunded`, `NotFunded`, `NotExpired`, or `EscrowExpired`.

### Running Tests

yarn install        # install dependencies
anchor test         # build and run all escrow tests### Additional Notes for Evaluators

This project focuses on SOL-only escrow logic, using PDAs and direct lamport transfers to keep the core ideas clear.  
Key challenges included getting PDA derivation and bumps correct on both client and program, safely handling lamport arithmetic from PDAs, and designing clear state flags to prevent double-spends and invalid transitions.  
The architecture is intentionally minimal but can be extended to SPL tokens or more complex multi-party trades in future iterations.
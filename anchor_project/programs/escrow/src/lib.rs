
use anchor_lang::prelude::*;
use anchor_lang::system_program;


declare_id!("42BhMbKF4ogTCqcnbmfS22XBD2f2i5NehWvAC3oeif4Q");


#[program]
pub mod escrow {
    use super::*;

    #[allow(clippy::too_many_arguments)]
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        escrow_id: u64,
        amount_a: u64,
        amount_b_expected: u64,
        expiry_ts: i64,
        taker_pubkey: Pubkey,
    ) -> Result<()> {
       
        require!(amount_a > 0, EscrowError::InvalidAmount);
        require!(amount_b_expected > 0, EscrowError::InvalidAmount);
        require!(
            expiry_ts > Clock::get()?.unix_timestamp,
            EscrowError::InvalidExpiry
        );

        let escrow_key = ctx.accounts.escrow.key();
        let escrow_account_info = ctx.accounts.escrow.to_account_info();

        let escrow = &mut ctx.accounts.escrow;
        escrow.maker = ctx.accounts.maker.key();
        escrow.taker = Some(taker_pubkey);
        escrow.escrow_id = escrow_id;
        escrow.amount_a = amount_a;
        escrow.amount_b_expected = amount_b_expected;
        escrow.is_funded = false;
        escrow.is_active = true;
        escrow.is_completed = false;
        escrow.expiry_ts = expiry_ts;
        escrow.bump = ctx.bumps.escrow;

        let transfer_ix = system_program::Transfer {
            from: ctx.accounts.maker.to_account_info(),
            to: escrow_account_info,
        };
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                transfer_ix,
            ),
            amount_a,
        )?;

        emit!(EscrowCreated {
            escrow: escrow_key,
            maker: escrow.maker,
            escrow_id,
            amount_a,
            amount_b_expected,
            expiry_ts,
            ts: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>) -> Result<()> {
      
        let escrow_key = ctx.accounts.escrow.key();
        let escrow_account_info = ctx.accounts.escrow.to_account_info();
        let escrow = &mut ctx.accounts.escrow;

        require!(escrow.is_active, EscrowError::NotActive);
        require!(!escrow.is_funded, EscrowError::AlreadyFunded);
        require!(escrow.taker == Some(ctx.accounts.taker.key()), EscrowError::Unauthorized);

      
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < escrow.expiry_ts,
            EscrowError::EscrowExpired
        );

       
        let amount_b = escrow.amount_b_expected;
        let transfer_ix = system_program::Transfer {
            from: ctx.accounts.taker.to_account_info(),
            to: escrow_account_info,
        };
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                transfer_ix,
            ),
            amount_b,
        )?;

        escrow.is_funded = true;
        escrow.taker = Some(ctx.accounts.taker.key());

        emit!(EscrowFunded {
            escrow: escrow_key,
            taker: ctx.accounts.taker.key(),
            amount_b,
            ts: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn complete_swap(ctx: Context<CompleteSwap>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.is_active, EscrowError::NotActive);
        require!(escrow.is_funded, EscrowError::NotFunded);

        let taker_key = escrow.taker.ok_or(EscrowError::TakerNotSet)?;
        require_keys_eq!(taker_key, ctx.accounts.taker.key(), EscrowError::Unauthorized);

        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= escrow.amount_a;
        **ctx.accounts.taker.to_account_info().try_borrow_mut_lamports()? += escrow.amount_a;

        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= escrow.amount_b_expected;
        **ctx.accounts.maker.to_account_info().try_borrow_mut_lamports()? += escrow.amount_b_expected;

        let escrow = &mut ctx.accounts.escrow;
        escrow.is_active = false;
        escrow.is_funded = false;
        escrow.is_completed = true;
        escrow.taker = None;

        emit!(EscrowCompleted {
            escrow: escrow.key(),
            maker: escrow.maker,
            taker: ctx.accounts.taker.key(),
            ts: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn cancel_escrow(ctx: Context<CancelEscrow>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require_keys_eq!(escrow.maker, ctx.accounts.maker.key(), EscrowError::Unauthorized);
        require!(escrow.is_active, EscrowError::NotActive);
        require!(!escrow.is_funded, EscrowError::AlreadyFunded);

        // Transfer SOL from escrow PDA to maker
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= escrow.amount_a;
        **ctx.accounts.maker.to_account_info().try_borrow_mut_lamports()? += escrow.amount_a;

        // Mark inactive
        let escrow = &mut ctx.accounts.escrow;
        escrow.is_active = false;

        emit!(EscrowCancelled {
            escrow: escrow.key(),
            maker: escrow.maker,
            ts: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
    pub fn refund_after_expiry(ctx: Context<RefundAfterExpiry>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require_keys_eq!(escrow.maker, ctx.accounts.maker.key(), EscrowError::Unauthorized);
        require!(escrow.is_active, EscrowError::NotActive);
        require!(!escrow.is_funded, EscrowError::AlreadyFunded);

        let now = Clock::get()?.unix_timestamp;
        require!(now > escrow.expiry_ts, EscrowError::NotExpired);

        // Transfer SOL from escrow PDA to maker
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= escrow.amount_a;
        **ctx.accounts.maker.to_account_info().try_borrow_mut_lamports()? += escrow.amount_a;

        let escrow = &mut ctx.accounts.escrow;
        escrow.is_active = false;

        emit!(EscrowRefunded {
            escrow: escrow.key(),
            maker: escrow.maker,
            ts: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}


#[derive(Accounts)]
#[instruction(escrow_id: u64)]
pub struct CreateEscrow<'info> {
   
    #[account(
        init,
        payer = maker,
        space = EscrowAccount::calculate_max_space(),
        seeds = [b"escrow", maker.key().as_ref(), &escrow_id.to_le_bytes()],
        bump
    )]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub maker: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    
    #[account(mut, has_one = maker)]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub taker: Signer<'info>,
t
    pub maker: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteSwap<'info> {
    #[account(mut, has_one = maker)]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(mut)]
    pub maker: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    #[account(mut, has_one = maker)]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub maker: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefundAfterExpiry<'info> {
    #[account(mut, has_one = maker)]
    pub escrow: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub maker: Signer<'info>,

    pub system_program: Program<'info, System>,
}


#[account]
pub struct EscrowAccount {
   
    pub maker: Pubkey,

    pub taker: Option<Pubkey>,

    pub escrow_id: u64,

    pub amount_a: u64,

    pub amount_b_expected: u64,

    pub is_funded: bool,

    pub is_active: bool,

    pub is_completed: bool,
    
    pub expiry_ts: i64,

    pub bump: u8,
}

impl EscrowAccount {
    
    pub fn calculate_max_space() -> usize {
        
        let mut size = 8; 
        size += 32; 
        size += 1 + 32;
        size += 8; 
        size += 8 + 8;
        size += 1 + 1 + 1;     
        size += 8;      
        size += 1;
        size += 128;
        size
    }
}


#[event]
pub struct EscrowCreated {
    pub escrow: Pubkey,
    pub maker: Pubkey,
    pub escrow_id: u64,
    pub amount_a: u64,
    pub amount_b_expected: u64,
    pub expiry_ts: i64,
    pub ts: i64,
}

#[event]
pub struct EscrowFunded {
    pub escrow: Pubkey,
    pub taker: Pubkey,
    pub amount_b: u64,
    pub ts: i64,
}

#[event]
pub struct EscrowCompleted {
    pub escrow: Pubkey,
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub ts: i64,
}

#[event]
pub struct EscrowCancelled {
    pub escrow: Pubkey,
    pub maker: Pubkey,
    pub ts: i64,
}

#[event]
pub struct EscrowRefunded {
    pub escrow: Pubkey,
    pub maker: Pubkey,
    pub ts: i64,
}


#[error_code]
pub enum EscrowError {
 
    #[msg("Invalid zero amount")]
    InvalidAmount,

    #[msg("Invalid expiry timestamp")]
    InvalidExpiry,

    #[msg("Escrow is not active")]
    NotActive,

    #[msg("Escrow is already funded")]
    AlreadyFunded,

    #[msg("Escrow is not funded yet")]
    NotFunded,

    #[msg("Only taker can call this")]
    Unauthorized,

    #[msg("Taker not set")]
    TakerNotSet,

    #[msg("Escrow has not expired yet")]
    NotExpired,

    #[msg("Escrow has expired and cannot be funded")]
    EscrowExpired,
}

use anchor_lang::prelude::*;

declare_id!("C6fRDhdF3v1rBNC3bHf1p5bm5vyYg5haaWhd41zMm44R");

#[program]
pub mod solana_counter {
    use super::*;

    // 初始化全局存储账户，将 count 设为 0
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter_account = &mut ctx.accounts.counter_account;
        counter_account.count = 0;
        msg!(
            "计数器初始化成功！当前 count = {}",
            counter_account.count
        );
        Ok(())
    }

    // 将 count 增加 1
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter_account = &mut ctx.accounts.counter_account;
        counter_account.count += 1;
        msg!(
            "计数器递增成功！当前 count = {}",
            counter_account.count
        );
        Ok(())
    }
}

// ----------------------------------------------------------------
// 账户结构体定义
// ----------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    // 使用 seed "global-counter" 派生 PDA 账户
    #[account(
        init,
        seeds = [b"global-counter"],
        bump,
        payer = user,
        space = 8 + 8 // 8字节 Anchor 鉴别符 + 8字节 u64 count
    )]
    pub counter_account: Account<'info, Counter>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    // 自动通过 seed 校验传入的账户是否是正确的全局计数器
    #[account(
        mut,
        seeds = [b"global-counter"],
        bump,
    )]
    pub counter_account: Account<'info, Counter>,
}

// ----------------------------------------------------------------
// 状态账户数据结构
// ----------------------------------------------------------------

#[account]
pub struct Counter {
    pub count: u64, // 存储计数值
}

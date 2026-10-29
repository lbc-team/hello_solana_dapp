import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import type { SolanaCounter } from "../target/types/solana_counter";
import { expect } from "chai";

describe("counter program", () => {
  // 读取当前环境 Provider（连接 localnet）
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = (anchor.workspace.SolanaCounter ||
    anchor.workspace.Counter) as Program<SolanaCounter>;

  // 计算全局 Counter PDA
  const [counterPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("global-counter")],
    program.programId
  );

  before(async () => {
    console.log("\n========================================================");
    console.log("Program ID :", program.programId.toBase58());
    console.log("Counter PDA:", counterPda.toBase58());
    console.log("Wallet     :", provider.wallet.publicKey.toBase58());
    console.log("========================================================\n");
  });

  it("初始化计数器 (initialize counter)", async () => {
    // 检查是否已初始化（兼容持久化本地测试环境）
    const accountInfo = await provider.connection.getAccountInfo(counterPda);

    if (!accountInfo) {
      const tx = await program.methods
        .initialize()
        .accounts({
          counterAccount: counterPda,
          user: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("Initialize Transaction Signature:", tx);

      const counterAccount = await program.account.counter.fetch(counterPda);
      console.log("Initialized Count:", counterAccount.count.toString());
      expect(counterAccount.count.toNumber()).to.equal(0);
    } else {
      console.log("计数器已存在，读取当前值验证结构");
      const counterAccount = await program.account.counter.fetch(counterPda);
      console.log("Existing Count:", counterAccount.count.toString());
      expect(counterAccount.count.toNumber()).to.be.a("number");
    }
  });

  it("递增计数器 (increment counter)", async () => {
    // 读取当前计数值
    const beforeAccount = await program.account.counter.fetch(counterPda);
    const beforeCount = beforeAccount.count.toNumber();
    console.log("递增前 Count:", beforeCount);

    // 调用 increment 指令
    const tx = await program.methods
      .increment()
      .accounts({
        counterAccount: counterPda,
      })
      .rpc();

    console.log("Increment Transaction Signature:", tx);

    // 读取并断言更新后的计数值
    const afterAccount = await program.account.counter.fetch(counterPda);
    const afterCount = afterAccount.count.toNumber();
    console.log("递增后 Count:", afterCount);

    expect(afterCount).to.equal(beforeCount + 1);
  });

  it("连续多次递增验证 (multiple increments)", async () => {
    const beforeAccount = await program.account.counter.fetch(counterPda);
    const beforeCount = beforeAccount.count.toNumber();

    // 递增第 1 次
    await program.methods
      .increment()
      .accounts({
        counterAccount: counterPda,
      })
      .preInstructions([
        anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1,
        }),
      ])
      .rpc();

    // 递增第 2 次（附带不同 microLamports，确保即便在同一 Slot 或相同 blockhash 下签名也唯一）
    await program.methods
      .increment()
      .accounts({
        counterAccount: counterPda,
      })
      .preInstructions([
        anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 2,
        }),
      ])
      .rpc();

    const afterAccount = await program.account.counter.fetch(counterPda);
    const afterCount = afterAccount.count.toNumber();
    console.log(`最终 Count: ${afterCount} (增加 2)`);

    expect(afterCount).to.equal(beforeCount + 2);
  });
});


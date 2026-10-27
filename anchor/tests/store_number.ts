import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import type { StoreNumber } from "../target/types/StoreNumber";
import { expect } from "chai";

const { BN } = anchor;

describe("store_number", () => {
  // 读取当前环境的 provider（连接 localnet 8899）
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.StoreNumber as Program<StoreNumber>;

  it("初始化并存储数字 (initialize and store number)", async () => {
    // 1. 生成存储数据的目标账户 Keypair
    const newAccount = anchor.web3.Keypair.generate();
    const testNumber = new BN(42);

    console.log("\n========================================================");
    console.log("Program ID        :", program.programId.toBase58());
    console.log("New Account Pubkey:", newAccount.publicKey.toBase58());
    console.log("========================================================\n");

    // 2. 调用合约 initialize 指令
    const tx = await program.methods
      .initialize(testNumber)
      .accounts({
        newAccount: newAccount.publicKey,
        signer: (provider.wallet as anchor.Wallet).payer.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([newAccount])
      .rpc();

    console.log("Transaction Signature:", tx);

    // 3. 读取链上数据进行断言验证
    const account = await program.account.dataStore.fetch(newAccount.publicKey);
    console.log("Fetched Account Data :", account.data.toString());

    expect(account.data.toString()).to.equal("42");
  });
});

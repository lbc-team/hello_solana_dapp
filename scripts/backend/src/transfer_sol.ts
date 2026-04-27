import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { RPC_ENDPOINT, PAYER_KEYPAIR_PATH } from "./config";
import fs from "fs";

async function main() {
  // 连接本地节点
  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  const payer1 = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR_PATH, "utf8")))
  );
  console.log("payer1 publicKey:", payer1.publicKey.toBase58());
  const payer2 = Keypair.generate();

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  const balance = await connection.getBalance(payer1.publicKey);
  console.log("账户余额:", balance / LAMPORTS_PER_SOL, "SOL");
  if (balance < 10 * LAMPORTS_PER_SOL) {
    // Airdrop 一些 SOL 以便支付手续费
    const airdropSignature = await connection.requestAirdrop(
      payer1.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction({
      signature: airdropSignature,
      blockhash,
      lastValidBlockHeight,
    });
    console.log("Airdrop 完成");
  }

  const ix = SystemProgram.transfer({
    fromPubkey: payer1.publicKey,
    toPubkey: payer2.publicKey,
    lamports: LAMPORTS_PER_SOL,
  });

  // 设置计算单元限制（默认转账需要约200-300个单元）
  const computeUnitIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 1000, // 1000 个计算单元
  });

  // 设置优先级费用（可选 - 让交易更快被处理）
  // 1 Lamport = 1,000,000 microLamports
  const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1000, // 每个计算单元支付 1000 microLamports
  });

  const tx = new Transaction()
    .add(computeUnitIx) // 先设置计算预算
    .add(priorityFeeIx) // 再设置优先级费用
    .add(ix); // 最后添加实际指令

  const simulation = await connection.simulateTransaction(tx, [payer1]);
  console.log("模拟执行结果:", simulation.value.err ? "失败" : "成功");

  // 📊 获取实际消耗的计算单元
  if (simulation.value.unitsConsumed) {
    console.log(`💻 实际消耗 CU: ${simulation.value.unitsConsumed}`);
    console.log(
      `💸 优先级费用 (CU * priorityFee): ${1000 * 1000} microLamports`
    );
  }

  const sig = await sendAndConfirmTransaction(connection, tx, [payer1]);
  console.log("Transaction Signature", sig);

  const balance2 = await connection.getBalance(payer1.publicKey);
  console.log("账户余额:", balance2 / LAMPORTS_PER_SOL, "SOL");
}

main().catch(console.error);

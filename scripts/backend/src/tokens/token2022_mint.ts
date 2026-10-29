/**
 * 演示 2: SPL Token 2022 (Token Extensions 扩展版) 发行、铸造与转账
 *
 * 流程：
 * 1. 发行 (createMint): 使用 TOKEN_2022_PROGRAM_ID 创建 Token-2022 Mint 账户
 * 2. 铸造 (mintTo): 为发送者创建 Token-2022 关联代币账户 (ATA) 并铸造 500,000 个代币
 * 3. 转账 (transferChecked): 使用 Token-2022 规范的 transferChecked 指令安全转账 30,000 个代币
 */

import "../compat";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transferChecked,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import { RPC_ENDPOINT, PAYER_KEYPAIR_PATH } from "../config";

/**
 * 加载已有密钥对或自动生成
 */
async function loadOrGeneratePayer(): Promise<Keypair> {
  if (fs.existsSync(PAYER_KEYPAIR_PATH)) {
    try {
      const secret = JSON.parse(fs.readFileSync(PAYER_KEYPAIR_PATH, "utf8"));
      return await Keypair.fromSecretKey(Uint8Array.from(secret));
    } catch {
      // fallback
    }
  }
  return await Keypair.generate();
}

export async function main() {
  console.log("========================================================");
  console.log("✨ 2. SPL Token 2022 (Token Extensions) 发行、铸造与转账演示");
  console.log("========================================================\n");

  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  console.log("🌐 连接节点:", RPC_ENDPOINT);

  const payer = await loadOrGeneratePayer();
  console.log("👤 支付者地址:", payer.publicKey.toBase58());

  // 确保支付者有足够 SOL 支付交易费用和租金
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 支付者 SOL 余额: ${Number(balance) / LAMPORTS_PER_SOL} SOL`);

  if (balance < BigInt(1 * LAMPORTS_PER_SOL)) {
    console.log("⏳ 正在请求 2 SOL 空投...");
    const airdropSig = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig, "confirmed");
    console.log("✅ 空投到账完成");
  }

  // ----------------------------------------------------
  // 步骤 1: 发行 Token-2022 代币 (创建 Mint)
  // ----------------------------------------------------
  console.log("\n--- 步骤 1: 发行 Token-2022 代币 (Create Mint) ---");
  const decimals = 9;
  const mint = await createMint(
    connection as any,
    payer as any,
    payer.publicKey as any, // Mint Authority
    payer.publicKey as any, // Freeze Authority
    decimals,
    undefined,
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("✅ Token-2022 Mint 创建成功!");
  console.log("  Mint 地址        :", mint.toBase58());
  console.log("  Decimals (精度)  :", decimals);
  console.log("  Token Program ID :", TOKEN_2022_PROGRAM_ID.toBase58());

  // ----------------------------------------------------
  // 步骤 2: 铸造 Token-2022 代币 (Mint To)
  // ----------------------------------------------------
  console.log("\n--- 步骤 2: 铸造 Token-2022 代币 (Mint To) ---");
  const payerAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    mint as any,
    payer.publicKey as any,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("✅ 支付者 Token-2022 ATA:", payerAta.address.toBase58());

  const mintTokens = 500_000n;
  const mintRawAmount = mintTokens * 10n ** BigInt(decimals);

  console.log(
    `⏳ 正在向支付者 ATA 铸造 ${mintTokens.toLocaleString()} 个 Token-2022 代币...`
  );
  const mintSig = await mintTo(
    connection as any,
    payer as any,
    mint as any,
    payerAta.address as any,
    payer as any,
    mintRawAmount,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("✅ 铸造完成! 交易签名:", mintSig);

  const payerAccountAfterMint = await getAccount(
    connection as any,
    payerAta.address as any,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  console.log(
    `📊 支付者当前代币余额: ${
      Number(payerAccountAfterMint.amount) / 10 ** decimals
    }`
  );

  // ----------------------------------------------------
  // 步骤 3: 转账 Token-2022 代币 (TransferChecked)
  // ----------------------------------------------------
  console.log("\n--- 步骤 3: 转账 Token-2022 代币 (TransferChecked) ---");
  const recipient = await Keypair.generate();
  console.log("👤 接收者钱包地址:", recipient.publicKey.toBase58());

  // 为接收者创建 Token-2022 ATA
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    mint as any,
    recipient.publicKey as any,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("✅ 接收者 Token-2022 ATA:", recipientAta.address.toBase58());

  const transferTokens = 30_000n;
  const transferRawAmount = transferTokens * 10n ** BigInt(decimals);

  console.log(
    `⏳ 正在使用 transferChecked 向接收者转账 ${transferTokens.toLocaleString()} 个代币...`
  );
  const transferSig = await transferChecked(
    connection as any,
    payer as any,
    payerAta.address as any,
    mint as any,
    recipientAta.address as any,
    payer as any,
    transferRawAmount,
    decimals,
    [],
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("✅ 转账完成! 交易签名:", transferSig);

  // 查询验证双方余额
  const payerAccountFinal = await getAccount(
    connection as any,
    payerAta.address as any,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );
  const recipientAccountFinal = await getAccount(
    connection as any,
    recipientAta.address as any,
    "confirmed",
    TOKEN_2022_PROGRAM_ID
  );

  console.log("\n================ 最终账户状态 ================");
  console.log(
    `💰 支付者剩余代币: ${
      Number(payerAccountFinal.amount) / 10 ** decimals
    } (${payerAta.address.toBase58()})`
  );
  console.log(
    `💰 接收者收到代币: ${
      Number(recipientAccountFinal.amount) / 10 ** decimals
    } (${recipientAta.address.toBase58()})`
  );
  console.log("================================================\n");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ 执行失败:", err);
    process.exit(1);
  });
}

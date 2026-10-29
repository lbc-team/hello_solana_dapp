/**
 * 演示 3: 单个 SPL Token NFT 发行、绑定 Metadata、铸造与转账
 *
 * 核心概念：
 * - Solana 上的标准 NFT 本质上是一个 decimals = 0 且 supply = 1 的 SPL Token
 * - 通过 Metaplex Token Metadata 程序 (metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s) 绑定链上元数据与 Master Edition
 *
 * 流程：
 * 1. 发行 NFT Mint: 创建 decimals = 0 的 SPL Token Mint
 * 2. 铸造 NFT: 为支付者创建 ATA 并铸造恰好 1 枚代币
 * 3. 绑定 Metadata 与 Master Edition:
 *    - 计算 Metadata PDA 与 Master Edition PDA
 *    - 发送 CreateMetadataAccountV3 与 CreateMasterEditionV3 指令
 * 4. 转账 NFT: 为接收者创建 ATA 并转账这枚 1-of-1 NFT
 */

import "../compat";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PROGRAM_ID as METAPLEX_METADATA_PROGRAM_ID,
  createCreateMetadataAccountV3Instruction,
  createCreateMasterEditionV3Instruction,
  DataV2,
} from "@metaplex-foundation/mpl-token-metadata";
import * as fs from "fs";
import { RPC_ENDPOINT, PAYER_KEYPAIR_PATH } from "../config";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  METAPLEX_METADATA_PROGRAM_ID.toBase58()
);

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
  console.log("🎨 3. 单个 SPL Token NFT 发行、绑定元数据与转账演示");
  console.log("========================================================\n");

  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  console.log("🌐 连接节点:", RPC_ENDPOINT);

  const payer = await loadOrGeneratePayer();
  console.log("👤 支付者地址:", payer.publicKey.toBase58());

  // 确保支付者有足够 SOL 支付 NFT 元数据账户的租金
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 支付者 SOL 余额: ${Number(balance) / LAMPORTS_PER_SOL} SOL`);

  if (balance < BigInt(2 * LAMPORTS_PER_SOL)) {
    console.log("⏳ 正在请求 2 SOL 空投以支付元数据存储租金...");
    const airdropSig = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig, "confirmed");
    console.log("✅ 空投到账完成");
  }

  // ----------------------------------------------------
  // 步骤 1: 发行 NFT Mint (Decimals 必须为 0)
  // ----------------------------------------------------
  console.log("\n--- 步骤 1: 发行 NFT Mint (Decimals = 0) ---");
  const mint = await createMint(
    connection as any,
    payer as any,
    payer.publicKey as any, // Mint Authority
    payer.publicKey as any, // Freeze Authority
    0, // NFT 精度固定为 0
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ NFT Mint 地址创建成功:", mint.toBase58());

  // ----------------------------------------------------
  // 步骤 2: 铸造恰好 1 枚代币到支付者 ATA
  // ----------------------------------------------------
  console.log("\n--- 步骤 2: 铸造 NFT (Supply = 1) ---");
  const payerAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    mint as any,
    payer.publicKey as any,
    false,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 支付者 NFT ATA:", payerAta.address.toBase58());

  console.log("⏳ 正在铸造 1 枚 NFT 代币...");
  const mintSig = await mintTo(
    connection as any,
    payer as any,
    mint as any,
    payerAta.address as any,
    payer as any,
    1, // 仅铸造 1 枚
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ NFT 铸造完成! 交易签名:", mintSig);

  // ----------------------------------------------------
  // 步骤 3: 绑定 Metaplex 链上 Metadata 与 Master Edition
  // ----------------------------------------------------
  console.log("\n--- 步骤 3: 绑定 Metaplex 元数据与 Master Edition ---");

  // 计算 Metadata PDA: ["metadata", program_id, mint]
  const mintBytes = Buffer.from(
    typeof (mint as any).toBytes === "function"
      ? (mint as any).toBytes()
      : (mint as any).toBuffer()
  );

  const [metadataPda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      Buffer.from(TOKEN_METADATA_PROGRAM_ID.toBytes()),
      mintBytes,
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  // 计算 Master Edition PDA: ["metadata", program_id, mint, "edition"]
  const [masterEditionPda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      Buffer.from(TOKEN_METADATA_PROGRAM_ID.toBytes()),
      mintBytes,
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );

  console.log("  Metadata PDA       :", metadataPda.toBase58());
  console.log("  Master Edition PDA :", masterEditionPda.toBase58());

  const nftData: DataV2 = {
    name: "UPChain Genesis NFT #001",
    symbol: "UPNFT",
    uri: "https://raw.githubusercontent.com/lbc-team/hello_gill/refs/heads/main/metadata/nft-metadata.json",
    sellerFeeBasisPoints: 500, // 5% 版税
    creators: [
      {
        address: payer.publicKey as any,
        verified: true,
        share: 100,
      },
    ],
    collection: null,
    uses: null,
  };

  // 构造创建元数据账户指令
  const createMetadataIx = createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPda as any,
      mint: mint as any,
      mintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      updateAuthority: payer.publicKey as any,
    },
    {
      createMetadataAccountArgsV3: {
        data: nftData,
        isMutable: true,
        collectionDetails: null,
      },
    }
  );

  // 构造创建 Master Edition 指令 (maxSupply = 0 确保其为正版不可再增发的母版)
  const createMasterEditionIx = createCreateMasterEditionV3Instruction(
    {
      edition: masterEditionPda as any,
      mint: mint as any,
      updateAuthority: payer.publicKey as any,
      mintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      metadata: metadataPda as any,
    },
    {
      createMasterEditionArgs: {
        maxSupply: 0,
      },
    }
  );

  console.log("⏳ 提交绑定 Metadata 与 Master Edition 交易...");
  const metaTx = new Transaction().add(
    createMetadataIx as any,
    createMasterEditionIx as any
  );
  const metaSig = await sendAndConfirmTransaction(connection as any, metaTx, [
    payer as any,
  ]);
  console.log("✅ 元数据与 Master Edition 绑定成功! 签名:", metaSig);
  console.log(`  名称 (Name) : ${nftData.name}`);
  console.log(`  代号 (Symbol): ${nftData.symbol}`);
  console.log(`  URI         : ${nftData.uri}`);

  // ----------------------------------------------------
  // 步骤 4: 转账 NFT 给新所有者
  // ----------------------------------------------------
  console.log("\n--- 步骤 4: 转账 NFT 给接收者 ---");
  const recipient = await Keypair.generate();
  console.log("👤 接收者钱包地址:", recipient.publicKey.toBase58());

  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    mint as any,
    recipient.publicKey as any,
    false,
    "confirmed",
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 接收者 NFT ATA:", recipientAta.address.toBase58());

  console.log("⏳ 正在转移 1 枚 NFT...");
  const transferSig = await transfer(
    connection as any,
    payer as any,
    payerAta.address as any,
    recipientAta.address as any,
    payer as any,
    1, // 转移 1 枚 NFT
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ NFT 转移成功! 交易签名:", transferSig);

  // 验证双方账户拥有情况
  const payerAcc = await getAccount(
    connection as any,
    payerAta.address as any,
    "confirmed",
    TOKEN_PROGRAM_ID
  );
  const recipientAcc = await getAccount(
    connection as any,
    recipientAta.address as any,
    "confirmed",
    TOKEN_PROGRAM_ID
  );

  console.log("\n================ 最终账户状态 ================");
  console.log(`💰 支付者持仓 NFT 数量: ${payerAcc.amount} (已转出)`);
  console.log(
    `💰 接收者持仓 NFT 数量: ${recipientAcc.amount} (${recipientAta.address.toBase58()})`
  );
  console.log("================================================\n");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ 执行失败:", err);
    process.exit(1);
  });
}

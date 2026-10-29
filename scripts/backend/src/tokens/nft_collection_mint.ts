/**
 * 演示 4: SPL Token NFT 合集 (Collection) 与单品发行、元数据绑定、合集验证与转账
 *
 * 核心概念：
 * - 在 Solana/Metaplex 标准中，合集本身也是一个特殊的 NFT (具有 collectionDetails)
 * - 子 NFT 在创建 Metadata 时声明所属的合集 mint 地址 (初始 verified = false)
 * - 只有合集的 Update Authority 签署 VerifyCollection 指令后，链上才会将 verified 置为 true，
 *   从而防止伪造该合集的假 NFT，这也是各大 Marketplace (Magic Eden, Tensor 等) 唯一认可的合集证明。
 *
 * 流程：
 * 1. 发行合集 NFT (Collection NFT):
 *    - 创建 decimals = 0 的 Mint
 *    - 铸造 1 枚，创建 Metadata (带 collectionDetails: V1) 和 Master Edition
 * 2. 发行单个子 NFT (Item NFT):
 *    - 创建 Mint 并铸造 1 枚
 *    - 创建 Metadata，将 collection 字段指向合集 Mint
 * 3. 链上合集验证 (Verify Collection):
 *    - 使用合集权限签署 VerifySizedCollectionItem 指令，将 verified 标记为 true
 * 4. 转账子 NFT:
 *    - 将已验证合集的 NFT 转移给目标接收者
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
  createVerifySizedCollectionItemInstruction,
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

/**
 * 辅助函数：计算 Metaplex Metadata PDA
 */
async function getMetadataPda(mint: any): Promise<PublicKey> {
  const mintBytes = Buffer.from(
    typeof mint.toBytes === "function" ? mint.toBytes() : mint.toBuffer()
  );
  const [pda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      Buffer.from(TOKEN_METADATA_PROGRAM_ID.toBytes()),
      mintBytes,
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * 辅助函数：计算 Metaplex Master Edition PDA
 */
async function getMasterEditionPda(mint: any): Promise<PublicKey> {
  const mintBytes = Buffer.from(
    typeof mint.toBytes === "function" ? mint.toBytes() : mint.toBuffer()
  );
  const [pda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      Buffer.from(TOKEN_METADATA_PROGRAM_ID.toBytes()),
      mintBytes,
      Buffer.from("edition"),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

export async function main() {
  console.log("========================================================");
  console.log("🏛️ 4. SPL Token NFT 合集与子单品发行、合集验证与转账演示");
  console.log("========================================================\n");

  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  console.log("🌐 连接节点:", RPC_ENDPOINT);

  const payer = await loadOrGeneratePayer();
  console.log("👤 支付者 / 合集管理者:", payer.publicKey.toBase58());

  // 确保余额充足
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 当前 SOL 余额: ${Number(balance) / LAMPORTS_PER_SOL} SOL`);

  if (balance < BigInt(3 * LAMPORTS_PER_SOL)) {
    console.log("⏳ 正在请求 3 SOL 空投用于支付合集及单品账户租金...");
    const airdropSig = await connection.requestAirdrop(
      payer.publicKey,
      3 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig, "confirmed");
    console.log("✅ 空投到账完成");
  }

  // =========================================================================
  // 阶段 1: 创建合集 NFT (Collection NFT)
  // =========================================================================
  console.log("\n--------------------------------------------------------");
  console.log("📦 阶段 1: 发行合集母版 NFT (Collection Master NFT)");
  console.log("--------------------------------------------------------");

  const colMint = await createMint(
    connection as any,
    payer as any,
    payer.publicKey as any,
    payer.publicKey as any,
    0,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 合集 Mint 创建成功:", colMint.toBase58());

  const colAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    colMint as any,
    payer.publicKey as any
  );
  await mintTo(
    connection as any,
    payer as any,
    colMint as any,
    colAta.address as any,
    payer as any,
    1
  );
  console.log("✅ 铸造 1 枚合集代币到 ATA:", colAta.address.toBase58());

  const colMetadataPda = await getMetadataPda(colMint);
  const colMasterEditionPda = await getMasterEditionPda(colMint);

  const colData: DataV2 = {
    name: "UPChain Genesis Collection",
    symbol: "UPCOL",
    uri: "https://raw.githubusercontent.com/lbc-team/hello_gill/refs/heads/main/metadata/nft-metadata.json",
    sellerFeeBasisPoints: 500,
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

  const createColMetaIx = createCreateMetadataAccountV3Instruction(
    {
      metadata: colMetadataPda as any,
      mint: colMint as any,
      mintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      updateAuthority: payer.publicKey as any,
    },
    {
      createMetadataAccountArgsV3: {
        data: colData,
        isMutable: true,
        collectionDetails: { __kind: "V1", size: 0 }, // 声明此 NFT 为合集母版
      },
    }
  );

  const createColEditionIx = createCreateMasterEditionV3Instruction(
    {
      edition: colMasterEditionPda as any,
      mint: colMint as any,
      updateAuthority: payer.publicKey as any,
      mintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      metadata: colMetadataPda as any,
    },
    { createMasterEditionArgs: { maxSupply: 0 } }
  );

  const colTx = new Transaction().add(
    createColMetaIx as any,
    createColEditionIx as any
  );
  const colSig = await sendAndConfirmTransaction(connection as any, colTx, [
    payer as any,
  ]);
  console.log("✅ 合集元数据与 Master Edition 已上链! 签名:", colSig);

  // =========================================================================
  // 阶段 2: 发行子 NFT 单品 (Item NFT)
  // =========================================================================
  console.log("\n--------------------------------------------------------");
  console.log("🖼️ 阶段 2: 发行单个子 NFT (Item NFT)");
  console.log("--------------------------------------------------------");

  const itemMint = await createMint(
    connection as any,
    payer as any,
    payer.publicKey as any,
    payer.publicKey as any,
    0,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 子单品 Mint 创建成功:", itemMint.toBase58());

  const itemAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    itemMint as any,
    payer.publicKey as any
  );
  await mintTo(
    connection as any,
    payer as any,
    itemMint as any,
    itemAta.address as any,
    payer as any,
    1
  );
  console.log("✅ 铸造 1 枚单品代币到 ATA:", itemAta.address.toBase58());

  const itemMetadataPda = await getMetadataPda(itemMint);
  const itemMasterEditionPda = await getMasterEditionPda(itemMint);

  const itemData: DataV2 = {
    name: "UPChain Origins #001",
    symbol: "UPNFT",
    uri: "https://raw.githubusercontent.com/lbc-team/hello_gill/refs/heads/main/metadata/nft-metadata.json",
    sellerFeeBasisPoints: 500,
    creators: [
      {
        address: payer.publicKey as any,
        verified: true,
        share: 100,
      },
    ],
    // 绑定目标合集 Mint（此时 verified 初始为 false，需要下一步验证）
    collection: {
      verified: false,
      key: colMint as any,
    },
    uses: null,
  };

  const createItemMetaIx = createCreateMetadataAccountV3Instruction(
    {
      metadata: itemMetadataPda as any,
      mint: itemMint as any,
      mintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      updateAuthority: payer.publicKey as any,
    },
    {
      createMetadataAccountArgsV3: {
        data: itemData,
        isMutable: true,
        collectionDetails: null,
      },
    }
  );

  const createItemEditionIx = createCreateMasterEditionV3Instruction(
    {
      edition: itemMasterEditionPda as any,
      mint: itemMint as any,
      updateAuthority: payer.publicKey as any,
      mintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      metadata: itemMetadataPda as any,
    },
    { createMasterEditionArgs: { maxSupply: 0 } }
  );

  const itemTx = new Transaction().add(
    createItemMetaIx as any,
    createItemEditionIx as any
  );
  const itemSig = await sendAndConfirmTransaction(connection as any, itemTx, [
    payer as any,
  ]);
  console.log("✅ 子单品元数据与 Master Edition 已上链! 签名:", itemSig);

  // =========================================================================
  // 阶段 3: 链上验证合集关系 (Verify Sized Collection Item)
  // =========================================================================
  console.log("\n--------------------------------------------------------");
  console.log("🔐 阶段 3: 链上验证合集 (Verify Collection)");
  console.log("--------------------------------------------------------");

  console.log(
    "⏳ 正在由合集管理权限签署验证指令 (VerifySizedCollectionItem)..."
  );
  const verifyIx = createVerifySizedCollectionItemInstruction({
    metadata: itemMetadataPda as any,
    collectionAuthority: payer.publicKey as any,
    payer: payer.publicKey as any,
    collectionMint: colMint as any,
    collection: colMetadataPda as any,
    collectionMasterEditionAccount: colMasterEditionPda as any,
  });

  const verifyTx = new Transaction().add(verifyIx as any);
  const verifySig = await sendAndConfirmTransaction(
    connection as any,
    verifyTx,
    [payer as any]
  );
  console.log("✅ 合集官方认证成功! 交易签名:", verifySig);
  console.log(
    `🔗 子 NFT (${itemMint.toBase58()}) 现已正式归属合集 (${colMint.toBase58()})`
  );

  // =========================================================================
  // 阶段 4: 转账子 NFT 给接收者
  // =========================================================================
  console.log("\n--------------------------------------------------------");
  console.log("🚀 阶段 4: 转账已认证的子 NFT 给接收者");
  console.log("--------------------------------------------------------");

  const recipient = await Keypair.generate();
  console.log("👤 接收者地址:", recipient.publicKey.toBase58());

  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    itemMint as any,
    recipient.publicKey as any
  );
  console.log("✅ 接收者 NFT ATA:", recipientAta.address.toBase58());

  console.log("⏳ 正在转移 1 枚子 NFT...");
  const transferSig = await transfer(
    connection as any,
    payer as any,
    itemAta.address as any,
    recipientAta.address as any,
    payer as any,
    1,
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 子 NFT 转移成功! 交易签名:", transferSig);

  // 查询最终状态
  const payerItemAcc = await getAccount(
    connection as any,
    itemAta.address as any,
    "confirmed",
    TOKEN_PROGRAM_ID
  );
  const recipientItemAcc = await getAccount(
    connection as any,
    recipientAta.address as any,
    "confirmed",
    TOKEN_PROGRAM_ID
  );

  console.log("\n================ 最终账户状态 ================");
  console.log(`📦 合集 Mint 地址  : ${colMint.toBase58()}`);
  console.log(`🖼️ 子 NFT Mint 地址: ${itemMint.toBase58()}`);
  console.log(`💰 支付者持仓数量   : ${payerItemAcc.amount} (已转出)`);
  console.log(
    `💰 接收者持仓数量   : ${recipientItemAcc.amount} (${recipientAta.address.toBase58()})`
  );
  console.log("================================================\n");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("❌ 执行失败:", err);
    process.exit(1);
  });
}

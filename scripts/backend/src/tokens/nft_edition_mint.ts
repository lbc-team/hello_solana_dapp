/**
 * 演示 7: Metaplex Print Edition (普通 Edition Account 副本) 发行、印刷与转账
 *
 * 核心概念辨析：
 * 1. 【Master Edition (原版 / 母版)】:
 *    - 独一无二的 1/1 原始艺术品。
 *    - 当 maxSupply = 0 时，表示绝版 1/1，不可印刷任何副本（主流 PFP 合集均为此模式）。
 *    - 当 maxSupply > 0 (或 null 不限量) 时，允许持有者根据母版“印刷”出指定数量的副本。
 *
 * 2. 【Edition Account (印次 / Print Edition 副本)】:
 *    - 从 Master Edition 复制衍生出的 NFT 副本（类似于限量版画、门票、图书第 N 版）。
 *    - 副本有自己独立的 Token Mint，但在链上对应的不是 MasterEditionV2，而是 Edition 账户。
 *    - 副本元数据（Metadata）完全继承自母版，链上 Edition 账户记录：
 *      - parent: 所属 Master Edition 的 Mint 地址
 *      - edition: 当前是第几版 (如第 1 版, 第 2 版...)
 *
 * 3. 【Edition Marker PDA】:
 *    - 链上位图记录账户，用于防止同一版次（如第 1 版）被重复印刷。
 *
 * 流程：
 * 1. 阶段 1: 发行 Master Edition 原作 (设置 maxSupply = 10，允许最多印刷 10 份)
 * 2. 阶段 2: 从 Master Edition 印刷第 1 份副本 (Print Edition #1, Edition Account)
 * 3. 阶段 3: 读取并解析母版与副本的链上账户结构，验证 Edition 与 Master Edition 的区别
 * 4. 阶段 4: 将该 Print Edition 副本转账给新接收者并验证
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
  createMintNewEditionFromMasterEditionViaTokenInstruction,
  MasterEditionV2,
  Edition,
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
      console.warn("⚠️ 读取已有私钥失败，重新生成...");
    }
  }
  const kp = await Keypair.generate();
  fs.writeFileSync(
    PAYER_KEYPAIR_PATH,
    JSON.stringify(Array.from(kp.secretKey))
  );
  return kp;
}

/**
 * 确保账户具备足够的 SOL
 */
async function ensureSolBalance(
  connection: Connection,
  address: PublicKey,
  minSol = 2
) {
  const balance = await connection.getBalance(address);
  const sol = Number(balance) / LAMPORTS_PER_SOL;
  console.log(
    `💰 当前 Payer (${address.toBase58()}) 余额: ${sol.toFixed(4)} SOL`
  );

  if (sol < minSol) {
    console.log(`⚡ 余额不足 ${minSol} SOL，正在申请空投 2 SOL...`);
    try {
      const sig = await connection.requestAirdrop(
        address,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig, "confirmed");
      const newBal = await connection.getBalance(address);
      console.log(
        `✅ 空投成功，当前余额: ${(Number(newBal) / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      );
    } catch (err: any) {
      console.warn("⚠️ 自动空投失败:", err.message);
    }
  }
}

/**
 * 计算 Metadata PDA: ['metadata', program_id, mint_pubkey]
 */
async function findMetadataPda(mint: any): Promise<PublicKey> {
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
 * 计算 Master Edition / Edition PDA: ['metadata', program_id, mint_pubkey, 'edition']
 */
async function findEditionPda(mint: any): Promise<PublicKey> {
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

/**
 * 计算 Edition Marker PDA: ['metadata', program_id, master_mint, 'edition', marker_chunk]
 * 官方规则：marker_chunk = Math.floor(edition / 248).toString()
 */
async function findEditionMarkerPda(
  masterMint: any,
  edition: number
): Promise<PublicKey> {
  const masterMintBytes = Buffer.from(
    typeof masterMint.toBytes === "function"
      ? masterMint.toBytes()
      : masterMint.toBuffer()
  );
  const markerChunk = Math.floor(edition / 248).toString();
  const [pda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      Buffer.from(TOKEN_METADATA_PROGRAM_ID.toBytes()),
      masterMintBytes,
      Buffer.from("edition"),
      Buffer.from(markerChunk),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

async function main() {
  console.log("============================================================");
  console.log("🎨 Metaplex Print Edition (Edition Account 副本) 全流程演示");
  console.log("============================================================\n");

  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const payer = await loadOrGeneratePayer();
  await ensureSolBalance(connection, payer.publicKey, 2);

  // =========================================================================
  // 阶段 1: 发行 Master Edition 原作 (可印刷版)
  // =========================================================================
  console.log("\n------------------------------------------------------------");
  console.log("🖼️ 阶段 1: 创建 Master Edition 原作 (maxSupply = 10)");
  console.log("------------------------------------------------------------");

  // 1.1 创建 Master Mint (decimals = 0)
  const masterMint = await createMint(
    connection as any,
    payer as any,
    payer.publicKey as any,
    payer.publicKey as any,
    0,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ Master Mint 创建成功:", masterMint.toBase58());

  // 1.2 铸造 1 枚母版代币给当前 Payer
  const masterAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    masterMint as any,
    payer.publicKey as any
  );
  await mintTo(
    connection as any,
    payer as any,
    masterMint as any,
    masterAta.address as any,
    payer as any,
    1
  );
  console.log("✅ Master 原作已铸造 1 枚至 ATA:", masterAta.address.toBase58());

  // 1.3 构建母版 Metadata PDA 和 Master Edition PDA
  const masterMetaPda = await findMetadataPda(masterMint);
  const masterEditionPda = await findEditionPda(masterMint);

  const masterData: DataV2 = {
    name: "Mona Lisa Genesis Master",
    symbol: "LISA",
    uri: "https://arweave.net/mona-lisa-master.json",
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

  const createMasterMetaIx = createCreateMetadataAccountV3Instruction(
    {
      metadata: masterMetaPda as any,
      mint: masterMint as any,
      mintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      updateAuthority: payer.publicKey as any,
    },
    {
      createMetadataAccountArgsV3: {
        data: masterData,
        isMutable: true,
        collectionDetails: null,
      },
    }
  );

  // ⚠️ 关键点：此处 maxSupply 设为 10，代表该母版允许最多印刷 10 份 Edition 副本！
  const MAX_EDITION_SUPPLY = 10;
  const createMasterEditionIx = createCreateMasterEditionV3Instruction(
    {
      edition: masterEditionPda as any,
      mint: masterMint as any,
      updateAuthority: payer.publicKey as any,
      mintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      metadata: masterMetaPda as any,
    },
    { createMasterEditionArgs: { maxSupply: MAX_EDITION_SUPPLY } }
  );

  const masterTx = new Transaction().add(
    createMasterMetaIx as any,
    createMasterEditionIx as any
  );
  const masterSig = await sendAndConfirmTransaction(
    connection as any,
    masterTx,
    [payer as any]
  );
  console.log("✅ Master Edition 上链成功! 交易签名:", masterSig);
  console.log("  - Master Edition 账户地址:", masterEditionPda.toBase58());
  console.log(`  - 允许最大印刷副本数 (maxSupply): ${MAX_EDITION_SUPPLY}`);

  // =========================================================================
  // 阶段 2: 从 Master Edition 印刷第 1 份副本 (Print Edition #1)
  // =========================================================================
  console.log("\n------------------------------------------------------------");
  console.log(
    "🖨️ 阶段 2: 印刷第 1 份副本 (Print Edition #1 - Edition Account)"
  );
  console.log("------------------------------------------------------------");

  const EDITION_NUMBER = 1;

  // 2.1 为副本创建全新的 Mint (decimals = 0)
  const printMint = await createMint(
    connection as any,
    payer as any,
    payer.publicKey as any,
    payer.publicKey as any,
    0,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 副本 Print Mint 地址:", printMint.toBase58());

  // 2.2 铸造 1 枚副本 Token 到持有者 ATA
  const printAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    printMint as any,
    payer.publicKey as any
  );
  await mintTo(
    connection as any,
    payer as any,
    printMint as any,
    printAta.address as any,
    payer as any,
    1
  );
  console.log("✅ 副本代币已铸造 1 枚至 ATA:", printAta.address.toBase58());

  // 2.3 计算副本专属的 PDAs
  const printMetaPda = await findMetadataPda(printMint);
  const printEditionPda = await findEditionPda(printMint); // 这里虽然同为 edition 种子，但存的是 Edition Account 结构！
  const editionMarkPda = await findEditionMarkerPda(masterMint, EDITION_NUMBER);

  console.log("📌 副本元数据 PDA (newMetadata):", printMetaPda.toBase58());
  console.log("📌 副本 Edition PDA (newEdition):", printEditionPda.toBase58());
  console.log(
    "📌 原作防重印位图 PDA (editionMarkPda):",
    editionMarkPda.toBase58()
  );

  // 2.4 调用从母版印发新版次的指令
  const printIx = createMintNewEditionFromMasterEditionViaTokenInstruction(
    {
      newMetadata: printMetaPda as any,
      newEdition: printEditionPda as any,
      masterEdition: masterEditionPda as any,
      newMint: printMint as any,
      editionMarkPda: editionMarkPda as any,
      newMintAuthority: payer.publicKey as any,
      payer: payer.publicKey as any,
      tokenAccountOwner: payer.publicKey as any, // 拥有 Master Edition Token 的所有者签署
      tokenAccount: masterAta.address as any, // 存放 1 枚 Master Edition 的 Token Account
      newMetadataUpdateAuthority: payer.publicKey as any,
      metadata: masterMetaPda as any,
    },
    {
      mintNewEditionFromMasterEditionViaTokenArgs: {
        edition: EDITION_NUMBER,
      },
    }
  );

  const printTx = new Transaction().add(printIx as any);
  const printSig = await sendAndConfirmTransaction(connection as any, printTx, [
    payer as any,
  ]);
  console.log("✅ Print Edition #1 印刷上链成功! 交易签名:", printSig);

  // =========================================================================
  // 阶段 3: 链上账户数据解析与对比验证
  // =========================================================================
  console.log("\n------------------------------------------------------------");
  console.log("🔬 阶段 3: 链上账户验证 (Master Edition vs Edition Account)");
  console.log("------------------------------------------------------------");

  // 3.1 解析母版 MasterEditionV2
  const masterEditionInfo = await connection.getAccountInfo(masterEditionPda);
  if (masterEditionInfo) {
    const [decodedMaster] = MasterEditionV2.deserialize(
      Buffer.from(masterEditionInfo.data)
    );
    console.log("👑 母版 (Master Edition) 状态:");
    console.log(`  - key (账户类型): MasterEditionV2 (${decodedMaster.key})`);
    console.log(`  - supply (已印刷份数): ${decodedMaster.supply.toString()}`);
    console.log(
      `  - maxSupply (最大允许份数): ${decodedMaster.maxSupply?.toString()}`
    );
  }

  // 3.2 解析副本 Edition (这就是真正的 Edition Account!)
  const printEditionInfo = await connection.getAccountInfo(printEditionPda);
  if (printEditionInfo) {
    const [decodedEdition] = Edition.deserialize(
      Buffer.from(printEditionInfo.data)
    );
    console.log("\n📄 副本 (Edition Account) 状态:");
    console.log(`  - key (账户类型): Edition (${decodedEdition.key})`);
    console.log(
      `  - parent (所属母版 Master Edition 账户): ${decodedEdition.parent.toBase58()}`
    );
    console.log(
      `  - edition (当前版次号): #${decodedEdition.edition.toString()}`
    );
    console.log(
      `  - 验证 parent 是否与母版吻合: ${decodedEdition.parent.equals(masterEditionPda as any) ? "✅ 完全匹配" : "❌ 不匹配"}`
    );
  }

  // =========================================================================
  // 阶段 4: 转账 Print Edition 副本给新接收者
  // =========================================================================
  console.log("\n------------------------------------------------------------");
  console.log("💸 阶段 4: 将 Print Edition 副本转账给新接收者");
  console.log("------------------------------------------------------------");

  const recipient = await Keypair.generate();
  console.log("🎯 接收者地址:", recipient.publicKey.toBase58());

  // 4.1 为接收者创建 ATA
  const recipientPrintAta = await getOrCreateAssociatedTokenAccount(
    connection as any,
    payer as any,
    printMint as any,
    recipient.publicKey as any
  );

  // 4.2 转账 1 枚副本 Token
  const transferSig = await transfer(
    connection as any,
    payer as any,
    printAta.address as any,
    recipientPrintAta.address as any,
    payer as any,
    1
  );
  console.log("✅ 副本 NFT 转账成功! 交易签名:", transferSig);

  // 4.3 核对余额
  const recipientBal = await getAccount(
    connection as any,
    recipientPrintAta.address as any
  );
  console.log(
    `🎉 接收者当前副本 NFT 余额: ${recipientBal.amount.toString()} 枚`
  );

  console.log("\n============================================================");
  console.log("🎯 Print Edition 全流程演示执行完毕！");
  console.log("   - 原作 Master Mint: " + masterMint.toBase58());
  console.log("   - 原作 Master Edition: " + masterEditionPda.toBase58());
  console.log("   - 副本 Print Mint: " + printMint.toBase58());
  console.log(
    "   - 副本 Edition Account: " +
      printEditionPda.toBase58() +
      " (Edition #" +
      EDITION_NUMBER +
      ")"
  );
  console.log("   - 副本现持有者: " + recipient.publicKey.toBase58());
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("❌ 执行失败:", err);
  process.exit(1);
});

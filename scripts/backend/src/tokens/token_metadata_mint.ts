/**
 * 演示: 为普通 SPL Token (同质化代币 FT) 发行并绑定链上元数据 (Metaplex Metadata)
 *
 * 核心区别：
 * - NFT (非同质化代币): decimals = 0, supply = 1, 且必须创建 Master Edition（母版账户以锁定增发）
 * - 普通 Token (同质化代币 FT): decimals > 0 (如 6 或 9)，通过 Metaplex Token Metadata 程序绑定
 *   MetadataAccountV3（包含名称 Name、代号 Symbol、Logo/URI），但【不要】创建 Master Edition！
 * - 绑定后，Phantom、OKX、Solscan 等钱包和区块链浏览器即可直接展示该代币的名称、Logo 图标与代币符号。
 *
 * 流程：
 * 1. 发行普通 Token Mint (decimals = 9)
 * 2. 铸造代币 (Mint To): 为支付者创建 ATA 并铸造 1,000,000 枚代币
 * 3. 绑定链上元数据 (CreateMetadataAccountV3): 写入 Name、Symbol、URI
 * 4. 读取链上元数据进行解析验证
 * 5. 转账代币 (Transfer): 向接收者转账 50,000 枚代币并核对余额
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
  Metadata,
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
  console.log("🏷️ 普通 SPL Token 发行、绑定链上元数据 (Metadata) 与转账");
  console.log("========================================================\n");

  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  console.log("🌐 连接节点:", RPC_ENDPOINT);

  const payer = await loadOrGeneratePayer();
  console.log("👤 支付者地址:", payer.publicKey.toBase58());

  // 确保支付者有足够 SOL 支付交易手续费与元数据账户租金
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 支付者 SOL 余额: ${Number(balance) / LAMPORTS_PER_SOL} SOL`);

  if (balance < BigInt(2 * LAMPORTS_PER_SOL)) {
    console.log("⏳ 正在请求 2 SOL 空投...");
    const airdropSig = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig, "confirmed");
    console.log("✅ 空投到账完成");
  }

  // ----------------------------------------------------
  // 步骤 1: 发行普通 Token Mint (9 位精度)
  // ----------------------------------------------------
  console.log("\n--- 步骤 1: 发行普通 Token Mint (Decimals = 9) ---");
  const decimals = 9;
  const mint = await createMint(
    connection as any,
    payer as any,
    payer.publicKey as any, // Mint Authority
    payer.publicKey as any, // Freeze Authority
    decimals,
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 普通 SPL Token Mint 创建成功!");
  console.log("  Mint 地址        :", mint.toBase58());
  console.log("  Decimals (精度)  :", decimals);
  console.log("  Token Program ID :", TOKEN_PROGRAM_ID.toBase58());

  // ----------------------------------------------------
  // 步骤 2: 铸造代币到支付者 ATA
  // ----------------------------------------------------
  console.log("\n--- 步骤 2: 铸造代币 (Mint To) ---");
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
  console.log("✅ 支付者代币账户 (ATA):", payerAta.address.toBase58());

  const mintTokens = 1_000_000n;
  const mintRawAmount = mintTokens * 10n ** BigInt(decimals);

  console.log(`⏳ 正在铸造 ${mintTokens.toLocaleString()} 枚代币...`);
  const mintSig = await mintTo(
    connection as any,
    payer as any,
    mint as any,
    payerAta.address as any,
    payer as any,
    mintRawAmount,
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 铸造完成! 交易签名:", mintSig);

  // ----------------------------------------------------
  // 步骤 3: 为普通代币绑定 Metaplex 链上 Metadata (不创建 Master Edition)
  // ----------------------------------------------------
  console.log("\n--- 步骤 3: 绑定 Metaplex 链上元数据 (MetadataAccountV3) ---");

  const mintBytes = Buffer.from(
    typeof (mint as any).toBytes === "function"
      ? (mint as any).toBytes()
      : (mint as any).toBuffer()
  );

  // 计算 Metadata PDA: ["metadata", program_id, mint]
  const [metadataPda] = await PublicKey.findProgramAddress(
    [
      Buffer.from("metadata"),
      Buffer.from(TOKEN_METADATA_PROGRAM_ID.toBytes()),
      mintBytes,
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  console.log("  Metadata PDA 地址:", metadataPda.toBase58());

  const tokenData: DataV2 = {
    name: "UPChain Community Token",
    symbol: "UPC",
    uri: "https://raw.githubusercontent.com/lbc-team/hello_gill/refs/heads/main/metadata/nft-metadata.json",
    sellerFeeBasisPoints: 0, // 普通 FT 代币版税通常设为 0
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

  // 构造创建元数据账户指令（不包含 Master Edition 指令，保持 FT 可持续增发与可流通性）
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
        data: tokenData,
        isMutable: true, // 允许管理员后续更新 Logo 或描述信息
        collectionDetails: null,
      },
    }
  );

  console.log("⏳ 提交绑定 Metadata 交易...");
  const metaTx = new Transaction().add(createMetadataIx as any);
  const metaSig = await sendAndConfirmTransaction(connection as any, metaTx, [
    payer as any,
  ]);
  console.log("✅ 链上元数据绑定成功! 签名:", metaSig);

  // ----------------------------------------------------
  // 步骤 4: 读取并解析链上 Metadata 进行核验
  // ----------------------------------------------------
  console.log("\n--- 步骤 4: 读取并解析链上元数据 ---");
  try {
    const fetchedMetadata = await Metadata.fromAccountAddress(
      connection as any,
      metadataPda as any
    );
    console.log("✅ 链上 Metadata 读取成功:");
    console.log(
      "  代币全称 (Name)    :",
      fetchedMetadata.data.name.replace(/\0/g, "")
    );
    console.log(
      "  代币代号 (Symbol)  :",
      fetchedMetadata.data.symbol.replace(/\0/g, "")
    );
    console.log(
      "  元数据 URI         :",
      fetchedMetadata.data.uri.replace(/\0/g, "")
    );
    console.log(
      "  Update Authority   :",
      fetchedMetadata.updateAuthority.toBase58()
    );
  } catch (error) {
    console.log("⚠️ 读取元数据解析提示:", error);
  }

  // ----------------------------------------------------
  // 步骤 5: 转账普通代币
  // ----------------------------------------------------
  console.log("\n--- 步骤 5: 转账普通代币给接收者 ---");
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
  console.log("✅ 接收者代币账户 (ATA):", recipientAta.address.toBase58());

  const transferTokens = 50_000n;
  const transferRawAmount = transferTokens * 10n ** BigInt(decimals);

  console.log(
    `⏳ 正在向接收者转账 ${transferTokens.toLocaleString()} 枚代币...`
  );
  const transferSig = await transfer(
    connection as any,
    payer as any,
    payerAta.address as any,
    recipientAta.address as any,
    payer as any,
    transferRawAmount,
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("✅ 转账成功! 交易签名:", transferSig);

  // ----------------------------------------------------
  // 最终账户状态检查
  // ----------------------------------------------------
  const payerAccountFinal = await getAccount(
    connection as any,
    payerAta.address as any,
    "confirmed",
    TOKEN_PROGRAM_ID
  );
  const recipientAccountFinal = await getAccount(
    connection as any,
    recipientAta.address as any,
    "confirmed",
    TOKEN_PROGRAM_ID
  );

  console.log("\n================ 最终账户状态 ================");
  console.log(`🏷️ Token Mint 地址 : ${mint.toBase58()}`);
  console.log(`📄 Metadata PDA   : ${metadataPda.toBase58()}`);
  console.log(
    `💰 支付者剩余代币  : ${
      Number(payerAccountFinal.amount) / 10 ** decimals
    } (${payerAta.address.toBase58()})`
  );
  console.log(
    `💰 接收者收到代币  : ${
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

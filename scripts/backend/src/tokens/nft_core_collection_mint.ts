/**
 * 演示 6: Metaplex Core (MPL-Core) NFT 合集创建、子资产铸造与转账 (nft_core_collection_mint.ts)
 *
 * 背景与技术选型：
 * - 在 Solana 生态中，早期 NFT 采用 SPL Token + Token Metadata (4 个账户模型：Mint + ATA + Metadata + Master Edition)；
 * - 虽然后续 Token-2022 推出了原生 Group & Member 扩展，但在行业实践中，各大 NFT 交易市场 (Tensor, Magic Eden)、
 *   钱包 (Phantom, Solflare) 与主流项目几乎一致选择了 Metaplex Core 标准。
 * - Metaplex Core 核心优势：
 *   1. 【单账户模型】：NFT 的 owner、metadata、collection 归属全部保存在单个链上账户中，无需 ATA 账户与单独的 Metadata 账户。
 *   2. 【低租金与低 CU】：单 NFT 租金从 ~0.022 SOL 降至 ~0.0029 SOL（节省约 85% 租金），转账和铸造更少 CU。
 *   3. 【天然合集支持】：铸造子 Asset 时直接指定 Collection，无需额外调用复杂的 VerifyCollection 指令。
 *   4. 【插件机制 (Plugins)】：支持版税 (Royalties)、冻结委托 (Freeze)、属性 (Attributes) 等原生插件。
 *
 * 流程：
 * 1. 初始化 Umi 实例并加载 Payer 密钥对与 mplCore 插件
 * 2. 确保 Payer 账户具备充足的 SOL 余额 (自动检测并按需 Airdrop)
 * 3. 创建 Core Collection (合集母版)
 * 4. 在该合集下铸造单个子 NFT (Core Asset)
 * 5. 查询验证合集归属与资产元数据
 * 6. 将该 Core NFT 资产转账给目标接收者
 * 7. 验证所有权变更
 */

import "../compat";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createSignerFromKeypair,
  signerIdentity,
  generateSigner,
  publicKey as umiPublicKey,
  Keypair as UmiKeypair,
} from "@metaplex-foundation/umi";
import {
  mplCore,
  createCollection,
  create,
  transfer,
  fetchCollectionV1,
  fetchAssetV1,
} from "@metaplex-foundation/mpl-core";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
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
 * 确保指定账户有足够的 SOL
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
      console.warn(
        "⚠️ 自动空投失败 (如果是主网或受限 RPC 请确保账户预留充足 SOL):",
        err.message
      );
    }
  }
}

/**
 * 构建并初始化适配 @solana/web3.js v3 的 Umi 实例
 */
function createConfiguredUmi(endpoint: string, payerKeypair: Keypair) {
  const umi = createUmi(endpoint).use(mplCore());

  // 适配 Umi eddsa 接口，解决 web3.js v3 中 Keypair 异步与内部方法差异
  umi.eddsa = {
    ...umi.eddsa,
    generateKeypair(): UmiKeypair {
      const privKey = ed25519.utils.randomPrivateKey();
      const pubKey = ed25519.getPublicKey(privKey);
      const secretKey = new Uint8Array(64);
      secretKey.set(privKey);
      secretKey.set(pubKey, 32);
      return {
        publicKey: umiPublicKey(bs58.encode(pubKey)),
        secretKey,
      };
    },
    createKeypairFromSecretKey(secretKey: Uint8Array): UmiKeypair {
      const pubKey =
        secretKey.length === 64
          ? secretKey.slice(32)
          : ed25519.getPublicKey(secretKey);
      const fullSecret =
        secretKey.length === 64
          ? secretKey
          : new Uint8Array([...secretKey, ...pubKey]);
      return {
        publicKey: umiPublicKey(bs58.encode(pubKey)),
        secretKey: fullSecret,
      };
    },
  };

  const umiPayer = umi.eddsa.createKeypairFromSecretKey(payerKeypair.secretKey);
  const signer = createSignerFromKeypair(umi, umiPayer);
  umi.use(signerIdentity(signer));

  return umi;
}

async function main() {
  console.log("============================================================");
  console.log("🚀 Metaplex Core (MPL-Core) NFT 合集与资产全流程演示");
  console.log("============================================================\n");

  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const payer = await loadOrGeneratePayer();
  await ensureSolBalance(connection, payer.publicKey, 2);

  // 初始化 Umi 实例
  const umi = createConfiguredUmi(RPC_ENDPOINT, payer);
  console.log(`🔑 Umi Identity (Payer): ${umi.identity.publicKey}`);

  // --------------------------------------------------------------------------
  // 步骤 1: 创建 Metaplex Core Collection (合集母版)
  // --------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("📦 步骤 1: 创建 Metaplex Core 合集 (Collection)");
  console.log("------------------------------------------------------------");

  const collectionSigner = generateSigner(umi);
  console.log(
    `📌 合集地址 (Collection Address): ${collectionSigner.publicKey}`
  );

  const collectionTx = await createCollection(umi, {
    collection: collectionSigner,
    name: "CyberPunk Core Genesis",
    uri: "https://arweave.net/genesis-collection-metadata.json",
  }).sendAndConfirm(umi);

  console.log(
    `✅ 合集创建成功! 交易签名: ${bs58.encode(collectionTx.signature)}`
  );

  // --------------------------------------------------------------------------
  // 步骤 2: 在合集中铸造子 NFT (Core Asset)
  // --------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("🎨 步骤 2: 在合集中铸造子 NFT (Asset)");
  console.log("------------------------------------------------------------");

  const assetSigner = generateSigner(umi);
  console.log(`📌 NFT 资产地址 (Asset Address): ${assetSigner.publicKey}`);

  const createAssetTx = await create(umi, {
    asset: assetSigner,
    collection: collectionSigner, // 传入合集 Signer/Collection 自动绑定
    name: "CyberPunk #0001",
    uri: "https://arweave.net/cyberpunk-0001.json",
  }).sendAndConfirm(umi);

  console.log(
    `✅ 子 NFT 铸造成功! 交易签名: ${bs58.encode(createAssetTx.signature)}`
  );

  // --------------------------------------------------------------------------
  // 步骤 3: 查询链上状态并验证
  // --------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("🔍 步骤 3: 读取链上合集与资产状态");
  console.log("------------------------------------------------------------");

  const fetchedCollection = await fetchCollectionV1(
    umi,
    collectionSigner.publicKey
  );
  const fetchedAsset = await fetchAssetV1(umi, assetSigner.publicKey);

  console.log("合集信息:", {
    name: fetchedCollection.name,
    uri: fetchedCollection.uri,
    updateAuthority: fetchedCollection.updateAuthority,
    currentSize: fetchedCollection.currentSize,
  });

  console.log("子 NFT 信息:", {
    name: fetchedAsset.name,
    uri: fetchedAsset.uri,
    owner: fetchedAsset.owner,
    updateAuthority: fetchedAsset.updateAuthority,
  });

  const isBelongsToCollection =
    fetchedAsset.updateAuthority.type === "Collection" &&
    fetchedAsset.updateAuthority.address === collectionSigner.publicKey;

  console.log(
    `✅ 链上合集归属验证: ${isBelongsToCollection ? "已自动认证 (Verified)" : "未认证"}`
  );

  // --------------------------------------------------------------------------
  // 步骤 4: 转账子 NFT 资产
  // --------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("💸 步骤 4: 将该 Core NFT 资产转账给目标接收者");
  console.log("------------------------------------------------------------");

  const recipientSigner = generateSigner(umi);
  console.log(`🎯 接收者地址: ${recipientSigner.publicKey}`);

  // 注意：Metaplex Core 采用单账户模型，无需提前为接收者创建 ATA 账户！
  const transferTx = await transfer(umi, {
    asset: fetchedAsset,
    collection: fetchedCollection,
    newOwner: recipientSigner.publicKey,
  }).sendAndConfirm(umi);

  console.log(`✅ 转账成功! 交易签名: ${bs58.encode(transferTx.signature)}`);

  // --------------------------------------------------------------------------
  // 步骤 5: 验证最终所有权
  // --------------------------------------------------------------------------
  console.log("\n------------------------------------------------------------");
  console.log("✨ 步骤 5: 验证最终资产归属");
  console.log("------------------------------------------------------------");

  const finalAsset = await fetchAssetV1(umi, assetSigner.publicKey);
  console.log(`🎉 最终 Asset Owner: ${finalAsset.owner}`);
  console.log(
    `🎉 是否成功转移至接收者: ${finalAsset.owner === recipientSigner.publicKey ? "是 (YES)" : "否 (NO)"}`
  );

  console.log("\n============================================================");
  console.log("🎯 演示全部执行完毕！");
  console.log("   - 合集地址: " + collectionSigner.publicKey);
  console.log("   - 资产地址: " + assetSigner.publicKey);
  console.log("   - 新持有者: " + recipientSigner.publicKey);
  console.log(
    "   - 单账户模型优势: 无需额外 ATA 账户，低至 ~0.0029 SOL 租金！"
  );
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("❌ 执行失败:", err);
  process.exit(1);
});

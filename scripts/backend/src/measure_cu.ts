import "./compat";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
  PublicKey,
} from "@solana/web3.js";
import { Program, BN, AnchorProvider, setProvider } from "@anchor-lang/core";
import idl from "./idl/favorites.json";
import { RPC_ENDPOINT, PAYER_KEYPAIR_PATH } from "./config";
import { Favorites } from "./types/favorites";
import fs from "fs";

// 🧮 CU 测量工具
class ComputeUnitMeasurer {
  private connection: Connection;
  private payer!: Keypair;

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, "confirmed");
  }

  async init() {
    this.payer = fs.existsSync(PAYER_KEYPAIR_PATH)
      ? await Keypair.fromSecretKey(
          Buffer.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR_PATH, "utf8")))
        )
      : await Keypair.generate();
  }

  // 📊 测量交易的 CU 消耗
  async measureTransaction(
    name: string,
    buildTransaction: () => Promise<Transaction>
  ): Promise<number> {
    try {
      console.log(`\n🔍 测量 ${name} 的 CU 消耗...`);

      const tx = await buildTransaction();

      // 设置很高的 CU 限制以确保不会因为限制而失败
      const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000, // 1M CU 限制，确保够用
      });

      tx.add(computeBudgetIx);
      tx.feePayer = this.payer.publicKey;
      tx.recentBlockhash = (
        await this.connection.getLatestBlockhash()
      ).blockhash;

      // 模拟交易
      const extraSigners = (tx as any)._extraSigners || [];
      const simulation = await this.connection.simulateTransaction(tx, [
        this.payer,
        ...extraSigners,
      ]);

      if (simulation.value.err) {
        console.log(`❌ ${name} 模拟失败:`, simulation.value.err);
        return -1;
      }

      const unitsConsumed = Number(simulation.value.unitsConsumed || 0);
      console.log(`✅ ${name}: ${unitsConsumed} CU`);

      return unitsConsumed;
    } catch (error) {
      console.log(`❌ ${name} 测量失败:`, error);
      return -1;
    }
  }

  // 🏃‍♂️ 运行所有测试
  async runAllTests() {
    console.log("🧮 开始 CU 消耗测量...\n");

    const results: Record<string, number> = {};

    // 1. 普通 SOL 转账
    results["SOL转账"] = await this.measureTransaction("SOL转账", async () => {
      const recipient = await Keypair.generate();
      return new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.payer.publicKey,
          toPubkey: recipient.publicKey,
          lamports: BigInt(LAMPORTS_PER_SOL),
        })
      );
    });

    // 2. 创建账户
    results["创建账户"] = await this.measureTransaction(
      "创建账户",
      async () => {
        const newAccount = await Keypair.generate();
        const tx = new Transaction().add(
          SystemProgram.createAccount({
            fromPubkey: this.payer.publicKey,
            newAccountPubkey: newAccount.publicKey,
            lamports:
              await this.connection.getMinimumBalanceForRentExemption(0),
            space: 0,
            programId: SystemProgram.programId,
          })
        );
        (tx as any)._extraSigners = [newAccount];
        return tx;
      }
    );

    // 3. Favorites 合约调用
    results["Favorites合约"] = await this.measureTransaction(
      "Favorites合约",
      async () => {
        // 创建 Provider 和 Program
        const createAnchorWallet = (keypair: any) => ({
          publicKey: keypair.publicKey,
          signTransaction: async (tx: any) => {
            tx.partialSign(keypair);
            return tx;
          },
          signAllTransactions: async (txs: any[]) => {
            txs.forEach((tx) => tx.partialSign(keypair));
            return txs;
          },
          payer: keypair,
        });

        const wallet = createAnchorWallet(this.payer);
        const provider = new AnchorProvider(this.connection as any, wallet as any, {
          commitment: "confirmed",
        });
        setProvider(provider);

        const program = new Program<Favorites>(idl as Favorites, provider);

        // 计算 PDA
        const [favoritesPda] = (PublicKey as any).findProgramAddressSync(
          [Buffer.from("favorites"), (this.payer.publicKey as any).toBuffer()],
          program.programId as any
        );

        // 构建指令
        const setFavoritesIx = await program.methods
          .setFavorites(new BN(42), "blue")
          .accountsPartial({
            user: this.payer.publicKey as any,
            favorites: favoritesPda as any,
            systemProgram: SystemProgram.programId as any,
          })
          .instruction();

        return new Transaction().add(setFavoritesIx as any);
      }
    );

    // 4. 带优先级费用的转账
    results["带优先级费用转账"] = await this.measureTransaction(
      "带优先级费用转账",
      async () => {
        const recipient = await Keypair.generate();
        const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 1000,
        });

        return new Transaction().add(priorityFeeIx).add(
          SystemProgram.transfer({
            fromPubkey: this.payer.publicKey,
            toPubkey: recipient.publicKey,
            lamports: BigInt(LAMPORTS_PER_SOL),
          })
        );
      }
    );

    // 📊 显示结果摘要
    console.log("\n" + "=".repeat(50));
    console.log("📊 CU 消耗测量结果摘要");
    console.log("=".repeat(50));

    Object.entries(results).forEach(([name, cu]) => {
      if (cu >= 0) {
        console.log(`${name.padEnd(20)}: ${cu.toLocaleString()} CU`);
      } else {
        console.log(`${name.padEnd(20)}: 测量失败`);
      }
    });

    // 💡 推荐设置
    console.log("\n💡 推荐的 CU 限制设置:");
    Object.entries(results).forEach(([name, cu]) => {
      if (cu > 0) {
        const recommended = Math.ceil(cu * 1.2); // 增加20%安全边际
        console.log(
          `${name.padEnd(20)}: ${recommended.toLocaleString()} CU (${cu} + 20%安全边际)`
        );
      }
    });
  }
}

// 🚀 运行测量
async function main() {
  const measurer = new ComputeUnitMeasurer();
  await measurer.init();
  await measurer.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

export { ComputeUnitMeasurer };

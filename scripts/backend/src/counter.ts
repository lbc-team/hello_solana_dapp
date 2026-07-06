import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";
import { Program, AnchorProvider } from "@anchor-lang/core";
import counterIdl from "./idl/solana_counter.json";
import { RPC_ENDPOINT, PAYER_KEYPAIR_PATH } from "./config";
import { SolanaCounter } from "./types/solana_counter";
import fs from "fs";

// 创建 Anchor Wallet
const createAnchorWallet = (keypair: Keypair) => ({
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

// 计算 Counter PDA
function getCounterPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global-counter")],
    programId
  );
  return pda;
}

// 初始化计数器
async function initializeCounter(
  program: Program<SolanaCounter>,
  payer: Keypair
): Promise<void> {
  const counterPda = getCounterPda(program.programId);
  console.log(`Counter PDA: ${counterPda.toBase58()}`);

  // 检查是否已初始化
  const accountInfo = await program.provider.connection.getAccountInfo(counterPda);
  if (accountInfo) {
    console.log("计数器已存在，跳过初始化");
    return;
  }

  console.log("正在初始化计数器...");
  const tx = await program.methods
    .initialize()
    .accountsPartial({
      counterAccount: counterPda,
      user: payer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`初始化成功！交易签名: ${tx}`);
}

// 递增计数器
async function incrementCounter(
  program: Program<SolanaCounter>
): Promise<void> {
  const counterPda = getCounterPda(program.programId);

  // 读取当前值
  const counter = await program.account.counter.fetch(counterPda);
  console.log(`当前计数值: ${counter.count.toString()}`);

  console.log("正在递增...");
  const tx = await program.methods
    .increment()
    .accountsPartial({
      counterAccount: counterPda,
    })
    .rpc();

  console.log(`递增成功！交易签名: ${tx}`);

  // 读取更新后的值
  const updatedCounter = await program.account.counter.fetch(counterPda);
  console.log(`更新后计数值: ${updatedCounter.count.toString()}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log("用法: npm run backend:counter <command>\n");
    console.log("可用命令:");
    console.log("  init, initialize  初始化计数器");
    console.log("  inc, increment    递增计数器");
    console.log("  both              初始化并递增");
    process.exit(1);
  }

  // 连接本地节点
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  console.log(`\n连接 RPC: ${RPC_ENDPOINT}`);

  // 加载 keypair
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR_PATH, "utf8")))
  );
  console.log(`使用账户: ${payer.publicKey.toBase58()}`);

  // 检查余额
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`账户余额: ${balance / LAMPORTS_PER_SOL} SOL`);

  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.log("余额不足，正在申请空投...");
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    const airdropSignature = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction({
      signature: airdropSignature,
      blockhash,
      lastValidBlockHeight,
    });
    console.log("空投成功！");
  }

  // 创建 Provider 和 Program
  const wallet = createAnchorWallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new Program<SolanaCounter>(counterIdl as SolanaCounter, provider);

  // 执行命令
  switch (command) {
    case "init":
    case "initialize":
      await initializeCounter(program, payer);
      break;
    case "inc":
    case "increment":
      await incrementCounter(program);
      break;
    case "both":
      await initializeCounter(program, payer);
      await incrementCounter(program);
      break;
    default:
      console.log(`未知命令: ${command}`);
      console.log("有效命令: init, increment, both, exit");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n执行失败:", error);
  process.exit(1);
});

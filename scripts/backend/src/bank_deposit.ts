import "./compat";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  PublicKey,
} from "@solana/web3.js";
import { Program, BN, AnchorProvider } from "@anchor-lang/core";
import bankIdl from "./idl/bank.json";
import { RPC_ENDPOINT, PAYER_KEYPAIR_PATH } from "./config";
import { Bank } from "./types/bank";
import fs from "fs";

// 创建 Anchor Wallet
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

async function checkAndInitializeBank(
  program: Program<Bank>,
  _authority: any
): Promise<PublicKey> {
  const connection = program.provider.connection;

  // 计算 Bank PDA
  const [bankPda] = (PublicKey as any).findProgramAddressSync(
    [Buffer.from("bank")],
    program.programId as any
  );

  console.log(`Bank PDA: ${bankPda.toBase58()}`);

  const bankInfo = await connection.getAccountInfo(bankPda as any);
  if (bankInfo) {
    console.log(`✅ Bank 已存在，余额: ${bankInfo.lamports} lamports`);
  } else {
    console.log(
      "ℹ️  Bank PDA 尚未存在，首次 deposit 时会由 System Program 接收 lamports"
    );
  }

  return bankPda;
}

async function checkAndCreateUserAccount(
  program: Program<Bank>,
  owner: any
): Promise<PublicKey> {
  // 计算 UserAccount PDA
  const [userAccountPda] = (PublicKey as any).findProgramAddressSync(
    [Buffer.from("user"), owner.publicKey.toBuffer()],
    program.programId as any
  );

  console.log(`UserAccount PDA: ${userAccountPda.toBase58()}`);

  // 检查 UserAccount 是否已存在
  try {
    const userAccount = await program.account.userAccount.fetch(
      userAccountPda as any
    );
    console.log(
      `✅ UserAccount 已存在，存款金额: ${userAccount.depositAmount.toString()} lamports`
    );
    return userAccountPda;
  } catch (error) {
    console.log("⚠️  UserAccount 不存在，正在创建...");

    // 创建 UserAccount
    const tx = await program.methods
      .createUserAccount()
      .accountsPartial({
        userAccount: userAccountPda as any,
        owner: owner.publicKey as any,
        systemProgram: SystemProgram.programId as any,
      })
      .rpc();

    console.log(`✅ UserAccount 创建成功！交易签名: ${tx}`);
    return userAccountPda;
  }
}

async function deposit(
  program: Program<Bank>,
  depositor: any,
  amount: number
): Promise<void> {
  const connection = program.provider.connection;

  console.log("\n=== 开始执行 Deposit ===");
  console.log(`存款人: ${depositor.publicKey.toBase58()}`);
  console.log(
    `存款金额: ${amount} SOL (${amount * LAMPORTS_PER_SOL} lamports)\n`
  );

  // 1. 检查并初始化 Bank
  const bankPda = await checkAndInitializeBank(program, depositor);

  // 2. 检查并创建 UserAccount
  const userAccountPda = await checkAndCreateUserAccount(program, depositor);

  // 3. 检查余额
  const balance = await connection.getBalance(depositor.publicKey as any);
  console.log(`\n当前余额: ${Number(balance) / LAMPORTS_PER_SOL} SOL`);

  const depositLamports = amount * LAMPORTS_PER_SOL;
  if (balance < BigInt(Math.floor(depositLamports + 0.01 * LAMPORTS_PER_SOL))) {
    throw new Error(`余额不足！需要至少 ${amount + 0.01} SOL（包括手续费）`);
  }

  // 4. 执行 deposit
  console.log(`\n正在执行 deposit...`);

  const tx = await program.methods
    .deposit(new BN(depositLamports))
    .accountsPartial({
      bank: bankPda as any,
      userAccount: userAccountPda as any,
      depositor: depositor.publicKey as any,
      systemProgram: SystemProgram.programId as any,
    })
    .rpc();

  console.log(`\n🎉 Deposit 成功！`);
  console.log(`交易签名: ${tx}`);
  console.log(`查看交易: http://localhost:8899/tx/${tx}`);

  // 5. 获取交易详情
  const txInfo = await connection.getParsedTransaction(tx, {
    maxSupportedTransactionVersion: 0,
  });

  if (txInfo?.meta?.logMessages) {
    console.log(`\n📋 交易日志:`);
    txInfo.meta.logMessages.forEach((log) => console.log(`  ${log}`));
  }

  // 6. 查询更新后的账户信息
  const userAccount = await program.account.userAccount.fetch(
    userAccountPda as any
  );
  const bankBalance = await connection.getBalance(bankPda as any);
  const newBalance = await connection.getBalance(depositor.publicKey as any);

  console.log(`\n📊 更新后的账户信息:`);
  console.log(
    `  用户存款记录: ${userAccount.depositAmount.toString()} lamports (${userAccount.depositAmount.toNumber() / LAMPORTS_PER_SOL} SOL)`
  );
  console.log(
    `  Bank 账户余额: ${bankBalance} lamports (${Number(bankBalance) / LAMPORTS_PER_SOL} SOL)`
  );
  console.log(`  存款人余额: ${Number(newBalance) / LAMPORTS_PER_SOL} SOL`);
}

async function main() {
  const args = process.argv.slice(2);

  // 解析参数
  let amount = 0.1; // 默认 0.1 SOL

  if (args.length > 0) {
    amount = parseFloat(args[0]);
    if (isNaN(amount) || amount <= 0) {
      console.error("错误: 金额必须是正数");
      console.log("用法: npm run bank-deposit [金额(SOL)]");
      console.log("示例: npm run bank-deposit 0.5");
      process.exit(1);
    }
  }

  // 连接本地节点
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  console.log(`连接 RPC: ${RPC_ENDPOINT}`);

  // 加载 keypair
  const payer = fs.existsSync(PAYER_KEYPAIR_PATH)
    ? await Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(PAYER_KEYPAIR_PATH, "utf8")))
      )
    : await Keypair.generate();

  console.log(`使用账户: ${payer.publicKey.toBase58()}`);

  // 检查余额并空投（如果需要）
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`账户余额: ${Number(balance) / LAMPORTS_PER_SOL} SOL`);

  if (balance < BigInt(Math.floor((amount + 1) * LAMPORTS_PER_SOL))) {
    console.log(`\n余额不足，正在申请空投...`);
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    try {
      const airdropSignature = await connection.requestAirdrop(
        payer.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction({
        signature: airdropSignature,
        blockhash,
        lastValidBlockHeight,
      });
      console.log(`✅ 空投成功！`);
    } catch (error) {
      console.error("空投失败:", error);
      console.log("提示: 请确保本地测试网络正在运行");
    }
  }

  // 创建 Provider
  const wallet = createAnchorWallet(payer);
  const provider = new AnchorProvider(connection as any, wallet as any, {
    commitment: "confirmed",
  });

  // 创建 Program 实例
  const program = new Program<Bank>(bankIdl as Bank, provider);

  // 执行 deposit
  await deposit(program, payer, amount);
}

main().catch((error) => {
  console.error("\n❌ 执行失败:", error);
  process.exit(1);
});

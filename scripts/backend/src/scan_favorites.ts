import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import bs58 from "bs58";
import favoritesIdl from "./idl/favorites.json";
import { getInstructionDiscriminatorFromIdl } from "./utils/discriminator";

// Favorites 合约程序 ID
const FAVORITES_PROGRAM_ID = new PublicKey(
  "AfWzQDmP7gzMaiFPmwwQysvVTEuxPvKtDcUA5hfTwiwW"
);
const RPC_ENDPOINT = "http://localhost:8899";

// 从 IDL 中获取 set_favorites 指令的 discriminator
const SET_FAVORITES_DISCRIMINATOR = getInstructionDiscriminatorFromIdl(
  favoritesIdl,
  "set_favorites"
);

// 扫描间隔（毫秒）
const SCAN_INTERVAL = 400; // 每 400ms 检查一次

interface SetFavoritesRecord {
  slot: number;
  signature: string;
  user: string;
  favorites: string;
  number: string;
  color: string;
  timestamp: number | null;
}

// 全局变量用于统计
let totalRecords = 0;

/**
完整指令数据 (24字节):
[211, 137, 87, 135, 161, 224, 187, 120, 42, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 98, 108, 117, 101]
│─────────────────────────────────────────────────────────────────────────────────────────────────│
│  Discriminator (8字节)  │  number (8字节)  │  color长度 (4字节)  │  color内容 (4字节)  │
字节数组转换为 Base58 字符串用于网络传输
*/

// 解析 set_favorites 指令数据
function parseSetFavoritesData(
  data: Buffer
): { number: bigint; color: string } | null {
  try {
    // 跳过前 8 字节的 discriminator
    let offset = 8;

    // 解析 number (u64, 8 bytes, little-endian)
    if (data.length < offset + 8) return null;
    const number = data.readBigUInt64LE(offset);
    offset += 8;

    // 解析 color (string, 4 bytes length + string data)
    if (data.length < offset + 4) return null;
    const colorLength = data.readUInt32LE(offset);
    offset += 4;

    if (data.length < offset + colorLength) return null;
    const color = data.slice(offset, offset + colorLength).toString("utf8");

    return { number, color };
  } catch (error) {
    console.error("解析指令数据失败:", error);
    return null;
  }
}

async function processSignature(
  connection: Connection,
  signature: string,
  slot: number
): Promise<SetFavoritesRecord[]> {
  const records: SetFavoritesRecord[] = [];

  try {
    // 使用 getParsedTransaction 获取解析后的交易
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta || tx.meta.err) {
      return records;
    }

    const message = tx.transaction.message;
    const instructions = message.instructions;

    // 遍历所有主指令
    for (let i = 0; i < instructions.length; i++) {
      const instruction = instructions[i];

      // 检查是否是 Favorites 程序的指令
      if (
        "programId" in instruction &&
        instruction.programId.equals(FAVORITES_PROGRAM_ID)
      ) {
        // 这是未解析的指令（自定义程序）
        if ("data" in instruction) {
          const instructionData = Buffer.from(bs58.decode(instruction.data));

          // 提取前 8 字节作为 discriminator
          if (instructionData.length < 8) continue;

          const discriminator = instructionData.slice(0, 8);

          if (discriminator.equals(SET_FAVORITES_DISCRIMINATOR)) {
            console.log(`\n✅ 发现 SET_FAVORITES 指令！`);
            console.log(`  指令索引: ${i}`);

            // 解析指令参数
            const params = parseSetFavoritesData(instructionData);

            if (params) {
              // 获取账户信息
              const accounts = instruction.accounts;
              const user =
                accounts.length > 0 ? accounts[0].toBase58() : "Unknown";
              const favorites =
                accounts.length > 1 ? accounts[1].toBase58() : "Unknown";

              const record: SetFavoritesRecord = {
                slot,
                signature,
                user,
                favorites,
                number: params.number.toString(),
                color: params.color,
                timestamp: tx.blockTime ?? null,
              };

              records.push(record);
              totalRecords++;

              // 打印记录
              console.log(`\n🔔 发现 SET_FAVORITES 调用:`);
              console.log(`  区块: ${slot}`);
              console.log(`  交易签名: ${signature}`);
              console.log(`  用户: ${user}`);
              console.log(`  Favorites PDA: ${favorites}`);
              console.log(`  Number: ${params.number}`);
              console.log(`  Color: ${params.color}`);
              console.log(
                `  时间: ${tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "N/A"}`
              );
            } else {
              console.log(`  ⚠️  无法解析指令参数`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`处理交易 ${signature} 时出错:`, error);
  }

  return records;
}

async function continuousScan(): Promise<void> {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const allRecords: SetFavoritesRecord[] = [];

  console.log("🚀 启动 Favorites 合约 set_favorites 实时监控...");
  console.log(`RPC 端点: ${RPC_ENDPOINT}`);
  console.log(`Favorites 程序 ID: ${FAVORITES_PROGRAM_ID.toBase58()}`);
  console.log(`扫描间隔: ${SCAN_INTERVAL}ms\n`);

  // 设置优雅退出处理
  let isRunning = true;
  process.on("SIGINT", () => {
    console.log("\n\n收到退出信号，正在保存数据...");
    isRunning = false;
  });

  // 获取当前最新的签名作为起点（不处理，只作为标记）
  console.log("正在获取当前最新区块位置...");
  const initialSignatures = await connection.getSignaturesForAddress(
    FAVORITES_PROGRAM_ID,
    { limit: 1 }
  );

  let lastProcessedSignature: string | undefined =
    initialSignatures.length > 0 ? initialSignatures[0].signature : undefined;

  if (lastProcessedSignature) {
    console.log(
      `✅ 从当前位置开始监控 (最新交易: ${lastProcessedSignature.slice(0, 8)}...)`
    );
  } else {
    console.log(`✅ 开始监控 (暂无历史交易)`);
  }
  console.log(`\n开始监控新的 Favorites 交易...\n`);

  // 已处理的签名集合
  const processedSignatures = new Set<string>();
  if (lastProcessedSignature) {
    processedSignatures.add(lastProcessedSignature);
  }

  // 持续扫描
  while (isRunning) {
    try {
      // 获取最新的交易
      const signatures = await connection.getSignaturesForAddress(
        FAVORITES_PROGRAM_ID,
        { limit: 10 }
      );

      if (signatures.length > 0) {
        // 过滤出新的交易
        const newSignatures = signatures.filter(
          (sig) => !processedSignatures.has(sig.signature)
        );

        if (newSignatures.length > 0) {
          console.log(`\n检测到 ${newSignatures.length} 个新交易`);

          // 反向处理（从旧到新）
          for (let i = newSignatures.length - 1; i >= 0; i--) {
            const sig = newSignatures[i];

            const records = await processSignature(
              connection,
              sig.signature,
              sig.slot
            );
            allRecords.push(...records);

            // 标记为已处理
            processedSignatures.add(sig.signature);
          }

          // 打印当前统计
          if (totalRecords > 0) {
            console.log(
              `\n📊 当前统计: 总计 ${totalRecords} 次 set_favorites 调用`
            );
          }
        } else {
          // 没有新交易，等待
          process.stdout.write(`\r⏳ 等待新交易...`);
        }
      } else {
        // 没有任何交易
        process.stdout.write(`\r⏳ 等待新交易...`);
      }

      // 等待一段时间再检查
      await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL));
    } catch (error) {
      console.error("\n扫描过程中出错:", error);
      await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL));
    }
  }

  // 保存结果
  if (allRecords.length > 0) {
    const outputFile = `favorites_records_${Date.now()}.json`;
    fs.writeFileSync(outputFile, JSON.stringify(allRecords, null, 2));
    console.log(`\n✅ 结果已保存到: ${outputFile}`);
  }

  console.log("\n=== 扫描已停止 ===");
  console.log(`总共发现 ${totalRecords} 次 set_favorites 调用`);
}

// 主函数
async function main() {
  await continuousScan();
}

main().catch((error) => {
  console.error("扫描失败:", error);
  process.exit(1);
});

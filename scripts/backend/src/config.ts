import path from "path";
import fs from "fs";

// 本地开发使用 HTTP (轮询)
export const RPC_ENDPOINT =
  process.env.SOLANA_RPC_ENDPOINT ?? "http://localhost:8899";

// 生产环境使用 WSS (真实时监听)
// export const RPC_ENDPOINT = "wss://api.devnet.solana.com";
export const PROGRAM_ID =
  process.env.FAVORITES_PROGRAM_ID ??
  "5AW6PAZ89DAt53CvW7iinQFKHjW5DZymrgn4uNY7GV1E";

const defaultKeypair = path.resolve(
  process.env.HOME || "",
  ".config/solana/id.json"
);
const localKeypair = path.resolve(process.cwd(), "keypair.json");

export const PAYER_KEYPAIR_PATH =
  process.env.PAYER_KEYPAIR_PATH ??
  (fs.existsSync(localKeypair)
    ? localKeypair
    : fs.existsSync(defaultKeypair)
      ? defaultKeypair
      : localKeypair);

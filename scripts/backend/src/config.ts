import path from "path";

// 本地开发使用 HTTP (轮询)
export const RPC_ENDPOINT =
  process.env.SOLANA_RPC_ENDPOINT ?? "http://localhost:8899";

// 生产环境使用 WSS (真实时监听)
// export const RPC_ENDPOINT = "wss://api.devnet.solana.com";
export const PROGRAM_ID =
  process.env.FAVORITES_PROGRAM_ID ??
  "4Sq6MsHjGc71x4cCXXnpxqVErDptwCmrdJjZexrrnCVK";

export const PAYER_KEYPAIR_PATH =
  process.env.PAYER_KEYPAIR_PATH ?? path.resolve(process.cwd(), "keypair.json");

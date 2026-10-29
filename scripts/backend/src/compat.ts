import {
  PublicKey,
  Connection,
  Message,
  MessageV0,
  SolanaJSONRPCError,
} from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BN = require("bn.js");

// 1. PublicKey.prototype.toBuffer
if (!(PublicKey.prototype as any).toBuffer) {
  (PublicKey.prototype as any).toBuffer = function () {
    return Buffer.from(this.toBytes());
  };
}

// 2. PublicKey.prototype._bn
if (!("_bn" in PublicKey.prototype)) {
  Object.defineProperty(PublicKey.prototype, "_bn", {
    get() {
      return new BN(this.toBytes());
    },
    configurable: true,
  });
}

// 3. PublicKey.prototype.equals (支持跨版本 v1 / v3 实例比较)
PublicKey.prototype.equals = function (address: any) {
  if (this === address) return true;
  if (!address) return false;
  const left = (this as any)._publicKeyBytes || this.toBytes();
  const right =
    address._publicKeyBytes ||
    (typeof address.toBytes === "function" ? address.toBytes() : undefined);
  if (!right) return false;
  for (let i = 0; i < 32; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
};

// 4. PublicKey.findProgramAddressSync & createProgramAddressSync
if (!(PublicKey as any).findProgramAddressSync) {
  (PublicKey as any).createProgramAddressSync = function (
    seeds: Array<Uint8Array | Buffer>,
    programId: PublicKey
  ) {
    let buf = Buffer.alloc(0);
    for (const seed of seeds) {
      if (seed.length > 32) {
        throw new TypeError("Max seed length exceeded");
      }
      buf = Buffer.concat([buf, Buffer.from(seed)]);
    }
    const pidBytes = Buffer.from(
      (programId as any).toBytes ? programId.toBytes() : (programId as any)
    );
    buf = Buffer.concat([buf, pidBytes, Buffer.from("ProgramDerivedAddress")]);
    const hash = sha256(buf);
    try {
      ed25519.ExtendedPoint.fromHex(Buffer.from(hash).toString("hex"));
      throw new Error("Invalid seeds, address must fall off the curve");
    } catch (e: any) {
      if (e.message && e.message.includes("curve")) {
        throw e;
      }
      return new PublicKey(hash);
    }
  };

  (PublicKey as any).findProgramAddressSync = function (
    seeds: Array<Uint8Array | Buffer>,
    programId: PublicKey
  ) {
    for (let nonce = 255; nonce >= 0; nonce--) {
      try {
        const pda = (PublicKey as any).createProgramAddressSync(
          seeds.concat([Buffer.from([nonce])]),
          programId
        );
        return [pda, nonce];
      } catch (e: any) {
        if (e.message && e.message.includes("curve")) continue;
        throw e;
      }
    }
    throw new Error("Unable to find a viable program address nonce");
  };
}

// 5. Wrap Connection methods to return Buffer for data (适配 Anchor IDL 解码)
const origGetAccountInfo = Connection.prototype.getAccountInfo;
Connection.prototype.getAccountInfo = async function (
  this: any,
  ...args: any[]
) {
  const info = await origGetAccountInfo.apply(this, args as any);
  if (info && info.data && !Buffer.isBuffer(info.data)) {
    (info as any).data = Buffer.from(info.data);
  }
  return info;
} as any;

// 适配 SPL Token / v1 库对 getMinimumBalanceForRentExemption 的 number 类型假设
const origGetMinimumBalance =
  Connection.prototype.getMinimumBalanceForRentExemption;
Connection.prototype.getMinimumBalanceForRentExemption = async function (
  this: any,
  ...args: any[]
) {
  const lamports = await origGetMinimumBalance.apply(this, args as any);
  return Number(lamports);
} as any;

const origGetAccountInfoAndContext =
  Connection.prototype.getAccountInfoAndContext;
Connection.prototype.getAccountInfoAndContext = async function (
  this: any,
  ...args: any[]
) {
  const res = await origGetAccountInfoAndContext.apply(this, args as any);
  if (res && res.value && res.value.data && !Buffer.isBuffer(res.value.data)) {
    (res.value as any).data = Buffer.from(res.value.data);
  }
  return res;
} as any;

const origGetProgramAccounts = Connection.prototype.getProgramAccounts;
Connection.prototype.getProgramAccounts = async function (
  this: any,
  ...args: any[]
) {
  const res = await origGetProgramAccounts.apply(this, args as any);
  if (Array.isArray(res)) {
    for (const item of res) {
      if (
        item.account &&
        item.account.data &&
        !Buffer.isBuffer(item.account.data)
      ) {
        (item.account as any).data = Buffer.from(item.account.data);
      }
    }
  }
  return res;
} as any;

const origGetMultipleAccountsInfo =
  Connection.prototype.getMultipleAccountsInfo;
Connection.prototype.getMultipleAccountsInfo = async function (
  this: any,
  ...args: any[]
) {
  const res = await origGetMultipleAccountsInfo.apply(this, args as any);
  if (Array.isArray(res)) {
    for (const item of res) {
      if (item && item.data && !Buffer.isBuffer(item.data)) {
        (item as any).data = Buffer.from(item.data);
      }
    }
  }
  return res;
} as any;

// 6. 适配 Connection.prototype.getBlock:
// @solana/web3.js v3 内部构造 RPC 请求时丢弃了 encoding 参数，
// 当对端节点（如 Surfpool 或未显式指定 encoding 的环境）返回 jsonParsed 或混合格式时，
// v3 的底层 mapper 会因将 parsed 指令/对象当做 compiled 指令处理而抛出：
// "ix.accounts is not iterable" 或 "Invalid public key input"。
// 此处拦截 getBlock 显式传递 encoding: "json"，并可靠构造 Message / MessageV0 实例。
const origGetBlock = Connection.prototype.getBlock;
Connection.prototype.getBlock = async function (
  this: Connection,
  slot: number,
  rawConfig?: any
) {
  try {
    const commitment =
      (rawConfig && rawConfig.commitment) ||
      (this as any)._commitment ||
      "confirmed";
    const slotNum = typeof slot === "bigint" ? Number(slot) : Number(slot);
    const config = {
      commitment,
      encoding: "json",
      maxSupportedTransactionVersion: 0,
      transactionDetails: "full",
      rewards: false,
      ...(rawConfig || {}),
    };

    const res = await fetch(this.rpcEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...((this as any)._rpcHttpHeaders || {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBlock",
        params: [slotNum, config],
      }),
    });

    const json = (await res.json()) as any;
    if (json.error) {
      const err = new (SolanaJSONRPCError as any)(
        json.error,
        "failed to get confirmed block"
      );
      (err as any).code = json.error.code;
      (err as any).data = json.error.data;
      throw err;
    }

    const result = json.result;
    if (!result) return null;

    return {
      blockhash: result.blockhash,
      previousBlockhash: result.previousBlockhash,
      parentSlot: result.parentSlot,
      blockTime: result.blockTime,
      blockHeight: result.blockHeight,
      rewards: result.rewards,
      transactions: (result.transactions || []).map((txRes: any) => {
        const version = txRes.version;
        const rawMsg = txRes.transaction.message;
        let message: any;

        const rawAccountKeys = (rawMsg.accountKeys || []).map((k: any) =>
          typeof k === "string" ? k : (k.pubkey ?? k)
        );

        if (version === "legacy" || version === undefined) {
          message = new Message({
            header: rawMsg.header,
            accountKeys: rawAccountKeys,
            recentBlockhash: rawMsg.recentBlockhash,
            instructions: (rawMsg.instructions || []).map((ix: any) => ({
              programIdIndex: ix.programIdIndex,
              accounts: ix.accounts ?? ix.accountKeyIndexes ?? [],
              data: ix.data,
              ...(ix.stackHeight != null
                ? { stackHeight: ix.stackHeight }
                : {}),
            })),
          });
        } else {
          message = new MessageV0({
            header: rawMsg.header,
            staticAccountKeys: rawAccountKeys.map(
              (k: string) => new PublicKey(k)
            ),
            recentBlockhash: rawMsg.recentBlockhash,
            compiledInstructions: (rawMsg.instructions || []).map(
              (ix: any) => ({
                programIdIndex: ix.programIdIndex,
                accountKeyIndexes: [
                  ...(ix.accounts ?? ix.accountKeyIndexes ?? []),
                ],
                data:
                  typeof ix.data === "string"
                    ? bs58.decode(ix.data)
                    : ix.data
                      ? Uint8Array.from(ix.data)
                      : new Uint8Array(0),
              })
            ),
            addressTableLookups: (rawMsg.addressTableLookups || []).map(
              (lookup: any) => ({
                accountKey: new PublicKey(
                  typeof lookup.accountKey === "string"
                    ? lookup.accountKey
                    : lookup.accountKey.pubkey
                ),
                writableIndexes: [...lookup.writableIndexes],
                readonlyIndexes: [...lookup.readonlyIndexes],
              })
            ),
          });
        }

        return {
          version,
          meta: txRes.meta,
          transaction: {
            signatures: txRes.transaction.signatures,
            message,
          },
        };
      }),
    };
  } catch (err: any) {
    if (err instanceof SolanaJSONRPCError) {
      throw err;
    }
    return origGetBlock.apply(this, [slot, rawConfig] as any);
  }
} as any;

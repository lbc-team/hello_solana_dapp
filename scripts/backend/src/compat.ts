import { PublicKey, Connection } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";
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
Connection.prototype.getAccountInfo = (async function (
  this: any,
  ...args: any[]
) {
  const info = await origGetAccountInfo.apply(this, args as any);
  if (info && info.data && !Buffer.isBuffer(info.data)) {
    (info as any).data = Buffer.from(info.data);
  }
  return info;
}) as any;

// 适配 SPL Token / v1 库对 getMinimumBalanceForRentExemption 的 number 类型假设
const origGetMinimumBalance =
  Connection.prototype.getMinimumBalanceForRentExemption;
Connection.prototype.getMinimumBalanceForRentExemption = (async function (
  this: any,
  ...args: any[]
) {
  const lamports = await origGetMinimumBalance.apply(this, args as any);
  return Number(lamports);
}) as any;

const origGetAccountInfoAndContext =
  Connection.prototype.getAccountInfoAndContext;
Connection.prototype.getAccountInfoAndContext = (async function (
  this: any,
  ...args: any[]
) {
  const res = await origGetAccountInfoAndContext.apply(this, args as any);
  if (res && res.value && res.value.data && !Buffer.isBuffer(res.value.data)) {
    (res.value as any).data = Buffer.from(res.value.data);
  }
  return res;
}) as any;

const origGetProgramAccounts = Connection.prototype.getProgramAccounts;
Connection.prototype.getProgramAccounts = (async function (
  this: any,
  ...args: any[]
) {
  const res = await origGetProgramAccounts.apply(this, args as any);
  if (Array.isArray(res)) {
    for (const item of res) {
      if (item.account && item.account.data && !Buffer.isBuffer(item.account.data)) {
        (item.account as any).data = Buffer.from(item.account.data);
      }
    }
  }
  return res;
}) as any;

const origGetMultipleAccountsInfo =
  Connection.prototype.getMultipleAccountsInfo;
Connection.prototype.getMultipleAccountsInfo = (async function (
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
}) as any;

"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  AccountRole,
  address as parseAddress,
  getStructEncoder,
  getU32Encoder,
  getU64Encoder,
  type Address,
  type Instruction,
} from "@solana/kit";
import { useWallet } from "../lib/wallet/context";
import { useSolanaClient } from "../lib/solana-client-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { lamportsFromSol, lamportsToSolString } from "../lib/lamports";
import { ellipsify } from "../lib/explorer";
import { useCluster } from "./cluster-context";
import { parseTransactionError } from "../lib/errors";

const SYSTEM_PROGRAM_ADDRESS =
  "11111111111111111111111111111111" as Address<"11111111111111111111111111111111">;
const TOKEN_PROGRAM_ADDRESS = parseAddress(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const TOKEN_2022_PROGRAM_ADDRESS = parseAddress(
  "TokenzQdYhSLiBZ7uEbGf2ZkVVY5KPjb4rUd3eKqpQn"
);

type TokenRow = {
  account: Address;
  mint: string;
  amount: string;
  decimals: number;
};

function createTransferSolInstruction({
  source,
  destination,
  lamports,
}: {
  source: Address;
  destination: Address;
  lamports: bigint;
}): Instruction {
  return {
    programAddress: SYSTEM_PROGRAM_ADDRESS,
    accounts: [
      { address: source, role: AccountRole.WRITABLE_SIGNER },
      { address: destination, role: AccountRole.WRITABLE },
    ],
    data: getStructEncoder([
      ["instruction", getU32Encoder()],
      ["lamports", getU64Encoder()],
    ]).encode({ instruction: 2, lamports }),
  };
}

function formatBlockTime(value: bigint | number | null) {
  if (value == null) return "-";
  return new Date(Number(value) * 1000).toLocaleString();
}

export function AccountCard() {
  const { wallet, signer, status } = useWallet();
  const client = useSolanaClient();
  const { cluster, getExplorerUrl } = useCluster();
  const { send, isSending } = useSendTransaction();

  const connectedAddress = wallet?.account.address;
  const [addressInput, setAddressInput] = useState("");
  const [inspectedAddress, setInspectedAddress] = useState<Address | null>(
    null
  );
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [isAirdropping, setIsAirdropping] = useState(false);

  const targetAddress = useMemo(
    () => inspectedAddress ?? connectedAddress ?? null,
    [connectedAddress, inspectedAddress]
  );

  const accountInfo = useSWR(
    targetAddress ? (["account-info", cluster, targetAddress] as const) : null,
    async ([, , target]) => {
      const { value } = await client.rpc
        .getAccountInfo(target, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();
      return value;
    }
  );

  const signatures = useSWR(
    targetAddress ? (["signatures", cluster, targetAddress] as const) : null,
    async ([, , target]) =>
      await client.rpc
        .getSignaturesForAddress(target, {
          commitment: "confirmed",
          limit: 8,
        })
        .send()
  );

  const tokenAccounts = useSWR(
    targetAddress ? (["token-accounts", cluster, targetAddress] as const) : null,
    async ([, , target]) => {
      const [legacy, token2022] = await Promise.all([
        client.rpc
          .getTokenAccountsByOwner(
            target,
            { programId: TOKEN_PROGRAM_ADDRESS },
            { commitment: "confirmed", encoding: "jsonParsed" }
          )
          .send(),
        client.rpc
          .getTokenAccountsByOwner(
            target,
            { programId: TOKEN_2022_PROGRAM_ADDRESS },
            { commitment: "confirmed", encoding: "jsonParsed" }
          )
          .send(),
      ]);

      const legacyRows = "value" in legacy ? legacy.value : legacy;
      const token2022Rows = "value" in token2022 ? token2022.value : token2022;

      return [...legacyRows, ...token2022Rows].map((item) => {
        const parsed = item.account.data.parsed.info;
        return {
          account: item.pubkey,
          mint: String(parsed.mint),
          amount: String(parsed.tokenAmount.uiAmountString ?? "0"),
          decimals: Number(parsed.tokenAmount.decimals ?? 0),
        } satisfies TokenRow;
      });
    }
  );

  const handleInspect = useCallback(() => {
    try {
      setInspectedAddress(parseAddress(addressInput.trim()));
    } catch {
      toast.error("Invalid Solana address.");
    }
  }, [addressInput]);

  const refreshAccount = useCallback(async () => {
    await Promise.all([
      accountInfo.mutate(),
      signatures.mutate(),
      tokenAccounts.mutate(),
    ]);
  }, [accountInfo, signatures, tokenAccounts]);

  const handleAirdrop = useCallback(async () => {
    if (!targetAddress) return;
    setIsAirdropping(true);
    try {
      const signature = await client.airdrop(targetAddress, lamportsFromSol(1));
      toast.success("Airdrop confirmed.", {
        description: signature ? (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ) : undefined,
      });
      await refreshAccount();
    } catch (err) {
      console.error("Airdrop failed:", err);
      toast.error(parseTransactionError(err));
    } finally {
      setIsAirdropping(false);
    }
  }, [client, getExplorerUrl, refreshAccount, targetAddress]);

  const handleTransfer = useCallback(async () => {
    if (!connectedAddress || !signer) return;
    try {
      const destinationAddress = parseAddress(destination.trim());
      const lamports = lamportsFromSol(parseFloat(amount));
      const instruction = createTransferSolInstruction({
        source: connectedAddress,
        destination: destinationAddress,
        lamports,
      });
      const signature = await send({ instructions: [instruction] });
      toast.success("Transfer confirmed.", {
        description: (
          <a
            href={getExplorerUrl(`/tx/${signature}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });
      setDestination("");
      await refreshAccount();
    } catch (err) {
      console.error("Transfer failed:", err);
      toast.error(parseTransactionError(err));
    }
  }, [
    amount,
    connectedAddress,
    destination,
    getExplorerUrl,
    refreshAccount,
    send,
    signer,
  ]);

  return (
    <section className="w-full space-y-5 rounded-2xl border border-border-low bg-card p-6 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-lg font-semibold">Account</p>
          <p className="text-sm text-muted">
            Inspect balances, token accounts, and recent signatures.
          </p>
        </div>
        <button
          onClick={refreshAccount}
          disabled={!targetAddress}
          className="rounded-md border border-border-low px-3 py-1.5 text-xs transition hover:bg-cream disabled:pointer-events-none disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <input
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border-low bg-card px-4 py-2.5 font-mono text-sm outline-none transition placeholder:text-muted focus:border-foreground/30"
          placeholder={connectedAddress ?? "Account address"}
        />
        <button
          onClick={handleInspect}
          disabled={!addressInput.trim()}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          Inspect
        </button>
        {inspectedAddress && connectedAddress && (
          <button
            onClick={() => {
              setInspectedAddress(null);
              setAddressInput("");
            }}
            className="rounded-lg border border-border-low px-5 py-2.5 text-sm font-medium transition hover:bg-cream"
          >
            My wallet
          </button>
        )}
      </div>

      {!targetAddress ? (
        <div className="rounded-lg bg-cream/50 p-4 text-center text-sm text-muted">
          Connect a wallet or enter an address.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border-low bg-cream/30 p-4">
            <p className="text-xs uppercase tracking-wide text-muted">
              Address
            </p>
            <a
              href={getExplorerUrl(`/address/${targetAddress}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block truncate font-mono text-sm underline underline-offset-2"
            >
              {targetAddress}
            </a>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-card p-3">
                <p className="text-xs text-muted">Balance</p>
                <p className="mt-1 font-mono text-xl font-semibold">
                  {accountInfo.data
                    ? lamportsToSolString(accountInfo.data.lamports)
                    : accountInfo.isLoading
                      ? "..."
                      : "0"}{" "}
                  SOL
                </p>
              </div>
              <div className="rounded-lg bg-card p-3">
                <p className="text-xs text-muted">Owner</p>
                <p className="mt-1 truncate font-mono text-xs">
                  {accountInfo.data
                    ? ellipsify(accountInfo.data.owner, 4)
                    : "-"}
                </p>
              </div>
              <div className="rounded-lg bg-card p-3">
                <p className="text-xs text-muted">Space</p>
                <p className="mt-1 font-mono text-xl font-semibold">
                  {accountInfo.data ? accountInfo.data.space.toString() : "-"}
                </p>
              </div>
              <div className="rounded-lg bg-card p-3">
                <p className="text-xs text-muted">Executable</p>
                <p className="mt-1 text-xl font-semibold">
                  {accountInfo.data?.executable ? "Yes" : "No"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
            <div className="space-y-3 rounded-xl border border-border-low bg-cream/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Airdrop</p>
                <span className="text-xs uppercase text-muted">{cluster}</span>
              </div>
              <button
                onClick={handleAirdrop}
                disabled={cluster === "mainnet" || isAirdropping}
                className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm font-medium transition hover:bg-cream disabled:pointer-events-none disabled:opacity-50"
              >
                {isAirdropping ? "Requesting..." : "Request 1 SOL"}
              </button>
            </div>

            <div className="space-y-3 rounded-xl border border-border-low bg-cream/30 p-4">
              <p className="text-sm font-medium">Send SOL</p>
              {status !== "connected" ? (
                <p className="rounded-lg bg-card p-3 text-sm text-muted">
                  Wallet not connected
                </p>
              ) : (
                <div className="space-y-3">
                  <input
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 font-mono text-sm outline-none transition placeholder:text-muted focus:border-foreground/30"
                    placeholder="Destination address"
                  />
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-foreground/30"
                    placeholder="Amount in SOL"
                  />
                  <button
                    onClick={handleTransfer}
                    disabled={
                      isSending ||
                      !destination.trim() ||
                      !amount ||
                      parseFloat(amount) <= 0
                    }
                    className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isSending ? "Confirming..." : "Send"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3 rounded-xl border border-border-low bg-cream/30 p-4">
              <p className="text-sm font-medium">Token Accounts</p>
              <div className="space-y-2">
                {tokenAccounts.isLoading ? (
                  <p className="rounded-lg bg-card p-3 text-sm text-muted">
                    Loading...
                  </p>
                ) : (tokenAccounts.data?.length ?? 0) === 0 ? (
                  <p className="rounded-lg bg-card p-3 text-sm text-muted">
                    No token accounts found.
                  </p>
                ) : (
                  tokenAccounts.data?.slice(0, 8).map((item) => (
                    <a
                      key={item.account}
                      href={getExplorerUrl(`/address/${item.account}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid gap-1 rounded-lg bg-card p-3 text-sm transition hover:bg-background"
                    >
                      <span className="truncate font-mono text-xs text-muted">
                        {item.account}
                      </span>
                      <span className="font-medium">
                        {item.amount}{" "}
                        <span className="text-xs text-muted">
                          decimals {item.decimals}
                        </span>
                      </span>
                      <span className="truncate font-mono text-xs text-muted">
                        Mint {item.mint}
                      </span>
                    </a>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border-low bg-cream/30 p-4">
              <p className="text-sm font-medium">Recent Transactions</p>
              <div className="space-y-2">
                {signatures.isLoading ? (
                  <p className="rounded-lg bg-card p-3 text-sm text-muted">
                    Loading...
                  </p>
                ) : (signatures.data?.length ?? 0) === 0 ? (
                  <p className="rounded-lg bg-card p-3 text-sm text-muted">
                    No transactions found.
                  </p>
                ) : (
                  signatures.data?.map((item) => (
                    <a
                      key={item.signature}
                      href={getExplorerUrl(`/tx/${item.signature}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid gap-1 rounded-lg bg-card p-3 text-sm transition hover:bg-background"
                    >
                      <span className="truncate font-mono text-xs">
                        {item.signature}
                      </span>
                      <span className="flex items-center justify-between gap-3 text-xs text-muted">
                        <span>Slot {item.slot.toString()}</span>
                        <span>{formatBlockTime(item.blockTime)}</span>
                        <span
                          className={
                            item.err ? "text-destructive" : "text-foreground"
                          }
                        >
                          {item.err ? "Failed" : "Success"}
                        </span>
                      </span>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { type Address } from "@solana/kit";
import { useWallet } from "../lib/wallet/context";
import { useSolanaClient } from "../lib/solana-client-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { ellipsify } from "../lib/explorer";
import { useCluster } from "./cluster-context";
import {
  decodeFavorites,
  FAVORITES_PROGRAM_ADDRESS,
  fetchMaybeFavorites,
  findFavoritesPda,
  getSetFavoritesInstruction,
  getSetFavoritesInstructionAsync,
} from "../generated/favorites";
import { parseTransactionError } from "../lib/errors";

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function FavoritesCard() {
  const { wallet, signer, status } = useWallet();
  const client = useSolanaClient();
  const { send, isSending } = useSendTransaction();
  const { cluster, getExplorerUrl } = useCluster();

  const [number, setNumber] = useState("");
  const [color, setColor] = useState("");
  const [favoritesAddress, setFavoritesAddress] = useState<Address | null>(
    null
  );

  const walletAddress = wallet?.account.address;
  const parsedFavoriteNumber = useMemo(() => {
    if (!number) return null;
    if (!/^\d+$/.test(number)) return null;
    return BigInt(number);
  }, [number]);

  useEffect(() => {
    let cancelled = false;

    async function deriveFavoritesPda() {
      if (!signer) {
        setFavoritesAddress(null);
        return;
      }

      try {
        const ix = await getSetFavoritesInstructionAsync({
          user: signer,
          number: 0n,
          color: "",
        });
        const pda = ix.accounts[1]?.address;
        if (!cancelled) setFavoritesAddress((pda as Address) ?? null);
      } catch {
        if (!cancelled) setFavoritesAddress(null);
      }
    }

    void deriveFavoritesPda();
    return () => {
      cancelled = true;
    };
  }, [signer]);

  const currentQuery = useSWR(
    favoritesAddress
      ? (["favorites-current", cluster, favoritesAddress] as const)
      : null,
    async ([, , pda]) => {
      const account = await fetchMaybeFavorites(client.rpc, pda, {
        commitment: "confirmed",
      });
      return account.exists ? account.data : null;
    }
  );

  const allFavoritesQuery = useSWR(
    ["favorites-all", cluster] as const,
    async () => {
      const accounts = await client.rpc
        .getProgramAccounts(FAVORITES_PROGRAM_ADDRESS, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();

      return accounts.flatMap((item) => {
        try {
          const data = item.account.data[0];
          const account = decodeFavorites({
            address: item.pubkey,
            data: base64ToBytes(data),
            executable: item.account.executable,
            lamports: item.account.lamports,
            programAddress: item.account.owner,
            space: item.account.space,
          });
          return [{ address: item.pubkey, data: account.data }];
        } catch (err) {
          console.warn(
            "Skipping undecodable favorites account",
            item.pubkey,
            err
          );
          return [];
        }
      });
    }
  );

  const current = currentQuery.data ?? null;
  const allFavorites = allFavoritesQuery.data ?? [];
  const isLoading = currentQuery.isLoading || allFavoritesQuery.isLoading;

  const handleSubmit = useCallback(async () => {
    if (!signer || !walletAddress) return;
    if (parsedFavoriteNumber == null) {
      toast.error("Number must be a whole number.");
      return;
    }
    if (color.length > 50) {
      toast.error("Color must be 50 characters or fewer.");
      return;
    }

    try {
      const [pda] = await findFavoritesPda({ user: walletAddress });
      const instruction = getSetFavoritesInstruction({
        user: signer,
        favorites: pda,
        number: parsedFavoriteNumber,
        color,
      });

      const signature = await send({ instructions: [instruction] });
      toast.success("Favorites saved.", {
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

      setNumber("");
      setColor("");
      await currentQuery.mutate();
      await allFavoritesQuery.mutate();
    } catch (err) {
      console.error("Set favorites failed:", err);
      toast.error(parseTransactionError(err));
    }
  }, [
    color,
    allFavoritesQuery,
    currentQuery,
    getExplorerUrl,
    parsedFavoriteNumber,
    send,
    signer,
    walletAddress,
  ]);

  return (
    <section className="w-full space-y-5 rounded-2xl border border-border-low bg-card p-6 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-lg font-semibold">Favorites</p>
          <p className="text-sm text-muted">
            Store a number and color in a PDA derived from your wallet.
          </p>
        </div>
        <a
          href={getExplorerUrl(`/address/${FAVORITES_PROGRAM_ADDRESS}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-cream px-3 py-1 text-xs font-medium text-muted transition hover:text-foreground"
        >
          Program {ellipsify(FAVORITES_PROGRAM_ADDRESS, 4)}
        </a>
      </div>

      {status !== "connected" ? (
        <div className="rounded-lg bg-cream/50 p-4 text-center text-sm text-muted">
          Wallet not connected
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
          <div className="space-y-4 rounded-xl border border-border-low bg-cream/30 p-4">
            <div>
              <label
                htmlFor="favorite-number"
                className="text-xs uppercase tracking-wide text-muted"
              >
                Number
              </label>
              <input
                id="favorite-number"
                type="number"
                min="0"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-foreground/30"
                placeholder="42"
              />
            </div>
            <div>
              <label
                htmlFor="favorite-color"
                className="text-xs uppercase tracking-wide text-muted"
              >
                Color
              </label>
              <input
                id="favorite-color"
                type="text"
                value={color}
                maxLength={50}
                onChange={(event) => setColor(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-foreground/30"
                placeholder="blue"
              />
            </div>
            <button
              onClick={handleSubmit}
              disabled={
                isSending || parsedFavoriteNumber == null || !color.trim()
              }
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isSending ? "Confirming..." : "Save favorites"}
            </button>
          </div>

          <div className="space-y-4 rounded-xl border border-border-low bg-cream/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-muted">
                Current PDA
              </p>
              <button
                onClick={() => void currentQuery.mutate()}
                className="rounded-md border border-border-low px-2 py-1 text-xs transition hover:bg-card"
              >
                Refresh
              </button>
            </div>
            {favoritesAddress && (
              <a
                href={getExplorerUrl(`/address/${favoritesAddress}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate font-mono text-xs text-muted underline underline-offset-2"
              >
                {favoritesAddress}
              </a>
            )}
            {current ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-card p-3">
                  <p className="text-xs text-muted">Number</p>
                  <p className="mt-1 font-mono text-2xl font-semibold">
                    {current.number.toString()}
                  </p>
                </div>
                <div className="rounded-lg bg-card p-3">
                  <p className="text-xs text-muted">Color</p>
                  <p className="mt-1 truncate text-2xl font-semibold">
                    {current.color || "-"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="rounded-lg bg-card p-3 text-sm text-muted">
                {isLoading ? "Loading..." : "No favorites account found."}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-border-low pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Program Accounts</p>
          <button
            onClick={() => void allFavoritesQuery.mutate()}
            className="rounded-md border border-border-low px-3 py-1.5 text-xs transition hover:bg-cream"
          >
            Refresh all
          </button>
        </div>
        <div className="grid gap-2">
          {allFavorites.length === 0 ? (
            <p className="rounded-lg bg-cream/30 p-3 text-sm text-muted">
              {isLoading ? "Loading..." : "No favorites accounts found."}
            </p>
          ) : (
            allFavorites.slice(0, 8).map((item) => (
              <a
                key={item.address}
                href={getExplorerUrl(`/address/${item.address}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="grid gap-2 rounded-lg border border-border-low bg-cream/30 p-3 text-sm transition hover:bg-cream md:grid-cols-[1fr_auto]"
              >
                <span className="truncate font-mono text-xs text-muted">
                  {item.address}
                </span>
                <span className="font-medium">
                  {item.data.number.toString()} / {item.data.color || "-"}
                </span>
              </a>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

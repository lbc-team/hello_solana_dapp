"use client";

import { AccountCard } from "../components/account-card";
import { AppHeader } from "../components/app-header";
import { GridBackground } from "../components/grid-background";

export default function AccountPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <div className="relative z-10">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-6 pb-20 pt-8">
          <section className="mb-10">
            <h1 className="text-5xl font-black tracking-tight md:text-6xl">
              Account
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Inspect an address, request local/devnet SOL, and send SOL from
              your connected wallet.
            </p>
          </section>
          <AccountCard />
        </main>
      </div>
    </div>
  );
}

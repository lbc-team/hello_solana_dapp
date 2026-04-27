"use client";

import Link from "next/link";
import { ClusterSelect } from "./cluster-select";
import { ThemeToggle } from "./theme-toggle";
import { WalletButton } from "./wallet-button";

const navItems = [
  { href: "/", label: "Vault" },
  { href: "/favorites", label: "Favorites" },
  { href: "/account", label: "Account" },
];

export function AppHeader() {
  return (
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
      <Link href="/" className="text-sm font-semibold tracking-tight">
        Solana Starter Kit
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <nav className="flex items-center gap-1 rounded-lg border border-border-low bg-card p-1 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-muted transition hover:bg-cream hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
        <ClusterSelect />
        <WalletButton />
      </div>
    </header>
  );
}

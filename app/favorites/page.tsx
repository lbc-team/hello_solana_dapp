"use client";

import { AppHeader } from "../components/app-header";
import { FavoritesCard } from "../components/favorites-card";
import { GridBackground } from "../components/grid-background";

export default function FavoritesPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />
      <div className="relative z-10">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-6 pb-20 pt-8">
          <section className="mb-10">
            <h1 className="text-5xl font-black tracking-tight md:text-6xl">
              Favorites
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Anchor PDA storage powered by the Codama-generated favorites
              client.
            </p>
          </section>
          <FavoritesCard />
        </main>
      </div>
    </div>
  );
}

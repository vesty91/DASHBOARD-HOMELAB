const foundations = [
  "Boards",
  "Widgets",
  "Integrations",
  "RBAC",
  "Monitoring",
  "Docker / NAS",
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
            Phase 1 bootstrap
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Homelab Dashboard
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
            Le squelette est prêt. Codex doit maintenant auditer la documentation,
            valider la stack et terminer les fondations avant toute fonctionnalité métier.
          </p>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {foundations.map((foundation) => (
            <article
              key={foundation}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5"
            >
              <div className="text-sm text-zinc-500">Module prévu</div>
              <div className="mt-2 text-lg font-medium">{foundation}</div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

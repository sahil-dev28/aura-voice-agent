import { CallWorkspace } from "@/components/call/call-workspace";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <p className="font-medium text-muted-foreground text-sm">Aura Assist</p>
        <h1 className="font-semibold text-2xl tracking-tight">Talk to Aria from Aura Skincare</h1>
      </header>
      <CallWorkspace />
    </main>
  );
}

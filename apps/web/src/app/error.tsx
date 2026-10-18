"use client";

import { Button } from "@aura/ui/components/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-semibold text-xl">Something went wrong</h1>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}

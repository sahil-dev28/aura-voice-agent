import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-semibold text-xl">Page not found</h1>
      <Link href="/" className="underline underline-offset-4">
        Back to Aria
      </Link>
    </main>
  );
}

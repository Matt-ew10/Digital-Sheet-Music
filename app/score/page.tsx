import type { Metadata } from "next";
import Link from "next/link";
import Score from "./score";

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Score</h1>
        <Link className="text-zinc-500 hover:underline" href="/">
          Home
        </Link>
      </header>

      <Score />
    </main>
  );
}

export const metadata: Metadata = {
  title: "Score",
};

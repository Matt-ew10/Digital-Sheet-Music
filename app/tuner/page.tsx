import type { Metadata } from "next";
import Link from "next/link";
import Tuner from "./tuner";

export default function Page() {
  return (
    <main className="flex flex-1 flex-col items-center gap-12 px-6 py-16">
      <header className="flex w-full max-w-md items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Tuner</h1>
        <Link className="text-zinc-500 hover:underline" href="/">
          Home
        </Link>
      </header>

      <Tuner />
    </main>
  );
}

export const metadata: Metadata = {
  title: "Tuner",
};

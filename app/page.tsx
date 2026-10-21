import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 py-16">
      <h1 className="text-2xl font-semibold">Digital Sheet Music</h1>

      <p className="text-zinc-600 dark:text-zinc-400">
        A score display for comparing five sheet music conditions with string
        players. The prototype is built in stages; this is the first one.
      </p>

      <ul className="flex flex-col gap-2">
        <li>
          <Link className="font-medium hover:underline" href="/tuner">
            Tuner
          </Link>
          <span className="text-zinc-500">: microphone pitch detection</span>
        </li>
      </ul>
    </main>
  );
}

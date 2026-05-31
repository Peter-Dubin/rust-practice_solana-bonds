import Link from "next/link";
import { getSession } from "@/lib/session";
import { AuthControls } from "./AuthControls";

export async function Header() {
  const session = await getSession();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Solana<span className="text-emerald-400">Bonds</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-300">
            <Link href="/token" className="hover:text-white">
              Tokens & Bonds
            </Link>
            {session && (
              <Link
                href={`/users/${session.userId}`}
                className="hover:text-white"
              >
                My Wallets
              </Link>
            )}
            <Link href="/users" className="hover:text-white">
              Users
            </Link>
          </nav>
        </div>
        <AuthControls userName={session?.name ?? null} />
      </div>
    </header>
  );
}

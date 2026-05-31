"use client";

import { useState } from "react";
import Link from "next/link";
import { useActiveWallet } from "./ActiveWalletContext";
import { explorerAddress, shortAddress } from "@/lib/explorer";
import {
  addWallet,
  requestAirdrop,
  getBalance,
  getTokenBalance,
  airdropSplTokenAction,
  type WalletListItem,
} from "@/app/users/[userId]/actions";
import type { TokenListItem } from "@/app/token/actions";

export function WalletsPanel({
  userId,
  initialWallets,
  tokens,
}: {
  userId: string;
  initialWallets: WalletListItem[];
  tokens: TokenListItem[];
}) {
  const [wallets, setWallets] = useState(initialWallets);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { activeWallet, setActiveWallet } = useActiveWallet();

  async function run<T>(fn: () => Promise<T>, label: (r: T) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(label(r));
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        disabled={busy}
        onClick={() =>
          run(
            () => addWallet(userId),
            (w) => {
              setWallets((prev) => [...prev, w]);
              return `Wallet created: ${w.address}`;
            }
          )
        }
        className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-500 disabled:opacity-50"
      >
        + Add wallet
      </button>

      {msg && (
        <p className="break-all rounded bg-zinc-900 p-3 text-xs text-zinc-300">
          {msg}
        </p>
      )}

      {wallets.length === 0 ? (
        <p className="text-zinc-500">No wallets yet.</p>
      ) : (
        <ul className="space-y-3">
          {wallets.map((w) => (
            <li
              key={w._id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={explorerAddress(w.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm text-emerald-400 hover:underline"
                >
                  {shortAddress(w.address, 6)}
                </a>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => getBalance(w.address),
                        (r) => `${shortAddress(w.address)} SOL: ${r.sol}`
                      )
                    }
                    className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
                  >
                    Check SOL
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => requestAirdrop(w.address, 1),
                        (r) => `Airdropped 1 SOL. Sig: ${r.signature}`
                      )
                    }
                    className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
                  >
                    Faucet 1 SOL
                  </button>
                  <button
                    onClick={() =>
                      setActiveWallet(
                        activeWallet === w.address ? null : w.address
                      )
                    }
                    className={`rounded px-2 py-1 text-xs ${
                      activeWallet === w.address
                        ? "bg-emerald-600"
                        : "bg-zinc-700 hover:bg-zinc-600"
                    }`}
                  >
                    {activeWallet === w.address ? "Active ✓" : "Set active"}
                  </button>
                  <Link
                    href={`/users/${userId}/wallets/${w._id}`}
                    className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
                  >
                    Open
                  </Link>
                </div>
              </div>

              {tokens.length > 0 && (
                <SplFaucet walletAddress={w.address} tokens={tokens} run={run} busy={busy} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SplFaucet({
  walletAddress,
  tokens,
  run,
  busy,
}: {
  walletAddress: string;
  tokens: TokenListItem[];
  run: <T>(fn: () => Promise<T>, label: (r: T) => string) => Promise<void>;
  busy: boolean;
}) {
  const [mint, setMint] = useState(tokens[0]?.mintAddress ?? "");
  const [amount, setAmount] = useState(100);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
      <span className="text-xs text-zinc-500">Faucet SPL:</span>
      <select
        value={mint}
        onChange={(e) => setMint(e.target.value)}
        className="rounded bg-zinc-800 px-2 py-1 text-xs"
      >
        {tokens.map((t) => (
          <option key={t._id} value={t.mintAddress}>
            {t.symbol}
          </option>
        ))}
      </select>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="w-20 rounded bg-zinc-800 px-2 py-1 text-xs"
      />
      <button
        disabled={busy}
        onClick={() =>
          run(
            () => airdropSplTokenAction(walletAddress, mint, amount),
            () => `Minted ${amount} to ${shortAddress(walletAddress)}`
          )
        }
        className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
      >
        Mint
      </button>
      <button
        disabled={busy}
        onClick={() =>
          run(
            () => getTokenBalance(mint, walletAddress),
            (r) => `Balance: ${r.amount} base units`
          )
        }
        className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
      >
        Check balance
      </button>
    </div>
  );
}

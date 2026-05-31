"use client";

import { useState } from "react";
import { explorerAddress, explorerTx, shortAddress } from "@/lib/explorer";
import {
  buyTokenAction,
  transferTokensAction,
  type TokenListItem,
} from "@/app/token/actions";

type Row = TokenListItem & { balance: string };

export function WalletDetailPanel({
  walletAddress,
  rows,
  stablecoins,
}: {
  walletAddress: string;
  rows: Row[];
  stablecoins: TokenListItem[];
}) {
  const [msg, setMsg] = useState<{ text: string; sig?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Buy form state
  const bonds = rows.filter((r) => r.tipo === "Bono");
  const [bondMint, setBondMint] = useState(bonds[0]?.mintAddress ?? "");
  const [stableMint, setStableMint] = useState(stablecoins[0]?.mintAddress ?? "");
  const [buyAmount, setBuyAmount] = useState(1);

  // Transfer form state
  const [xferMint, setXferMint] = useState(rows[0]?.mintAddress ?? "");
  const [xferTo, setXferTo] = useState("");
  const [xferAmount, setXferAmount] = useState(1);

  async function run(fn: () => Promise<{ signature?: string; ok?: boolean }>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ text: ok, sig: r.signature });
    } catch (e) {
      setMsg({ text: `Error: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <div className="rounded bg-zinc-900 p-3 text-sm">
          <p className="text-zinc-200">{msg.text}</p>
          {msg.sig && (
            <a
              href={explorerTx(msg.sig)}
              target="_blank"
              rel="noreferrer"
              className="break-all text-xs text-emerald-400 hover:underline"
            >
              {msg.sig}
            </a>
          )}
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Token holdings</h2>
        {rows.length === 0 ? (
          <p className="text-zinc-500">No tokens on-chain yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="py-2">Type</th>
                <th>Name</th>
                <th>Symbol</th>
                <th>Balance (base)</th>
                <th>Nominal</th>
                <th>Coupon %</th>
                <th>Years</th>
                <th>Mint</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-zinc-900">
                  <td className="py-2">{r.tipo}</td>
                  <td>{r.name}</td>
                  <td>{r.symbol}</td>
                  <td>{r.balance}</td>
                  <td>{r.nominal ?? "—"}</td>
                  <td>{r.porcentajeCupon ?? "—"}</td>
                  <td>{r.anos ?? "—"}</td>
                  <td>
                    {r.mintAddress && (
                      <a
                        href={explorerAddress(r.mintAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-emerald-400 hover:underline"
                      >
                        {shortAddress(r.mintAddress)}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {bonds.length > 0 && stablecoins.length > 0 && (
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="mb-3 font-semibold">Buy a bond</h2>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <Field label="Bond">
              <select
                value={bondMint}
                onChange={(e) => setBondMint(e.target.value)}
                className="rounded bg-zinc-800 px-2 py-1"
              >
                {bonds.map((b) => (
                  <option key={b._id} value={b.mintAddress}>
                    {b.symbol}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pay with">
              <select
                value={stableMint}
                onChange={(e) => setStableMint(e.target.value)}
                className="rounded bg-zinc-800 px-2 py-1"
              >
                {stablecoins.map((s) => (
                  <option key={s._id} value={s.mintAddress}>
                    {s.symbol}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Units">
              <input
                type="number"
                value={buyAmount}
                onChange={(e) => setBuyAmount(Number(e.target.value))}
                className="w-20 rounded bg-zinc-800 px-2 py-1"
              />
            </Field>
            <button
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    buyTokenAction({
                      walletAddress,
                      stableMint,
                      bonoMint: bondMint,
                      amount: buyAmount,
                    }),
                  `Bought ${buyAmount} bond(s).`
                )
              }
              className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500 disabled:opacity-50"
            >
              Buy
            </button>
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="rounded-lg border border-zinc-800 p-4">
          <h2 className="mb-3 font-semibold">Transfer</h2>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <Field label="Token">
              <select
                value={xferMint}
                onChange={(e) => setXferMint(e.target.value)}
                className="rounded bg-zinc-800 px-2 py-1"
              >
                {rows.map((r) => (
                  <option key={r._id} value={r.mintAddress}>
                    {r.symbol}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To address">
              <input
                value={xferTo}
                onChange={(e) => setXferTo(e.target.value)}
                placeholder="recipient base58"
                className="w-64 rounded bg-zinc-800 px-2 py-1 font-mono text-xs"
              />
            </Field>
            <Field label="Amount">
              <input
                type="number"
                value={xferAmount}
                onChange={(e) => setXferAmount(Number(e.target.value))}
                className="w-20 rounded bg-zinc-800 px-2 py-1"
              />
            </Field>
            <button
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    transferTokensAction({
                      fromAddress: walletAddress,
                      toAddress: xferTo,
                      mintAddress: xferMint,
                      amount: xferAmount,
                    }),
                  "Transfer sent."
                )
              }
              className="rounded bg-emerald-600 px-3 py-1 hover:bg-emerald-500 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

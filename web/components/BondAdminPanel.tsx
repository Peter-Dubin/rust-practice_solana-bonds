"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { explorerTx } from "@/lib/explorer";
import { payCuponAction, payNominalAction } from "@/app/token/actions";

export function BondAdminPanel({ mintAddress }: { mintAddress: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; sig?: string } | null>(null);

  async function run(fn: () => Promise<{ signature: string }>, label: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ text: label, sig: r.signature });
      router.refresh();
    } catch (e) {
      setMsg({ text: `Error: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 p-4">
      <h2 className="mb-1 font-semibold">Issuer actions</h2>
      <p className="mb-3 text-xs text-zinc-500">
        Only the bond issuer can pay coupons and redeem the nominal.
      </p>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() =>
            run(() => payCuponAction(mintAddress), "Coupon paid to all holders.")
          }
          className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-500 disabled:opacity-50"
        >
          Pay coupon
        </button>
        <button
          disabled={busy}
          onClick={() =>
            run(() => payNominalAction(mintAddress), "Nominal redeemed.")
          }
          className="rounded bg-amber-600 px-3 py-2 text-sm hover:bg-amber-500 disabled:opacity-50"
        >
          Pay nominal
        </button>
      </div>

      {msg && (
        <div className="mt-3 rounded bg-zinc-900 p-3 text-sm">
          <p>{msg.text}</p>
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
    </section>
  );
}

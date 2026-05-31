"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTokenAction } from "@/app/token/actions";

export function CreateTokenForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [tipo, setTipo] = useState<"StableCoin" | "Bono">("Bono");
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    decimals: 0,
    amount: 1000,
    walletAddress: "",
    nominal: 1000,
    porcentajeCupon: 4,
    anos: 4,
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    const payload =
      tipo === "Bono"
        ? { tipo, ...form }
        : {
            tipo,
            name: form.name,
            symbol: form.symbol,
            decimals: form.decimals,
            amount: form.amount,
            walletAddress: form.walletAddress,
          };
    const res = await createTokenAction(payload);
    setBusy(false);
    setMsg(res.message);
    if (res.success) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-500"
      >
        + Create token / bond
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-lg bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Create token / bond</h2>

            <div className="flex gap-2 text-sm">
              {(["StableCoin", "Bono"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTipo(t);
                    if (t === "Bono") set("decimals", 0);
                  }}
                  className={`rounded px-3 py-1 ${
                    tipo === t ? "bg-emerald-600" : "bg-zinc-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <Input label="Name" value={form.name} onChange={(v) => set("name", v)} />
            <Input label="Symbol" value={form.symbol} onChange={(v) => set("symbol", v)} />
            <Input
              label="Decimals"
              type="number"
              value={form.decimals}
              onChange={(v) => set("decimals", Number(v))}
            />
            <Input
              label="Initial supply"
              type="number"
              value={form.amount}
              onChange={(v) => set("amount", Number(v))}
            />
            <Input
              label="Issuer wallet address"
              value={form.walletAddress}
              onChange={(v) => set("walletAddress", v)}
              mono
            />

            {tipo === "Bono" && (
              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="Nominal"
                  type="number"
                  value={form.nominal}
                  onChange={(v) => set("nominal", Number(v))}
                />
                <Input
                  label="Coupon %"
                  type="number"
                  value={form.porcentajeCupon}
                  onChange={(v) => set("porcentajeCupon", Number(v))}
                />
                <Input
                  label="Years"
                  type="number"
                  value={form.anos}
                  onChange={(v) => set("anos", Number(v))}
                />
              </div>
            )}

            {msg && <p className="text-sm text-amber-400">{msg}</p>}

            <button
              disabled={busy}
              onClick={submit}
              className="w-full rounded bg-emerald-600 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? "Creating on-chain…" : "Create"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
    </label>
  );
}

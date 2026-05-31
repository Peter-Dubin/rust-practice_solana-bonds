import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Solana<span className="text-emerald-400">Bonds</span>
        </h1>
        <p className="max-w-2xl text-zinc-300">
          A dual-token debt-bond platform on Solana. Issue bonds
          (<span className="text-emerald-400">BonoDeuda</span>) against a
          stablecoin (<span className="text-emerald-400">EuroCC</span>), sell
          them to investors, pay annual coupons, and redeem the nominal at
          maturity — all settled on-chain via SPL token transfers.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card
          title="The lifecycle"
          body="Register → create a wallet → faucet SOL & EuroCC → create a bond → buy it → view bondholders → pay coupons → redeem nominal → transfer bonds."
        />
        <Card
          title="Bond economics"
          body="Coupon = (coupon% × units × nominal) / 100 per period. At maturity, holders redeem the full nominal per unit (plus any premium)."
        />
      </section>

      <section className="flex gap-3">
        <Link
          href="/token"
          className="rounded bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500"
        >
          Browse tokens & bonds
        </Link>
        <Link
          href="/users"
          className="rounded bg-zinc-700 px-4 py-2 font-medium hover:bg-zinc-600"
        >
          Users
        </Link>
      </section>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <p className="text-sm text-zinc-400">{body}</p>
    </div>
  );
}

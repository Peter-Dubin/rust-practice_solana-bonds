import { getTokenById, getBonistas } from "../actions";
import { getTokenBalance } from "@/lib/solana";
import { explorerAddress, shortAddress } from "@/lib/explorer";
import { BondAdminPanel } from "@/components/BondAdminPanel";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, WalletDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BondDetailPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;
  const token = await getTokenById(tokenId);

  if (!token) return <p className="text-zinc-500">Token not found.</p>;

  const bonistas = token.mintAddress ? await getBonistas(token.mintAddress) : [];
  const issuerBalance =
    token.mintAddress
      ? await getTokenBalance(token.mintAddress, token.walletAddress).catch(
          () => "0"
        )
      : "0";

  const session = await getSession();
  let isIssuer = false;
  if (session && token.walletAddress) {
    const db = await getDb();
    const match = await db
      .collection<WalletDoc>(COLLECTIONS.wallets)
      .findOne({ userId: session.userId, address: token.walletAddress });
    isIssuer = !!match;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {token.name}{" "}
          <span className="text-zinc-500">({token.symbol})</span>
        </h1>
        <p className="text-sm text-zinc-400">{token.tipo}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <Stat label="Nominal" value={token.nominal ?? "—"} />
        <Stat label="Coupon %" value={token.porcentajeCupon ?? "—"} />
        <Stat label="Years" value={token.anos ?? "—"} />
        <Stat label="Issuer balance (base)" value={issuerBalance} />
      </section>

      {token.mintAddress && (
        <p className="text-sm">
          Mint:{" "}
          <a
            href={explorerAddress(token.mintAddress)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-emerald-400 hover:underline"
          >
            {token.mintAddress}
          </a>
        </p>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Bondholders (bonistas)</h2>
        {bonistas.length === 0 ? (
          <p className="text-zinc-500">No bondholders yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr className="border-b border-zinc-800">
                <th className="py-2">Holder</th>
                <th>Units</th>
                <th>Purchased</th>
                <th>Paid w/</th>
                <th>Payments</th>
              </tr>
            </thead>
            <tbody>
              {bonistas.map((b) => (
                <tr key={b._id} className="border-b border-zinc-900">
                  <td className="py-2">
                    <a
                      href={explorerAddress(b.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-emerald-400 hover:underline"
                    >
                      {shortAddress(b.address)}
                    </a>
                  </td>
                  <td>{b.amount}</td>
                  <td className="text-xs text-zinc-400">
                    {new Date(b.purchaseDate).toLocaleDateString()}
                  </td>
                  <td>
                    <span className="font-mono text-xs">
                      {shortAddress(b.stablecoinUsed)}
                    </span>
                  </td>
                  <td className="text-xs text-zinc-400">
                    {(b.payments ?? []).length} payment(s)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {token.mintAddress && isIssuer && (
        <BondAdminPanel mintAddress={token.mintAddress} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

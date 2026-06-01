import Link from "next/link";
import { getTokens } from "./actions";
import { explorerAddress, shortAddress } from "@/lib/explorer";
import { CreateTokenForm } from "@/components/CreateTokenForm";
import { DeleteTokenButton } from "@/components/DeleteTokenButton";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, WalletDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const tokens = await getTokens();

  const session = await getSession();
  let myWalletAddresses = new Set<string>();
  if (session) {
    const db = await getDb();
    const wallets = await db
      .collection<WalletDoc>(COLLECTIONS.wallets)
      .find({ userId: session.userId }, { projection: { address: 1 } })
      .toArray();
    myWalletAddresses = new Set(wallets.map((w) => w.address));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tokens &amp; Bonds</h1>
        <CreateTokenForm />
      </div>

      {tokens.length === 0 ? (
        <p className="text-zinc-500">No tokens yet. Create one to get started.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-2">Type</th>
              <th>Name</th>
              <th>Symbol</th>
              <th>Dec</th>
              <th>Supply</th>
              <th>Nominal</th>
              <th>Coupon%</th>
              <th>Years</th>
              <th>Issuer</th>
              <th>Mint</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t._id} className="border-b border-zinc-900">
                <td className="py-2">{t.tipo}</td>
                <td>{t.name}</td>
                <td>{t.symbol}</td>
                <td>{t.decimals}</td>
                <td>{t.amount.toLocaleString()}</td>
                <td>{t.nominal ?? "—"}</td>
                <td>{t.porcentajeCupon ?? "—"}</td>
                <td>{t.anos ?? "—"}</td>
                <td>
                  <a
                    href={explorerAddress(t.walletAddress)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-emerald-400 hover:underline"
                  >
                    {shortAddress(t.walletAddress)}
                  </a>
                </td>
                <td>
                  {t.mintAddress ? (
                    <a
                      href={explorerAddress(t.mintAddress)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-emerald-400 hover:underline"
                    >
                      {shortAddress(t.mintAddress)}
                    </a>
                  ) : (
                    <span className="text-xs text-amber-500">pending</span>
                  )}
                </td>
                <td className="text-right">
                  <span className="flex items-center justify-end gap-3">
                    {t.tipo === "Bono" && (
                      <Link
                        href={`/token/${t._id}`}
                        className="text-emerald-400 hover:underline"
                      >
                        Detail
                      </Link>
                    )}
                    {myWalletAddresses.has(t.walletAddress) && (
                      <DeleteTokenButton tokenId={t._id} />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

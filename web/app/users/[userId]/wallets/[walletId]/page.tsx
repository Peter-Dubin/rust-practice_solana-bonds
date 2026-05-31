import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, WalletDoc } from "@/lib/types";
import { getBalance, getTokenBalance } from "@/lib/solana";
import { getTokens } from "@/app/token/actions";
import { explorerAddress } from "@/lib/explorer";
import { WalletDetailPanel } from "@/components/WalletDetailPanel";

export const dynamic = "force-dynamic";

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ userId: string; walletId: string }>;
}) {
  const { walletId } = await params;

  const db = await getDb();
  const wallet = ObjectId.isValid(walletId)
    ? await db
        .collection<WalletDoc>(COLLECTIONS.wallets)
        .findOne(
          { _id: new ObjectId(walletId) },
          { projection: { encryptedPrivateKey: 0 } }
        )
    : null;

  if (!wallet) return <p className="text-zinc-500">Wallet not found.</p>;

  const [sol, tokens] = await Promise.all([
    getBalance(wallet.address).catch(() => 0),
    getTokens(),
  ]);

  // On-chain balance per token (only those minted on-chain).
  const rows = await Promise.all(
    tokens
      .filter((t) => t.mintAddress)
      .map(async (t) => ({
        ...t,
        balance: await getTokenBalance(t.mintAddress!, wallet.address).catch(
          () => "0"
        ),
      }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Wallet</h1>
        <a
          href={explorerAddress(wallet.address)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sm text-emerald-400 hover:underline"
        >
          {wallet.address}
        </a>
        <p className="mt-1 text-sm text-zinc-400">SOL balance: {sol}</p>
      </div>

      <WalletDetailPanel
        walletAddress={wallet.address}
        rows={rows}
        stablecoins={tokens.filter(
          (t) => t.tipo === "StableCoin" && t.mintAddress
        )}
      />
    </div>
  );
}

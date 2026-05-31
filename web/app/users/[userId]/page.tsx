import { getUserAndWallets } from "./actions";
import { getTokens } from "@/app/token/actions";
import { WalletsPanel } from "@/components/WalletsPanel";

export const dynamic = "force-dynamic";

export default async function UserWalletsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const [{ user, wallets }, tokens] = await Promise.all([
    getUserAndWallets(userId),
    getTokens(),
  ]);

  if (!user) {
    return <p className="text-zinc-500">User not found.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{user.name}&rsquo;s wallets</h1>
      <WalletsPanel
        userId={userId}
        initialWallets={wallets}
        tokens={tokens.filter((t) => t.mintAddress)}
      />
    </div>
  );
}

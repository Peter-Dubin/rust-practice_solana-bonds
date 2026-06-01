"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, TokenDoc, BonistaDoc, WalletDoc } from "@/lib/types";
import { requireSession } from "@/lib/session";
import {
  createToken,
  buyToken as solBuyToken,
  transferTokens as solTransferTokens,
  payCupon,
  payNominal,
  loadKeypairByAddress,
  loadTokenByMint,
} from "@/lib/solana";
import {
  createTokenSchema,
  buyTokenSchema,
  transferSchema,
} from "@/lib/validation";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export interface TokenListItem {
  _id: string;
  tipo: string;
  name: string;
  symbol: string;
  decimals: number;
  amount: number;
  walletAddress: string;
  mintAddress?: string;
  nominal?: number;
  porcentajeCupon?: number;
  anos?: number;
  payments?: { date: string; amount: number }[];
}

function serializeToken(t: TokenDoc): TokenListItem {
  return {
    _id: t._id!.toString(),
    tipo: t.tipo,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    amount: t.amount,
    walletAddress: t.walletAddress,
    mintAddress: t.mintAddress,
    nominal: t.nominal,
    porcentajeCupon: t.porcentajeCupon,
    anos: t.anos,
    payments: t.payments,
  };
}

export async function getTokens(): Promise<TokenListItem[]> {
  const db = await getDb();
  const tokens = await db.collection<TokenDoc>(COLLECTIONS.token).find().toArray();
  return tokens.map(serializeToken);
}

export async function getTokenById(id: string): Promise<TokenListItem | null> {
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  const t = await db
    .collection<TokenDoc>(COLLECTIONS.token)
    .findOne({ _id: new ObjectId(id) });
  return t ? serializeToken(t) : null;
}

export interface CreateTokenResult {
  success: boolean;
  message: string;
  mintAddress?: string;
}

export async function createTokenAction(
  input: unknown
): Promise<CreateTokenResult> {
  await requireSession();
  const parsed = createTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const db = await getDb();
  const tokens = db.collection<TokenDoc>(COLLECTIONS.token);

  const doc: TokenDoc = {
    tipo: data.tipo,
    name: data.name,
    symbol: data.symbol,
    decimals: data.decimals,
    amount: data.amount,
    walletAddress: data.walletAddress,
    ...(data.tipo === "Bono"
      ? {
          nominal: data.nominal,
          porcentajeCupon: data.porcentajeCupon,
          anos: data.anos,
          payments: [],
        }
      : {}),
  };

  const { insertedId } = await tokens.insertOne(doc);

  try {
    const issuer = await loadKeypairByAddress(data.walletAddress);
    const mint = await createToken(
      issuer,
      data.name,
      data.symbol,
      data.decimals,
      data.amount
    );
    await tokens.updateOne(
      { _id: insertedId },
      { $set: { mintAddress: mint.toBase58() } }
    );
    revalidatePath("/token");
    return {
      success: true,
      message: "Token created on-chain.",
      mintAddress: mint.toBase58(),
    };
  } catch (err) {
    // Roll back the metadata doc if the on-chain step failed.
    await tokens.deleteOne({ _id: insertedId });
    return {
      success: false,
      message: `On-chain creation failed: ${(err as Error).message}`,
    };
  }
}

/** DEV ONLY: wipe token/wallets/users collections. Guarded to development. */
export async function cleanTokens(): Promise<{ ok: boolean }> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("cleanTokens is disabled in production.");
  }
  await requireSession();
  const db = await getDb();
  await Promise.all([
    db.collection(COLLECTIONS.token).deleteMany({}),
    db.collection(COLLECTIONS.wallets).deleteMany({}),
    db.collection(COLLECTIONS.users).deleteMany({}),
    db.collection(COLLECTIONS.bonista).deleteMany({}),
  ]);
  revalidatePath("/token");
  return { ok: true };
}

export async function buyTokenAction(input: unknown) {
  await requireSession();
  const data = buyTokenSchema.parse(input);
  await solBuyToken(data.walletAddress, data.stableMint, data.bonoMint, data.amount);
  revalidatePath("/token");
  return { ok: true };
}

export async function transferTokensAction(input: unknown) {
  await requireSession();
  const data = transferSchema.parse(input);
  const { Connection } = await import("@solana/web3.js");
  const conn = new Connection(process.env.SOLANA_URL!, "confirmed");

  const from = await loadKeypairByAddress(data.fromAddress);
  const token = await loadTokenByMint(data.mintAddress);
  const mint = new PublicKey(data.mintAddress);

  const fromATA = await getAssociatedTokenAddress(mint, from.publicKey);
  // Ensure destination ATA exists (payer = sender).
  const { getOrCreateAssociatedTokenAccount } = await import("@solana/spl-token");
  const toATA = await getOrCreateAssociatedTokenAccount(
    conn,
    from,
    mint,
    new PublicKey(data.toAddress)
  );

  const baseUnits = BigInt(Math.round(data.amount * 10 ** token.decimals));
  const signature = await solTransferTokens(
    conn,
    from,
    fromATA,
    toATA.address,
    baseUnits
  );
  revalidatePath("/token");
  return { signature };
}

export async function payCuponAction(mintAddress: string) {
  await requireSession();
  const signature = await payCupon(mintAddress);
  revalidatePath(`/token`);
  return { signature };
}

export async function payNominalAction(mintAddress: string) {
  await requireSession();
  const signature = await payNominal(mintAddress);
  revalidatePath(`/token`);
  return { signature };
}

export interface BonistaListItem {
  _id: string;
  address: string;
  amount: number;
  purchaseDate: string;
  stablecoinUsed: string;
  payments?: { date: string; amount: number }[];
}

export async function deleteTokenAction(tokenId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  const { ObjectId } = await import("mongodb");
  if (!ObjectId.isValid(tokenId)) return { ok: false, message: "Invalid token id." };

  const db = await getDb();

  const token = await db
    .collection<TokenDoc>(COLLECTIONS.token)
    .findOne({ _id: new ObjectId(tokenId) });
  if (!token) return { ok: false, message: "Token not found." };

  // Only the issuer (wallet owner) may delete.
  const ownsWallet = await db
    .collection<WalletDoc>(COLLECTIONS.wallets)
    .findOne({ userId: session.userId, address: token.walletAddress });
  if (!ownsWallet) return { ok: false, message: "Only the issuer can delete this token." };

  // Block deletion if bondholders exist.
  if (token.mintAddress) {
    const holderCount = await db
      .collection(COLLECTIONS.bonista)
      .countDocuments({ tokenMint: token.mintAddress });
    if (holderCount > 0) return { ok: false, message: "Cannot delete: bondholders exist." };
  }

  await db.collection(COLLECTIONS.token).deleteOne({ _id: new ObjectId(tokenId) });
  revalidatePath("/token");
  return { ok: true, message: "Token deleted." };
}

export async function getBonistas(mintAddress: string): Promise<BonistaListItem[]> {
  const db = await getDb();
  const rows = await db
    .collection<BonistaDoc>(COLLECTIONS.bonista)
    .find({ tokenMint: mintAddress })
    .toArray();
  return rows.map((r) => ({
    _id: r._id!.toString(),
    address: r.address,
    amount: r.amount,
    purchaseDate: r.purchaseDate,
    stablecoinUsed: r.stablecoinUsed,
    payments: r.payments,
  }));
}

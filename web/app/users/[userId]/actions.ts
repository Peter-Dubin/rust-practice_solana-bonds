"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { Keypair } from "@solana/web3.js";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, UserDoc, WalletDoc } from "@/lib/types";
import { encryptSecretKey } from "@/lib/crypto";
import { requireSession } from "@/lib/session";
import {
  requestAirdrop as solRequestAirdrop,
  getBalance as solGetBalance,
  getTokenBalance as solGetTokenBalance,
  airdropSplToken,
  loadKeypairByAddress,
  loadTokenByMint,
} from "@/lib/solana";
import { addressSchema, airdropSplSchema } from "@/lib/validation";

export interface WalletListItem {
  _id: string;
  address: string;
}

export interface UserAndWallets {
  user: { _id: string; name: string } | null;
  wallets: WalletListItem[];
}

/** Never returns private keys. */
export async function getUserAndWallets(
  userId: string
): Promise<UserAndWallets> {
  const db = await getDb();
  let user: UserAndWallets["user"] = null;
  if (ObjectId.isValid(userId)) {
    const doc = await db
      .collection<UserDoc>(COLLECTIONS.users)
      .findOne({ _id: new ObjectId(userId) }, { projection: { passwordHash: 0 } });
    if (doc) user = { _id: doc._id!.toString(), name: doc.name };
  }
  const wallets = await db
    .collection<WalletDoc>(COLLECTIONS.wallets)
    .find({ userId }, { projection: { encryptedPrivateKey: 0 } })
    .toArray();
  return {
    user,
    wallets: wallets.map((w) => ({ _id: w._id!.toString(), address: w.address })),
  };
}

/** Create a new wallet for the user, storing the private key AES-256-GCM encrypted. */
export async function addWallet(userId: string): Promise<WalletListItem> {
  const session = await requireSession();
  if (session.userId !== userId) {
    throw new Error("You can only add wallets to your own account.");
  }
  const kp = Keypair.generate();
  const doc: WalletDoc = {
    userId,
    address: kp.publicKey.toBase58(),
    encryptedPrivateKey: encryptSecretKey(kp.secretKey),
  };
  const db = await getDb();
  const res = await db.collection<WalletDoc>(COLLECTIONS.wallets).insertOne(doc);
  revalidatePath(`/users/${userId}`);
  return { _id: res.insertedId.toString(), address: doc.address };
}

// --- Faucets & balance reads ---------------------------------------------

export async function requestAirdrop(address: string, amount = 1) {
  await requireSession();
  addressSchema.parse(address);
  const signature = await solRequestAirdrop(address, amount);
  return { signature };
}

export async function getBalance(address: string) {
  addressSchema.parse(address);
  return { sol: await solGetBalance(address) };
}

export async function getTokenBalance(mintAddress: string, walletAddress: string) {
  addressSchema.parse(mintAddress);
  addressSchema.parse(walletAddress);
  return { amount: await solGetTokenBalance(mintAddress, walletAddress) };
}

/** Mint SPL tokens to a wallet, signed by the token's issuer (decrypted server-side). */
export async function airdropSplTokenAction(
  selectedWallet: string,
  mintAddress: string,
  splAmount: number
) {
  await requireSession();
  const parsed = airdropSplSchema.parse({ selectedWallet, mintAddress, splAmount });
  const token = await loadTokenByMint(parsed.mintAddress);
  const issuer = await loadKeypairByAddress(token.walletAddress);
  await airdropSplToken(
    parsed.mintAddress,
    parsed.selectedWallet,
    parsed.splAmount,
    issuer
  );
  return { ok: true };
}

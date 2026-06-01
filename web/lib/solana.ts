import "server-only";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  SendTransactionError,
} from "@solana/web3.js";
import {
  createMint,
  mintTo,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  transfer,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import { getDb } from "./mongodb";
import { decryptSecretKey } from "./crypto";
import { COLLECTIONS, TokenDoc, WalletDoc, BonistaDoc } from "./types";

// All Solana operations are server-only. Private keys are decrypted from the DB
// inside these functions and never leave the server.

function connection(): Connection {
  const url = process.env.SOLANA_URL;
  if (!url) throw new Error("SOLANA_URL is not set.");
  return new Connection(url, "confirmed");
}

// ---------------------------------------------------------------------------
// Wallet / token loaders (server-only)
// ---------------------------------------------------------------------------

/** Load and decrypt a wallet's Keypair by its public address. */
async function loadKeypairByAddress(address: string): Promise<Keypair> {
  const db = await getDb();
  const wallet = await db
    .collection<WalletDoc>(COLLECTIONS.wallets)
    .findOne({ address });
  if (!wallet) throw new Error(`Wallet not found: ${address}`);
  return Keypair.fromSecretKey(decryptSecretKey(wallet.encryptedPrivateKey));
}

async function loadTokenByMint(mintAddress: string): Promise<TokenDoc> {
  const db = await getDb();
  const token = await db
    .collection<TokenDoc>(COLLECTIONS.token)
    .findOne({ mintAddress });
  if (!token) throw new Error(`Token not found for mint: ${mintAddress}`);
  return token;
}

// ---------------------------------------------------------------------------
// SOL
// ---------------------------------------------------------------------------

export async function requestAirdrop(
  address: string,
  amount = 1
): Promise<string> {
  const conn = connection();
  const pubkey = new PublicKey(address);
  const sig = await conn.requestAirdrop(pubkey, amount * LAMPORTS_PER_SOL);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

export async function getBalance(address: string): Promise<number> {
  const conn = connection();
  const lamports = await conn.getBalance(new PublicKey(address));
  return lamports / LAMPORTS_PER_SOL;
}

// ---------------------------------------------------------------------------
// Token creation & SPL faucet
// ---------------------------------------------------------------------------

/** Create a mint, the payer's ATA, and mint the initial supply to it. */
export async function createToken(
  payer: Keypair,
  _name: string,
  _symbol: string,
  decimals: number,
  initialSupply: number
): Promise<PublicKey> {
  const conn = connection();
  const mint = await createMint(
    conn,
    payer,
    payer.publicKey,
    payer.publicKey,
    decimals
  );
  const ata = await getOrCreateAssociatedTokenAccount(
    conn,
    payer,
    mint,
    payer.publicKey
  );
  await mintTo(
    conn,
    payer,
    mint,
    ata.address,
    payer,
    BigInt(initialSupply) * 10n ** BigInt(decimals)
  );
  return mint;
}

/** Mint `amount` (whole units) of an existing token to a destination wallet. */
export async function airdropSplToken(
  mintAddress: string,
  destinationAddress: string,
  amount: number,
  payerKeypair: Keypair
): Promise<boolean> {
  const conn = connection();
  const mint = new PublicKey(mintAddress);
  const token = await loadTokenByMint(mintAddress);
  const dest = await getOrCreateAssociatedTokenAccount(
    conn,
    payerKeypair,
    mint,
    new PublicKey(destinationAddress)
  );
  await mintTo(
    conn,
    payerKeypair,
    mint,
    dest.address,
    payerKeypair,
    BigInt(amount) * 10n ** BigInt(token.decimals)
  );
  return true;
}

// ---------------------------------------------------------------------------
// Balances & transfers
// ---------------------------------------------------------------------------

export async function getTokenBalance(
  mintAddress: string,
  walletAddress: string
): Promise<string> {
  const conn = connection();
  const ata = await getAssociatedTokenAddress(
    new PublicKey(mintAddress),
    new PublicKey(walletAddress)
  );
  try {
    const account = await getAccount(conn, ata);
    return account.amount.toString();
  } catch (err) {
    if (
      err instanceof TokenAccountNotFoundError ||
      err instanceof TokenInvalidAccountOwnerError
    ) {
      return "0";
    }
    throw err;
  }
}

/** Low-level SPL transfer between ATAs, signed by `from`. */
export async function transferTokens(
  conn: Connection,
  from: Keypair,
  fromATA: PublicKey,
  toATA: PublicKey,
  amount: number | bigint
): Promise<string> {
  try {
    return await transfer(conn, from, fromATA, toATA, from, BigInt(amount));
  } catch (err) {
    if (err instanceof SendTransactionError) {
      throw new Error(
        `Transfer failed: ${(await err.getLogs(conn))?.join(" | ")}`
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Buy a bond (dual transfer + bondholder ledger)
// ---------------------------------------------------------------------------

/**
 * Buyer purchases `amount` bonds:
 *  - BONO issuer -> buyer (amount units)
 *  - stablecoin buyer -> issuer (amount × nominal, base units)
 *  - insert a bonista (bondholder) record
 */
export async function buyToken(
  walletAddress: string,
  stableMint: string,
  bonoMint: string,
  amount: number
): Promise<void> {
  const conn = connection();
  const bond = await loadTokenByMint(bonoMint);
  const stable = await loadTokenByMint(stableMint);
  if (bond.tipo !== "Bono") throw new Error("bonoMint is not a Bono.");
  const nominal = bond.nominal;
  if (!nominal) throw new Error("Bond has no nominal value.");

  const buyer = await loadKeypairByAddress(walletAddress);
  const issuer = await loadKeypairByAddress(bond.walletAddress);

  const bonoMintPk = new PublicKey(bonoMint);
  const stableMintPk = new PublicKey(stableMint);

  // ATAs
  const issuerBonoATA = await getOrCreateAssociatedTokenAccount(
    conn,
    issuer,
    bonoMintPk,
    issuer.publicKey
  );
  const buyerBonoATA = await getOrCreateAssociatedTokenAccount(
    conn,
    buyer,
    bonoMintPk,
    buyer.publicKey
  );
  const buyerStableATA = await getOrCreateAssociatedTokenAccount(
    conn,
    buyer,
    stableMintPk,
    buyer.publicKey
  );
  const issuerStableATA = await getOrCreateAssociatedTokenAccount(
    conn,
    issuer,
    stableMintPk,
    issuer.publicKey
  );

  // Atomic transaction: both legs succeed or neither does.
  const bonoUnits = BigInt(amount) * 10n ** BigInt(bond.decimals);
  const priceBaseUnits =
    BigInt(amount) * BigInt(nominal) * 10n ** BigInt(stable.decimals);

  const tx = new Transaction();
  tx.add(
    createTransferInstruction(
      issuerBonoATA.address,
      buyerBonoATA.address,
      issuer.publicKey,
      bonoUnits
    )
  );
  tx.add(
    createTransferInstruction(
      buyerStableATA.address,
      issuerStableATA.address,
      buyer.publicKey,
      priceBaseUnits
    )
  );

  try {
    const { sendAndConfirmTransaction } = await import("@solana/web3.js");
    await sendAndConfirmTransaction(conn, tx, [issuer, buyer]);
  } catch (err) {
    if (err instanceof SendTransactionError) {
      throw new Error(
        `Buy failed: ${(await err.getLogs(conn))?.join(" | ")}`
      );
    }
    throw err;
  }

  // Ledger
  const db = await getDb();
  const record: BonistaDoc = {
    tokenMint: bonoMint,
    address: walletAddress,
    amount,
    purchaseDate: new Date().toISOString(),
    stablecoinUsed: stableMint,
    payments: [],
  };
  await db.collection<BonistaDoc>(COLLECTIONS.bonista).insertOne(record);
}

// ---------------------------------------------------------------------------
// Coupon & nominal payments (batched stablecoin transfers from the issuer)
// ---------------------------------------------------------------------------

type PerUnit = (nominal: number, porcentajeCupon: number) => number;

/** Shared engine for coupon / nominal payouts. `perUnit` returns € per held unit. */
async function payHolders(
  bonoMint: string,
  perUnit: PerUnit
): Promise<string> {
  const conn = connection();
  const bond = await loadTokenByMint(bonoMint);
  if (bond.tipo !== "Bono") throw new Error("Not a Bono.");
  if (bond.nominal === undefined || bond.porcentajeCupon === undefined) {
    throw new Error("Bond is missing nominal/porcentajeCupon.");
  }
  const issuer = await loadKeypairByAddress(bond.walletAddress);

  const db = await getDb();
  const holders = await db
    .collection<BonistaDoc>(COLLECTIONS.bonista)
    .find({ tokenMint: bonoMint })
    .toArray();
  if (holders.length === 0) throw new Error("No bondholders for this bond.");

  // Cache stablecoin token docs by mint (for decimals) and issuer source ATAs.
  const stableCache = new Map<string, TokenDoc>();
  const sourceAtaCache = new Map<string, PublicKey>();

  const tx = new Transaction();
  const perHolderAmount: { holder: BonistaDoc; euros: number }[] = [];

  for (const holder of holders) {
    let stable = stableCache.get(holder.stablecoinUsed);
    if (!stable) {
      stable = await loadTokenByMint(holder.stablecoinUsed);
      stableCache.set(holder.stablecoinUsed, stable);
    }
    const stableMintPk = new PublicKey(holder.stablecoinUsed);

    // Source ATA (issuer) — create once per stablecoin.
    let sourceAta = sourceAtaCache.get(holder.stablecoinUsed);
    if (!sourceAta) {
      const ata = await getOrCreateAssociatedTokenAccount(
        conn,
        issuer,
        stableMintPk,
        issuer.publicKey
      );
      sourceAta = ata.address;
      sourceAtaCache.set(holder.stablecoinUsed, sourceAta);
    }

    // Destination ATA (holder) — ensure it exists, issuer pays rent.
    const destAta = await getOrCreateAssociatedTokenAccount(
      conn,
      issuer,
      stableMintPk,
      new PublicKey(holder.address)
    );

    const euros = perUnit(bond.nominal, bond.porcentajeCupon) * holder.amount;
    if (euros <= 0) continue;
    const baseUnits = BigInt(Math.round(euros * 10 ** stable.decimals));

    tx.add(
      createTransferInstruction(
        sourceAta,
        destAta.address,
        issuer.publicKey,
        baseUnits
      )
    );
    perHolderAmount.push({ holder, euros });
  }

  if (tx.instructions.length === 0) {
    throw new Error("Nothing to pay (all holders hold 0 units).");
  }

  const { sendAndConfirmTransaction } = await import("@solana/web3.js");
  const signature = await sendAndConfirmTransaction(conn, tx, [issuer]);

  // Record payment history (issuer side + each holder).
  const now = new Date().toISOString();
  const total = perHolderAmount.reduce((s, p) => s + p.euros, 0);
  await db
    .collection<TokenDoc>(COLLECTIONS.token)
    .updateOne(
      { mintAddress: bonoMint },
      { $push: { payments: { date: now, amount: total } } }
    );
  for (const { holder, euros } of perHolderAmount) {
    await db
      .collection<BonistaDoc>(COLLECTIONS.bonista)
      .updateOne(
        { _id: holder._id },
        { $push: { payments: { date: now, amount: euros } } }
      );
  }

  return signature;
}

/** Pay one coupon period: (porcentajeCupon × units × nominal) / 100, in stablecoin. */
export async function payCupon(bonoMint: string): Promise<string> {
  return payHolders(bonoMint, (nominal, pct) => (pct * nominal) / 100);
}

/** Redeem nominal at maturity: full nominal per unit. */
export async function payNominal(bonoMint: string): Promise<string> {
  return payHolders(bonoMint, (nominal) => nominal);
}

// Re-export helpers used by server actions.
export { loadKeypairByAddress, loadTokenByMint };

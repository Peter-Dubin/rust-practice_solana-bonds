import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccount,
  transfer,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import "dotenv/config";

// ---------------------------------------------------------------------------
// Paths & connection
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Project root (the eurocoin-token/ folder), where wallets/ and token-info.json live. */
export const ROOT = join(__dirname, "..");
export const WALLETS_DIR = join(ROOT, "wallets");
export const TOKEN_INFO_PATH = join(ROOT, "token-info.json");

export const SOLANA_URL = process.env.SOLANA_URL ?? "http://localhost:8899";

/** A single shared connection at the "confirmed" commitment level. */
export function getConnection(): Connection {
  return new Connection(SOLANA_URL, "confirmed");
}

// ---------------------------------------------------------------------------
// Token info shape (mirrors token-info.json)
// ---------------------------------------------------------------------------

export interface WalletEntry {
  publicKey: string;
}

export interface TokenEntry {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: number;
}

export interface TokenInfo {
  wallets: {
    emisorEuroCC: WalletEntry;
    emisorBonoDeuda: WalletEntry;
    adquirente1: WalletEntry;
    adquirente2: WalletEntry;
  };
  tokens: {
    euroCC: TokenEntry;
    bonoDeuda: TokenEntry;
  };
}

/** Logical wallet name → on-disk file name under wallets/. */
export const WALLET_FILES: Record<string, string> = {
  emisorEuroCC: "emisor_eurocc.json",
  emisorBonoDeuda: "emisor_bonodeuda.json",
  adquirente1: "adquirente1.json",
  adquirente2: "adquirente2.json",
};

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/** Read wallets/<name>.json (a 64-byte secret-key array) and return the Keypair. */
export function loadKeypair(name: string): Keypair {
  const fileName = WALLET_FILES[name] ?? `${name}.json`;
  const raw = readFileSync(join(WALLETS_DIR, fileName), "utf-8");
  const secret = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(secret);
}

/** Parse token-info.json. */
export function loadTokenInfo(): TokenInfo {
  const raw = readFileSync(TOKEN_INFO_PATH, "utf-8");
  return JSON.parse(raw) as TokenInfo;
}

// ---------------------------------------------------------------------------
// Associated Token Accounts (ATA)
// ---------------------------------------------------------------------------

/**
 * Derive the ATA for (mint, owner). If it does not exist yet, create it
 * (paid for and signed by `payer`). Returns the ATA address.
 */
export async function getOrCreateATA(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    await getAccount(connection, ata);
    return ata;
  } catch (err) {
    if (
      err instanceof TokenAccountNotFoundError ||
      err instanceof TokenInvalidAccountOwnerError
    ) {
      return await createAssociatedTokenAccount(connection, payer, mint, owner);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Balances & transfers
// ---------------------------------------------------------------------------

/** Return the token-account balance in base units (0 if the account is missing). */
export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<number> {
  try {
    const account = await getAccount(connection, tokenAccount);
    return Number(account.amount);
  } catch (err) {
    if (
      err instanceof TokenAccountNotFoundError ||
      err instanceof TokenInvalidAccountOwnerError
    ) {
      return 0;
    }
    throw err;
  }
}

/**
 * SPL transfer of `amount` base units from `fromATA` to `toATA`,
 * signed by `from`. Returns the transaction signature.
 */
export async function transferTokens(
  connection: Connection,
  from: Keypair,
  fromATA: PublicKey,
  toATA: PublicKey,
  amount: number | bigint
): Promise<string> {
  try {
    return await transfer(
      connection,
      from,
      fromATA,
      toATA,
      from,
      BigInt(amount)
    );
  } catch (err) {
    if (err instanceof SendTransactionError) {
      console.error("Transfer failed. Logs:", await err.getLogs(connection));
    }
    throw err;
  }
}

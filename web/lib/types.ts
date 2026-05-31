import { ObjectId } from "mongodb";

export type Tipo = "StableCoin" | "Bono";

export interface PaymentRecord {
  date: string; // ISO date
  amount: number;
}

export interface UserDoc {
  _id?: ObjectId;
  name: string;
  passwordHash: string;
}

export interface WalletDoc {
  _id?: ObjectId;
  userId: string;
  address: string;
  encryptedPrivateKey: string; // AES-256-GCM, never returned to client
}

export interface TokenDoc {
  _id?: ObjectId;
  tipo: Tipo;
  name: string;
  symbol: string;
  decimals: number;
  amount: number; // initial supply
  walletAddress: string; // issuer
  mintAddress?: string; // set after on-chain creation
  // Bono-only:
  nominal?: number;
  porcentajeCupon?: number;
  anos?: number;
  payments?: PaymentRecord[];
}

export interface BonistaDoc {
  _id?: ObjectId;
  tokenMint: string;
  address: string;
  amount: number;
  purchaseDate: string;
  stablecoinUsed: string;
  payments?: PaymentRecord[];
}

export const COLLECTIONS = {
  users: "users",
  wallets: "wallets",
  token: "token",
  bonista: "bonista",
} as const;

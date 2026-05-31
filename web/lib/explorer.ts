// Build Solana explorer links. For a local validator we point the explorer's
// cluster param at the custom RPC URL; for devnet we use the named cluster.

const SOLANA_URL = process.env.NEXT_PUBLIC_SOLANA_URL ?? "http://localhost:8899";

function clusterQuery(): string {
  if (SOLANA_URL.includes("devnet")) return "?cluster=devnet";
  if (SOLANA_URL.includes("testnet")) return "?cluster=testnet";
  if (SOLANA_URL.includes("mainnet")) return "";
  // local validator
  return `?cluster=custom&customUrl=${encodeURIComponent(SOLANA_URL)}`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}${clusterQuery()}`;
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}${clusterQuery()}`;
}

export function shortAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 1) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

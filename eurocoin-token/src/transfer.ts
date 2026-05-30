import { PublicKey } from "@solana/web3.js";
import {
  getConnection,
  getOrCreateATA,
  loadKeypair,
  loadTokenInfo,
  transferTokens,
} from "./utils.js";

const NUM_TOKENS = 1; // BONO units to transfer

async function main() {
  const connection = getConnection();
  const info = loadTokenInfo();

  const from = loadKeypair("adquirente1");
  const toPubkey = new PublicKey(info.wallets.adquirente2.publicKey);

  const bonoMint = new PublicKey(info.tokens.bonoDeuda.mint);
  const bonoDecimals = info.tokens.bonoDeuda.decimals;

  // adquirente1 pays/signs and creates the destination ATA if needed.
  const fromATA = await getOrCreateATA(
    connection,
    from,
    bonoMint,
    from.publicKey
  );
  const toATA = await getOrCreateATA(connection, from, bonoMint, toPubkey);

  const amount = BigInt(NUM_TOKENS) * 10n ** BigInt(bonoDecimals);
  const sig = await transferTokens(connection, from, fromATA, toATA, amount);

  console.log(
    `Transferred ${NUM_TOKENS} BONO adquirente1 -> adquirente2. Sig: ${sig}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

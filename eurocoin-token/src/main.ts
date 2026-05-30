import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { createMint, mintTo } from "@solana/spl-token";
import {
  getConnection,
  getOrCreateATA,
  transferTokens,
  WALLETS_DIR,
  WALLET_FILES,
  TOKEN_INFO_PATH,
  TokenInfo,
} from "./utils.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const AIRDROP_SOL = 2000; // SOL airdropped to each wallet (chunked under the hood)
const AIRDROP_CHUNK = 100; // a single requestAirdrop is capped, so airdrop in chunks

const EUROCC = {
  name: "EuroCC",
  symbol: "EUROCC",
  decimals: 2,
  initialSupply: 1_000_000_000,
} as const;

const BONO = {
  name: "BonoDeuda",
  symbol: "BONO",
  decimals: 0,
  initialSupply: 10_000,
} as const;

/** EuroCC distributed to each buyer so they can actually purchase bonds. */
const EUROCC_PER_BUYER = 100_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function airdropSol(
  connection: Connection,
  pubkey: PublicKey,
  totalSol: number
): Promise<void> {
  let remaining = totalSol;
  while (remaining > 0) {
    const chunk = Math.min(remaining, AIRDROP_CHUNK);
    const sig = await connection.requestAirdrop(
      pubkey,
      chunk * LAMPORTS_PER_SOL
    );
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    remaining -= chunk;
  }
}

function toBaseUnits(amount: number, decimals: number): bigint {
  return BigInt(amount) * 10n ** BigInt(decimals);
}

// ---------------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------------

async function main() {
  const connection = getConnection();
  console.log(`Connected to ${connection.rpcEndpoint}`);

  // 1. Generate 4 keypairs and persist them as 64-byte secret-key arrays.
  mkdirSync(WALLETS_DIR, { recursive: true });
  const names = [
    "emisorEuroCC",
    "emisorBonoDeuda",
    "adquirente1",
    "adquirente2",
  ] as const;

  const keypairs: Record<string, Keypair> = {};
  for (const name of names) {
    const kp = Keypair.generate();
    keypairs[name] = kp;
    const file = join(WALLETS_DIR, WALLET_FILES[name]);
    writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)));
    console.log(`  wallet ${name}: ${kp.publicKey.toBase58()}`);
  }

  const emisorEuroCC = keypairs.emisorEuroCC;
  const emisorBonoDeuda = keypairs.emisorBonoDeuda;
  const adquirente1 = keypairs.adquirente1;
  const adquirente2 = keypairs.adquirente2;

  // 2. Airdrop SOL to each wallet.
  console.log(`\nAirdropping ${AIRDROP_SOL} SOL to each wallet...`);
  for (const name of names) {
    await airdropSol(connection, keypairs[name].publicKey, AIRDROP_SOL);
    console.log(`  airdropped ${name}`);
  }

  // 3. Create the EuroCC mint (authority = emisorEuroCC).
  console.log("\nCreating EuroCC mint...");
  const euroCCMint = await createMint(
    connection,
    emisorEuroCC,
    emisorEuroCC.publicKey,
    emisorEuroCC.publicKey,
    EUROCC.decimals
  );
  console.log(`  EuroCC mint: ${euroCCMint.toBase58()}`);

  // 4. Create the issuer's EuroCC ATA and mint the full supply.
  const emisorEuroCCATA = await getOrCreateATA(
    connection,
    emisorEuroCC,
    euroCCMint,
    emisorEuroCC.publicKey
  );
  await mintTo(
    connection,
    emisorEuroCC,
    euroCCMint,
    emisorEuroCCATA,
    emisorEuroCC,
    toBaseUnits(EUROCC.initialSupply, EUROCC.decimals)
  );
  console.log(`  Minted ${EUROCC.initialSupply} EuroCC to issuer`);

  // 5. Distribute EuroCC to the two buyers.
  for (const buyer of [adquirente1, adquirente2]) {
    const buyerATA = await getOrCreateATA(
      connection,
      emisorEuroCC,
      euroCCMint,
      buyer.publicKey
    );
    await transferTokens(
      connection,
      emisorEuroCC,
      emisorEuroCCATA,
      buyerATA,
      toBaseUnits(EUROCC_PER_BUYER, EUROCC.decimals)
    );
    console.log(
      `  Distributed ${EUROCC_PER_BUYER} EuroCC to ${buyer.publicKey.toBase58()}`
    );
  }

  // 6. Create the BonoDeuda mint (authority = emisorBonoDeuda) and mint supply.
  console.log("\nCreating BonoDeuda mint...");
  const bonoMint = await createMint(
    connection,
    emisorBonoDeuda,
    emisorBonoDeuda.publicKey,
    emisorBonoDeuda.publicKey,
    BONO.decimals
  );
  console.log(`  BonoDeuda mint: ${bonoMint.toBase58()}`);

  const emisorBonoATA = await getOrCreateATA(
    connection,
    emisorBonoDeuda,
    bonoMint,
    emisorBonoDeuda.publicKey
  );
  await mintTo(
    connection,
    emisorBonoDeuda,
    bonoMint,
    emisorBonoATA,
    emisorBonoDeuda,
    toBaseUnits(BONO.initialSupply, BONO.decimals)
  );
  console.log(`  Minted ${BONO.initialSupply} BonoDeuda to issuer`);

  // 7. Write token-info.json.
  const tokenInfo: TokenInfo = {
    wallets: {
      emisorEuroCC: { publicKey: emisorEuroCC.publicKey.toBase58() },
      emisorBonoDeuda: { publicKey: emisorBonoDeuda.publicKey.toBase58() },
      adquirente1: { publicKey: adquirente1.publicKey.toBase58() },
      adquirente2: { publicKey: adquirente2.publicKey.toBase58() },
    },
    tokens: {
      euroCC: { mint: euroCCMint.toBase58(), ...EUROCC },
      bonoDeuda: { mint: bonoMint.toBase58(), ...BONO },
    },
  };
  writeFileSync(TOKEN_INFO_PATH, JSON.stringify(tokenInfo, null, 2));
  console.log(`\nWrote ${TOKEN_INFO_PATH}`);
  console.log("Setup complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

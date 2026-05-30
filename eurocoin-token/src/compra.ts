import { PublicKey } from "@solana/web3.js";
import {
  getConnection,
  getOrCreateATA,
  loadKeypair,
  loadTokenInfo,
  transferTokens,
} from "./utils.js";

// Purchase parameters: adquirente1 buys bonds from emisorBonoDeuda.
const NUM_BONOS = 1; // bonds to buy
const PRECIO_EUROCC = 1000; // price per bond, in EuroCC

async function main() {
  const connection = getConnection();
  const info = loadTokenInfo();

  const buyer = loadKeypair("adquirente1");
  const bonoIssuer = loadKeypair("emisorBonoDeuda");

  const euroCCMint = new PublicKey(info.tokens.euroCC.mint);
  const bonoMint = new PublicKey(info.tokens.bonoDeuda.mint);
  const euroDecimals = info.tokens.euroCC.decimals;
  const bonoDecimals = info.tokens.bonoDeuda.decimals;

  // The 4 ATAs involved in the swap.
  const buyerEuroATA = await getOrCreateATA(
    connection,
    buyer,
    euroCCMint,
    buyer.publicKey
  );
  const issuerEuroATA = await getOrCreateATA(
    connection,
    bonoIssuer,
    euroCCMint,
    bonoIssuer.publicKey
  );
  const issuerBonoATA = await getOrCreateATA(
    connection,
    bonoIssuer,
    bonoMint,
    bonoIssuer.publicKey
  );
  const buyerBonoATA = await getOrCreateATA(
    connection,
    buyer,
    bonoMint,
    buyer.publicKey
  );

  // Leg 1: EuroCC buyer -> issuer (payment).
  const euroAmount =
    BigInt(PRECIO_EUROCC * NUM_BONOS) * 10n ** BigInt(euroDecimals);
  const euroSig = await transferTokens(
    connection,
    buyer,
    buyerEuroATA,
    issuerEuroATA,
    euroAmount
  );
  console.log(
    `Paid ${PRECIO_EUROCC * NUM_BONOS} EuroCC (buyer -> issuer). Sig: ${euroSig}`
  );

  // Leg 2: BONO issuer -> buyer (delivery).
  const bonoAmount = BigInt(NUM_BONOS) * 10n ** BigInt(bonoDecimals);
  const bonoSig = await transferTokens(
    connection,
    bonoIssuer,
    issuerBonoATA,
    buyerBonoATA,
    bonoAmount
  );
  console.log(`Delivered ${NUM_BONOS} BONO (issuer -> buyer). Sig: ${bonoSig}`);
  console.log("Purchase complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

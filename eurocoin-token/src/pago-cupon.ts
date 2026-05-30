import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  getConnection,
  getOrCreateATA,
  getTokenBalance,
  loadKeypair,
  loadTokenInfo,
  transferTokens,
} from "./utils.js";

const CUPON_PORCENTAJE = 0.04; // 4% annual coupon
const NOMINAL_BONO = 1000; // face value per bond in EuroCC

async function main() {
  const connection = getConnection();
  const info = loadTokenInfo();

  const euroIssuer = loadKeypair("emisorEuroCC");
  const euroCCMint = new PublicKey(info.tokens.euroCC.mint);
  const bonoMint = new PublicKey(info.tokens.bonoDeuda.mint);
  const euroDecimals = info.tokens.euroCC.decimals;
  const bonoDecimals = info.tokens.bonoDeuda.decimals;

  const issuerEuroATA = await getOrCreateATA(
    connection,
    euroIssuer,
    euroCCMint,
    euroIssuer.publicKey
  );

  // Pay coupons to the two potential bondholders.
  const holders = ["adquirente1", "adquirente2"] as const;
  for (const name of holders) {
    const owner = new PublicKey(info.wallets[name].publicKey);

    const bonoATA = await getAssociatedTokenAddress(bonoMint, owner);
    const bonoBase = await getTokenBalance(connection, bonoATA);
    const bonoBalance = bonoBase / 10 ** bonoDecimals;

    const coupon = bonoBalance * NOMINAL_BONO * CUPON_PORCENTAJE;
    if (coupon <= 0) {
      console.log(`  ${name}: holds 0 BONO — no coupon`);
      continue;
    }

    const holderEuroATA = await getOrCreateATA(
      connection,
      euroIssuer,
      euroCCMint,
      owner
    );
    const amount = BigInt(Math.round(coupon * 10 ** euroDecimals));
    const sig = await transferTokens(
      connection,
      euroIssuer,
      issuerEuroATA,
      holderEuroATA,
      amount
    );
    console.log(
      `  ${name}: holds ${bonoBalance} BONO -> coupon ${coupon} EuroCC. Sig: ${sig}`
    );
  }

  console.log("Coupon payment complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { getConnection, getTokenBalance, loadTokenInfo } from "./utils.js";

async function main() {
  const connection = getConnection();
  const info = loadTokenInfo();

  const euroCCMint = new PublicKey(info.tokens.euroCC.mint);
  const bonoMint = new PublicKey(info.tokens.bonoDeuda.mint);
  const euroDecimals = info.tokens.euroCC.decimals;
  const bonoDecimals = info.tokens.bonoDeuda.decimals;

  console.log("Balances:\n");
  for (const [name, entry] of Object.entries(info.wallets)) {
    const owner = new PublicKey(entry.publicKey);

    const euroATA = await getAssociatedTokenAddress(euroCCMint, owner);
    const bonoATA = await getAssociatedTokenAddress(bonoMint, owner);

    const euroBase = await getTokenBalance(connection, euroATA);
    const bonoBase = await getTokenBalance(connection, bonoATA);

    const euro = euroBase / 10 ** euroDecimals;
    const bono = bonoBase / 10 ** bonoDecimals;

    console.log(
      `  ${name.padEnd(16)} EuroCC: ${euro.toLocaleString()} €   BONO: ${bono}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

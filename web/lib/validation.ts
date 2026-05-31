import { z } from "zod";
import { PublicKey } from "@solana/web3.js";

/** A base58 Solana address that actually parses as a PublicKey. */
export const addressSchema = z
  .string()
  .trim()
  .refine((v) => {
    try {
      // eslint-disable-next-line no-new
      new PublicKey(v);
      return true;
    } catch {
      return false;
    }
  }, "Invalid Solana address");

export const credentialsSchema = z.object({
  user: z.string().trim().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const createTokenSchema = z
  .object({
    tipo: z.enum(["StableCoin", "Bono"]),
    name: z.string().trim().min(1),
    symbol: z.string().trim().min(1).max(10),
    decimals: z.coerce.number().int().min(0).max(9),
    amount: z.coerce.number().positive(),
    walletAddress: addressSchema,
    nominal: z.coerce.number().positive().optional(),
    porcentajeCupon: z.coerce.number().min(0).optional(),
    anos: z.coerce.number().int().positive().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.tipo === "Bono") {
      for (const field of ["nominal", "porcentajeCupon", "anos"] as const) {
        if (val[field] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required for a Bono`,
          });
        }
      }
    }
  });

export const buyTokenSchema = z.object({
  walletAddress: addressSchema, // buyer wallet
  stableMint: addressSchema,
  bonoMint: addressSchema,
  amount: z.coerce.number().int().positive(),
});

export const transferSchema = z.object({
  fromAddress: addressSchema,
  toAddress: addressSchema,
  mintAddress: addressSchema,
  amount: z.coerce.number().positive(),
});

export const airdropSplSchema = z.object({
  selectedWallet: addressSchema,
  mintAddress: addressSchema,
  splAmount: z.coerce.number().positive(),
});

export type CreateTokenInput = z.infer<typeof createTokenSchema>;
export type BuyTokenInput = z.infer<typeof buyTokenSchema>;
export type TransferInput = z.infer<typeof transferSchema>;

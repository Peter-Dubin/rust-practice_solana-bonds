import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

// AES-256-GCM encryption for wallet private keys at rest.
// Stored format (single string): base64(iv).base64(authTag).base64(ciphertext)

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM

/** Load and validate the 32-byte key from ENCRYPTION_KEY (hex or base64). */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set.");
  }
  // Try hex (64 chars) first, then base64.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}).`
    );
  }
  return key;
}

/** Encrypt a UTF-8 plaintext. Returns "iv.tag.ciphertext" (each base64). */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/** Decrypt a value produced by encrypt(). Throws if tampered/invalid. */
export function decrypt(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload format.");
  }
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Encrypt a Solana secret key (Uint8Array, 64 bytes) → string.
 * We JSON-encode the byte array so it round-trips to Keypair.fromSecretKey.
 */
export function encryptSecretKey(secretKey: Uint8Array): string {
  return encrypt(JSON.stringify(Array.from(secretKey)));
}

/** Decrypt a stored private key back to a Uint8Array suitable for Keypair.fromSecretKey. */
export function decryptSecretKey(payload: string): Uint8Array {
  const json = decrypt(payload);
  return Uint8Array.from(JSON.parse(json) as number[]);
}

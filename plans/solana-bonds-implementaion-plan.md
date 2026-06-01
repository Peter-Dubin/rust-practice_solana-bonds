# Solana Bonds — Implementation Plan & Build Spec

> **Purpose of this document.** This is a self-contained seed specification for re-building a
> Solana debt-bonds platform from scratch in an empty folder. It captures every functional
> requirement, data model, blockchain operation, and configuration detail needed to implement
> the system — **without** prescribing any visual design. The frontend look, theme, layout, and
> component library are intentionally left to the implementer; only the *capabilities* and *data*
> each screen must expose are specified.
>
> A developer should be able to open only this file and build the whole system.

---

## 1. Overview & Goal

The system is a **dual-token debt-bond platform on Solana**:

- **EuroCC** — a stablecoin (SPL token, 2 decimals) used as the means of payment.
- **BonoDeuda / "Bono"** — a bond (SPL token, 0 decimals; 1 token = 1 bond) issued against EuroCC.

Users register, create Solana wallets, fund them via faucets, create bonds with custom economics
(nominal, coupon %, term), buy bonds with a stablecoin, transfer them, and — as the bond issuer —
pay annual coupons and redeem the nominal at maturity. All value movement settles **on-chain**
via SPL token transfers; MongoDB stores users, wallets, token metadata, and the bondholder ledger.

The project is delivered in two phases:

- **Phase 1 — CLI module** (`eurocoin-token/`): a TypeScript proof-of-concept that exercises the
  full bond lifecycle against a local validator. Good for learning the on-chain mechanics first.
- **Phase 2 — Web app** (`web/`): a Next.js application that productizes the same operations with
  auth, persistence, faucets, and a UI.

> **Build with security in mind.** The original reference stored passwords and wallet private keys
> in **plaintext** and had no sessions. This spec targets the **secure intended design**
> (bcrypt password hashing, encrypted private keys at rest, real sessions). See §7.

---

## 2. Architecture & Tech Stack

### Phase 1 — CLI module
- Language: TypeScript, run with `tsx`.
- Libraries: `@solana/web3.js` (^1.98), `@solana/spl-token` (^0.4), `dotenv` (^16).
- Runtime target: **local validator** `solana-test-validator` at `http://localhost:8899`.
- No database; state persists to `token-info.json` + `wallets/*.json`.

### Phase 2 — Web app
- **Next.js 15** (App Router, Turbopack) + **React 19** + **TypeScript**.
- **Tailwind CSS v4** for styling (component library is the implementer's choice — see §9).
- **MongoDB** driver v6 for persistence.
- **@solana/web3.js** (^1.98) + **@solana/spl-token** (^0.4) for on-chain ops.
- Validation: **zod** + react-hook-form (recommended).
- Auth/security: **bcrypt** (hashing), **AES-256-GCM** (key encryption), httpOnly cookie sessions
  (or JWT). See §7.

### Layered architecture (Phase 2)

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (React Server + Client Components)                  │
│   pages/routes, forms, tables, modals — implementer's style  │
└───────────────┬─────────────────────────────────────────────┘
                │ calls
┌───────────────▼─────────────────────────────────────────────┐
│ Server layer: Next.js Server Actions ("use server") +        │
│ Route Handlers (/api/...)                                    │
│   auth, user/wallet CRUD, token CRUD, buy, pay coupon/nominal│
└───────┬───────────────────────────────────┬─────────────────┘
        │                                     │
┌───────▼────────────┐            ┌───────────▼─────────────────┐
│ lib/solana.ts      │            │ lib/mongodb.ts              │
│  SPL token ops     │            │  cached Mongo client        │
└───────┬────────────┘            └───────────┬─────────────────┘
        │                                      │
┌───────▼────────────┐            ┌────────────▼────────────────┐
│ Solana validator   │            │ MongoDB (users, wallets,    │
│ (RPC SOLANA_URL)   │            │  token, bonista)            │
└────────────────────┘            └─────────────────────────────┘
```

---

## 3. Bond Domain Model & Economics

A bond is defined by:

| Field            | Meaning                                                        |
|------------------|---------------------------------------------------------------|
| `nominal`        | Face value per bond unit, denominated in the stablecoin (€).   |
| `porcentajeCupon`| Annual coupon rate, as a percentage (e.g. `4` = 4%).           |
| `anos`           | Term in years until maturity.                                  |
| (redemption)     | Optional premium at maturity (reference example uses 7%).      |

**Coupon payment per bondholder** (one coupon period):

```
couponAmount = (porcentajeCupon × unitsHeld × nominal) / 100
```

**Nominal redemption per bondholder** (at maturity):

```
nominalAmount = unitsHeld × nominal      (+ optional redemption premium)
```

All transfer amounts must be converted to **base units** before calling SPL transfer:
`amountBaseUnits = amount × 10^(stablecoin decimals)`.

### Worked example (the reference bond)

```
Nominal (face value):        1000 €
Issue date:                  21 Apr 2025
Maturity:                    21 Apr 2029  (≈ 4-year term)
Annual coupon:               4% of nominal = 40 €
Redemption premium:          7% of nominal = 70 €

Cash flow for an investor holding 1 bond:
  21 Apr 2026:  +40 €   (coupon 1)
  21 Apr 2027:  +40 €   (coupon 2)
  21 Apr 2028:  +40 €   (coupon 3)
  21 Apr 2029:  +1110 € (coupon 4 + nominal 1000 + premium 70)
```

---

## 4. Phase 1 — CLI Module Spec (`eurocoin-token/`)

### Tokens

| Token      | Symbol  | Decimals | Initial supply        | Mint authority    |
|------------|---------|----------|-----------------------|-------------------|
| EuroCC     | EUROCC  | 2        | 1,000,000,000 (× 10²) | emisorEuroCC      |
| BonoDeuda  | BONO    | 0        | 10,000                | emisorBonoDeuda   |

### Actors (4 wallets)

`emisorEuroCC` (stablecoin issuer), `emisorBonoDeuda` (bond issuer), `adquirente1` (buyer 1),
`adquirente2` (buyer 2). Each keypair is created with `Keypair.generate()` and persisted as a JSON
**byte array** (the 64-byte secret key) under `wallets/<name>.json`. Reload with
`Keypair.fromSecretKey(new Uint8Array(JSON.parse(file)))`.

### Persistence files

`wallets/` — `emisor_eurocc.json`, `emisor_bonodeuda.json`, `adquirente1.json`, `adquirente2.json`
(each is `[byte0, …, byte63]`).

`token-info.json` — generated by `main.ts`:

```json
{
  "wallets": {
    "emisorEuroCC":    { "publicKey": "<base58>" },
    "emisorBonoDeuda": { "publicKey": "<base58>" },
    "adquirente1":     { "publicKey": "<base58>" },
    "adquirente2":     { "publicKey": "<base58>" }
  },
  "tokens": {
    "euroCC":    { "mint": "<base58>", "name": "EuroCC",    "symbol": "EUROCC", "decimals": 2, "initialSupply": 1000000000 },
    "bonoDeuda": { "mint": "<base58>", "name": "BonoDeuda", "symbol": "BONO",   "decimals": 0, "initialSupply": 10000 }
  }
}
```

### Scripts

**`src/utils.ts`** — shared helpers:
- `loadKeypair(name)` → reads `wallets/<name>.json`, returns `Keypair`.
- `loadTokenInfo()` → parses `token-info.json`.
- `getOrCreateATA(connection, payer, mint, owner)` → derives ATA (`getAssociatedTokenAddress`),
  checks existence (`getAccount`), creates if missing (`createAssociatedTokenAccount`).
- `getTokenBalance(connection, tokenAccount)` → `Number(account.amount)` base units, `0` if missing.
- `transferTokens(connection, from, fromATA, toATA, amount)` → SPL `transfer(...)`, returns the
  signature; handle `SendTransactionError` with logs.
- Export a `TokenInfo` interface mirroring `token-info.json`.

**`src/main.ts`** — one-time setup:
1. Generate 4 keypairs, write each to `wallets/`.
2. Airdrop SOL to each (`connection.requestAirdrop`, confirm each) — reference uses 2,000 SOL each.
3. `createMint(connection, emisorEuroCC, emisorEuroCC.publicKey, emisorEuroCC.publicKey, 2)`.
4. Create emisorEuroCC's ATA; `mintTo(...)` the full EuroCC supply (`supply × 10²` base units).
5. Distribute EuroCC to `adquirente1` and `adquirente2` (create ATAs, `transfer`).
6. `createMint(... emisorBonoDeuda ..., 0)`; create ATA; `mintTo` 10,000 BONO.
7. Write `token-info.json`.

**`src/compra.ts`** — simulate a purchase (`adquirente1` buys bonds from `emisorBonoDeuda`):
- Constants: `NUM_BONOS = 1`, `PRECIO_EUROCC = 1000` (price per bond).
- Create the 4 needed ATAs (EuroCC for buyer + bond issuer; BONO for issuer + buyer).
- Transfer EuroCC buyer→issuer (`PRECIO_EUROCC × NUM_BONOS × 10²` base units).
- Transfer BONO issuer→buyer (`NUM_BONOS` base units).

**`src/balance.ts`** — print EuroCC and BONO balances for all 4 actors (divide base units by
`10^decimals`).

**`src/transfer.ts`** — transfer 1 BONO `adquirente1 → adquirente2` (`NUM_TOKENS = 1`); payer/signer
is `adquirente1`.

**`src/pago-cupon.ts`** — pay coupons from `emisorEuroCC` to each bondholder:
- Constants: `CUPON_PORCENTAJE = 0.04`, `NOMINAL_BONO = 1000`.
- Read each buyer's BONO balance; `coupon = bonoBalance × NOMINAL_BONO × CUPON_PORCENTAJE`.
- For each buyer with `coupon > 0`, transfer `coupon × 10²` base units EuroCC from emisorEuroCC.

### npm scripts (`package.json`)

```jsonc
{
  "scripts": {
    "dev":      "npx tsx src/main.ts",     // setup wallets, airdrops, mint tokens
    "balance":  "npx tsx src/balance.ts",
    "compra":   "npx tsx src/compra.ts",
    "transfer": "npx tsx src/transfer.ts",
    "cupon":    "npx tsx src/pago-cupon.ts",
    "test":     "npm run dev && npm run balance && npm run compra && npm run transfer && npm run cupon && npm run balance",
    "build":    "tsc"
  }
}
```

Dependencies: `@solana/web3.js`, `@solana/spl-token`, `dotenv`, `typescript`, `ts-node`, `tsx`.

---

## 5. Phase 2 — Web App Spec (`web/`)

### 5.1 Routes / Pages

For each: **route → purpose → data shown → user actions → server calls.**

| Route | Purpose | Data shown | Actions | Server calls |
|-------|---------|-----------|---------|--------------|
| `/` | Landing / intro | Project description | — | — |
| (header) Auth | Register & login | Current user + active wallet | Register, Login, Logout | `POST /api/auth/register`, `POST /api/auth/login` |
| `/users` | List users (admin/dev) | Table of users | Add user; open a user | `getUsers`, `addUser` |
| `/users/[userId]` | A user's wallets | User name + wallet list | Add wallet; check SOL balance; faucet SOL; faucet SPL token; check token balance; set active wallet; open wallet | `getUserAndWallets`, `addWallet`, `requestAirdrop`, `getBalance`, `airdropSplTokenAction`, `getTokenBalance` |
| `/users/[userId]/wallets/[walletId]` | Wallet detail | Address, SOL balance, table of all tokens with on-chain balance + bond fields (nominal/coupon/years) | **Buy** a bond (pick stablecoin + amount); transfer | `buyToken`, `transferTokens`, `getTokenBalance` |
| `/token` | All tokens/bonds | Table: tipo, name, symbol, decimals, amount, nominal, coupon %, years, wallet & mint (explorer links) | **Create token/bond** | `getTokens`, `createTokenAction` |
| `/token/[tokenId]` | Bond detail + admin | Bond fields, on-chain balance, **bonista (bondholder) list** | **Pay coupon**, **Pay nominal** (issuer only) | `payCuponAction`, `payNominalAction` |

Notes:
- Active user/wallet selection is global app state. The reference used localStorage + a React
  context (`GlobalContext`); this spec recommends server sessions instead (see §7) while keeping a
  client context for the *active wallet* selection UX.
- A `cleanTokens()` dev action wipes `token`, `wallets`, `users` collections (guard behind a
  dev-only/admin check — do **not** expose in production).

### 5.2 Core user flows

```
register → login → create wallet → faucet SOL → faucet EUROCC
        → create bond → buy bond (stablecoin → bond)
        → view bondholders → pay coupon → (at maturity) pay nominal
        → transfer bond to another wallet
```

### 5.3 Server actions & API routes

**Auth (API route handlers):**
- `POST /api/auth/register` — body `{ user, password }`. Reject if user exists (`409`) or fields
  missing (`400`). **Hash** the password (bcrypt) and insert. Returns `{ ok: true }`.
- `POST /api/auth/login` — body `{ user, password }`. Look up by `name`, **compare hash** with
  bcrypt. On success establish a session (httpOnly cookie / JWT) and return `{ ok, _id, name }`;
  else `401`.

**Users (`app/users/actions.ts`):**
- `getUsers()` → all users `{ _id, name }` (never return password hashes).
- `addUser(formData)` → insert `{ name }`; revalidate `/users`.

**User wallets (`app/users/[userId]/actions.ts`):**
- `getUserAndWallets(userId)` → `{ user: {_id,name} | null, wallets: [{_id, address}] }` (never
  return private keys to the client).
- `addWallet(userId)` → `Keypair.generate()`, store `{ userId, address, encryptedPrivateKey }`
  (encrypted — see §7); revalidate `/users/[userId]`.

**Tokens (`app/token/actions.ts`):**
- `getTokens()` → all token docs (stringify `_id`).
- `createTokenAction({ tipo, name, symbol, decimals, amount, walletAddress, nominal?, porcentajeCupon?, anos? })`
  → (1) insert token metadata; if `tipo === "Bono"` include `nominal/porcentajeCupon/anos`;
  (2) load issuer wallet, **decrypt** private key server-side; (3) `createToken(...)` on-chain;
  (4) update token doc with `mintAddress`. Returns `{ success, message }`.
- `cleanTokens()` → dev-only wipe of `token`/`wallets`/`users`.
- `payCuponAction(mintAddress)` → calls `payCupon(mintAddress)`; returns tx signature.
- `payNominalAction(mintAddress)` → calls `payNominal(mintAddress)`; returns tx signature.

### 5.4 `lib/solana.ts` operations

All functions create a `Connection(process.env.SOLANA_URL, "confirmed")`. Private keys are
**decrypted from the DB inside these server-only functions**, never sent to the client.

| Function | Signature (intent) | On-chain steps |
|----------|-------------------|----------------|
| `requestAirdrop` | `(address, amount=1) → signature` | `requestAirdrop(pubkey, amount × LAMPORTS_PER_SOL)`, confirm |
| `getBalance` | `(address) → SOL` | `getBalance` / `LAMPORTS_PER_SOL` |
| `createToken` | `(payer: Keypair, name, symbol, decimals, initialSupply) → mint PublicKey` | `createMint` → create payer ATA → `mintTo(initialSupply × 10^decimals)` |
| `airdropSplToken` | `(mintAddress, destinationAddress, amount, payerKeypair) → boolean` | get/create dest ATA → `mintTo` |
| `airdropSplTokenAction` | `(selectedWallet, mintAddress, splAmount) → void` | load token + issuer wallet from DB, decrypt key, call `airdropSplToken` |
| `getTokenBalance` | `(mintAddress, walletAddress) → string` | derive ATA → `getAccount` amount |
| `buyToken` | `(walletAddress, stableMint, bonoMint, amount) → void` | transfer `amount` BONO issuer→buyer; transfer `amount × nominal × 10^stableDecimals` stablecoin buyer→issuer; **insert `bonista` record** |
| `transferTokens` | `(connection, from: Keypair, fromATA, toATA, amount) → signature` | SPL `transfer`; throw on `SendTransactionError` with logs |
| `payCupon` | `(bonoMint) → signature` | load bond + issuer; query all `bonista` for this mint; build one transaction batching a transfer of `(porcentajeCupon × units × nominal)/100` stablecoin to each holder; send+confirm; push payment records to `token.payments` and each `bonista.payments` |
| `payNominal` | `(bonoMint) → signature` | same as `payCupon` but transfers the **full nominal per unit** (optionally + premium); record payments |

---

## 6. Data Model (MongoDB)

Database name is implementer's choice; four collections:

**`users`**
```jsonc
{ "_id": ObjectId, "name": "string", "passwordHash": "bcrypt-hash" }
```

**`wallets`**
```jsonc
{
  "_id": ObjectId,
  "userId": "string",                 // owner
  "address": "base58 public key",
  "encryptedPrivateKey": "string"     // AES-256-GCM ciphertext (see §7) — never plaintext
}
```

**`token`**
```jsonc
{
  "_id": ObjectId,
  "tipo": "StableCoin" | "Bono",
  "name": "string",
  "symbol": "string",
  "decimals": 2,
  "amount": 1000000,                  // initial supply
  "walletAddress": "issuer base58",
  "mintAddress": "base58",            // set after on-chain creation
  // Bono-only:
  "nominal": 1000,
  "porcentajeCupon": 4,
  "anos": 4,
  "payments": [ { "date": "ISODate", "amount": 40 } ]   // issuer-side payment history
}
```

**`bonista`** (bondholder ledger — one row per purchase)
```jsonc
{
  "_id": ObjectId,
  "tokenMint": "bond mint base58",
  "address": "holder wallet base58",
  "amount": 1,                        // units held
  "purchaseDate": "ISODate",
  "stablecoinUsed": "stablecoin mint base58",
  "payments": [ { "date": "ISODate", "amount": 40 } ]   // coupons/nominal received
}
```

---

## 7. Security Requirements (intended / secure design)

> These **replace** the reference app's insecure behavior (plaintext passwords, plaintext private
> keys in Mongo, no sessions, `MONGODB_URI` logged to console). Implement the secure versions.

1. **Password hashing.** Store `passwordHash` via **bcrypt** (cost ≥ 10). Register hashes;
   login compares with `bcrypt.compare`. Never store or log plaintext passwords.
2. **Private key encryption at rest.** Encrypt each wallet secret key with **AES-256-GCM** using a
   server-side key from `ENCRYPTION_KEY` (32 bytes). Store ciphertext + IV + auth tag as
   `encryptedPrivateKey`. **Decrypt only inside `lib/solana.ts` server functions** to sign
   transactions; never return private keys (encrypted or not) to the client.
3. **Sessions.** Replace localStorage-based identity with an **httpOnly, secure cookie** session
   (or signed JWT) issued at login, secret from `SESSION_SECRET`. Protect server actions that
   mutate data behind a session check.
4. **Authorization.** Verify the requesting user owns the wallet before signing/transferring;
   restrict coupon/nominal payment to the bond's issuer; guard `cleanTokens()` to dev/admin only.
5. **Input validation.** Validate all inputs with **zod** (amounts > 0, valid base58 addresses,
   required fields) on the server before touching the chain or DB.
6. **No secret logging.** Never log `MONGODB_URI`, keys, or private keys.

---

## 8. Environment Variables

| Var | Required | Purpose |
|-----|----------|---------|
| `MONGODB_URI` | yes | MongoDB connection string |
| `SOLANA_URL` | yes | Solana RPC endpoint (e.g. `http://localhost:8899` or a devnet URL) |
| `NODE_ENV` | yes | `development` / `production` (Mongo client caching, cookie flags) |
| `ENCRYPTION_KEY` | yes | 32-byte key (hex/base64) for AES-256-GCM private-key encryption |
| `SESSION_SECRET` | yes | Secret for signing session cookies / JWTs |

`.env.example`:

```dotenv
MONGODB_URI=mongodb://localhost:27017/solana-bonds
SOLANA_URL=http://localhost:8899
NODE_ENV=development
ENCRYPTION_KEY=replace-with-32-byte-hex-or-base64
SESSION_SECRET=replace-with-random-secret
```

`lib/mongodb.ts`: cache a single `MongoClient` promise on `globalThis` in development (avoid
hot-reload connection storms); create fresh in production. Throw if `MONGODB_URI` is missing.

---

## 9. UI Guidance (implementer's own style)

The frontend look, theme, layout, and component library are **yours to design**. What must exist:

**Screens (capabilities, not layouts):**
- **Header / nav** with brand, link to tokens, link to "my wallets", and auth controls (register,
  login, logout). Show the active user and active wallet (with an explorer link).
- **Landing** explaining the platform.
- **Users list** with add-user and drill-in (dev/admin convenience).
- **User wallets** page: list wallets; add wallet; per-wallet actions for SOL balance check, SOL
  faucet, SPL token faucet, token-balance check; select active wallet.
- **Wallet detail**: SOL balance, table of all tokens with on-chain balances and (for bonds)
  nominal/coupon/years; **Buy** action (choose stablecoin + amount) and transfer.
- **Tokens list**: table of all tokens/bonds with metadata + explorer links; **Create token/bond**
  form (type selector toggles bond-only fields: nominal, coupon %, years).
- **Bond detail**: bond metadata, on-chain balance, **bondholder (bonista) table**, and
  issuer-only **Pay coupon** / **Pay nominal** actions that surface the resulting tx signature.

**Required interaction patterns (any styling):**
- Tables for lists (users, wallets, tokens, bondholders).
- Modals/dialogs for create-token, buy, and the faucet/balance actions.
- Forms with client + server validation; show errors inline.
- After any on-chain action, show the **transaction signature with a link to a Solana explorer**.
- Toast/notification feedback for success/error.
- Loading and empty states for every async list/action.

---

## 10. Build Order / Milestones

1. **Phase 1 CLI** — implement `utils.ts` → `main.ts` (setup) → `balance.ts` → `compra.ts` →
   `transfer.ts` → `pago-cupon.ts`. Run against `solana-test-validator` to validate mechanics.
2. **Web scaffolding** — Next.js app, Tailwind, `lib/mongodb.ts`, `lib/solana.ts` (start with
   `requestAirdrop`, `getBalance`, `getTokenBalance`).
3. **Auth + sessions** — register/login with bcrypt + session cookie (§7).
4. **Wallets** — `addWallet` with AES-256-GCM encryption; list + active-wallet selection.
5. **Faucets** — SOL airdrop + SPL token airdrop.
6. **Token/bond creation** — `createTokenAction` + `createToken`; persist `mintAddress`.
7. **Buy** — `buyToken` (dual transfer) + `bonista` ledger insert.
8. **Coupon & nominal** — `payCupon`, `payNominal` (batched transfers + payment history).
9. **Transfer** — bond transfer between wallets.
10. **Polish** — validation, authorization checks, explorer links, toasts, empty/loading states.

---

## 11. Verification / Acceptance Checklist

**Setup**
- [x] `solana-test-validator` running; `SOLANA_URL` reachable; MongoDB reachable. *(Atlas M0 free tier — rustsolanabonds cluster)*

**Phase 1 (CLI)**
- [x] `npm run dev` creates 4 wallets, airdrops SOL, mints EuroCC + BonoDeuda, writes `token-info.json`.
- [x] `npm run balance` prints correct EuroCC/BONO balances.
- [x] `npm run compra` moves 1000 EUROCC buyer→issuer and 1 BONO issuer→buyer.
- [x] `npm run transfer` moves 1 BONO adquirente1→adquirente2.
- [x] `npm run cupon` pays 40 EUROCC per held bond to each holder.

**Phase 2 (Web)**
- [x] Register + login work; password stored only as bcrypt hash; session cookie set.
- [x] Create wallet stores an **encrypted** private key; client never receives it.
- [x] SOL faucet increases SOL balance; SPL faucet increases token balance.
- [x] Create a Bono with nominal/coupon/years; `mintAddress` saved on-chain + in DB.
- [x] Buy a bond UI visible (Bond + StableCoin dropdowns, Units, Buy button); buy is atomic (both legs in one tx).
- [x] Buy a bond: BONO appears in buyer wallet, stablecoin debited, `bonista` row created.
- [x] Bond detail lists bondholders.
- [x] Pay coupon transfers `(coupon% × units × nominal)/100` to each holder; tx signature shown; payment history recorded.
- [x] Pay nominal transfers full nominal per unit; recorded.
- [x] Transfer a bond between two wallets. *(10 WB bonds sent from User1 → Peter Dubin; WB balance dropped 1000 → 990)*
- [x] Authorization enforced: issuer-only actions hidden from non-issuers. *(Confirmed: User1 = WB issuer sees buttons; Peter Dubin = non-issuer does not)*

**Sanity**
- [x] A developer could build the system from this file alone — token params, data shapes,
      function contracts, bond math, env vars, and security model are all specified.

---

## 12. Phase 2 — Demo Workflow (Real-Life Scenario)

> **Purpose.** This section translates the verification checklist into a story-driven walkthrough.
> Follow it top to bottom to exercise the full bond lifecycle as if you were running a real
> corporate bond issuance — with exact token numbers at every step so you always know what to
> expect on screen.

---

### The Story

**GreenTech Corp** is a clean-energy company that needs €1 000 000 to fund a new solar farm.
Instead of going to a bank, they issue **corporate bonds** on Solana — anyone with a wallet can
invest, and the bond contract guarantees annual interest payments plus full repayment at maturity.

| Role | Account | Represents |
|------|---------|-----------|
| **Peter Dubin** | Issuer / Treasurer | GreenTech Corp — creates tokens, pays coupons, redeems bonds |
| **User1** | Investor | An individual buying a bond as a savings product |

---

### Tokens used in this demo

| Token | Symbol | Type | Decimals | Meaning |
|-------|--------|------|----------|---------|
| Token A | TA | StableCoin | 2 | The payment currency (like a euro stablecoin). 1 TA = 100 base units on-chain. |
| Work Bond | WB | Bono | 0 | The bond itself. 1 WB = 1 bond. 0 decimals means no fractions — you own whole bonds. |

**Bond economics for WB**

```
Face value (nominal):  1 000 TA per bond
Annual interest:       4% of nominal = 40 TA per bond per year
Term:                  4 years
```

**Full cash-flow for an investor holding 1 WB for the entire term:**

```
Day 0  (buy):    −1 000 TA   ← investor pays GreenTech
Year 1 (coupon): +   40 TA   ← GreenTech pays investor
Year 2 (coupon): +   40 TA
Year 3 (coupon): +   40 TA
Year 4 (coupon): +   40 TA
Year 4 (nominal):+ 1 000 TA  ← GreenTech returns the face value
─────────────────────────────
Net profit:         +160 TA  (16 % total return, 4 % per year)
```

---

### Step-by-step walkthrough

#### Step 1 — GreenTech sets up (Peter Dubin)

1. Register and log in as **Peter Dubin**.
2. Go to **My Wallets → + Add wallet**. This is the company treasury wallet.
3. Click **Faucet 1 SOL** on that wallet (SOL is needed to pay Solana transaction fees).
4. Go to **Tokens & Bonds → + Create token / bond**:
   - Type: **StableCoin** | Name: `Token A` | Symbol: `TA` | Decimals: `2` | Supply: `1 000 000`
   - Issuer wallet: *(auto-filled with your active wallet)*
   - Click **Create**. The blockchain creates the mint and puts 1 000 000 TA (= 100 000 000 base units) in Peter Dubin's treasury.
5. Still on **+ Create token / bond**:
   - Type: **Bono** | Name: `Work Bond` | Symbol: `WB` | Supply: `1 000`
   - Nominal: `1000` | Coupon %: `4` | Years: `4` | Decimals: locked to `0`
   - Click **Create**. GreenTech now holds 1 000 WB bonds ready to sell.

> **What happened on-chain:** Two SPL mints were created. Peter Dubin's ATA for TA holds
> 100 000 000 base units; his ATA for WB holds 1 000 base units (= 1 000 bonds).

---

#### Step 2 — Investor sets up (User1)

6. Register and log in as **User1**.
7. Go to **My Wallets → + Add wallet**.
8. Click **Faucet 1 SOL** (User1 also needs SOL for fees).
9. In the SPL Faucet row, select **TA**, type `2000`, click **Mint**.
   - Why 2 000? Each bond costs 1 000 TA, so 2 000 gives room to buy 2 bonds and still have change.
   - On-chain result: User1's TA balance = **2 000 TA = 200 000 base units**.

> **Balance check before buying:**
> ```
> User1  TA: 200 000 base units (= 2 000 TA)  ✓ enough
> User1  WB:       0 base units
> Peter  WB:   1 000 base units (= 1 000 bonds available)
> ```

---

#### Step 3 — User1 buys a bond

10. On User1's wallets page, click **Open** on the wallet.
11. In the **Buy a bond** section:
    - Bond: `WB` | Pay with: `TA` | Units: `1`
    - Click **Buy**.

**What happens (atomic, single Solana transaction):**

```
User1  TA:  −100 000 base units  (= −1 000 TA, the bond price)  → Peter Dubin
Peter  WB:  −      1 base unit   (= −1 bond)                    → User1
User1  WB:  +      1 base unit   (= +1 bond)
```

**Balances after:**
```
User1  TA:  100 000 base units  (= 1 000 TA remaining)
User1  WB:       1 base unit    (= 1 bond owned)
Peter  TA:  +100 000 base units received (payment)
Peter  WB:     999 base units   (999 bonds left to sell)
```

A new **bondholder row** is created in the database: holder = User1's wallet, units = 1.

---

#### Step 4 — GreenTech pays Year 1 coupon (Peter Dubin)

12. Log in as **Peter Dubin**.
13. Go to **Tokens & Bonds → Detail** on Work Bond (WB).
14. In **Issuer actions**, click **Pay coupon**.

**Coupon formula:** `4% × 1 bond × 1 000 TA nominal = 40 TA`

```
Peter  TA:  −4 000 base units   (= −40 TA paid out)  → User1
User1  TA:  +4 000 base units   (= +40 TA received)
```

The bondholder row now shows **1 payment**. A transaction signature links to the explorer.

---

#### Step 5 — User1 transfers a bond to Peter Dubin mid-term

15. Log in as **User1**, go to the wallet detail page (Open).
16. In the **Transfer** section:
    - Token: `WB` | To address: *(Peter Dubin's wallet address)* | Amount: `1`
    - Click **Send**.

```
User1  WB:  −1 base unit  (bond sold / transferred)
Peter  WB:  +1 base unit  (bond received)
```

> This simulates a secondary market sale — the bond changes hands before maturity.
> Note: the bondholder ledger in the DB still records User1 as the original buyer.
> Coupon and nominal payments use the bondholder ledger, not live on-chain balances —
> so only holders recorded at the time of each payment receive the transfer.

---

#### Step 6 — GreenTech pays nominal at maturity (Peter Dubin)

17. Log in as **Peter Dubin**, navigate to Work Bond detail.
18. Click **Pay nominal**.

**Nominal formula:** `1 000 TA × 1 bond held (per bondholder record) = 1 000 TA`

```
Peter  TA:  −100 000 base units  (= −1 000 TA)  → User1
User1  TA:  +100 000 base units  (= +1 000 TA received — full face value back)
```

The bondholder row now shows **2 payments** (1 coupon + 1 nominal).

---

### Final balances (1 coupon + nominal paid, bond transferred mid-term)

| Account | TA (base) | TA (whole) | WB (bonds) |
|---------|-----------|-----------|------------|
| User1 | started with 200 000, spent 100 000 on bond, received 4 000 coupon + 100 000 nominal | **204 000** (= 2 040 TA) | 0 (transferred away) |
| Peter Dubin | received 100 000 from sale, paid 4 000 coupon + 100 000 nominal, received bond back | net −4 000 (paid interest) | 1 (the bond transferred back) |

> **User1's profit: 40 TA** — earned 4% annual interest on a 1-year hold.
> If held all 4 years without transferring: **+160 TA total (16% return)**.

---

### Quick-reference: what token amounts to use

| Action | Field to fill | Value | Why |
|--------|--------------|-------|-----|
| SPL Faucet (TA to investor) | Amount | `2000` | Needs ≥ 1 000 TA per bond (nominal = 1000, decimals = 2 → 100 000 base) |
| Buy a bond | Units | `1` | 1 WB bond |
| Transfer bond | Amount | `1` | 1 WB (whole bonds only, decimals = 0) |
| Pay coupon (auto) | — | — | System calculates: 4% × 1 000 × bonds held = 40 TA per holder |
| Pay nominal (auto) | — | — | System calculates: 1 000 TA × bonds held per holder |

# hello_solana_dapp

Next.js starter with Tailwind CSS, `@solana/kit`, and an Anchor vault program example.

## Getting Started

```shell
npx -y create-solana-dapp@latest -t solana-foundation/templates/kit/hello_solana_dapp
```

```shell
npm install
npm run setup   # Builds the Anchor program and generates the TypeScript client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect your wallet, and interact with the vault.

## What's Included

- **Wallet connection** via wallet-standard with auto-discovery and dropdown UI
- **Cluster switching** — devnet, testnet, mainnet, and localnet from the header
- **Wallet balance** display with airdrop button (devnet/testnet/localnet)
- **Anchor programs** — vault plus migrated favorites, SOL bank, event log, and token bank examples
- **Toast notifications** with explorer links for every transaction
- **Error handling** — human-readable messages for common Solana and program errors
- **Codama-generated client** — type-safe program interactions using `@solana/kit`
- **Tailwind CSS v4** with light/dark mode toggle

## Stack

| Layer          | Technology                       |
| -------------- | -------------------------------- |
| Frontend       | Next.js 16, React 19, TypeScript |
| Styling        | Tailwind CSS v4                  |
| Solana Client  | `@solana/kit`, wallet-standard   |
| Program Client | Codama-generated, `@solana/kit`  |
| Program        | Anchor (Rust)                    |

## Project Structure

```
├── app/
│   ├── components/
│   │   ├── cluster-context.tsx  # Cluster state (React context + localStorage)
│   │   ├── cluster-select.tsx   # Cluster switcher dropdown
│   │   ├── grid-background.tsx  # Solana-branded decorative grid
│   │   ├── providers.tsx        # Wallet + theme providers
│   │   ├── theme-toggle.tsx     # Light/dark mode toggle
│   │   ├── vault-card.tsx       # Vault deposit/withdraw UI
│   │   └── wallet-button.tsx    # Wallet connect/disconnect dropdown
│   ├── generated/vault/        # Codama-generated program client
│   ├── lib/
│   │   ├── wallet/             # Wallet-standard connection layer
│   │   │   ├── types.ts        # Wallet types
│   │   │   ├── standard.ts     # Wallet discovery + session creation
│   │   │   ├── signer.ts       # WalletSession → TransactionSigner
│   │   │   └── context.tsx     # WalletProvider + useWallet() hook
│   │   ├── hooks/
│   │   │   ├── use-balance.ts  # SWR-based balance fetching
│   │   │   └── use-send-transaction.ts  # Transaction send with loading state
│   │   ├── cluster.ts          # Cluster endpoints + RPC factory
│   │   ├── lamports.ts         # SOL/lamports conversion
│   │   ├── send-transaction.ts # Transaction build + sign + send pipeline
│   │   ├── errors.ts           # Transaction error parsing
│   │   └── explorer.ts         # Explorer URL builder + address helpers
│   └── page.tsx                # Main page
├── anchor/                     # Anchor workspace
│   ├── programs/
│   │   ├── anchor_favorites/   # PDA-backed favorites example
│   │   ├── bank/               # SOL deposit/withdraw example
│   │   ├── emit_log/           # Anchor event emission example
│   │   ├── tokenbank/          # SPL token bank example
│   │   └── vault/              # Vault program (Rust)
│   └── tests/                  # TypeScript integration tests
├── scripts/backend/            # Migrated backend utility scripts
│   ├── src/                    # Solana RPC, scan, transfer, and demo scripts
│   └── tsconfig.json           # ts-node config for backend scripts
└── codama.json                 # Codama client generation config
```

## Local Development

To test against a local validator instead of devnet:

1. **Start a local validator**

   ```bash
   surfpool start
   ```

2. **Deploy the program locally**

   ```bash
   solana config set --url localhost
   cd anchor
   anchor build
   anchor deploy
   cd ..
   npm run codama:js   # Regenerate client with local program ID
   ```

3. **Switch to localnet** in the app using the cluster selector in the header.

## Deploy Your Own Vault

The included vault program is already deployed to devnet. To deploy your own:

### Prerequisites

- [Rust](https://rustup.rs/)
- [Solana CLI](https://solana.com/docs/intro/installation)
- [Anchor](https://www.anchor-lang.com/docs/installation)

### Steps

1. **Configure Solana CLI for devnet**

   ```bash
   solana config set --url devnet
   ```

2. **Create a wallet (if needed) and fund it**

   ```bash
   solana-keygen new
   solana airdrop 2
   ```

3. **Build and deploy the program**

   ```bash
   cd anchor
   anchor build
   anchor keys sync    # Updates program ID in source
   anchor build        # Rebuild with new ID
   anchor deploy
   cd ..
   ```

4. **Regenerate the client and restart**
   ```bash
   npm run setup   # Rebuilds program and regenerates client
   npm run dev
   ```

## Testing

The Anchor workspace has two separate test entry points.

```bash
npm run anchor-build   # Build the program first
npm run anchor-test    # Run Rust/Cargo tests only
npm run anchor-tstest  # Run TypeScript mocha integration tests
```

`npm run anchor-test` delegates to `anchor test --skip-deploy`, and `Anchor.toml` keeps `test = "cargo test"`. This runs the Rust unit tests and LiteSVM tests under `anchor/programs/**`.

`npm run anchor-tstest` delegates to `anchor run tstest`, which runs `ts-mocha` against `anchor/tests/**/*.ts`. These TypeScript tests expect a local RPC at `http://127.0.0.1:8899` with the migrated programs deployed.

## Backend Scripts

The old `hello_solana/backend` TypeScript scripts now live under `scripts/backend` and reuse this app's root `package.json` and `node_modules`.

```bash
npm run backend:dev
npm run backend:listen-favorites
npm run backend:scan-favorites
npm run backend:scan-favorites-with-coder
npm run backend:scan-favorites-by-block
npm run backend:get-all-favorites-pdas
npm run backend:scan-bank
npm run backend:bank-deposit -- 0.5
npm run backend:measure-cu
npm run backend:transfer-sol
npm run backend:scan-sol-transfers
npm run backend:spl-token
npm run backend:keypair-to-base58 -- ./keypair.json
npm run backend:example-encoding
```

By default the scripts connect to `http://localhost:8899` and read `./keypair.json` from the project root when a signer is needed. Override these with environment variables:

```bash
SOLANA_RPC_ENDPOINT=http://localhost:8899 PAYER_KEYPAIR_PATH=./keypair.json npm run backend:bank-deposit -- 0.1
```

Local signer files such as `keypair.json` and `keypair_base58.txt` are ignored by git.

## Regenerating the Client

If you modify the program, regenerate the TypeScript client:

```bash
npm run setup   # Or: npm run anchor-build && npm run codama:js
```

This uses [Codama](https://github.com/codama-idl/codama) to generate a type-safe client from the Anchor IDL.

## Learn More

- [Solana Docs](https://solana.com/docs) — core concepts and guides
- [Anchor Docs](https://www.anchor-lang.com/docs/introduction) — program development framework
- [Deploying Programs](https://solana.com/docs/programs/deploying) — deployment guide
- [@solana/kit](https://github.com/anza-xyz/kit) — Solana JavaScript SDK
- [Codama](https://github.com/codama-idl/codama) — client generation from IDL

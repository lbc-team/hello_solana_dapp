# hello_solana_dapp

基于 Next.js 的 starter 项目，集成 Tailwind CSS、`@solana/kit` 和一个 Anchor vault 程序示例。

## 快速开始

```shell
npx -y create-solana-dapp@latest -t solana-foundation/templates/kit/hello_solana_dapp
```

```shell
npm install
npm run setup   # 构建 Anchor 程序并生成 TypeScript 客户端
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，连接您的钱包，与 vault 进行交互。

## 功能特性

- **钱包连接** — 通过 wallet-standard 实现自动发现和下拉菜单 UI
- **集群切换** — 从顶部导航栏切换 devnet、testnet、mainnet 和 localnet
- **钱包余额** — 显示余额并提供空投按钮（devnet/testnet/localnet）
- **Anchor 程序** — vault 加上迁移后的 favorites、SOL bank、event log 和 token bank 示例
- **Toast 通知** — 每笔交易都带有浏览器链接
- **错误处理** — 为常见 Solana 和程序错误提供可读性良好的错误信息
- **Codama 生成的客户端** — 使用 `@solana/kit` 进行类型安全的程序交互
- **Tailwind CSS v4** — 支持明暗模式切换

## 技术栈

| 层级           | 技术                             |
| -------------- | -------------------------------- |
| 前端           | Next.js 16, React 19, TypeScript |
| 样式           | Tailwind CSS v4                  |
| Solana 客户端  | `@solana/kit`, wallet-standard   |
| 程序客户端     | Codama 生成, `@solana/kit`       |
| 程序           | Anchor (Rust)                    |

## 项目结构

```
├── app/
│   ├── components/
│   │   ├── cluster-context.tsx  # 集群状态 (React context + localStorage)
│   │   ├── cluster-select.tsx   # 集群切换下拉菜单
│   │   ├── grid-background.tsx  # Solana 品牌装饰网格
│   │   ├── providers.tsx        # 钱包 + 主题 providers
│   │   ├── theme-toggle.tsx     # 明暗模式切换
│   │   ├── vault-card.tsx       # Vault 存取款 UI
│   │   └── wallet-button.tsx    # 钱包连接/断开下拉菜单
│   ├── generated/vault/        # Codama 生成的程序客户端
│   ├── lib/
│   │   ├── wallet/             # Wallet-standard 连接层
│   │   │   ├── types.ts        # 钱包类型
│   │   │   ├── standard.ts     # 钱包发现 + 会话创建
│   │   │   ├── signer.ts       # WalletSession → TransactionSigner
│   │   │   └── context.tsx     # WalletProvider + useWallet() hook
│   │   ├── hooks/
│   │   │   ├── use-balance.ts  # 基于 SWR 的余额获取
│   │   │   └── use-send-transaction.ts  # 交易发送及加载状态
│   │   ├── cluster.ts          # 集群端点 + RPC 工厂
│   │   ├── lamports.ts         # SOL/lamports 转换
│   │   ├── send-transaction.ts # 交易构建 + 签名 + 发送流水线
│   │   ├── errors.ts           # 交易错误解析
│   │   └── explorer.ts         # 浏览器 URL 构建器 + 地址辅助工具
│   └── page.tsx                # 主页面
├── anchor/                     # Anchor 工作区
│   ├── programs/
│   │   ├── anchor_favorites/   # 基于 PDA 的 favorites 示例
│   │   ├── bank/               # SOL 存取款示例
│   │   ├── emit_log/           # Anchor 事件发射示例
│   │   ├── tokenbank/          # SPL token bank 示例
│   │   └── vault/              # Vault 程序 (Rust)
│   └── tests/                  # TypeScript 集成测试
├── scripts/backend/            # 迁移后的后端工具脚本
│   ├── src/                    # Solana RPC、扫描、转账和演示脚本
│   └── tsconfig.json           # 后端脚本的 ts-node 配置
└── codama.json                 # Codama 客户端生成配置
```

## 本地开发

要在本地验证器而非 devnet 上进行测试：

1. **启动本地验证器**

   ```bash
   surfpool start
   ```

2. **本地部署程序**

   ```bash
   solana config set --url localhost
   cd anchor
   anchor build
   anchor deploy
   cd ..
   npm run codama:js   # 使用本地程序 ID 重新生成客户端
   ```

3. **切换到 localnet** — 在应用中使用顶部导航栏的集群选择器。

## 部署您自己的 Vault

附带的 vault 程序已部署到 devnet。要部署您自己的：

### 前置条件

- [Rust](https://rustup.rs/)
- [Solana CLI](https://solana.com/docs/intro/installation)
- [Anchor](https://www.anchor-lang.com/docs/installation)

### 步骤

1. **配置 Solana CLI 为 devnet**

   ```bash
   solana config set --url devnet
   ```

2. **创建钱包（如需要）并获取资金**

   ```bash
   solana-keygen new
   solana airdrop 2
   ```

3. **构建并部署程序**

   ```bash
   cd anchor
   anchor build
   anchor keys sync    # 更新源码中的程序 ID
   anchor build        # 使用新 ID 重新构建
   anchor deploy
   cd ..
   ```

4. **重新生成客户端并重启**
   ```bash
   npm run setup   # 重新构建程序并重新生成客户端
   npm run dev
   ```

## 测试

Anchor 工作区有两个独立的测试入口。

```bash
npm run anchor-build   # 先构建程序
npm run anchor-test    # 仅运行 Rust/Cargo 测试
npm run anchor-tstest  # 运行 TypeScript mocha 集成测试
```

`npm run anchor-test` 委托给 `anchor test --skip-deploy`，`Anchor.toml` 保持 `test = "cargo test"`。这会运行 `anchor/programs/**` 下的 Rust 单元测试和 LiteSVM 测试。

`npm run anchor-tstest` 委托给 `anchor run tstest`，对 `anchor/tests/**/*.ts` 运行 `ts-mocha`。这些 TypeScript 测试期望本地 RPC 在 `http://127.0.0.1:8899` 并已部署迁移后的程序。

## 后端脚本

旧的 `hello_solana/backend` TypeScript 脚本现在位于 `scripts/backend`，并复用此应用的根 `package.json` 和 `node_modules`。

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

默认情况下，脚本连接到 `http://localhost:8899`，需要签名者时从项目根目录读取 `./keypair.json`。可通过环境变量覆盖：

```bash
SOLANA_RPC_ENDPOINT=http://localhost:8899 PAYER_KEYPAIR_PATH=./keypair.json npm run backend:bank-deposit -- 0.1
```

本地签名者文件如 `keypair.json` 和 `keypair_base58.txt` 已被 git 忽略。

## 重新生成客户端

如果您修改了程序，请重新生成 TypeScript 客户端：

```bash
npm run setup   # 或：npm run anchor-build && npm run codama:js
```

这使用 [Codama](https://github.com/codama-idl/codama) 从 Anchor IDL 生成类型安全的客户端。

## 了解更多

- [Solana 文档](https://solana.com/docs) — 核心概念和指南
- [Anchor 文档](https://www.anchor-lang.com/docs/introduction) — 程序开发框架
- [部署程序](https://solana.com/docs/programs/deploying) — 部署指南
- [@solana/kit](https://github.com/anza-xyz/kit) — Solana JavaScript SDK
- [Codama](https://github.com/codama-idl/codama) — 从 IDL 生成客户端

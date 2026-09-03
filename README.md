# CeloAgent: Decentralized AI-Agent Marketplace on Celo

CeloAgent is a decentralized AI-Agent Marketplace built on the **Celo** blockchain. It enables a primary AI Orchestrator Agent to dynamically discover specialized sub-agents, verify their identity and reputation on-chain via the **ERC-8004** standard, request user payment authorization, execute real on-chain Celo Sepolia transactions via a backend-controlled agent wallet, trigger service completion, and record immutable reputation feedback.

---

## 🌟 Core Flow Overview

1. **User Task Input**: User submits a high-level task to the Main AI Orchestrator.
2. **AI Discovery**: Main AI Agent discovers registered specialized sub-agents matching required capabilities.
3. **Identity & Reputation Inspection**: Main AI Agent verifies the sub-agent's ERC-8004 identity card and on-chain trust score.
4. **User Payment Authorization**: Frontend presents an interactive approval modal detailing service fee and Celo gas estimates.
5. **On-Chain Settlement**: Backend agent wallet signs and broadcasts real Celo Sepolia transaction using `viem`.
6. **Task Dispatch & Execution**: Authenticated service request dispatched to sub-agent endpoint upon transaction confirmation.
7. **Reputation Recording**: On-chain rating and feedback recorded on the ERC-8004 Reputation Registry.

---

## 🌐 Supported Celo Networks

| Network | Chain ID | RPC URL | Explorer |
|---|---|---|---|
| **Celo Sepolia Testnet** (Default) | `11142220` | `https://forno.celo-sepolia.celo-testnet.org` | [Blockscout](https://celo-sepolia.blockscout.com) |
| **Celo Mainnet** | `42220` | `https://forno.celo.org` | [Celo Explorer](https://explorer.celo.org) |

> **Note**: Chain ID `11142220` is configured as the active testnet chain for Celo Sepolia.

---

## 🛠️ Phase 2: Celo Blockchain Infrastructure

Phase 2 establishes a type-safe, read-only blockchain layer and backend agent key security foundation under `src/lib/celo/`:

- **Network Config (`config.ts`)**: Centralized definitions for Celo Sepolia (`11142220`) and Celo Mainnet (`42220`).
- **Public Client (`public-client.ts`)**: `viem` `PublicClient` for read-only RPC queries and connectivity checks.
- **Account Management (`account.ts`)**: Server-side agent key validation and address resolution using `AGENT_PRIVATE_KEY`. Protected with `server-only`.
- **Wallet Client (`wallet-client.ts`)**: Server-side `WalletClient` instance for backend agent signing. Protected with `server-only`.
- **Balance Service (`balance.ts`)**: Real-time native CELO balance queries from RPC via `getAgentBalance()`.
- **Transaction Service (`transactions.ts`)**: Transaction detail retrieval (`getTransaction`) and confirmation wait infrastructure (`waitForTransaction`).
- **Celo Health API (`/api/health/celo`)**: Endpoint returning network state, block height, RPC status, and agent wallet configuration.

> [!IMPORTANT]
> **Phase 2 Security & Boundary Policy**:
> - Private keys MUST be configured using `AGENT_PRIVATE_KEY` in environment variables and are **never** exposed to browser bundles.
> - Private-key and wallet signing modules enforce `import 'server-only'`.
> - If `AGENT_PRIVATE_KEY` is omitted, the application seamlessly runs in read-only mode showing `"Agent wallet not configured"`.
> - **Phase 2 DOES NOT execute or broadcast real transactions.**

---

## 🔐 Environment Setup & Agent Wallet Security

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Configure `.env.local`:
```env
CELO_NETWORK=sepolia
CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
AGENT_PRIVATE_KEY=0x... # (Optional: 64-hex char private key for testnet agent wallet)
```

> [!CAUTION]
> Never commit `.env` or `.env.local` to Git repository control. Keep private keys strictly in server environment variables or KMS.

---

## 🚦 Running & Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Test Suite
```bash
npm test
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the live Celo Blockchain Status component.

### 4. Verify Celo Health Endpoint
```bash
curl http://localhost:3000/api/health/celo
```

---

## 📅 Roadmap & Milestones

- [x] **Phase 1**: Foundation, Next.js layout, Tailwind setup, Celo network configuration.
- [x] **Phase 2**: Celo Blockchain Infrastructure, `viem` Clients, Server-Side Agent Wallet Abstraction, Balance & Health API.
- [ ] **Phase 3**: AI Orchestrator Agent & tool calling infrastructure.
- [ ] **Phase 4**: Marketplace UI catalog & User Payment Approval Modal.
- [ ] **Phase 5**: End-to-end task execution & Celo Sepolia transaction integration.
- [ ] **Phase 6**: On-chain ERC-8004 reputation recording & Mainnet readiness.

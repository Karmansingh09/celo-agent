# CeloAgent: Control Plane for Autonomous Agent Spending on Celo

CeloAgent is a **spending dashboard and safety/control layer for AI agents that spend Celo stablecoins on behalf of users**. It gives users visibility, limits, approvals, and revocation over how autonomous AI agents use their funds.

---

## 🌟 Product Vision & Core Positioning

As AI agents perform autonomous tasks (fetching data, purchasing compute, requesting translations, querying financial feeds), they require financial authority. Giving an agent unrestricted access to a wallet creates significant financial risks.

CeloAgent sits between the AI agent and the payment rail:

```text
       USER (Defines Policy & Approves Exceptions)
                        │
                        ▼
                 +--------------+
                 |   AI AGENT   |
                 +------+-------+
                        │ Payment Request
                        v
              +-------------------+
              |     CELOAGENT     |
              |   CONTROL PLANE   |
              +---------+---------+
                        │
         +--------------+--------------+
         │                             │
         v                             v
  Policy / Budget Check           Approval Workflow
         │                             │
         v                             v
  Controlled Payment             User Sign-off
         │
         v
    Celo Settlement (cUSD / CELO)
```

### Core User Controls
- **Spending Budgets**: Total and daily spending allocations per agent.
- **Per-Transaction Limits**: Hard caps on single transaction amounts.
- **Auto-Approval Thresholds**: Low-value transactions execute automatically; larger transactions trigger user sign-off.
- **Authorized Recipients**: Explicit allowlists for approved recipient addresses and services.
- **Expiration Controls**: Timed policy validity windows.
- **Auditable Activity Log**: Human-readable reasons for every `ALLOW`, `REQUIRE_USER_APPROVAL`, or `DENY` decision.

---

## 🎯 Primary Focus & Ecosystem Alignment

- **Primary Asset Focus**: Celo stablecoins (starting with **cUSD**).
- **Target Ecosystem**: Celo Sepolia testnet initially, designed with MiniPay-oriented user flows in mind.
- **Underlying Settlement Engine**: The existing `viem`-based Celo payment infrastructure (`src/lib/celo/`) serves as the execution rail under the control plane.

---

## 🚫 What CeloAgent Is NOT

To maintain focus and avoid scope creep, CeloAgent is **NOT** currently:
- A generic AI chatbot or LLM interface.
- A general-purpose agent discovery or marketplace protocol.
- A replacement for identity/reputation standards (such as ERC-8004).
- A multi-chain wallet or cross-chain bridge.
- A DAO, NFT, or governance token project.

---

## 🛡️ Security Model & Interim Policy Enforcement

> [!IMPORTANT]
> **Interim Policy Engine Notice**:
> In the current MVP, spending policy evaluation is **server-enforced**. 
> - The MVP policy engine is **not** cryptographically enforced on-chain.
> - The MVP is **not** non-custodial or resistant to a fully compromised application backend.
> - Private keys are protected server-side via `import 'server-only'` boundaries and environment variables (`AGENT_PRIVATE_KEY`), but full backend compromise could bypass server-level policies.
> 
> Future roadmap phases (Phase 7) include research into smart accounts, session keys, and delegated authorization (ERC-7715 patterns) to push policy enforcement directly to the Celo smart contract layer.

---

## 🌐 Supported Celo Networks

| Network | Chain ID | RPC URL | Explorer |
|---|---|---|---|
| **Celo Sepolia Testnet** (Default) | `11142220` | `https://forno.celo-sepolia.celo-testnet.org` | [Blockscout](https://celo-sepolia.blockscout.com) |
| **Celo Mainnet** | `42220` | `https://forno.celo.org` | [Celo Explorer](https://explorer.celo.org) |

---

## 🔐 Environment Setup & Security

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Configure `.env.local`:
```env
CELO_NETWORK=sepolia
CELO_SEPOLIA_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
CELO_MAX_PAYMENT=0.01
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
Open [http://localhost:3000](http://localhost:3000) to view the application.

### 4. Verify Celo Health & Payment Endpoints
```bash
# Health check:
curl http://localhost:3000/api/health/celo

# Send payment (requires configured AGENT_PRIVATE_KEY with testnet CELO):
curl -X POST http://localhost:3000/api/payments/send \
  -H "Content-Type: application/json" \
  -d '{"to": "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A", "amountCelo": "0.005", "purpose": "API test"}'
```

---

## 📅 Roadmap & Project Phases

- [x] **Phase 1**: Foundation, Next.js layout, Tailwind setup, Celo network configuration.
- [x] **Phase 2**: Celo Blockchain Infrastructure, `viem` Clients, Server-Side Agent Wallet Abstraction, Balance & Health API.
- [x] **Phase 3**: Secure Celo Payment Workflow (`executePayment`, `CELO_MAX_PAYMENT`, `POST /api/payments/send`, `PaymentDemoCard`).
- [x] **Phase 3.5 & 4**: Master Specification, Product Repositioning & Scope Lock (`docs/CELOAGENT-MASTER-SPEC.md`).
- [ ] **Phase 5**: Spending Policy v1 Engine (`maxPerTransaction`, `maxPerDay`, `allowedRecipients`, `autoApproveThreshold`, `validUntil`).
- [ ] **Phase 6**: Concurrency Correctness & Atomic Budget Accounting.
- [ ] **Phase 7**: On-Chain Enforcement Research (Smart Accounts / Session Keys).
- [ ] **Phase 8**: Control Plane Dashboard UI.
- [ ] **Phase 9**: Demo Service Agents (`DataAgent`, `TranslationAgent`, `ComputeAgent`).
- [ ] **Phase 10**: Security Hardening & Complete Threat Audit.

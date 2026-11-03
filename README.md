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

## 🛡️ Security Model & Policy Enforcement

Policy evaluation and reservation accounting are server-enforced. The controlled
payment path resolves a signer by `agentId` and the persisted execution wallet
address; it does not use a shared global signer. The default signer provider fails
closed until an operator wires an approved HSM/KMS or smart-account integration.

The application is not resistant to a fully compromised backend. A future smart
account/session-key integration can move additional policy guarantees on-chain.

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
AGENT_SIGNER_PROVIDER=external-kms
AGENT_SIGNER_ENDPOINT=
DATABASE_URL=postgresql://user:password@localhost:5432/celoagent
DATABASE_SSL=require
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_POOL_MAX=10
```

> [!CAUTION]
> Never commit `.env` or `.env.local` to Git repository control. Private keys must remain inside the external signer boundary; CeloAgent source and database records store signer references and wallet addresses, never private key material.

### PostgreSQL setup

PostgreSQL is the durable production store. Create an empty database, set
`DATABASE_URL`, then apply the schema:

```bash
npm run db:migrate
```

When `DATABASE_URL` is set, agents, policy versions, budgets, reservations,
approvals, authentication nonces/sessions, and audit events use PostgreSQL.
Production startup fails closed if `DATABASE_URL` is missing. Without it,
development and unit tests use the explicit in-memory adapters.

The budget store acquires a row lock for each agent/day window and performs
reservation, commit, and release changes in one SQL transaction. Reservation
idempotency is database-scoped, so separate application instances cannot
overspend the same budget through a process-local race.

### Signer integration boundary

At server startup, configure an `AgentSignerProvider` through
`configureAgentSignerProvider`. The provider must resolve an agent-specific
signer from an HSM/KMS, vault, or approved smart-account service and return a
viem account/wallet client without exposing key material to frontend code or
storing it in PostgreSQL. Each resolution is checked against the agent ID and
persisted `walletAddress`. The repository includes a fail-closed default and a
static provider for controlled integration tests.

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

### 4. Verify Celo Health & Agent Payment Endpoints
```bash
# Health check:
curl http://localhost:3000/api/health/celo

# Note: The legacy endpoint POST /api/payments/send is deprecated (returns HTTP 410 Gone).
# Controlled agent payments are authorized via authenticated SIWE sessions:
# POST /api/agents/{agentId}/payments
```

---

## 🚧 Development Status

CeloAgent is currently in active MVP development:
- **Architecture & Scaffolding**: Master specifications, SIWE-based control plane routing, and Celo health monitoring are established.
- **Payment Execution**: The controlled rail supports actual cUSD ERC-20 execution on Celo Sepolia after an approved signer provider is configured. Settlement is only committed after independent receipt and `Transfer` event verification.
- **Durable State**: PostgreSQL persistence is available and required for production startup. Migration `db/migrations/001_initial.sql` defines the durable domain, authentication, execution, and append-only audit tables.
- **Recovery**: Uncertain reservations remain held for reconciliation; an automated reconciliation worker is a subsequent milestone.

---

## 📅 Roadmap & Project Phases

- [x] **Phase 1**: Foundation, Next.js layout, Tailwind setup, Celo network configuration.
- [x] **Phase 2**: Celo Blockchain Infrastructure, `viem` Clients, Server-Side Agent Wallet Abstraction, Balance & Health API.
- [x] **Phase 3**: Celo Payment Rail (`executePayment`, `CELO_MAX_PAYMENT`, `PaymentDemoCard`).
- [x] **Phase 3.5 & 4**: Master Specification, Product Repositioning & Scope Lock (`docs/CELOAGENT-MASTER-SPEC.md`).
- [ ] **Phase 5**: Spending Policy v1 Engine (`maxPerTransaction`, `maxPerDay`, `allowedRecipients`, `autoApproveThreshold`, `validUntil`).
- [ ] **Phase 6**: Concurrency Correctness & Atomic Budget Accounting.
- [ ] **Phase 7**: On-Chain Enforcement Research (Smart Accounts / Session Keys).
- [ ] **Phase 8**: Control Plane Dashboard UI.
- [ ] **Phase 9**: Demo Service Agents (`DataAgent`, `TranslationAgent`, `ComputeAgent`).
- [ ] **Phase 10**: Security Hardening & Complete Threat Audit.

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

## 🛠️ Stack & Architecture

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Blockchain Interface**: `viem` (Type-safe EVM interactions with custom Celo chain configs)
- **AI Engine**: LLM Orchestrator with dynamic tool/function calling
- **Wallet Architecture**: Backend-controlled agent wallet with spending policy limits
- **Trust Standard**: ERC-8004 Agent Identity & Reputation standard

---

## 🚦 Getting Started

### 1. Prerequisites
- Node.js `^20.18.0` or higher
- npm `^10.8.0` or higher

### 2. Environment Setup
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 📅 Roadmap & Milestones

- [x] **Phase 1**: Foundation, Next.js layout, Tailwind setup, Celo network configuration (`viem`).
- [ ] **Phase 2**: Backend Agent Wallet & Database schema setup.
- [ ] **Phase 3**: AI Orchestrator Agent & tool calling infrastructure.
- [ ] **Phase 4**: Marketplace UI catalog & User Payment Approval Modal.
- [ ] **Phase 5**: End-to-end task execution & Celo Sepolia transaction integration.
- [ ] **Phase 6**: On-chain ERC-8004 reputation recording & Mainnet readiness.

# CeloAgent — Product & Engineering Master Specification

**Document status:** Living project specification  
**Purpose:** Source of truth for product direction, architecture, scope, implementation constraints, security model, and demo behavior.  
**Initial implementation network:** Celo Sepolia  
**Primary implementation stack:** Next.js 14, TypeScript, Tailwind CSS, viem  
**Initial asset focus:** cUSD / Celo stablecoin payment flows  
**Primary product idea:** A control plane for autonomous AI-agent spending on Celo.

---

# 1. Executive Summary

CeloAgent is a **spending dashboard and safety/control layer for AI agents that spend Celo stablecoins on behalf of users**.

The project started as a broader AI-agent marketplace concept:

> AI agents discover other agents, hire them, and pay them using Celo.

That direction is intentionally no longer the core product. Agent marketplaces, agent-to-agent commerce, identity, reputation, and payment rails are already being developed by multiple projects and standards.

The stronger direction is:

> **Make autonomous agent spending understandable, controllable, auditable, and safe for Celo users.**

An AI agent should be able to operate autonomously, but it should not receive unrestricted financial authority.

CeloAgent therefore sits between the AI agent and the payment rail:

```text
                         USER
                          |
                          v
                   +--------------+
                   |   AI AGENT   |
                   +------+-------+
                          |
                          | payment request
                          v
                +----------------------+
                |      CELOAGENT       |
                |   CONTROL PLANE      |
                +----------+-----------+
                           |
                 +---------+---------+
                 |                   |
                 v                   v
          Policy / Budget      Approval UI
             checks
                 |
                 v
          Controlled payment
                 |
                 v
                Celo
                 |
                 v
          Service / Provider
```

The product should give the user:

- visibility into agent spending
- spending limits
- daily budgets
- authorized recipients
- approval thresholds
- expiration
- blocked transaction explanations
- transaction history
- remaining budget
- pending approvals
- auditable reasons for every decision

The project should prioritize **real engineering and transparent limitations** over feature count.

---

# 2. Product Positioning

## Primary positioning

> **CeloAgent is a control plane for autonomous agent spending on Celo — giving users visibility, limits, approvals, and revocation over how AI agents use their stablecoin budgets.**

Initial ecosystem focus:

> **Celo stablecoins and MiniPay-oriented user flows.**

This does NOT mean the first version must run inside MiniPay.

The initial product should be built and tested independently on Celo Sepolia. MiniPay compatibility/integration should be researched and added only when technically justified.

---

# 3. The Problem

AI agents are increasingly capable of taking actions on behalf of users.

Many useful agent actions eventually require payment:

- APIs
- datasets
- compute
- translation
- search
- storage
- financial data
- other agent services

The difficult question is:

> How much financial authority should an autonomous AI agent receive?

Giving an agent unrestricted access to a user's wallet creates risks:

- excessive spending
- incorrect AI decisions
- compromised tools
- malicious service providers
- prompt injection
- compromised backend
- unauthorized recipients
- repeated transactions
- bugs
- race conditions
- accidental payments

CeloAgent addresses the control problem.

The user should be able to say:

```text
My agent can spend:

Maximum per transaction: $0.10
Daily budget:             $0.50
Auto approval:            <= $0.05
Authorized recipients:    DataAgent, ComputeAgent
Policy expiry:            24 hours
```

The agent is autonomous **inside those boundaries**.

---

# 4. Product Philosophy

## 4.1 Autonomous does not mean unrestricted

The goal is not to remove human control.

The goal is:

> **Constrained autonomy.**

The AI should perform routine low-value actions without asking the user every time, while larger, unexpected, or unauthorized actions require approval or are rejected.

---

## 4.2 Policy is a safety boundary, not an AI feature

The AI should never be able to override the financial policy.

If the agent requests:

```text
$0.03
```

and the policy allows it:

```text
ALLOW
```

If the agent requests:

```text
$0.08
```

when automatic approval is limited to $0.05:

```text
REQUIRE_USER_APPROVAL
```

If the agent requests:

```text
$1.20
```

when its daily limit is $1:

```text
DENY
```

The agent's reasoning does not override these results.

---

## 4.3 Transparency over marketing

CeloAgent must never claim that its MVP provides stronger security than it actually does.

The initial policy engine is server-enforced.

Therefore:

> If the backend is fully compromised, the MVP policy engine cannot be described as cryptographically enforced financial security.

The project must explicitly document this limitation.

Future on-chain/session-key/smart-account research exists specifically to address this trust boundary.

---

# 5. What CeloAgent Is NOT

The project should explicitly avoid scope creep.

CeloAgent is NOT initially:

- a generic AI chatbot
- a new blockchain
- a token project
- a DAO
- an NFT project
- a replacement for ERC-8004
- a replacement for ERC-7715
- a general-purpose agent marketplace
- a full agent discovery protocol
- a new reputation protocol
- a full agent-to-agent commerce protocol
- a universal multi-chain wallet
- a fake transaction simulator presented as real infrastructure

These may be researched or referenced, but they are not the MVP.

---

# 6. Why the Marketplace Is No Longer the Core

The original concept was:

```text
Agent A
   |
   | discovers
   v
Agent B
   |
   | hires
   v
Agent B provides service
   |
   | payment
   v
Celo
```

This is useful, but not sufficiently differentiated.

Existing ecosystems already address parts of:

- agent discovery
- agent hiring
- agent-to-agent commerce
- identity
- reputation
- payments
- escrow

Therefore CeloAgent should not spend most of its engineering effort recreating those systems.

Instead:

```text
Agent discovers a service
        |
        v
CeloAgent checks spending policy
        |
        +---- DENY
        |
        +---- USER APPROVAL
        |
        +---- ALLOW
        |
        v
Celo payment
```

The marketplace becomes a **small demo environment** for the spending-control product.

---

# 7. Core User Story

A user creates a Research Agent.

They give it a controlled budget:

```text
Total demo budget: $1.00
Daily limit:       $0.50
Max transaction:   $0.10
Auto approve:      $0.05
Expiry:            24 hours
```

The agent performs research.

It requests:

```text
DataAgent
Cost: $0.03
```

CeloAgent:

```text
ALLOW
```

The payment executes.

Next:

```text
ComputeAgent
Cost: $0.08
```

CeloAgent:

```text
REQUIRE_USER_APPROVAL
```

The user sees the request.

Next:

```text
UnknownAgent
Cost: $0.03
```

CeloAgent:

```text
DENY
Reason: recipient is not authorized
```

Finally:

```text
DataAgent
Cost: $0.20
```

CeloAgent:

```text
DENY
Reason: transaction exceeds maximum transaction limit
```

This is the core demonstration.

---

# 8. Architecture Overview

The architecture should remain modular.

```text
+--------------------------------------------------------------+
|                         CeloAgent                             |
+--------------------------------------------------------------+
|                                                              |
|  UI / Control Plane                                          |
|  +--------------------------------------------------------+  |
|  | Dashboard | Policy | Approvals | Activity | Agent View |  |
|  +--------------------------+-----------------------------+  |
|                             |                               |
|                             v                               |
|  Application/API Layer                                      |
|  +--------------------------------------------------------+  |
|  | Payment API | Policy API | Activity API | Approval API  |  |
|  +--------------------------+-----------------------------+  |
|                             |                               |
|                             v                               |
|  Domain / Control Layer                                     |
|  +--------------------------------------------------------+  |
|  | Spending Policy | Decision Engine | Budget Accounting  |  |
|  | Reservation     | Approval Logic | Audit Events        |  |
|  +--------------------------+-----------------------------+  |
|                             |                               |
|                             v                               |
|  Celo Infrastructure                                        |
|  +--------------------------------------------------------+  |
|  | Public Client | Wallet Client | Balance | Transactions  |  |
|  +--------------------------+-----------------------------+  |
|                             |                               |
|                             v                               |
|                        Celo Sepolia                          |
|                                                              |
+--------------------------------------------------------------+
```

---

# 9. Existing Celo Foundation

The existing project already has:

- Next.js 14
- TypeScript
- Tailwind
- viem
- Celo Sepolia
- server-side wallet handling
- public client
- wallet client
- balance checks
- transaction utilities
- payment service
- payment API
- payment UI
- environment configuration
- server-only boundaries
- tests

This foundation should be preserved.

The existing payment system is not throwaway work.

It becomes the payment rail under the future control plane.

---

# 10. Existing Payment Architecture

Current conceptual flow:

```text
User enters payment
        |
        v
Client validation
        |
        v
Review screen
        |
        v
Explicit confirmation
        |
        v
POST /api/payments/send
        |
        v
Server validation
        |
        v
Spending cap
        |
        v
Balance / gas check
        |
        v
Celo transaction
        |
        v
Wait for confirmation
        |
        v
Transaction hash
        |
        v
Explorer
```

This should evolve into:

```text
Agent payment request
        |
        v
Policy evaluation
        |
        +------ DENY ----------------+
        |                            |
        +------ APPROVAL             |
        |                            |
        +------ ALLOW                |
                                     |
                                     v
                              Budget reservation
                                     |
                                     v
                              Payment execution
                                     |
                                     v
                              Transaction result
                                     |
                                     v
                              Activity record
```

---

# 11. Phase 5 Policy Model

The first policy version should remain intentionally small.

Recommended fields:

```text
AgentSpendingPolicy

agentId
maxPerTransaction
maxPerDay
allowedRecipients[]
autoApproveThreshold
validUntil
```

Do not add every possible policy feature immediately.

Avoid initially:

- categories
- minimum reputation
- frequency limits
- complex service scoring
- cross-chain policies
- complex token routing

---

# 12. Policy Decisions

The policy engine should return exactly three major outcomes:

```text
ALLOW
REQUIRE_USER_APPROVAL
DENY
```

Example:

```json
{
  "decision": "ALLOW",
  "reason": "Within spending policy",
  "remainingDailyBudget": "0.47"
}
```

Approval:

```json
{
  "decision": "REQUIRE_USER_APPROVAL",
  "reason": "Amount exceeds autonomous approval threshold"
}
```

Denied:

```json
{
  "decision": "DENY",
  "reason": "Recipient is not authorized"
}
```

Every decision should have a human-readable reason.

This is important for the dashboard.

---

# 13. Policy Evaluation Order

The exact implementation can evolve, but the conceptual order should be:

```text
Request received
       |
       v
Is policy active?
       |
       +-- NO --> DENY
       |
       v
Is recipient authorized?
       |
       +-- NO --> DENY
       |
       v
Does amount exceed per-transaction limit?
       |
       +-- YES --> DENY
       |
       v
Does daily budget remain sufficient?
       |
       +-- NO --> DENY
       |
       v
Is amount above auto-approval threshold?
       |
       +-- YES --> REQUIRE_USER_APPROVAL
       |
       v
ALLOW
```

A future implementation may reserve budget before final approval/execution depending on the transaction model.

---

# 14. Concurrency and Budget Reservation

This is a major engineering requirement.

Naive implementation:

```text
Remaining daily budget = $0.10

Request A = $0.08
Request B = $0.08

A checks:
$0.08 <= $0.10
PASS

B checks:
$0.08 <= $0.10
PASS
```

The result would be:

```text
$0.16 spent
```

even though the policy only allowed:

```text
$0.10
```

This is a race condition.

The system therefore needs a reservation/atomic accounting mechanism.

Conceptually:

```text
Request
   |
   v
Acquire budget reservation atomically
   |
   +---- insufficient budget ---> DENY
   |
   v
Reserve amount
   |
   v
Policy decision
   |
   v
Execute payment
   |
   +---- success ---> commit spending
   |
   +---- failure ---> release reservation
```

For the MVP, a database-backed atomic operation or equivalent reservation/locking strategy is acceptable.

The implementation must include a test where two concurrent requests compete for the same remaining budget and one is rejected.

This test is an important technical demonstration.

---

# 15. Budget Accounting

The system should distinguish conceptually between:

```text
AVAILABLE
RESERVED
SPENT
```

Example:

```text
Daily limit:     $1.00
Spent:           $0.40
Reserved:        $0.20
Available:       $0.40
```

Formula:

```text
available = dailyLimit - spent - reserved
```

A reservation should not become permanent spending until the payment succeeds.

If payment fails:

```text
reservation released
```

If payment succeeds:

```text
reservation converted to spent
```

---

# 16. Approval Model

Approval should be explicit.

Example:

```text
Amount: $0.08
Auto-approve threshold: $0.05

Decision:
REQUIRE_USER_APPROVAL
```

Dashboard:

```text
+------------------------------------+
| Payment Approval                   |
|                                    |
| Agent: ResearchAgent               |
| Service: ComputeAgent              |
| Amount: $0.08                      |
|                                    |
| Reason: Above automatic threshold  |
|                                    |
| [ Reject ]          [ Approve ]    |
+------------------------------------+
```

Approval must not bypass other policy rules.

If a request exceeds a hard maximum or is for an unauthorized recipient, user approval should not turn it into an allowed payment.

---

# 17. Spending Dashboard

The dashboard is the highest-leverage product surface.

It should communicate financial state immediately.

Example:

```text
RESEARCH AGENT

Available Budget
$0.83 / $1.00

Today's Spending
$0.17 / $0.50

Pending Approvals
1

Blocked Transactions
2

Policy
ACTIVE
```

Policy card:

```text
SPENDING POLICY

Maximum transaction       $0.10
Daily limit               $0.50
Auto approval             $0.05
Authorized recipients     3
Policy expires            24 hours
```

---

# 18. Activity Feed

Every payment attempt should produce an understandable activity record.

Example:

```text
✓ DataAgent
  $0.03
  Automatically approved
  2 minutes ago

⚠ ComputeAgent
  $0.08
  User approval required
  5 minutes ago

✕ UnknownAgent
  $0.03
  Recipient not authorized
  7 minutes ago

✕ DataAgent
  $0.20
  Transaction limit exceeded
  10 minutes ago
```

The user should not have to understand blockchain internals to understand why a payment was blocked.

Transaction hashes and explorer links can be available as secondary details.

---

# 19. Control Plane UX

The control plane should eventually contain:

```text
Dashboard
Agents
Spending Policy
Approvals
Activity
Transactions
Settings
```

Do not build all pages at once.

The first useful dashboard should focus on:

1. budget
2. policy
3. pending approvals
4. recent activity
5. blocked transactions
6. transaction details

---

# 20. Mock Service Agents

The marketplace should be intentionally small.

Use 2–3 demo services:

```text
DataAgent
TranslationAgent
ComputeAgent
```

Each can have:

- name
- service description
- fixed demo price
- recipient address
- enabled/disabled status

The purpose is to demonstrate the control plane.

It is NOT intended to become a new agent discovery protocol.

---

# 21. Example Demo Agents

## DataAgent

Service:

```text
Historical market dataset
```

Price:

```text
$0.03
```

Expected:

```text
ALLOW
```

---

## TranslationAgent

Service:

```text
Translate 1,000 words
```

Price:

```text
$0.04
```

Expected:

```text
ALLOW
```

---

## ComputeAgent

Service:

```text
Run compute workload
```

Price:

```text
$0.08
```

Expected:

```text
REQUIRE_USER_APPROVAL
```

---

## UnauthorizedAgent

Price:

```text
$0.03
```

Expected:

```text
DENY
```

Reason:

```text
Recipient is not authorized.
```

---

# 22. Demo Script

The final MVP should be able to demonstrate:

### Test 1 — Automatic payment

```text
Request: $0.03
Authorized recipient
Within limits

→ ALLOW
→ Payment
→ Celo transaction
```

### Test 2 — Approval

```text
Request: $0.08
Within hard limits
Above auto-approval threshold

→ REQUIRE_USER_APPROVAL
→ User approves
→ Payment
```

### Test 3 — Unauthorized recipient

```text
Request: $0.03
Unknown recipient

→ DENY
```

### Test 4 — Per-transaction limit

```text
Request: $0.20
Max transaction: $0.10

→ DENY
```

### Test 5 — Daily limit

```text
Remaining daily budget: $0.05
Request: $0.08

→ DENY
```

### Test 6 — Concurrency

```text
Remaining: $0.10

Request A: $0.08
Request B: $0.08

→ A succeeds
→ B rejected

Total <= $0.10
```

This is the core technical demo.

---

# 23. Celo Architecture

Initial network:

```text
Celo Sepolia
```

The existing project uses:

```text
Chain ID:
11142220

RPC:
https://forno.celo-sepolia.celo-testnet.org

Explorer:
https://celo-sepolia.blockscout.com
```

Mainnet should NOT be used until the application is security-reviewed and the demo flow is stable.

---

# 24. Stablecoin Strategy

The initial product should focus on **one stablecoin** rather than supporting every Celo asset immediately.

Preferred first target:

```text
cUSD
```

The internal architecture should nevertheless avoid hard-coding assumptions that make future tokens impossible.

Conceptually:

```text
Token
  |
  +-- address
  +-- symbol
  +-- decimals
  +-- network
```

The MVP can expose only cUSD in the UI.

Future assets can be added without redesigning the entire policy system.

---

# 25. MiniPay Strategy

MiniPay is strategically relevant because Celo has a major consumer distribution channel through it.

However:

**Do not make the MVP dependent on MiniPay integration.**

First build:

```text
CeloAgent
    |
    v
Celo Sepolia
```

Then research:

```text
MiniPay
    |
    v
CeloAgent control plane
```

The project should never claim direct MiniPay support until the integration is actually implemented and tested.

---

# 26. On-Chain vs Off-Chain Responsibilities

## MVP off-chain

Appropriate for:

- policy evaluation
- dashboard
- activity feed
- approval workflow
- service metadata
- budget calculations
- decision explanations
- demo agent configuration

## Blockchain

Appropriate for:

- payment settlement
- transaction history
- eventually enforceable permissions
- eventually smart-account controls
- potentially escrow

The architecture should avoid putting every AI decision on-chain.

---

# 27. On-Chain Enforcement Research

The MVP policy engine is server-enforced.

That means:

```text
Agent
  |
  v
Backend
  |
  v
Policy
  |
  v
Wallet
```

A compromised backend could potentially bypass the policy.

Therefore a future architecture should investigate:

- smart accounts
- account abstraction
- session keys
- delegated authorization
- scoped permissions
- expiring permissions
- ERC-7715-compatible patterns where appropriate
- Celo-compatible equivalents

The objective is to move important financial boundaries closer to the wallet/contract layer.

Do not assume a particular standard is supported by MiniPay or Celo without verification.

---

# 28. Phase 7 Research Spike

Phase 7 should be a time-boxed research/prototype phase.

Questions:

1. What account-abstraction infrastructure is currently available on Celo?
2. What permission/delegation mechanisms are supported?
3. Can spending limits be enforced outside the backend?
4. Can permissions expire?
5. Can recipients/contracts be scoped?
6. Can an agent operate without receiving unrestricted private-key access?
7. What happens if the CeloAgent backend is compromised?
8. What is the simplest credible on-chain enforcement mechanism?

Potential prototype:

```text
One smart-contract-enforced
per-transaction spending cap
+
expiry
```

Do not attempt a complete permission framework.

---

# 29. Security Threat Model

The system should explicitly consider:

## Prompt injection

The AI is manipulated into requesting an unwanted payment.

Mitigation:

Policy remains independent of AI reasoning.

---

## Malicious service

A service attempts to charge more than expected.

Mitigation:

Recipient and amount policy checks.

---

## Unauthorized recipient

Agent sends funds to an unapproved address.

Mitigation:

Recipient allowlist.

---

## Excessive spending

Agent repeatedly requests payments.

Mitigation:

Per-transaction and daily limits.

---

## Backend compromise

An attacker controls the application server.

MVP limitation:

Server-enforced policies can potentially be bypassed by a fully compromised backend.

Future mitigation:

On-chain permission enforcement / smart accounts / delegated authorization.

---

## Expired policy

An old permission remains active.

Mitigation:

Check `validUntil` on every request.

---

## Race condition

Concurrent requests exceed the budget.

Mitigation:

Atomic reservation/accounting.

---

## Double submission

The same request is accidentally submitted twice.

Mitigation:

Idempotency/request identifiers and server-side transaction state.

---

## Private key compromise

The agent wallet private key is stolen.

MVP limitation:

A traditional backend-controlled key is a major trust boundary.

Future direction:

Scoped wallet permissions / smart accounts / session keys.

---

# 30. Secret Management

Never expose:

```text
AGENT_PRIVATE_KEY
```

to:

- browser code
- Git
- logs
- screenshots
- Antigravity output
- public documentation
- GitHub

Environment variables belong in local secret files such as:

```text
.env.local
```

and must remain ignored by Git.

The browser should never receive the private key.

---

# 31. Existing Security Boundary

Current code already uses server-only boundaries around sensitive Celo wallet/payment functionality.

Preserve that architecture.

Sensitive modules should remain inaccessible to client bundles.

The client should call APIs.

The server performs:

- validation
- policy checks
- wallet operations
- blockchain operations

---

# 32. Future Agent Wallet Model

Long-term architecture should aim toward:

```text
User Wallet
     |
     | controlled funding
     v
Agent-controlled account
     |
     | scoped permissions
     v
AI Agent
```

The user should not simply give an AI agent the same unrestricted private key used for personal funds.

Potential permission dimensions:

```text
Amount
Recipient
Contract
Token
Time
Expiry
Frequency
```

Only implement what is justified.

---

# 33. Identity and Reputation

ERC-8004 should be treated as a future integration, not an MVP requirement.

Possible future flow:

```text
Discover service
      |
      v
Verify agent identity
      |
      v
Check reputation
      |
      v
Check spending policy
      |
      v
Authorize payment
```

But CeloAgent should not build a competing identity/reputation protocol.

---

# 34. What Is Deferred

Explicitly deferred:

- ERC-8004 integration
- real agent discovery
- real open marketplace
- cross-agent commerce protocol
- multi-token support
- policy-aware routing
- reputation scoring
- DAO
- NFT
- token
- governance
- cross-chain support
- complex service categories
- complex financial strategies

These can be reconsidered later only if they clearly strengthen the core product.

---

# 35. Development Roadmap

## PHASE 1 — Foundation

Status:

```text
DONE
```

---

## PHASE 2 — Celo Blockchain Integration

Status:

```text
DONE
```

---

## PHASE 3 — Secure Payment Workflow

Status:

```text
DONE
```

Existing functionality includes:

- validation
- spending cap
- balance checks
- server-side wallet
- payment API
- confirmation
- transaction hash

---

## PHASE 3.5 — Competitive + Architecture Analysis

Status:

```text
DONE
```

Outcome:

Move away from:

```text
generic agent marketplace
```

toward:

```text
agent spending control plane
```

---

## PHASE 4 — Product / Scope Lock

Deliverable:

One product specification and README update.

Define:

- product positioning
- target user
- cUSD-first approach
- MVP scope
- deferred features
- security limitations

No unnecessary code.

---

## PHASE 5 — Spending Policy v1

Implement:

```text
maxPerTransaction
maxPerDay
allowedRecipients[]
autoApproveThreshold
validUntil
```

Implement decision states:

```text
ALLOW
REQUIRE_USER_APPROVAL
DENY
```

Tests for:

- allow
- approval
- transaction-limit denial
- daily-limit denial
- unauthorized-recipient denial
- expired-policy denial

---

## PHASE 6 — Concurrency Correctness

Implement:

- budget reservation
- atomic accounting
- release on failure
- commit on success

Test concurrent requests.

Required result:

```text
Two requests cannot collectively exceed the budget.
```

---

## PHASE 7 — On-Chain Enforcement Research

Research:

- Celo account abstraction
- smart accounts
- session keys
- delegated authorization
- relevant permission standards

Deliverable:

Decision document.

Optional:

Minimal prototype.

---

## PHASE 8 — Control Plane Dashboard

Build:

- budget overview
- policy card
- approvals
- activity
- blocked transactions
- transaction details

This is the main product surface.

---

## PHASE 9 — Demo Service Agents

Build simple demo providers:

```text
DataAgent
TranslationAgent
ComputeAgent
```

Use them to trigger real policy decisions.

Do not build a real marketplace protocol.

---

## PHASE 10 — Security Hardening

Complete:

- threat model
- idempotency
- error handling
- transaction states
- logging
- secret audit
- policy audit
- concurrency tests
- documentation

---

## PHASE 11 — Celo / MiniPay Integration Research

Only after the core product works.

Determine:

- MiniPay integration possibilities
- supported wallet capabilities
- stablecoin UX
- account/permission constraints
- realistic user flow

Build only if justified.

---

# 36. Suggested Repository Documentation

The repository should eventually contain:

```text
docs/
├── PRODUCT.md
├── ARCHITECTURE.md
├── SECURITY.md
├── THREAT-MODEL.md
├── SPENDING-POLICY.md
├── CONCURRENCY.md
├── ONCHAIN-PERMISSIONS.md
├── DEMO.md
└── ROADMAP.md
```

This master specification can serve as the source document from which those focused documents are derived.

---

# 37. Engineering Rules for AI Coding Agents

Any AI coding agent working on this repository must follow these rules.

## Rule 1 — Read the specification first

Before making architectural changes, read:

```text
docs/CELOAGENT-MASTER-SPEC.md
```

---

## Rule 2 — Do not invent infrastructure

Do not assume:

- an API exists
- a Celo feature exists
- MiniPay supports something
- a standard is deployed
- an address is correct
- a contract exists

Verify first.

---

## Rule 3 — Do not overbuild

Prefer:

```text
small + real + tested
```

over:

```text
large + simulated + undocumented
```

---

## Rule 4 — No fake security

If something is server-enforced, call it server-enforced.

Do not call it:

```text
trustless
cryptographically enforced
non-custodial
secure against backend compromise
```

unless the architecture actually provides those properties.

---

## Rule 5 — No fake blockchain activity

Real blockchain transactions should only occur when they represent an actual application action.

Do not generate random transactions to inflate activity.

---

## Rule 6 — Preserve modularity

Keep these concerns separated:

```text
UI
API
Policy
Budget
Payment
Blockchain
Storage
```

---

## Rule 7 — Tests are required

New security-sensitive functionality should have tests.

Especially:

- policy decisions
- limits
- expiry
- recipient restrictions
- approvals
- budget reservations
- concurrency
- payment failures

---

# 38. Quality Bar

The project should be judged by:

## Technical quality

Does the system actually work?

## Security reasoning

Does it correctly identify what it protects and what it does not?

## Celo relevance

Does Celo materially improve the product?

## User experience

Can a normal user understand why money was or was not spent?

## Engineering depth

Does the project handle real problems such as concurrency and authorization?

## Demonstrability

Can the complete flow be shown live?

## Honesty

Are limitations documented?

---

# 39. What Would Make the Project Weak

The project becomes weak if it turns into:

```text
AI chatbot
+
pretty dashboard
+
fake agent cards
+
random blockchain transaction
+
buzzwords
```

It also becomes weak if:

- policy rules are only UI decorations
- blocked payments can still execute
- concurrency is ignored
- backend trust assumptions are hidden
- MiniPay is claimed without actual integration
- standards are mentioned but not understood
- unnecessary blockchain features are added

---

# 40. What Would Make the Project Strong

The project becomes strong if the demo can prove:

```text
Agent requests payment
        |
        v
Policy evaluates request
        |
        +---- ALLOW
        |
        +---- REQUIRE APPROVAL
        |
        +---- DENY
        |
        v
Budget is reserved safely
        |
        v
Real Celo payment
        |
        v
Transaction recorded
        |
        v
Dashboard explains result
```

And especially:

```text
Concurrent requests
        |
        v
Budget reservation
        |
        v
No overspending
```

That is a concrete engineering story.

---

# 41. Long-Term Vision

If the MVP proves useful, CeloAgent can evolve into a broader control plane.

Potential future architecture:

```text
                         CeloAgent
                             |
        +--------------------+--------------------+
        |                    |                    |
        v                    v                    v
   Agent Identity       Spending Control      Reputation
        |                    |                    |
        +--------------------+--------------------+
                             |
                             v
                      Agent Commerce
                             |
                             v
                            Celo
```

The important sequence is:

```text
First:
Control

Then:
Commerce

Then:
Identity / Reputation

Then:
Broader Agent Economy
```

Not the other way around.

---

# 42. Final Product Definition

The current product definition is:

> **CeloAgent is a control plane for autonomous agent spending on Celo. It gives users visibility and control over how AI agents use stablecoin budgets through spending limits, recipient restrictions, approval thresholds, expiration, safe budget accounting, and an auditable activity interface.**

Initial focus:

> **Celo stablecoins, starting with cUSD, with MiniPay-oriented UX and future integration research.**

Core technical principle:

> **Agents can act autonomously, but their financial authority is constrained by explicit user-defined permissions.**

Core MVP:

```text
Policy
+
Budget accounting
+
Concurrency safety
+
Approval
+
Real Celo payments
+
Control-plane dashboard
```

Everything else is secondary.

---

# 43. Final Scope Lock

For the current build, prioritize:

1. Policy model
2. Policy decision engine
3. Budget accounting
4. Concurrency correctness
5. Approval flow
6. Dashboard
7. Real Celo payment
8. Demo service agents
9. Security documentation

Do NOT prioritize:

1. ERC-8004
2. Real marketplace
3. Reputation
4. Multi-token support
5. DAO
6. NFT
7. Token
8. Cross-chain
9. Complex AI routing

The project should earn complexity rather than accumulate it.

---

# 44. Golden Rule

Whenever a new feature is proposed, ask:

> **Does this make autonomous agent spending safer, more understandable, more controllable, or more useful on Celo?**

If the answer is no:

**Do not build it yet.**

---

# 45. Status

Current state:

```text
Foundation                         DONE
Celo integration                   DONE
Secure payment                     DONE
Competitive analysis               DONE

Product direction                  LOCKED
Policy engine                      NEXT
Concurrency                        NEXT
On-chain permission research      FUTURE
Dashboard                          FUTURE
Demo marketplace                   FUTURE / THIN
ERC-8004                           DEFERRED
MiniPay integration                RESEARCH LATER
```

This document is the current source of truth for CeloAgent's product and engineering direction.

# Decentralized Auction Platform

A smart-contract **auction house on Ethereum**, where the contract itself is the auctioneer.
It lists items, records bids, tracks the highest bidder, closes auctions when time runs out,
pays the seller, and refunds losing bidders — **automatically, with no middleman.**

> **Costs nothing to test.** Everything here runs for free on the **Remix VM** and the
> **Sepolia testnet**. You never spend real money.

## What's in this project

```
decentralized-auction-platform/
├── contracts/AuctionPlatform.sol        # The smart contract (the "auctioneer")
├── frontend/index.html                  # Self-contained website (HTML/CSS/JS + ethers.js)
├── test/AuctionPlatform.test.js         # Full end-to-end test (11-step scenario)
├── scripts/deploy.js                    # Deploy helper for a local chain
├── scripts/generate_report.py           # Builds the Word report
├── hardhat.config.js                    # Hardhat config (EVM = paris, avoids PUSH0 issues)
├── Decentralized_Auction_Platform_Report.docx   # The written report for the examiner
└── README.md
```

## The five things the contract does

1. **List** — a seller calls `createAuction(...)` to open a lot.
2. **Bid** — buyers call `placeBid(id)` and attach ETH; the contract holds it safely.
3. **Track** — the contract always knows the current highest bid and bidder.
4. **End** — after the deadline, anyone calls `endAuction(id)` to close the lot.
5. **Pay** — the winning bid goes to the seller; outbid buyers `withdrawRefund(id)`.

---

## Quickstart A — Remix VM (fastest, zero setup, 100% free)

The Remix VM is a pretend blockchain that runs inside your browser. Nothing to install.

1. Open <https://remix.ethereum.org>.
2. In the **File Explorer**, create a new file `AuctionPlatform.sol` and paste in the contents
   of `contracts/AuctionPlatform.sol`.
3. Go to the **Solidity Compiler** tab, choose compiler **0.8.20**, and click **Compile**.
4. Go to the **Deploy & Run Transactions** tab. Set **Environment** to **Remix VM (Cancun)**.
5. Click **Deploy**. Your contract appears under *Deployed Contracts*.
6. Expand it and use the buttons to try everything:
   - `createAuction` — e.g. `"Watch","Rare 1960s watch",1000000000000000000,3600`
     (the price `1000000000000000000` is **1 ETH expressed in wei**; `3600` = 1 hour).
   - Switch the **Account** dropdown (top of the panel) to a different account, type a value in
     the **Value** box (e.g. `2` and set the unit to **Ether**), and call `placeBid` with `1`.
   - Read state with `getAuction`, `getBidHistory`, `timeLeft`, etc.

This proves the contract logic with no wallet and no real network.

---

## Quickstart B — Sepolia testnet + MetaMask + the website (free)

This is the "real" decentralized experience, still using free play-money.

1. **Install MetaMask** (browser extension) from <https://metamask.io> and create a wallet.
2. In MetaMask, switch the network to **Sepolia** (enable test networks in Settings if hidden).
3. **Get free test ETH** from a Sepolia faucet (search "Sepolia faucet"; e.g. the Google Cloud
   or Alchemy Sepolia faucet). A small amount is plenty.
4. **Deploy to Sepolia via Remix:** repeat Quickstart A steps 1–3, then on the *Deploy & Run*
   tab set **Environment** to **Injected Provider - MetaMask**. MetaMask will pop up — approve
   the connection (it should show Sepolia). Click **Deploy** and confirm in MetaMask.
5. **Copy the deployed contract address** (click the copy icon next to the deployed contract).
6. **Open the website:** double-click `frontend/index.html` to open it in your browser.
7. Click **Connect MetaMask**, paste the contract address into the *Contract address* box, and
   click **Load**. The address is remembered for next time.
8. Use the site: **create an auction**, **place bids** (switch MetaMask accounts to bid against
   yourself), watch the **live countdown**, **close** the lot after the deadline, and
   **withdraw** your refund if you were outbid.

---

## Quickstart C — Run the automated tests locally (optional, free)

This is for verifying the contract on a local developer chain. Requires Node.js.

```bash
npm install        # installs Hardhat + ethers + chai (one time)
npx hardhat compile
npx hardhat test
```

Expected result:

```
  AuctionPlatform — full auction lifecycle
    ✔ runs a complete auction and enforces every rule
    ✔ supports multiple simultaneous auctions with independent state

  2 passing
```

The main test walks through the full 11-step scenario: create a lot; reject a below-minimum
bid; reject the seller bidding; A bids then B outbids; reject a non-higher bid; check A's
pending refund; reject ending early; check the bid history; fast-forward time, end the auction
and confirm the seller received **exactly** the winning bid; A withdraws the refund; and a
second withdrawal is rejected.

> **"invalid opcode" on a local chain?** That's the `PUSH0` opcode. This project already
> compiles with `evmVersion: "paris"` in `hardhat.config.js`, which avoids it. That same build
> also runs on Sepolia.

---

## Security highlights (explained fully in the report)

- **Pull-over-push refunds** — the contract never auto-sends refunds. Outbid bidders withdraw
  their own money, so a malicious bidder can't freeze the auction by refusing a transfer.
- **Checks-effects-interactions** — `withdrawRefund` zeroes your balance *before* sending the
  ETH, blocking reentrancy attacks.
- **Fair rules** — the seller can't bid on their own item; bids must beat the current highest;
  no bids accepted after the deadline.

## The report

`Decentralized_Auction_Platform_Report.docx` is written for a non-technical examiner: title
page, table of contents, page numbers, the "contract is the auctioneer" idea with a comparison
to a traditional auction, a function-by-function breakdown, key blockchain concepts, the
security decisions, the free build-and-test guide, a verification table of the passing tests,
possible extensions, a team-division table, and a glossary.

To regenerate it: `python3 -m venv .venv && .venv/bin/pip install python-docx && .venv/bin/python scripts/generate_report.py`

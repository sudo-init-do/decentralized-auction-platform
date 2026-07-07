// Live narrated demo of a full auction, run on Hardhat's in-process chain.
//   npx hardhat run scripts/demo.js
//
// It deploys the contract and plays out a real auction between three accounts, printing the
// state and ETH balances at every step so you can SEE the money move.

const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const E = (wei) => ethers.formatEther(wei) + " ETH";
const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const line = () => console.log("─".repeat(64));

async function bal(addr) {
  return ethers.provider.getBalance(addr);
}

async function main() {
  const [seller, alice, bob] = await ethers.getSigners();
  console.log("\n🏛️  DECENTRALIZED AUCTION HOUSE — live demo\n");
  console.log("Players:");
  console.log("  Seller :", short(seller.address));
  console.log("  Alice  :", short(alice.address), "(bidder A)");
  console.log("  Bob    :", short(bob.address), "(bidder B)");
  line();

  // Deploy
  const Factory = await ethers.getContractFactory("AuctionPlatform");
  const house = await Factory.deploy();
  await house.waitForDeployment();
  console.log("✅ Contract deployed at", short(await house.getAddress()), "— it is now the auctioneer.\n");

  // 1. LIST
  const price = ethers.parseEther("1.0");
  await house.connect(seller).createAuction("Vintage Watch", "A rare 1960s wristwatch", price, 3600);
  console.log("📦 LIST   Seller lists lot #1 'Vintage Watch', starting price", E(price), "for 1 hour.\n");

  // 2. BID — Alice
  console.log("💰 BID    Alice bids 1.0 ETH …");
  await house.connect(alice).placeBid(1, { value: ethers.parseEther("1.0") });
  let a = await house.getAuction(1);
  console.log("          Highest: ", E(a.highestBid), "by", short(a.highestBidder), "(Alice)\n");

  // 2. BID — Bob outbids
  console.log("💰 BID    Bob bids 1.5 ETH (outbidding Alice) …");
  await house.connect(bob).placeBid(1, { value: ethers.parseEther("1.5") });
  a = await house.getAuction(1);
  console.log("          Highest: ", E(a.highestBid), "by", short(a.highestBidder), "(Bob)");
  console.log("          Alice is now owed a refund of", E(await house.pendingReturns(1, alice.address)), "(held safely by the contract)\n");

  // Rule demos
  console.log("🚫 RULES  The contract rejects bad moves:");
  await house.connect(alice).placeBid(1, { value: ethers.parseEther("1.5") }).catch((e) => console.log("          • equal bid rejected →", reason(e)));
  await house.connect(seller).placeBid(1, { value: ethers.parseEther("2.0") }).catch((e) => console.log("          • seller bidding rejected →", reason(e)));
  await house.endAuction(1).catch((e) => console.log("          • early close rejected →", reason(e)));
  console.log();

  // 3. TRACK — history
  const hist = await house.getBidHistory(1);
  console.log("📜 TRACK  Public bid history for lot #1:");
  hist.forEach((b, i) => console.log(`          #${i + 1}  ${short(b.bidder)}  ${E(b.amount)}`));
  console.log();

  // 4. END
  console.log("⏰ Fast-forwarding past the 1-hour deadline …");
  await time.increase(3601);
  const sellerBefore = await bal(seller.address);
  console.log("🔨 END    Anyone closes the auction (Bob does it here) …");
  await house.connect(bob).endAuction(1);
  const sellerAfter = await bal(seller.address);
  a = await house.getAuction(1);
  console.log("          Winner:", short(a.highestBidder), "(Bob) with", E(a.highestBid));
  console.log("💸 PAY    Seller balance went up by exactly", E(sellerAfter - sellerBefore), "→ the winning bid.\n");

  // 5. Refund
  console.log("🔁 REFUND Alice withdraws her outbid 1.0 ETH (pull-over-push) …");
  const aliceBefore = await bal(alice.address);
  const tx = await house.connect(alice).withdrawRefund(1);
  const rc = await tx.wait();
  const gas = rc.gasUsed * rc.gasPrice;
  const aliceAfter = await bal(alice.address);
  console.log("          Alice net change:", E(aliceAfter - aliceBefore), "(+", E(aliceAfter - aliceBefore + gas), "before her gas fee)");
  await house.connect(alice).withdrawRefund(1).catch((e) => console.log("          • second withdrawal rejected →", reason(e)));

  line();
  console.log("✅ Auction complete: item sold, seller paid, loser refunded — no middleman.\n");
}

function reason(e) {
  return (e.reason || e.shortMessage || e.message || "reverted").replace(/^execution reverted:?\s*/i, "");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

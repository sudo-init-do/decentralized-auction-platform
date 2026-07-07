// End-to-end test of the whole auction lifecycle.
//
// We spin up a local in-memory blockchain (Hardhat), deploy the contract, and run ONE full
// auction from start to finish, asserting that the contract behaves correctly at every step.
//
// Run with:  npx hardhat test
//
// The numbered comments below match the 11 required scenario steps in the project brief.

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AuctionPlatform — full auction lifecycle", function () {
  let auctionHouse;
  let seller, alice, bob; // seller = lists the item; alice (A) & bob (B) = bidders

  const ONE_HOUR = 60 * 60;
  const startingPrice = ethers.parseEther("1.0"); // 1 ETH minimum first bid
  const bidA = ethers.parseEther("1.0"); // Alice bids exactly the starting price
  const bidB = ethers.parseEther("1.5"); // Bob outbids Alice

  // Fresh contract and accounts before each test so tests never interfere with each other.
  beforeEach(async function () {
    [seller, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AuctionPlatform", seller);
    auctionHouse = await Factory.deploy();
    await auctionHouse.waitForDeployment();
  });

  it("runs a complete auction and enforces every rule", async function () {
    // ---- STEP 1: create an auction -----------------------------------------------------
    await expect(
      auctionHouse
        .connect(seller)
        .createAuction("Vintage Watch", "A rare 1960s wristwatch", startingPrice, ONE_HOUR)
    ).to.emit(auctionHouse, "AuctionCreated");

    const id = 1n;
    let a = await auctionHouse.getAuction(id);
    expect(a.seller).to.equal(seller.address);
    expect(a.itemName).to.equal("Vintage Watch");
    expect(a.startingPrice).to.equal(startingPrice);
    expect(a.ended).to.equal(false);

    // ---- STEP 2: reject a bid below the starting price ---------------------------------
    await expect(
      auctionHouse.connect(alice).placeBid(id, { value: ethers.parseEther("0.5") })
    ).to.be.revertedWith("Below starting price");

    // ---- STEP 3: reject the seller bidding on their own item ---------------------------
    await expect(
      auctionHouse.connect(seller).placeBid(id, { value: startingPrice })
    ).to.be.revertedWith("Seller cannot bid");

    // ---- STEP 4: A bids, then B outbids ------------------------------------------------
    await expect(auctionHouse.connect(alice).placeBid(id, { value: bidA }))
      .to.emit(auctionHouse, "BidPlaced")
      .withArgs(id, alice.address, bidA);

    a = await auctionHouse.getAuction(id);
    expect(a.highestBidder).to.equal(alice.address);
    expect(a.highestBid).to.equal(bidA);

    await expect(auctionHouse.connect(bob).placeBid(id, { value: bidB }))
      .to.emit(auctionHouse, "BidPlaced")
      .withArgs(id, bob.address, bidB);

    a = await auctionHouse.getAuction(id);
    expect(a.highestBidder).to.equal(bob.address);
    expect(a.highestBid).to.equal(bidB);

    // ---- STEP 5: reject a non-higher bid (equal to current highest) --------------------
    await expect(
      auctionHouse.connect(alice).placeBid(id, { value: bidB })
    ).to.be.revertedWith("Bid not higher than current");

    // ---- STEP 6: A's pendingReturn equals their original bid ---------------------------
    expect(await auctionHouse.pendingReturns(id, alice.address)).to.equal(bidA);
    // The same number is visible through the convenience view used by the frontend.
    expect(await auctionHouse.connect(alice).myRefund(id)).to.equal(bidA);

    // ---- STEP 7: reject ending the auction before the deadline -------------------------
    await expect(auctionHouse.endAuction(id)).to.be.revertedWith("Auction not yet ended");

    // ---- STEP 8: bid history contains both bids ----------------------------------------
    expect(await auctionHouse.bidCount(id)).to.equal(2n);
    const history = await auctionHouse.getBidHistory(id);
    expect(history.length).to.equal(2);
    expect(history[0].bidder).to.equal(alice.address);
    expect(history[0].amount).to.equal(bidA);
    expect(history[1].bidder).to.equal(bob.address);
    expect(history[1].amount).to.equal(bidB);

    // ---- STEP 9: fast-forward past the deadline, end the auction, seller gets EXACTLY the
    //              winning bid -----------------------------------------------------------
    await time.increase(ONE_HOUR + 1); // jump the local clock forward by just over an hour

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    // End the auction from a NON-seller account (bob), so the seller pays no gas here and we
    // can assert the seller received EXACTLY the winning bid, with no gas to muddy the maths.
    await expect(auctionHouse.connect(bob).endAuction(id))
      .to.emit(auctionHouse, "AuctionEnded")
      .withArgs(id, bob.address, bidB);

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(bidB);

    a = await auctionHouse.getAuction(id);
    expect(a.ended).to.equal(true);

    // Ending twice must fail.
    await expect(auctionHouse.endAuction(id)).to.be.revertedWith("Already ended");

    // ---- STEP 10: A withdraws their refund ---------------------------------------------
    const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);

    const tx = await auctionHouse.connect(alice).withdrawRefund(id);
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
    // Alice gets her 1 ETH back, minus the gas she spent calling withdraw.
    expect(aliceBalanceAfter - aliceBalanceBefore + gasUsed).to.equal(bidA);

    // Her recorded balance is now zero.
    expect(await auctionHouse.pendingReturns(id, alice.address)).to.equal(0n);

    // ---- STEP 11: a second withdrawal is rejected --------------------------------------
    await expect(
      auctionHouse.connect(alice).withdrawRefund(id)
    ).to.be.revertedWith("Nothing to withdraw");
  });

  it("supports multiple simultaneous auctions with independent state", async function () {
    // Two lots created back to back get ids #1 and #2 and never interfere.
    await auctionHouse.connect(seller).createAuction("Painting", "Oil on canvas", startingPrice, ONE_HOUR);
    await auctionHouse.connect(alice).createAuction("Bicycle", "Road bike", startingPrice, ONE_HOUR);

    expect(await auctionHouse.auctionCount()).to.equal(2n);

    await auctionHouse.connect(bob).placeBid(1n, { value: bidB });
    const lot1 = await auctionHouse.getAuction(1n);
    const lot2 = await auctionHouse.getAuction(2n);

    expect(lot1.highestBidder).to.equal(bob.address);
    expect(lot2.highestBid).to.equal(0n); // lot #2 untouched
  });
});

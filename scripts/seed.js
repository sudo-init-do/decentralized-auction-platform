// Deploy the contract to the running local node and fill it with a few LIVE auctions so the
// website has something to display right away.
//   npx hardhat run scripts/seed.js --network localhost

const { ethers } = require("hardhat");

async function main() {
  const [seller, alice, bob, carol] = await ethers.getSigners();

  const Factory = await ethers.getContractFactory("AuctionPlatform");
  const house = await Factory.deploy();
  await house.waitForDeployment();
  const addr = await house.getAddress();

  // Lot #1 — popular item, two bids, runs for 2 hours (status: LIVE)
  await house.connect(seller).createAuction(
    "Vintage Watch", "A rare 1960s mechanical wristwatch in working condition.",
    ethers.parseEther("1.0"), 2 * 3600
  );
  await house.connect(alice).placeBid(1, { value: ethers.parseEther("1.0") });
  await house.connect(bob).placeBid(1, { value: ethers.parseEther("1.5") });

  // Lot #2 — closes in 5 minutes (status: ENDING SOON), one bid
  await house.connect(alice).createAuction(
    "Mountain Bike", "21-speed hardtail, lightly used, recently serviced.",
    ethers.parseEther("0.5"), 5 * 60
  );
  await house.connect(carol).placeBid(2, { value: ethers.parseEther("0.6") });

  // Lot #3 — fresh listing, no bids yet, runs for 1 day (status: LIVE)
  await house.connect(bob).createAuction(
    "Abstract Painting", "Original oil on canvas, 60x80cm, signed by the artist.",
    ethers.parseEther("2.0"), 24 * 3600
  );

  console.log("\n✅ Seeded contract deployed at:", addr);
  console.log("   Auctions created: 3 (Vintage Watch, Mountain Bike, Abstract Painting)\n");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });

// Deploy the AuctionPlatform contract.
//
// Local chain:  npx hardhat node          (in one terminal)
//               npx hardhat run scripts/deploy.js --network localhost   (in another)
//
// For Sepolia, the recommended free path in this project is Remix (see the README), but this
// script also works if you add a Sepolia network + private key to hardhat.config.js.

const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const Factory = await ethers.getContractFactory("AuctionPlatform");
  const auctionHouse = await Factory.deploy();
  await auctionHouse.waitForDeployment();

  const address = await auctionHouse.getAddress();
  console.log("AuctionPlatform deployed to:", address);
  console.log("Paste this address into the frontend (index.html) to connect.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

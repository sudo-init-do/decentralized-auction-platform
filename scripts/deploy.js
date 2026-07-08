// Deploy the AuctionPlatform contract.
//
// Local chain:  npx hardhat node          (in one terminal)
//               npx hardhat run scripts/deploy.js --network localhost   (in another)
//
// Sepolia:      set PRIVATE_KEY (and optionally SEPOLIA_RPC_URL) in .env, then
//               npx hardhat run scripts/deploy.js --network sepolia

const { ethers } = require("hardhat");

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No deployer account available. Set PRIVATE_KEY in .env (see hardhat.config.js)."
    );
  }
  const [deployer] = signers;
  console.log("Deploying with account:", deployer.address);

  const Factory = await ethers.getContractFactory("AuctionPlatform");
  const c = await Factory.deploy();
  await c.waitForDeployment();
  const addr = await c.getAddress();

  console.log("Deployed to: " + addr);
  console.log("Paste this address into the frontend (index.html) to connect.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

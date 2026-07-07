require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-network-helpers");

/**
 * Hardhat configuration for the Decentralized Auction Platform.
 *
 * NOTE ON "PUSH0" / "invalid opcode":
 *   Solidity 0.8.20+ targets the "shanghai" EVM by default, which introduces the PUSH0 opcode.
 *   Some local chains reject PUSH0 with an "invalid opcode" error on view calls. To keep this
 *   project runnable everywhere for free, we compile with evmVersion "paris" (pre-PUSH0).
 *   "paris" bytecode runs on every modern network, INCLUDING the Sepolia testnet, so the same
 *   build works locally and when you deploy to Sepolia.
 */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  networks: {
    // The built-in in-process Hardhat network used by `npx hardhat test`.
    hardhat: {
      hardfork: "shanghai",
    },
  },
};

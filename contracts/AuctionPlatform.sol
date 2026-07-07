// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title  AuctionPlatform
 * @notice A decentralized auction house that lives entirely on the Ethereum blockchain.
 *
 *         There is NO human auctioneer and NO company in the middle. This smart contract
 *         IS the auctioneer. It does five jobs, automatically and for everyone equally:
 *
 *           1. LIST  - a seller creates an auction (a "lot") for an item.
 *           2. BID   - buyers send ETH to place bids; the contract holds the money safely.
 *           3. TRACK - the contract always knows the current highest bid and bidder.
 *           4. END   - once the timer runs out, the auction can be closed (by anyone).
 *           5. PAY   - the winning bid is paid to the seller; losers withdraw their money back.
 *
 *         Because the rules are written in code that runs on a public blockchain, nobody can
 *         cheat, hide a bid, or refuse to pay out. The code is the referee.
 *
 *         This contract is written for a school project, so the comments explain not just
 *         WHAT each line does but WHY we made each security decision.
 */
contract AuctionPlatform {
    // ---------------------------------------------------------------------------------------
    // DATA: what an auction looks like
    // ---------------------------------------------------------------------------------------

    /**
     * @dev A single bid record, kept so we can show a full, transparent bid history per lot.
     *      `bidder` is who bid, `amount` is how much (in wei), `timestamp` is when.
     */
    struct Bid {
        address bidder;
        uint256 amount;
        uint256 timestamp;
    }

    /**
     * @dev Everything we store about one auction / lot.
     *      Note: ETH amounts are always stored in WEI (the smallest unit of ETH).
     *      1 ETH = 1,000,000,000,000,000,000 wei (10^18). We never store decimals on-chain.
     */
    struct Auction {
        uint256 id;             // lot number: #1, #2, #3 ...
        address payable seller; // who is selling (payable = allowed to receive ETH)
        string  itemName;       // short title, e.g. "Vintage Watch"
        string  description;    // longer description of the item
        uint256 startingPrice;  // minimum acceptable first bid, in wei
        uint256 highestBid;     // current highest bid, in wei (0 until the first valid bid)
        address highestBidder;  // current winning bidder (address(0) if none yet)
        uint256 endTime;        // unix timestamp after which bidding is closed
        bool    ended;          // true once endAuction() has paid the seller
    }

    // ---------------------------------------------------------------------------------------
    // STORAGE: the contract's permanent memory on the blockchain
    // ---------------------------------------------------------------------------------------

    /// @notice How many auctions have ever been created. Also used to hand out the next id.
    uint256 public auctionCount;

    /// @notice Look up any auction by its id. auctions[1] is lot #1, etc.
    mapping(uint256 => Auction) public auctions;

    /// @notice The full bid history for each auction (auctionId => list of bids).
    mapping(uint256 => Bid[]) private bidHistory;

    /**
     * @notice Money that is owed back to bidders who were outbid (auctionId => bidder => wei).
     * @dev    This is the heart of the "pull-over-push" pattern (explained at withdrawRefund).
     *         We DO NOT automatically send refunds. Instead we record what each person is owed
     *         and let them pull it out themselves. This keeps the auction safe and unstoppable.
     */
    mapping(uint256 => mapping(address => uint256)) public pendingReturns;

    // ---------------------------------------------------------------------------------------
    // EVENTS: announcements the blockchain broadcasts so the website (and anyone) can react
    // ---------------------------------------------------------------------------------------

    event AuctionCreated(
        uint256 indexed id,
        address indexed seller,
        string itemName,
        uint256 startingPrice,
        uint256 endTime
    );
    event BidPlaced(uint256 indexed id, address indexed bidder, uint256 amount);
    event AuctionEnded(uint256 indexed id, address indexed winner, uint256 amount);
    event RefundWithdrawn(uint256 indexed id, address indexed bidder, uint256 amount);

    // ---------------------------------------------------------------------------------------
    // 1. LIST: create a new auction
    // ---------------------------------------------------------------------------------------

    /**
     * @notice Create (list) a new auction for an item.
     * @param itemName        Short name of the item.
     * @param description     Longer description.
     * @param startingPrice   Minimum first bid, in wei.
     * @param durationSeconds How long the auction stays open, in seconds (e.g. 3600 = 1 hour).
     * @return id The new auction's lot number.
     *
     * @dev We compute endTime = now + duration. `block.timestamp` is the current time as the
     *      blockchain sees it. Anyone can be a seller; no special permission is needed.
     */
    function createAuction(
        string calldata itemName,
        string calldata description,
        uint256 startingPrice,
        uint256 durationSeconds
    ) external returns (uint256 id) {
        // Basic sanity checks so the auction is meaningful.
        require(bytes(itemName).length > 0, "Item name required");
        require(durationSeconds > 0, "Duration must be > 0");

        auctionCount += 1;     // give this lot the next number
        id = auctionCount;

        uint256 end = block.timestamp + durationSeconds;

        // Save the new auction into permanent storage.
        auctions[id] = Auction({
            id: id,
            seller: payable(msg.sender), // the person who called this function is the seller
            itemName: itemName,
            description: description,
            startingPrice: startingPrice,
            highestBid: 0,
            highestBidder: address(0),
            endTime: end,
            ended: false
        });

        // Tell the world a new auction exists.
        emit AuctionCreated(id, msg.sender, itemName, startingPrice, end);
    }

    // ---------------------------------------------------------------------------------------
    // 2. BID + 3. TRACK: place a bid (the ETH sent IS the bid)
    // ---------------------------------------------------------------------------------------

    /**
     * @notice Place a bid on auction `id`. The ETH you attach to this call IS your bid.
     * @param id The lot number to bid on.
     *
     * Rules enforced by the contract (this is the referee at work):
     *   - The auction must exist and not be past its deadline.
     *   - The seller is NOT allowed to bid on their own item (no self-inflation).
     *   - The FIRST bid must be at least the starting price.
     *   - Every LATER bid must be STRICTLY greater than the current highest bid.
     *   - When you become the new highest bidder, the PREVIOUS highest bidder is credited
     *     in `pendingReturns` so they can withdraw their money later.
     */
    function placeBid(uint256 id) external payable {
        Auction storage a = auctions[id];

        // --- CHECKS -------------------------------------------------------------------------
        require(a.id != 0, "Auction does not exist");
        require(block.timestamp < a.endTime, "Auction already ended");
        require(!a.ended, "Auction closed");
        require(msg.sender != a.seller, "Seller cannot bid");

        if (a.highestBid == 0) {
            // No valid bid yet: the first bid must meet the starting price.
            require(msg.value >= a.startingPrice, "Below starting price");
        } else {
            // There is already a leader: you must beat them strictly.
            require(msg.value > a.highestBid, "Bid not higher than current");
        }

        // --- EFFECTS ------------------------------------------------------------------------
        // Credit the person we are about to dethrone, so they can reclaim their funds.
        // We ADD (+=) in case the same person was outbid more than once across the auction.
        if (a.highestBidder != address(0)) {
            pendingReturns[id][a.highestBidder] += a.highestBid;
        }

        // Record the new leader.
        a.highestBid = msg.value;
        a.highestBidder = msg.sender;

        // Append to the transparent, append-only bid history.
        bidHistory[id].push(Bid({
            bidder: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp
        }));

        emit BidPlaced(id, msg.sender, msg.value);
    }

    // ---------------------------------------------------------------------------------------
    // 4. END + 5. PAY (seller): close the auction and pay the seller
    // ---------------------------------------------------------------------------------------

    /**
     * @notice Close auction `id` after its deadline and pay the winning bid to the seller.
     * @param id The lot number to close.
     *
     * @dev ANYONE may call this. That is by design: the auction must be closeable even if the
     *      seller disappears, so a buyer (or any helpful third party) can trigger the payout.
     *      It can only run AFTER the deadline and only ONCE.
     *
     *      We use `call{value: ...}` (rather than the older `transfer`) because it forwards all
     *      gas and is the currently-recommended way to send ETH. We check the boolean result.
     */
    function endAuction(uint256 id) external {
        Auction storage a = auctions[id];

        // --- CHECKS -------------------------------------------------------------------------
        require(a.id != 0, "Auction does not exist");
        require(block.timestamp >= a.endTime, "Auction not yet ended");
        require(!a.ended, "Already ended");

        // --- EFFECTS (set ended BEFORE sending money, to prevent reentrancy) -----------------
        a.ended = true;

        uint256 winningBid = a.highestBid;
        address winner = a.highestBidder;

        // --- INTERACTIONS -------------------------------------------------------------------
        if (winner != address(0)) {
            // There was a winner: send exactly the winning bid to the seller.
            (bool ok, ) = a.seller.call{value: winningBid}("");
            require(ok, "Payout to seller failed");
        }
        // If there were no bids, there is nothing to pay; the lot simply closes.

        emit AuctionEnded(id, winner, winningBid);
    }

    // ---------------------------------------------------------------------------------------
    // 5. PAY (refunds to losers): withdraw money you are owed
    // ---------------------------------------------------------------------------------------

    /**
     * @notice Withdraw any ETH you are owed from auction `id` (because you were outbid).
     * @param id The lot number you want your refund from.
     *
     * @dev SECURITY - "pull over push" + "checks-effects-interactions":
     *
     *      We never push refunds automatically inside placeBid(). Why? Imagine a malicious
     *      bidder whose wallet is a contract that REJECTS incoming ETH. If we tried to auto-send
     *      their refund when they got outbid, that send would fail and could freeze the whole
     *      auction. By making refunds a "pull" (each user withdraws their own money), one bad
     *      actor can only ever hurt themselves.
     *
     *      Inside this function we follow checks-effects-interactions to block "reentrancy"
     *      attacks: we read the amount, then ZERO it OUT in storage BEFORE sending the ETH.
     *      So even if the receiver is a contract that calls withdrawRefund() again in the
     *      middle of the transfer, their recorded balance is already 0 and they get nothing extra.
     */
    function withdrawRefund(uint256 id) external {
        // --- CHECKS -------------------------------------------------------------------------
        uint256 amount = pendingReturns[id][msg.sender];
        require(amount > 0, "Nothing to withdraw");

        // --- EFFECTS (zero the balance FIRST) -----------------------------------------------
        pendingReturns[id][msg.sender] = 0;

        // --- INTERACTIONS (send the money LAST) ---------------------------------------------
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        // If the send somehow fails, restore the balance so the user doesn't lose their money.
        if (!ok) {
            pendingReturns[id][msg.sender] = amount;
            revert("Refund transfer failed");
        }

        emit RefundWithdrawn(id, msg.sender, amount);
    }

    // ---------------------------------------------------------------------------------------
    // VIEW HELPERS: read-only functions the website uses to display information
    // (These cost no gas when called from outside the blockchain.)
    // ---------------------------------------------------------------------------------------

    /**
     * @notice Get all the stored fields of one auction at once (handy for the frontend).
     */
    function getAuction(uint256 id)
        external
        view
        returns (
            uint256 id_,
            address seller,
            string memory itemName,
            string memory description,
            uint256 startingPrice,
            uint256 highestBid,
            address highestBidder,
            uint256 endTime,
            bool ended
        )
    {
        Auction storage a = auctions[id];
        require(a.id != 0, "Auction does not exist");
        return (
            a.id,
            a.seller,
            a.itemName,
            a.description,
            a.startingPrice,
            a.highestBid,
            a.highestBidder,
            a.endTime,
            a.ended
        );
    }

    /// @notice Return the full bid history (every bid) for auction `id`.
    function getBidHistory(uint256 id) external view returns (Bid[] memory) {
        return bidHistory[id];
    }

    /// @notice How many bids have been placed on auction `id`.
    function bidCount(uint256 id) external view returns (uint256) {
        return bidHistory[id].length;
    }

    /**
     * @notice How many seconds are left before auction `id` closes (0 if already past).
     * @dev    The frontend uses this to drive its live countdown.
     */
    function timeLeft(uint256 id) external view returns (uint256) {
        Auction storage a = auctions[id];
        require(a.id != 0, "Auction does not exist");
        if (block.timestamp >= a.endTime) {
            return 0;
        }
        return a.endTime - block.timestamp;
    }

    /// @notice How much ETH (in wei) the caller can withdraw from auction `id`.
    function myRefund(uint256 id) external view returns (uint256) {
        return pendingReturns[id][msg.sender];
    }
}

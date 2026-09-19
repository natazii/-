/* Optional open ascending auction. Loaded after engine.js.
   Declining a purchase includes the landing player in the auction. Bids begin at
   $10, rise by at least $10, and can never exceed cash. Passing withdraws a player.
   Bot decisions and the continuation of the original turn stay in the engine. */
Object.assign(Game, {
  startAuction(tileIndex) {
    const s = this.state;
    const land = BOARD[tileIndex];
    if (!s || s.phase !== 'action' || !s.settings.auction || !land || !['city', 'airport', 'company'].includes(land.type) || s.owners[tileIndex] !== undefined) return;
    s.pendingBuy = undefined;
    s.pendingBuyPlayer = undefined;
    s.phase = 'auction';
    s.auction = { tileIndex, highBid: 0, highBidder: null, bidderId: null, passed: [], increment: 10 };
    this.log(`Auction opened for ${BOARD[tileIndex].name}. Bidding starts at $10.`, null, 'buy');
    GameUI.closeLandInfo?.();
    this.advanceAuction((s.turn + s.players.length - 1) % s.players.length);
  },

  auctionMinimum() {
    const a = this.state?.auction;
    return a ? a.highBid + a.increment : 0;
  },

  advanceAuction(afterId) {
    const s = this.state;
    const a = s?.auction;
    if (!a || s.phase !== 'auction') return;
    const minimum = this.auctionMinimum();
    const eligible = s.players.filter(p => !p.bankrupt && p.id !== a.highBidder && !a.passed.includes(p.id) && p.cash >= minimum);
    if (!eligible.length) return this.finishAuction();

    // Traverse the same (possibly randomized) order as the game, skipping the leader.
    const ids = new Set(eligible.map(p => p.id));
    for (let step = 1; step <= s.players.length; step++) {
      const id = (afterId + step) % s.players.length;
      if (ids.has(id)) { a.bidderId = id; break; }
    }
    GameUI.renderAll();
    const bidder = this.player(a.bidderId);
    if (bidder.isBot) {
      this.schedule(() => {
        if (this.state.auction !== a || a.bidderId !== bidder.id) return;
        const land = BOARD[a.tileIndex];
        // A conservative bot leaves $200 for rent; a nearly completed set is worth more.
        const set = land.group ? groupTiles(land.group) : [];
        const completesSet = set.length > 0 && set.every(i => i === a.tileIndex || s.owners[i] === bidder.id);
        const ceiling = Math.min(bidder.cash - 200, Math.floor(land.cost * (completesSet ? 1.4 : 1.1)));
        if (minimum <= ceiling) this.placeAuctionBid(minimum);
        else this.passAuction();
      }, 550);
    }
  },

  placeAuctionBid(value) {
    const s = this.state;
    const a = s?.auction;
    if (!a || s.phase !== 'auction' || a.bidderId === null) return false;
    const bidder = this.player(a.bidderId);
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < this.auctionMinimum() || amount > bidder.cash || bidder.bankrupt) return false;
    a.highBid = amount;
    a.highBidder = bidder.id;
    this.log(`bid $${amount} for ${BOARD[a.tileIndex].name}`, bidder.id, 'buy');
    this.advanceAuction(bidder.id);
    return true;
  },

  passAuction() {
    const s = this.state;
    const a = s?.auction;
    if (!a || s.phase !== 'auction' || a.bidderId === null) return false;
    const id = a.bidderId;
    if (!a.passed.includes(id)) a.passed.push(id);
    this.log('withdrew from the auction.', id, 'info');
    this.advanceAuction(id);
    return true;
  },

  finishAuction() {
    const s = this.state;
    const a = s?.auction;
    if (!a || s.phase !== 'auction') return;
    const winner = a.highBidder === null ? null : this.player(a.highBidder);
    const land = BOARD[a.tileIndex];
    if (winner && !winner.bankrupt && winner.cash >= a.highBid && s.owners[a.tileIndex] === undefined) {
      this.pay(winner, -a.highBid);
      s.owners[a.tileIndex] = winner.id;
      this.log(`won ${land.name} at auction for $${a.highBid}`, winner.id, 'buy');
      GameUI.playSound?.('buy');
    } else {
      this.log(`${land.name} remains with the bank. No winning bid.`, null, 'info');
    }
    s.auction = null;
    s.phase = 'action';
    GameUI.renderAll();
    // Continue the original player's End turn, including their extra roll on doubles.
    this.endTurn();
  }
});

import { Swap, Lot, Holding, ClosedTrade } from '../types';

export class PnLEngine {
  private holdings: Map<string, Holding> = new Map();
  private closedTrades: ClosedTrade[] = [];

  processSwapsForPnL(swaps: Swap[]): {
    closedTrades: ClosedTrade[];
    openHoldings: Holding[];
  } {
    console.log('\n=== DIAGNOSTIC PNL PROCESSING ===');
    console.log(`Total swaps to process: ${swaps.length}`);
    
    // Reset state
    this.holdings.clear();
    this.closedTrades = [];

    // Sort swaps chronologically - CRITICAL for FIFO
    const sortedSwaps = [...swaps].sort((a, b) => a.timestamp - b.timestamp);

    // Group swaps by token for analysis
    const tokenSwaps = new Map<string, Swap[]>();
    sortedSwaps.forEach(swap => {
      const tokenMint = swap.tokenMint;
      if (!tokenSwaps.has(tokenMint)) {
        tokenSwaps.set(tokenMint, []);
      }
      tokenSwaps.get(tokenMint)!.push(swap);
    });

    console.log('\n=== TOKEN SWAP SUMMARY ===');
    for (const [tokenMint, swaps] of tokenSwaps) {
      const buys = swaps.filter(s => s.direction === 'buy');
      const sells = swaps.filter(s => s.direction === 'sell');
      const totalBought = buys.reduce((sum, s) => sum + s.tokenAmount, 0);
      const totalSold = sells.reduce((sum, s) => sum + s.tokenAmount, 0);
      const netBalance = totalBought - totalSold;
      
      console.log(`Token ${tokenMint.slice(0, 8)}...:`);
      console.log(`  Buys: ${buys.length} (${totalBought.toFixed(6)} tokens)`);
      console.log(`  Sells: ${sells.length} (${totalSold.toFixed(6)} tokens)`);
      console.log(`  Net Balance: ${netBalance.toFixed(6)} tokens`);
      console.log(`  Should have ${netBalance > 0.000001 ? 'HOLDINGS' : 'NO HOLDINGS'}`);
    }

    console.log('\n=== PROCESSING SWAPS CHRONOLOGICALLY ===');
    let swapIndex = 0;
    for (const swap of sortedSwaps) {
      swapIndex++;
      console.log(`\n[${swapIndex}/${sortedSwaps.length}] Processing ${swap.direction.toUpperCase()}`);
      console.log(`  Token: ${swap.tokenMint.slice(0, 8)}...`);
      console.log(`  Amount: ${swap.tokenAmount.toFixed(6)} tokens`);
      console.log(`  SOL: ${swap.solAmount.toFixed(6)}`);
      console.log(`  Price: ${swap.pricePerToken.toFixed(8)} SOL/token`);
      console.log(`  Time: ${new Date(swap.timestamp * 1000).toISOString()}`);
      
      if (swap.direction === 'buy') {
        this.processBuyDiagnostic(swap);
      } else if (swap.direction === 'sell') {
        this.processSellDiagnostic(swap);
      }
      
      // Show current holdings after each transaction
      console.log(`  Current Holdings After Transaction:`);
      const currentHolding = this.holdings.get(swap.tokenMint);
      if (currentHolding && currentHolding.totalQuantity > 0.000001) {
        console.log(`    ${swap.tokenMint.slice(0, 8)}...: ${currentHolding.totalQuantity.toFixed(6)} tokens`);
      } else {
        console.log(`    ${swap.tokenMint.slice(0, 8)}...: 0 tokens (no holding)`);
      }
    }

    // Final holdings analysis
    const openHoldings = Array.from(this.holdings.values()).filter(
      holding => holding.totalQuantity > 0.000001
    );

    console.log('\n=== FINAL HOLDINGS ANALYSIS ===');
    console.log(`Total tokens with holdings: ${openHoldings.length}`);
    let totalHoldingsValue = 0;
    
    for (const holding of openHoldings) {
      const value = holding.totalQuantity * holding.averageCostPerUnit;
      totalHoldingsValue += value;
      console.log(`${holding.tokenMint.slice(0, 8)}...:`);
      console.log(`  Quantity: ${holding.totalQuantity.toFixed(6)} tokens`);
      console.log(`  Avg Cost: ${holding.averageCostPerUnit.toFixed(8)} SOL/token`);
      console.log(`  Total Value: ${value.toFixed(6)} SOL`);
      console.log(`  Lots: ${holding.purchaseLots.length}`);
    }
    
    console.log(`\nTOTAL HOLDINGS VALUE: ${totalHoldingsValue.toFixed(6)} SOL`);
    console.log(`CLOSED TRADES: ${this.closedTrades.length}`);

    return {
      closedTrades: this.closedTrades,
      openHoldings: openHoldings
    };
  }

  private processBuyDiagnostic(swap: Swap): void {
    const tokenMint = swap.tokenMint;
    
    const lot: Lot = {
      quantity: swap.tokenAmount,
      costPerUnit: swap.pricePerToken,
      timestamp: swap.timestamp,
      signature: swap.signature
    };

    let holding = this.holdings.get(tokenMint);
    if (!holding) {
      holding = {
        tokenMint: tokenMint,
        purchaseLots: [],
        totalQuantity: 0,
        averageCostPerUnit: 0
      };
      this.holdings.set(tokenMint, holding);
      console.log(`    ✓ Created new holding`);
    }

    const previousQuantity = holding.totalQuantity;
    holding.purchaseLots.push(lot);
    holding.totalQuantity += lot.quantity;
    
    const totalCost = holding.purchaseLots.reduce((sum, lot) => 
      sum + (lot.quantity * lot.costPerUnit), 0
    );
    holding.averageCostPerUnit = totalCost / holding.totalQuantity;
    
    console.log(`    ✓ Buy processed:`);
    console.log(`      Previous: ${previousQuantity.toFixed(6)} tokens`);
    console.log(`      Added: ${lot.quantity.toFixed(6)} tokens`);
    console.log(`      New Total: ${holding.totalQuantity.toFixed(6)} tokens`);
    console.log(`      New Avg Cost: ${holding.averageCostPerUnit.toFixed(8)} SOL/token`);
  }

  private processSellDiagnostic(swap: Swap): void {
    const tokenMint = swap.tokenMint;
    const holding = this.holdings.get(tokenMint);
    
    if (!holding || holding.purchaseLots.length === 0) {
      console.log(`    ⚠️  SELL WITHOUT HOLDING - possible airdrop or missing buy`);
      console.log(`      Creating profit-only trade for ${swap.tokenAmount.toFixed(6)} tokens`);
      
      const closedTrade: ClosedTrade = {
        tokenMint: tokenMint,
        totalCostBasisInSol: 0,
        totalProceedsInSol: swap.solAmount,
        realizedPnLInSol: swap.solAmount,
        realizedPnLPercent: Infinity,
        holdingDurationSeconds: 0,
        buyTimestamp: swap.timestamp,
        sellTimestamp: swap.timestamp,
        quantity: swap.tokenAmount
      };
      
      this.closedTrades.push(closedTrade);
      return;
    }

    console.log(`    📉 Processing sell against holding:`);
    console.log(`      Available: ${holding.totalQuantity.toFixed(6)} tokens`);
    console.log(`      Trying to sell: ${swap.tokenAmount.toFixed(6)} tokens`);
    console.log(`      Available lots: ${holding.purchaseLots.length}`);

    let remainingQuantityToSell = swap.tokenAmount;
    let totalCostBasis = 0;
    let totalQuantitySold = 0;
    let buyTimestamp = 0;

    // Show what lots are available
    holding.purchaseLots.forEach((lot, index) => {
      console.log(`        Lot ${index + 1}: ${lot.quantity.toFixed(6)} tokens @ ${lot.costPerUnit.toFixed(8)} SOL`);
    });

    const originalLotCount = holding.purchaseLots.length;
    let lotIndex = 0;

    while (remainingQuantityToSell > 0.000001 && holding.purchaseLots.length > 0) {
      const lot = holding.purchaseLots[0];
      lotIndex++;
      
      if (buyTimestamp === 0) {
        buyTimestamp = lot.timestamp;
      }

      const quantityFromThisLot = Math.min(remainingQuantityToSell, lot.quantity);
      const costBasisFromThisLot = quantityFromThisLot * lot.costPerUnit;
      
      console.log(`        Using lot ${lotIndex}: ${quantityFromThisLot.toFixed(6)} tokens @ ${lot.costPerUnit.toFixed(8)} SOL`);
      
      totalCostBasis += costBasisFromThisLot;
      totalQuantitySold += quantityFromThisLot;
      remainingQuantityToSell -= quantityFromThisLot;

      if (quantityFromThisLot >= lot.quantity - 0.000001) {
        console.log(`          → Lot fully consumed, removing`);
        holding.purchaseLots.shift();
      } else {
        console.log(`          → Lot partially consumed, ${(lot.quantity - quantityFromThisLot).toFixed(6)} remaining`);
        lot.quantity -= quantityFromThisLot;
      }
    }

    // Update holding
    const previousQuantity = holding.totalQuantity;
    holding.totalQuantity -= totalQuantitySold;
    
    if (holding.totalQuantity < 0.000001) {
      console.log(`    ✓ Holding depleted, removing from map`);
      this.holdings.delete(tokenMint);
    } else {
      const totalCost = holding.purchaseLots.reduce((sum, lot) => 
        sum + (lot.quantity * lot.costPerUnit), 0
      );
      holding.averageCostPerUnit = holding.totalQuantity > 0 ? totalCost / holding.totalQuantity : 0;
      
      console.log(`    ✓ Holding updated:`);
      console.log(`      Previous: ${previousQuantity.toFixed(6)} tokens`);
      console.log(`      Sold: ${totalQuantitySold.toFixed(6)} tokens`);
      console.log(`      Remaining: ${holding.totalQuantity.toFixed(6)} tokens`);
    }

    if (remainingQuantityToSell > 0.000001) {
      console.log(`    ⚠️  OVERSELL: Tried to sell ${swap.tokenAmount.toFixed(6)} but only had ${totalQuantitySold.toFixed(6)}`);
      console.log(`      Missing: ${remainingQuantityToSell.toFixed(6)} tokens`);
    }

    // Create closed trade
    if (totalQuantitySold > 0.000001) {
      const proceedsFromSoldPortion = (totalQuantitySold / swap.tokenAmount) * swap.solAmount;
      const realizedPnLInSol = proceedsFromSoldPortion - totalCostBasis;
      
      const closedTrade: ClosedTrade = {
        tokenMint: tokenMint,
        totalCostBasisInSol: totalCostBasis,
        totalProceedsInSol: proceedsFromSoldPortion,
        realizedPnLInSol: realizedPnLInSol,
        realizedPnLPercent: totalCostBasis > 0 ? (realizedPnLInSol / totalCostBasis) * 100 : Infinity,
        holdingDurationSeconds: swap.timestamp - buyTimestamp,
        buyTimestamp: buyTimestamp,
        sellTimestamp: swap.timestamp,
        quantity: totalQuantitySold
      };

      this.closedTrades.push(closedTrade);
      console.log(`    ✓ Created closed trade: ${realizedPnLInSol >= 0 ? '+' : ''}${realizedPnLInSol.toFixed(6)} SOL`);
    }
  }

  getClosedTradeStats(): {
    totalTrades: number;
    winners: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    averagePnL: number;
  } {
    const totalTrades = this.closedTrades.length;
    const winners = this.closedTrades.filter(trade => trade.realizedPnLInSol > 0).length;
    const losses = this.closedTrades.filter(trade => trade.realizedPnLInSol < 0).length;
    const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;
    const totalPnL = this.closedTrades.reduce((sum, trade) => sum + trade.realizedPnLInSol, 0);
    const averagePnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    return {
      totalTrades,
      winners,
      losses,
      winRate,
      totalPnL,
      averagePnL
    };
  }
} 
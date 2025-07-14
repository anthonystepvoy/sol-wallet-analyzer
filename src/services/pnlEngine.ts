import { Swap, Lot, Holding, ClosedTrade } from '../types';

export class PnLEngine {
  private holdings: Map<string, Holding> = new Map();
  private closedTrades: ClosedTrade[] = [];

  /**
   * Process all swaps using FIFO method to calculate realized PnL
   */
  processSwapsForPnL(swaps: Swap[]): {
    closedTrades: ClosedTrade[];
    openHoldings: Holding[];
  } {
    console.log('Processing swaps for PnL calculation using FIFO method...');
    
    // Reset state
    this.holdings.clear();
    this.closedTrades = [];

    // Sort swaps chronologically
    const sortedSwaps = [...swaps].sort((a, b) => a.timestamp - b.timestamp);

    for (const swap of sortedSwaps) {
      if (swap.direction === 'buy') {
        this.processBuy(swap);
      } else if (swap.direction === 'sell') {
        this.processSell(swap);
      }
    }

    // Convert holdings map to array
    const openHoldings = Array.from(this.holdings.values());

    console.log(`Processed ${this.closedTrades.length} closed trades`);
    console.log(`Remaining open holdings: ${openHoldings.length}`);

    return {
      closedTrades: this.closedTrades,
      openHoldings: openHoldings
    };
  }

  /**
   * Process a buy transaction
   */
  private processBuy(swap: Swap): void {
    const tokenMint = swap.tokenMint;
    
    // Create new lot
    const lot: Lot = {
      quantity: swap.tokenAmount,
      costPerUnit: swap.pricePerToken,
      timestamp: swap.timestamp,
      signature: swap.signature
    };

    // Get or create holding for this token
    let holding = this.holdings.get(tokenMint);
    if (!holding) {
      holding = {
        tokenMint: tokenMint,
        purchaseLots: [],
        totalQuantity: 0,
        averageCostPerUnit: 0
      };
      this.holdings.set(tokenMint, holding);
    }

    // Add lot to holding
    holding.purchaseLots.push(lot);
    holding.totalQuantity += lot.quantity;
    
    // Recalculate average cost per unit
    const totalCost = holding.purchaseLots.reduce((sum, lot) => 
      sum + (lot.quantity * lot.costPerUnit), 0
    );
    holding.averageCostPerUnit = totalCost / holding.totalQuantity;
  }

  /**
   * Process a sell transaction using FIFO method
   */
  private processSell(swap: Swap): void {
    const tokenMint = swap.tokenMint;
    const holding = this.holdings.get(tokenMint);
    
    if (!holding || holding.purchaseLots.length === 0) {
      console.warn(`Sell transaction for token ${tokenMint} but no holding found`);
      return;
    }

    let remainingQuantityToSell = swap.tokenAmount;
    let totalCostBasis = 0;
    let totalQuantitySold = 0;
    let buyTimestamp = 0;

    // Process lots in FIFO order
    while (remainingQuantityToSell > 0 && holding.purchaseLots.length > 0) {
      const lot = holding.purchaseLots[0];
      
      if (buyTimestamp === 0) {
        buyTimestamp = lot.timestamp;
      }

      const quantityFromThisLot = Math.min(remainingQuantityToSell, lot.quantity);
      const costBasisFromThisLot = quantityFromThisLot * lot.costPerUnit;
      
      totalCostBasis += costBasisFromThisLot;
      totalQuantitySold += quantityFromThisLot;
      remainingQuantityToSell -= quantityFromThisLot;

      if (quantityFromThisLot === lot.quantity) {
        // Consume entire lot
        holding.purchaseLots.shift();
      } else {
        // Partially consume lot
        lot.quantity -= quantityFromThisLot;
      }
    }

    // Update holding totals
    holding.totalQuantity -= totalQuantitySold;
    if (holding.totalQuantity > 0) {
      const totalCost = holding.purchaseLots.reduce((sum, lot) => 
        sum + (lot.quantity * lot.costPerUnit), 0
      );
      holding.averageCostPerUnit = totalCost / holding.totalQuantity;
    } else {
      holding.averageCostPerUnit = 0;
    }

    // Only create a closed trade if we actually found a corresponding buy lot.
    if (buyTimestamp > 0) {
      // Create closed trade record
      const realizedPnLInSol = swap.solAmount - totalCostBasis;
      const realizedPnLPercent = totalCostBasis > 0 ? (realizedPnLInSol / totalCostBasis) * 100 : Infinity;
      const holdingDurationSeconds = swap.timestamp - buyTimestamp;

      const closedTrade: ClosedTrade = {
        tokenMint: tokenMint,
        totalCostBasisInSol: totalCostBasis,
        totalProceedsInSol: swap.solAmount,
        realizedPnLInSol: realizedPnLInSol,
        realizedPnLPercent: realizedPnLPercent,
        holdingDurationSeconds: holdingDurationSeconds,
        buyTimestamp: buyTimestamp,
        sellTimestamp: swap.timestamp,
        quantity: totalQuantitySold
      };

      this.closedTrades.push(closedTrade);
    }

    // If the holding's quantity is now effectively zero, remove it from open holdings.
    // We use a small threshold to handle potential floating point inaccuracies.
    if (holding.totalQuantity < 0.000001) {
      this.holdings.delete(tokenMint);
    }
  }

  /**
   * Get summary statistics for closed trades
   */
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
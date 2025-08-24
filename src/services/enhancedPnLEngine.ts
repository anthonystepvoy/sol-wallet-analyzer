import { Swap, Lot, Holding, ClosedTrade } from '../types';

export interface PnLProcessingResult {
  closedTrades: ClosedTrade[];
  openHoldings: Holding[];
  processingSummary: {
    totalSwapsProcessed: number;
    validSwapsProcessed: number;
    oversellTradesCreated: number;
    zeroProfit: number;
    avgBuyPrice: number;
    avgSellPrice: number;
    netSOL: number;
    dataQualityScore: number;
  };
}

export class EnhancedPnLEngine {
  private holdings: Map<string, Holding> = new Map();
  private closedTrades: ClosedTrade[] = [];
  private oversellCount = 0;
  private zeroProfit = 0;
  private totalBuyVolume = 0;
  private totalSellVolume = 0;
  private buyCount = 0;
  private sellCount = 0;
  
  /**
   * Process swaps with enhanced accuracy and conservative handling
   */
  processSwapsForPnL(swaps: Swap[]): PnLProcessingResult {
    console.log('\n=== ENHANCED PNL PROCESSING ===');
    console.log(`Total swaps to process: ${swaps.length}`);
    
    // Reset state
    this.holdings.clear();
    this.closedTrades = [];
    this.oversellCount = 0;
    this.zeroProfit = 0;
    this.totalBuyVolume = 0;
    this.totalSellVolume = 0;
    this.buyCount = 0;
    this.sellCount = 0;
    
    // Pre-validate swaps
    const validSwaps = this.validateAndFilterSwaps(swaps);
    console.log(`Valid swaps after filtering: ${validSwaps.length}`);
    
    // Sort chronologically - CRITICAL for FIFO accuracy
    const sortedSwaps = [...validSwaps].sort((a, b) => a.timestamp - b.timestamp);
    
    // Process each swap with enhanced validation
    for (const swap of sortedSwaps) {
      this.processSwapWithValidation(swap);
    }
    
    // Post-process validation
    const openHoldings = this.validateAndCleanHoldings();
    
    // Calculate data quality metrics
    const dataQualityScore = this.calculateDataQualityScore(validSwaps.length, swaps.length);
    
    const processingSummary = {
      totalSwapsProcessed: swaps.length,
      validSwapsProcessed: validSwaps.length,
      oversellTradesCreated: this.oversellCount,
      zeroProfit: this.zeroProfit,
      avgBuyPrice: this.buyCount > 0 ? this.totalBuyVolume / this.buyCount : 0,
      avgSellPrice: this.sellCount > 0 ? this.totalSellVolume / this.sellCount : 0,
      netSOL: this.totalSellVolume - this.totalBuyVolume,
      dataQualityScore
    };
    
    console.log('\n=== ENHANCED PNL SUMMARY ===');
    console.log(`Data Quality Score: ${dataQualityScore.toFixed(1)}/100`);
    console.log(`Oversell Trades: ${this.oversellCount}`);
    console.log(`Zero-Profit Trades: ${this.zeroProfit}`);
    console.log(`Net SOL: ${processingSummary.netSOL.toFixed(6)}`);
    console.log(`Closed Trades: ${this.closedTrades.length}`);
    console.log(`Open Holdings: ${openHoldings.length}`);
    
    return {
      closedTrades: this.closedTrades,
      openHoldings,
      processingSummary
    };
  }
  
  /**
   * Validate and filter swaps for quality
   */
  private validateAndFilterSwaps(swaps: Swap[]): Swap[] {
    const validSwaps: Swap[] = [];
    
    for (const swap of swaps) {
      // Basic validation
      if (!swap.signature || !swap.tokenMint || !swap.timestamp) {
        console.log(`❌ Invalid swap: missing required fields`);
        continue;
      }
      
      if (swap.tokenAmount <= 0 || swap.solAmount <= 0) {
        console.log(`❌ Invalid swap: non-positive amounts`);
        continue;
      }
      
      if (swap.pricePerToken <= 0) {
        console.log(`❌ Invalid swap: non-positive price`);
        continue;
      }
      
      // Check for extreme values that might indicate data issues
      if (swap.pricePerToken > 1000) { // >1000 SOL per token
        console.log(`⚠️ Extreme price detected: ${swap.pricePerToken.toFixed(8)} SOL/token`);
      }
      
      if (swap.solAmount > 10000) { // >10000 SOL trade
        console.log(`⚠️ Very large trade detected: ${swap.solAmount.toFixed(2)} SOL`);
      }
      
      validSwaps.push(swap);
    }
    
    return validSwaps;
  }
  
  /**
   * Process a single swap with comprehensive validation
   */
  private processSwapWithValidation(swap: Swap): void {
    if (swap.direction === 'buy') {
      this.processBuyEnhanced(swap);
      this.buyCount++;
      this.totalBuyVolume += swap.solAmount;
    } else if (swap.direction === 'sell') {
      this.processSellEnhanced(swap);
      this.sellCount++;
      this.totalSellVolume += swap.solAmount;
    }
  }
  
  /**
   * Enhanced buy processing with validation
   */
  private processBuyEnhanced(swap: Swap): void {
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
    }
    
    holding.purchaseLots.push(lot);
    holding.totalQuantity += lot.quantity;
    
    // Recalculate weighted average cost
    const totalCost = holding.purchaseLots.reduce((sum, lot) => 
      sum + (lot.quantity * lot.costPerUnit), 0
    );
    holding.averageCostPerUnit = totalCost / holding.totalQuantity;
  }
  
  /**
   * Enhanced sell processing with conservative oversell handling
   */
  private processSellEnhanced(swap: Swap): void {
    const tokenMint = swap.tokenMint;
    const holding = this.holdings.get(tokenMint);
    
    if (!holding || holding.purchaseLots.length === 0) {
      // Conservative handling: Create zero-profit trade for missing buys
      this.handleMissingBuy(swap);
      return;
    }
    
    const availableQuantity = holding.totalQuantity;
    const requestedQuantity = swap.tokenAmount;
    
    if (requestedQuantity > availableQuantity * 1.001) { // 0.1% tolerance
      // Partial oversell - process what we can conservatively
      this.handlePartialOversell(swap, holding);
    } else {
      // Normal sell - process normally
      this.handleNormalSell(swap, holding);
    }
  }
  
  /**
   * Handle missing buy transactions (airdrops, incomplete data)
   */
  private handleMissingBuy(swap: Swap): void {
    console.log(`⚠️ Missing buy for ${swap.tokenMint.slice(0, 8)}... - treating as zero-cost`);
    
    const closedTrade: ClosedTrade = {
      tokenMint: swap.tokenMint,
      totalCostBasisInSol: 0,
      totalProceedsInSol: swap.solAmount,
      realizedPnLInSol: 0, // Conservative: no profit from missing data
      realizedPnLPercent: 0,
      holdingDurationSeconds: 0,
      buyTimestamp: swap.timestamp,
      sellTimestamp: swap.timestamp,
      quantity: swap.tokenAmount
    };
    
    this.closedTrades.push(closedTrade);
    this.zeroProfit++;
  }
  
  /**
   * Handle partial oversell situations
   */
  private handlePartialOversell(swap: Swap, holding: Holding): void {
    const availableQuantity = holding.totalQuantity;
    const requestedQuantity = swap.tokenAmount;
    const oversellQuantity = requestedQuantity - availableQuantity;
    
    console.log(`⚠️ Partial oversell for ${swap.tokenMint.slice(0, 8)}...`);
    console.log(`  Available: ${availableQuantity.toFixed(6)}`);
    console.log(`  Requested: ${requestedQuantity.toFixed(6)}`);
    console.log(`  Oversell: ${oversellQuantity.toFixed(6)}`);
    
    // Process the portion we can match
    if (availableQuantity > 0.000001) {
      const matchedPortion = availableQuantity / requestedQuantity;
      const matchedProceeds = swap.solAmount * matchedPortion;
      
      const matchedSwap: Swap = {
        ...swap,
        tokenAmount: availableQuantity,
        solAmount: matchedProceeds,
        pricePerToken: matchedProceeds / availableQuantity
      };
      
      this.handleNormalSell(matchedSwap, holding);
    }
    
    // Handle the oversell portion conservatively
    const oversellPortion = oversellQuantity / requestedQuantity;
    const oversellProceeds = swap.solAmount * oversellPortion;
    
    const oversellTrade: ClosedTrade = {
      tokenMint: swap.tokenMint,
      totalCostBasisInSol: 0,
      totalProceedsInSol: oversellProceeds,
      realizedPnLInSol: 0, // Conservative: no profit from oversell
      realizedPnLPercent: 0,
      holdingDurationSeconds: 0,
      buyTimestamp: swap.timestamp,
      sellTimestamp: swap.timestamp,
      quantity: oversellQuantity
    };
    
    this.closedTrades.push(oversellTrade);
    this.oversellCount++;
  }
  
  /**
   * Handle normal sell transactions
   */
  private handleNormalSell(swap: Swap, holding: Holding): void {
    let remainingQuantityToSell = swap.tokenAmount;
    let totalCostBasis = 0;
    let totalQuantitySold = 0;
    let buyTimestamp = 0;
    
    // FIFO processing
    while (remainingQuantityToSell > 0.000001 && holding.purchaseLots.length > 0) {
      const lot = holding.purchaseLots[0];
      
      if (buyTimestamp === 0) {
        buyTimestamp = lot.timestamp;
      }
      
      const quantityFromThisLot = Math.min(remainingQuantityToSell, lot.quantity);
      const costBasisFromThisLot = quantityFromThisLot * lot.costPerUnit;
      
      totalCostBasis += costBasisFromThisLot;
      totalQuantitySold += quantityFromThisLot;
      remainingQuantityToSell -= quantityFromThisLot;
      
      if (quantityFromThisLot >= lot.quantity - 0.000001) {
        holding.purchaseLots.shift();
      } else {
        lot.quantity -= quantityFromThisLot;
      }
    }
    
    // Update holding
    holding.totalQuantity -= totalQuantitySold;
    
    if (holding.totalQuantity < 0.000001) {
      this.holdings.delete(swap.tokenMint);
    } else {
      const totalCost = holding.purchaseLots.reduce((sum, lot) => 
        sum + (lot.quantity * lot.costPerUnit), 0
      );
      holding.averageCostPerUnit = holding.totalQuantity > 0 ? totalCost / holding.totalQuantity : 0;
    }
    
    // Create closed trade
    const realizedPnLInSol = swap.solAmount - totalCostBasis;
    
    const closedTrade: ClosedTrade = {
      tokenMint: swap.tokenMint,
      totalCostBasisInSol: totalCostBasis,
      totalProceedsInSol: swap.solAmount,
      realizedPnLInSol: realizedPnLInSol,
      realizedPnLPercent: totalCostBasis > 0 ? (realizedPnLInSol / totalCostBasis) * 100 : 0,
      holdingDurationSeconds: swap.timestamp - buyTimestamp,
      buyTimestamp: buyTimestamp,
      sellTimestamp: swap.timestamp,
      quantity: totalQuantitySold
    };
    
    this.closedTrades.push(closedTrade);
  }
  
  /**
   * Validate and clean holdings
   */
  private validateAndCleanHoldings(): Holding[] {
    const openHoldings: Holding[] = [];
    
    for (const holding of this.holdings.values()) {
      if (holding.totalQuantity > 0.000001) {
        // Validate holding consistency
        const calculatedQuantity = holding.purchaseLots.reduce((sum, lot) => sum + lot.quantity, 0);
        if (Math.abs(calculatedQuantity - holding.totalQuantity) > 0.000001) {
          console.log(`⚠️ Holding quantity mismatch for ${holding.tokenMint.slice(0, 8)}...`);
          console.log(`  Calculated: ${calculatedQuantity.toFixed(6)}`);
          console.log(`  Stored: ${holding.totalQuantity.toFixed(6)}`);
          
          // Fix the discrepancy
          holding.totalQuantity = calculatedQuantity;
        }
        
        // Validate average cost
        if (holding.purchaseLots.length > 0) {
          const totalCost = holding.purchaseLots.reduce((sum, lot) => 
            sum + (lot.quantity * lot.costPerUnit), 0
          );
          const correctAverageCost = totalCost / holding.totalQuantity;
          
          if (Math.abs(correctAverageCost - holding.averageCostPerUnit) > 0.00000001) {
            console.log(`⚠️ Average cost mismatch for ${holding.tokenMint.slice(0, 8)}...`);
            holding.averageCostPerUnit = correctAverageCost;
          }
        }
        
        openHoldings.push(holding);
      }
    }
    
    return openHoldings;
  }
  
  /**
   * Calculate data quality score
   */
  private calculateDataQualityScore(validSwaps: number, totalSwaps: number): number {
    let score = 100;
    
    // Deduct for filtered swaps
    const filteredRatio = (totalSwaps - validSwaps) / totalSwaps;
    score -= filteredRatio * 20;
    
    // Deduct for oversells
    const oversellRatio = this.oversellCount / this.closedTrades.length;
    score -= oversellRatio * 30;
    
    // Deduct for zero-profit trades (missing data)
    const zeroProfitRatio = this.zeroProfit / this.closedTrades.length;
    score -= zeroProfitRatio * 25;
    
    // Bonus for having realistic trade patterns
    if (this.buyCount > 0 && this.sellCount > 0) {
      const buySellRatio = Math.min(this.buyCount, this.sellCount) / Math.max(this.buyCount, this.sellCount);
      score += buySellRatio * 10; // Bonus for balanced trading
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Get comprehensive statistics
   */
  getEnhancedStats(): {
    totalTrades: number;
    winners: number;
    losses: number;
    winRate: number;
    totalPnL: number;
    averagePnL: number;
    oversellCount: number;
    dataQualityScore: number;
  } {
    const totalTrades = this.closedTrades.length;
    const winners = this.closedTrades.filter(trade => trade.realizedPnLInSol > 0).length;
    const losses = this.closedTrades.filter(trade => trade.realizedPnLInSol < 0).length;
    const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;
    const totalPnL = this.closedTrades.reduce((sum, trade) => sum + trade.realizedPnLInSol, 0);
    const averagePnL = totalTrades > 0 ? totalPnL / totalTrades : 0;
    const dataQualityScore = this.calculateDataQualityScore(totalTrades, totalTrades);
    
    return {
      totalTrades,
      winners,
      losses,
      winRate,
      totalPnL,
      averagePnL,
      oversellCount: this.oversellCount,
      dataQualityScore
    };
  }
}
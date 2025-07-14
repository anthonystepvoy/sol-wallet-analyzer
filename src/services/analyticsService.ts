import { 
  Swap, 
  ClosedTrade, 
  Holding, 
  TokenPrice, 
  WalletAnalysis 
} from '../types';
import { PriceService } from './priceService';

export class AnalyticsService {
  private priceService: PriceService;

  constructor(priceService: PriceService) {
    this.priceService = priceService;
  }

  /**
   * Calculate all analytics for the wallet analysis
   */
  async calculateWalletAnalysis(
    swaps: Swap[],
    closedTrades: ClosedTrade[],
    openHoldings: Holding[]
  ): Promise<WalletAnalysis> {
    // Only filter out dust, not USDC
    const filteredOpenHoldings = openHoldings.filter(
      h => h.totalQuantity > 0.00001
    );

    const highLevelStats = this.calculateHighLevelStats(closedTrades, filteredOpenHoldings);
    const holdingsValue = await this.calculateHoldingsValue(filteredOpenHoldings);
    const pnlMetrics = this.calculatePnLMetrics(closedTrades);
    const tradingMetrics = this.calculateTradingMetrics(swaps, closedTrades);
    const capitalFlow = this.calculateCapitalFlow(closedTrades);
    const feeAnalysis = this.calculateFeeAnalysis(swaps);
    const pnlDistribution = this.calculatePnLDistribution(closedTrades);
    const holdingDurationDistribution = this.calculateHoldingDurationDistribution(closedTrades);

    return {
      ...highLevelStats,
      ...holdingsValue,
      ...pnlMetrics,
      ...tradingMetrics,
      ...capitalFlow,
      ...feeAnalysis,
      pnlDistribution,
      holdingDurationDistribution,
      closedTrades,
      openHoldings: filteredOpenHoldings,
      allSwaps: swaps
    };
  }

  /**
   * Calculate high-level statistics
   */
  private calculateHighLevelStats(closedTrades: ClosedTrade[], openHoldings: Holding[]) {
    // Filter out USDC from open holdings
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const nonUsdcHoldings = openHoldings.filter(holding => holding.tokenMint !== usdcMint);

    const uniqueTokensTraded = new Set([
      ...closedTrades.map(trade => trade.tokenMint),
      ...nonUsdcHoldings.map(holding => holding.tokenMint)
    ]).size;

    // Trade-level statistics (current approach)
    const winners = closedTrades.filter(trade => trade.realizedPnLInSol > 0).length;
    const losses = closedTrades.filter(trade => trade.realizedPnLInSol < 0).length;
    const winRate = closedTrades.length > 0 ? (winners / closedTrades.length) * 100 : 0;
    const openTrades = nonUsdcHoldings.length; // Exclude USDC from open trades count

    // Token-level statistics (bot's approach)
    const tokenPnlSummary = new Map<string, { totalPnl: number }>();
    
    // Aggregate PnL by token
    for (const trade of closedTrades) {
      const existing = tokenPnlSummary.get(trade.tokenMint);
      if (existing) {
        existing.totalPnl += trade.realizedPnLInSol;
      } else {
        tokenPnlSummary.set(trade.tokenMint, { totalPnl: trade.realizedPnLInSol });
      }
    }

    // Count token-level winners and losers
    let tokenWinners = 0;
    let tokenLosers = 0;
    for (const summary of tokenPnlSummary.values()) {
      if (summary.totalPnl > 0) {
        tokenWinners++;
      } else if (summary.totalPnl < 0) {
        tokenLosers++;
      }
    }

    return {
      uniqueTokensTraded,
      winners,
      losses,
      winRate,
      openTrades,
      tokenWinners,
      tokenLosers
    };
  }

  /**
   * Calculate current holdings value
   */
  private async calculateHoldingsValue(openHoldings: Holding[]) {
    // Filter out USDC from holdings calculation
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const nonUsdcHoldings = openHoldings.filter(holding => holding.tokenMint !== usdcMint);

    if (nonUsdcHoldings.length === 0) {
      return {
        tokenHoldingsInSol: 0,
        tokenHoldingsInUsd: 0
      };
    }

    const tokenMints = nonUsdcHoldings.map(holding => holding.tokenMint);
    const tokenPrices = await this.priceService.getComprehensivePrices(tokenMints);
    
    let totalHoldingsInSol = 0;
    let totalHoldingsInUsd = 0;
    let tokensWithPrices = 0;
    let tokensWithoutPrices = 0;

    console.log(`Calculating holdings value for ${nonUsdcHoldings.length} tokens (excluding USDC)...`);
    console.log(`Received price data for ${tokenPrices.length} tokens`);

    for (const holding of nonUsdcHoldings) {
      const price = tokenPrices.find(p => p.mint === holding.tokenMint);
      if (price && price.priceInUsd > 0) {
        const holdingValueInSol = holding.totalQuantity * price.priceInSol;
        const holdingValueInUsd = holding.totalQuantity * price.priceInUsd;
        
        totalHoldingsInSol += holdingValueInSol;
        totalHoldingsInUsd += holdingValueInUsd;
        tokensWithPrices++;
        
        console.log(`Token ${holding.tokenMint.slice(0, 8)}...: ${holding.totalQuantity} tokens @ $${price.priceInUsd} = $${holdingValueInUsd.toFixed(2)}`);
      } else {
        tokensWithoutPrices++;
        console.log(`No price data for token ${holding.tokenMint.slice(0, 8)}... (${holding.totalQuantity} tokens)`);
      }
    }

    console.log(`Holdings calculation: ${tokensWithPrices} tokens with prices, ${tokensWithoutPrices} without prices`);
    console.log(`Total holdings (excluding USDC): ${totalHoldingsInSol.toFixed(4)} SOL, $${totalHoldingsInUsd.toFixed(2)} USD`);

    return {
      tokenHoldingsInSol: totalHoldingsInSol,
      tokenHoldingsInUsd: totalHoldingsInUsd
    };
  }

  /**
   * Calculate PnL metrics
   */
  private calculatePnLMetrics(closedTrades: ClosedTrade[]) {
    const totalRealizedPnLInSol = closedTrades.reduce((sum, trade) => 
      sum + trade.realizedPnLInSol, 0
    );
    
    const totalRealizedPnLInUsd = closedTrades.reduce((sum, trade) => 
      sum + (trade.realizedPnLInSol * 100), 0 // Using approximate SOL/USD rate
    );
    
    const averagePnLInSol = closedTrades.length > 0 ? 
      totalRealizedPnLInSol / closedTrades.length : 0;
    
    const averagePnLPercent = closedTrades.length > 0 ? 
      closedTrades.reduce((sum, trade) => sum + trade.realizedPnLPercent, 0) / closedTrades.length : 0;
    
    const pnlRatio = closedTrades.length > 0 ? 
      closedTrades.filter(trade => trade.realizedPnLInSol > 0).length / closedTrades.length : 0;

    return {
      totalRealizedPnLInSol,
      totalRealizedPnLInUsd,
      averagePnLInSol,
      averagePnLPercent,
      pnlRatio
    };
  }

  /**
   * Calculate trading metrics
   */
  private calculateTradingMetrics(swaps: Swap[], closedTrades: ClosedTrade[]) {
    const totalTrades = closedTrades.length;
    const averageTradingSizeInSol = swaps.length > 0 ? 
      swaps.reduce((sum, swap) => sum + swap.solAmount, 0) / swaps.length : 0;
    const sumOfPnLInSol = closedTrades.reduce((sum, trade) => 
      sum + trade.realizedPnLInSol, 0
    );

    return {
      totalTrades,
      averageTradingSizeInSol,
      sumOfPnLInSol
    };
  }

  /**
   * Calculate capital flow metrics
   */
  private calculateCapitalFlow(closedTrades: ClosedTrade[]) {
    const solSpentBuyingTokens = closedTrades.reduce((sum, trade) => 
      sum + trade.totalCostBasisInSol, 0
    );
    
    const solReceivedSellingTokens = closedTrades.reduce((sum, trade) => 
      sum + trade.totalProceedsInSol, 0
    );

    return {
      solSpentBuyingTokens,
      solReceivedSellingTokens
    };
  }

  /**
   * Calculate fee analysis
   */
  private calculateFeeAnalysis(swaps: Swap[]) {
    const totalSpentOnFees = swaps.reduce((sum, swap) => sum + swap.fee, 0);
    const averageFeePerTrade = swaps.length > 0 ? totalSpentOnFees / swaps.length : 0;

    return {
      totalSpentOnFees,
      averageFeePerTrade
    };
  }

  /**
   * Calculate PnL distribution percentiles
   */
  private calculatePnLDistribution(closedTrades: ClosedTrade[]) {
    const pnlValues = closedTrades.map(trade => trade.realizedPnLInSol).sort((a, b) => a - b);
    
    return this.calculatePercentiles(pnlValues);
  }

  /**
   * Calculate holding duration distribution percentiles
   */
  private calculateHoldingDurationDistribution(closedTrades: ClosedTrade[]) {
    const durationValues = closedTrades.map(trade => trade.holdingDurationSeconds).sort((a, b) => a - b);
    
    return this.calculatePercentiles(durationValues);
  }

  /**
   * Calculate percentiles for a sorted array of values
   */
  private calculatePercentiles(sortedValues: number[]) {
    if (sortedValues.length === 0) {
      return {
        min: 0,
        max: 0,
        p10: 0,
        p25: 0,
        p50: 0,
        p75: 0,
        p90: 0
      };
    }

    const getPercentile = (percentile: number) => {
      const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
      return sortedValues[index] || 0;
    };

    return {
      min: sortedValues[0],
      max: sortedValues[sortedValues.length - 1],
      p10: getPercentile(10),
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p90: getPercentile(90)
    };
  }
} 
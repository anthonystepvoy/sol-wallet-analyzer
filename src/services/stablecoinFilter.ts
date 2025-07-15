import { Swap, ClosedTrade, Holding } from '../types';

// Known stablecoin mints on Solana
const STABLECOIN_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT  
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAI
  'So11111111111111111111111111111111111111112',   // WSOL (wrapped SOL)
  // Add more stablecoins as needed
]);

export interface FilteredAnalysis {
  all: {
    swaps: Swap[];
    closedTrades: ClosedTrade[];
    openHoldings: Holding[];
    stats: {
      totalSwaps: number;
      totalPnL: number;
      winRate: number;
      uniqueTokens: number;
    };
  };
  speculativeOnly: {
    swaps: Swap[];
    closedTrades: ClosedTrade[];
    openHoldings: Holding[];
    stats: {
      totalSwaps: number;
      totalPnL: number;
      winRate: number;
      uniqueTokens: number;
    };
  };
  stablecoinOnly: {
    swaps: Swap[];
    stats: {
      totalSwaps: number;
      totalVolume: number;
      totalFees: number;
    };
  };
}

export class StablecoinFilter {
  /**
   * Check if a token mint is a stablecoin
   */
  static isStablecoin(tokenMint: string): boolean {
    return STABLECOIN_MINTS.has(tokenMint);
  }

  /**
   * Check if a swap involves stablecoins
   */
  static isStablecoinSwap(swap: Swap): boolean {
    return this.isStablecoin(swap.tokenMint);
  }

  /**
   * Filter swaps and trades into speculative vs stablecoin categories
   */
  static filterAnalysis(
    swaps: Swap[],
    closedTrades: ClosedTrade[],
    openHoldings: Holding[]
  ): FilteredAnalysis {
    // Separate swaps
    const speculativeSwaps = swaps.filter(swap => !this.isStablecoinSwap(swap));
    const stablecoinSwaps = swaps.filter(swap => this.isStablecoinSwap(swap));

    // Separate closed trades
    const speculativeTrades = closedTrades.filter(trade => !this.isStablecoin(trade.tokenMint));
    const stablecoinTrades = closedTrades.filter(trade => this.isStablecoin(trade.tokenMint));

    // Separate open holdings
    const speculativeHoldings = openHoldings.filter(holding => !this.isStablecoin(holding.tokenMint));
    const stablecoinHoldings = openHoldings.filter(holding => this.isStablecoin(holding.tokenMint));

    // Calculate stats for speculative trades
    const speculativeStats = this.calculateStats(speculativeSwaps, speculativeTrades);
    const allStats = this.calculateStats(swaps, closedTrades);
    const stablecoinStats = this.calculateStablecoinStats(stablecoinSwaps);

    return {
      all: {
        swaps,
        closedTrades,
        openHoldings,
        stats: allStats
      },
      speculativeOnly: {
        swaps: speculativeSwaps,
        closedTrades: speculativeTrades,
        openHoldings: speculativeHoldings,
        stats: speculativeStats
      },
      stablecoinOnly: {
        swaps: stablecoinSwaps,
        stats: stablecoinStats
      }
    };
  }

  /**
   * Calculate trading statistics
   */
  private static calculateStats(swaps: Swap[], closedTrades: ClosedTrade[]) {
    const uniqueTokens = new Set(swaps.map(swap => swap.tokenMint)).size;
    const totalPnL = closedTrades.reduce((sum, trade) => sum + trade.realizedPnLInSol, 0);
    const winners = closedTrades.filter(trade => trade.realizedPnLInSol > 0).length;
    const winRate = closedTrades.length > 0 ? (winners / closedTrades.length) * 100 : 0;

    return {
      totalSwaps: swaps.length,
      totalPnL,
      winRate,
      uniqueTokens
    };
  }

  /**
   * Calculate stablecoin-specific statistics
   */
  private static calculateStablecoinStats(stablecoinSwaps: Swap[]) {
    const totalVolume = stablecoinSwaps.reduce((sum, swap) => sum + swap.solAmount, 0);
    const totalFees = stablecoinSwaps.length * 0.0005; // Approximate fee

    return {
      totalSwaps: stablecoinSwaps.length,
      totalVolume,
      totalFees
    };
  }

  /**
   * Generate filtered report
   */
  static generateFilteredReport(filtered: FilteredAnalysis, walletAddress: string, daysBack: number): string {
    const { all, speculativeOnly, stablecoinOnly } = filtered;

    return `
============================================================
📊 FILTERED ANALYSIS REPORT (Last ${daysBack} Days)
============================================================

💼 Wallet: ${walletAddress}

🎯 SPECULATIVE TRADING PERFORMANCE (Meme Tokens Only)
${'-'.repeat(55)}
• Total Speculative Swaps: ${speculativeOnly.stats.totalSwaps}
• Closed Speculative Trades: ${speculativeOnly.closedTrades.length}
• Unique Speculative Tokens: ${speculativeOnly.stats.uniqueTokens}
• Speculative Win Rate: ${speculativeOnly.stats.winRate.toFixed(2)}%
• Speculative PnL: ${speculativeOnly.stats.totalPnL.toFixed(4)} SOL
• Open Speculative Positions: ${speculativeOnly.openHoldings.length}

💰 PORTFOLIO MANAGEMENT (Stablecoins & WSOL)
${'-'.repeat(45)}
• Stablecoin Swaps: ${stablecoinOnly.stats.totalSwaps}
• Stablecoin Volume: ${stablecoinOnly.stats.totalVolume.toFixed(4)} SOL
• Estimated Stablecoin Fees: ${stablecoinOnly.stats.totalFees.toFixed(4)} SOL

📊 COMPLETE WALLET ACTIVITY (All Transactions)
${'-'.repeat(48)}
• Total Swaps: ${all.stats.totalSwaps}
• Total Closed Trades: ${all.closedTrades.length}
• Total Unique Tokens: ${all.stats.uniqueTokens}
• Overall Win Rate: ${all.stats.winRate.toFixed(2)}%
• Total PnL: ${all.stats.totalPnL.toFixed(4)} SOL
• Total Open Positions: ${all.openHoldings.length}

🔍 ANALYSIS INSIGHTS
${'-'.repeat(20)}
• Speculative vs Total Swaps: ${speculativeOnly.stats.totalSwaps}/${all.stats.totalSwaps}
• Pure Trading Focus: ${((speculativeOnly.stats.totalSwaps / all.stats.totalSwaps) * 100).toFixed(1)}% speculative
• Portfolio Management: ${((stablecoinOnly.stats.totalSwaps / all.stats.totalSwaps) * 100).toFixed(1)}% stablecoin/WSOL

💡 RECOMMENDATION FOR BOT COMPARISON:
${'-'.repeat(35)}
When comparing with bots, use SPECULATIVE metrics:
• Trades: ${speculativeOnly.stats.totalSwaps} (not ${all.stats.totalSwaps})
• Win Rate: ${speculativeOnly.stats.winRate.toFixed(2)}% (not ${all.stats.winRate.toFixed(2)}%)
• PnL: ${speculativeOnly.stats.totalPnL.toFixed(4)} SOL (not ${all.stats.totalPnL.toFixed(4)} SOL)
• Tokens: ${speculativeOnly.stats.uniqueTokens} (not ${all.stats.uniqueTokens})

============================================================
`;
  }

  /**
   * Get speculative tokens summary
   */
  static getSpeculativeTokensSummary(filtered: FilteredAnalysis): string {
    const { speculativeOnly } = filtered;
    
    // Group by token mint and calculate totals
    const tokenSummary: Record<string, { totalPnL: number, trades: number }> = {};
    
    speculativeOnly.closedTrades.forEach(trade => {
      const mint = trade.tokenMint.slice(0, 8) + '...';
      if (!tokenSummary[mint]) {
        tokenSummary[mint] = { totalPnL: 0, trades: 0 };
      }
      tokenSummary[mint].totalPnL += trade.realizedPnLInSol;
      tokenSummary[mint].trades += 1;
    });

    // Sort by PnL
    const sortedTokens = Object.entries(tokenSummary)
      .sort(([,a], [,b]) => b.totalPnL - a.totalPnL);

    const winners = sortedTokens.filter(([,data]) => data.totalPnL > 0);
    const losers = sortedTokens.filter(([,data]) => data.totalPnL <= 0);

    let summary = '\n🎯 SPECULATIVE TOKEN PERFORMANCE\n';
    summary += '='.repeat(35) + '\n\n';

    if (winners.length > 0) {
      summary += `🟢 Profitable Speculative Tokens (${winners.length}):\n`;
      winners.slice(0, 10).forEach(([mint, data]) => {
        summary += ` • ${mint}   PnL: ${data.totalPnL > 0 ? '+' : ''}${data.totalPnL.toFixed(4)} SOL (${data.trades} trades)\n`;
      });
    }

    if (losers.length > 0) {
      summary += `\n🔴 Unprofitable Speculative Tokens (${losers.length}):\n`;
      losers.slice(0, 10).forEach(([mint, data]) => {
        summary += ` • ${mint}   PnL: ${data.totalPnL.toFixed(4)} SOL (${data.trades} trades)\n`;
      });
    }

    return summary;
  }
}
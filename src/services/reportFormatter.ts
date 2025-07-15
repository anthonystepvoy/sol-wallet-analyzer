import { WalletAnalysis } from '../types';
import { ConfidenceScore } from './confidenceScorer';

export class ReportFormatter {
  /**
   * Format wallet analysis into a human-readable report
   */
  formatWalletAnalysis(analysis: WalletAnalysis, walletAddress: string, daysBack: number, confidenceScore?: ConfidenceScore): string {
    const report = [
      this.formatHeader(walletAddress, daysBack),
      this.formatTradingPlatforms(analysis),
      this.formatHighLevelStats(analysis), // This will still show trade-level stats, which is fine
      this.formatHoldings(analysis),
      this.formatPnLMetrics(analysis),
      this.formatTradingMetrics(analysis),
      this.formatCapitalFlow(analysis),
      this.formatDistributions(analysis),
      this.formatFeeAnalysis(analysis),
      confidenceScore ? this.formatConfidenceScore(confidenceScore) : '',
      this.formatDetailedTrades(analysis),
      '='.repeat(60), // Add a separator
      this.formatTokenPnlSummary(analysis) // Add the new summary section
    ].filter(section => section.length > 0).join('\n\n');

    return report;
  }

  private formatHeader(walletAddress: string, daysBack: number): string {
    return `📊 Last ${daysBack} Days Performance 📊

💼 Wallet: ${walletAddress}`;
  }

  private formatTradingPlatforms(analysis: WalletAnalysis): string {
    const platforms = new Set(analysis.allSwaps.map(swap => swap.platform));
    const platformList = Array.from(platforms).join(', ');
    return `🔍 Trades on: ${platformList}`;
  }

  private formatHighLevelStats(analysis: WalletAnalysis): string {
    return `Unique Tokens Traded: ${analysis.uniqueTokensTraded}
🟢 Winners: ${analysis.winners} (${analysis.tokenWinners} tokens)
🔴 Losses: ${analysis.losses} (${analysis.tokenLosers} tokens)
💯 Win Rate: ${analysis.winRate.toFixed(2)}%

🟡 Open Trades: ${analysis.openTrades}`;
  }

  private formatHoldings(analysis: WalletAnalysis): string {
    return `💰 Token Holdings: ${analysis.tokenHoldingsInSol.toFixed(4)} SOL ($${analysis.tokenHoldingsInUsd.toFixed(2)} USD)`;
  }

  private formatPnLMetrics(analysis: WalletAnalysis): string {
    const pnlValues = analysis.closedTrades.map(trade => trade.realizedPnLInSol).sort((a, b) => a - b);
    const pnlPercentValues = analysis.closedTrades.map(trade => trade.realizedPnLPercent).sort((a, b) => a - b);

    const getPercentile = (sortedValues: number[], percentile: number) => {
        if (sortedValues.length === 0) return 0;
        const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
        return sortedValues[index] || 0;
    };

    return `📈 Distribution of Trades PnL in percentiles:
Min: ${getPercentile(pnlValues, 0).toFixed(4)} SOL | ${getPercentile(pnlPercentValues, 0).toFixed(2)}% - Worst trade! 🚨
10th: ${getPercentile(pnlValues, 10).toFixed(4)} SOL | ${getPercentile(pnlPercentValues, 10).toFixed(2)}%
25th: ${getPercentile(pnlValues, 25).toFixed(4)} SOL | ${getPercentile(pnlPercentValues, 25).toFixed(2)}%
50th: ${getPercentile(pnlValues, 50).toFixed(4)} SOL | ${getPercentile(pnlPercentValues, 50).toFixed(2)}%
75th: ${getPercentile(pnlValues, 75).toFixed(4)} SOL | ${getPercentile(pnlPercentValues, 75).toFixed(2)}%
90th: ${getPercentile(pnlValues, 90).toFixed(4)} SOL | ${getPercentile(pnlPercentValues, 90).toFixed(2)}%
Max: ${getPercentile(pnlValues, 100).toFixed(4)} SOL | ${getPercentile(pnlPercentValues, 100).toFixed(2)}% - Best trade! 🔥
ℹ️ e.g. 25th means 25% of the trades performed worse than that and 75% performed better`;
  }

  private formatTradingMetrics(analysis: WalletAnalysis): string {
    return `🪙 Average PnL: ${analysis.averagePnLInSol.toFixed(2)} SOL | ${analysis.averagePnLPercent.toFixed(0)}%
⚖️ Average Trading Size (A): ${analysis.averageTradingSizeInSol.toFixed(4)} SOL
💰 Sum of PnL (B): ${analysis.sumOfPnLInSol.toFixed(2)} SOL
💎 PnL Ratio (B/A): ${(analysis.sumOfPnLInSol / analysis.averageTradingSizeInSol * 100).toFixed(0)}%`;
  }

  private formatCapitalFlow(analysis: WalletAnalysis): string {
    const solSpent = analysis.solSpentBuyingTokens;
    const solReceived = analysis.solReceivedSellingTokens;
    const tokenHoldings = analysis.tokenHoldingsInSol;
    
    // CRITICAL: The reference bot appears to include current token holdings
    // in their Net SOL calculation, not just realized trades
    const netSolRealized = solReceived - solSpent;
    const netSolTotal = netSolRealized + tokenHoldings;
    
    return `📤 Sol Spent Buying Tokens (C): ${solSpent.toFixed(2)}
📥 Sol Received Selling Tokens (D): ${solReceived.toFixed(2)}
💎 Current Token Holdings: ${tokenHoldings.toFixed(2)} SOL
📊 Net Sol (Realized): ${netSolRealized.toFixed(2)}
📊 Net Sol (Total): ${netSolTotal.toFixed(2)}`;
  }

  private formatFeeAnalysis(analysis: WalletAnalysis): string {
    return `💸 Total Spent on Fees: ${analysis.totalSpentOnFees.toFixed(4)} SOL
📌 Avg. Fee per Trade: ${analysis.averageFeePerTrade.toFixed(6)} SOL`;
  }

  private formatDistributions(analysis: WalletAnalysis): string {
    const duration = analysis.holdingDurationDistribution;

    const formatDuration = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h`;
      return `${Math.floor(seconds / 60)}m`;
    };

    const avgDurationMinutes = analysis.closedTrades.length > 0 ? 
      analysis.closedTrades.reduce((sum, trade) => sum + trade.holdingDurationSeconds, 0) / analysis.closedTrades.length / 60 : 0;

    return `⏳ Distribution of Deltas in percentiles:
Min: ${formatDuration(duration.min)}
10th: ${formatDuration(duration.p10)}
25th: ${formatDuration(duration.p25)}
50th: ${formatDuration(duration.p50)}
75th: ${formatDuration(duration.p75)}
Max: ${formatDuration(duration.max)}
ℹ️ Delta is the time between buying and selling a token

⏱️ Average Trading Time: ${avgDurationMinutes.toFixed(1)} minutes
🔁 Trades per Token: ${(analysis.totalTrades / analysis.uniqueTokensTraded).toFixed(2)} on average`;
  }

  private formatDetailedTrades(analysis: WalletAnalysis): string {
    if (analysis.closedTrades.length === 0) {
      return `📋 DETAILED TRADES
No closed trades found in the analysis period.`;
    }

    const topTrades = analysis.closedTrades
      .sort((a, b) => Math.abs(b.realizedPnLInSol) - Math.abs(a.realizedPnLInSol))
      .slice(0, 10);

    const formatDuration = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h`;
      return `${Math.floor(seconds / 60)}m`;
    };

    const tradeDetails = topTrades.map((trade, index) => {
      const pnlColor = trade.realizedPnLInSol >= 0 ? '🟢' : '🔴';
      return `${index + 1}. ${pnlColor} ${trade.tokenMint.slice(0, 8)}...
   PnL: ${trade.realizedPnLInSol.toFixed(4)} SOL (${trade.realizedPnLPercent.toFixed(2)}%)
   Duration: ${formatDuration(trade.holdingDurationSeconds)}
   Quantity: ${trade.quantity.toFixed(2)}`;
    }).join('\n');

    // Only show open positions with a non-zero balance (dust filtered in analyticsService)
    const filteredOpenHoldings = analysis.openHoldings;

    return `📋 TOP 10 TRADES BY ABSOLUTE PnL

${tradeDetails}

${filteredOpenHoldings.length > 0 ? `\n🔵 OPEN POSITIONS (${filteredOpenHoldings.length}):
${filteredOpenHoldings.map(holding => 
  `• ${holding.tokenMint.slice(0, 8)}... - ${holding.totalQuantity.toFixed(2)} tokens (avg cost: ${holding.averageCostPerUnit.toFixed(6)} SOL)`
).join('\n')}` : ''}`;
  }

  private formatConfidenceScore(confidenceScore: ConfidenceScore): string {
    const getScoreColor = (score: number) => {
      if (score >= 85) return '🟢';
      if (score >= 70) return '🟡';
      if (score >= 55) return '🟠';
      return '🔴';
    };

    const getScoreEmoji = (score: number) => {
      if (score >= 85) return '✅';
      if (score >= 70) return '⚠️';
      return '❌';
    };

    let report = `🎯 CONFIDENCE ASSESSMENT
${getScoreColor(confidenceScore.overall)} Overall Confidence: ${confidenceScore.overall}% ${getScoreEmoji(confidenceScore.overall)}

📊 Score Breakdown:
• Data Quality: ${confidenceScore.breakdown.dataQuality}%
• Calculation Logic: ${confidenceScore.breakdown.calculationLogic}%
• Reasonableness: ${confidenceScore.breakdown.reasonableness}%
• Consistency: ${confidenceScore.breakdown.consistency}%`;

    if (confidenceScore.warnings.length > 0) {
      report += `\n\n⚠️ Warnings:`;
      confidenceScore.warnings.forEach(warning => {
        report += `\n• ${warning}`;
      });
    }

    if (confidenceScore.recommendations.length > 0) {
      report += `\n\n💡 Recommendations:`;
      confidenceScore.recommendations.forEach(rec => {
        report += `\n• ${rec}`;
      });
    }

    return report;
  }

  private formatTokenPnlSummary(analysis: WalletAnalysis): string {
    const tokenPnlSummary = new Map<string, { totalPnl: number }>();

    for (const trade of analysis.closedTrades) {
      const summary = tokenPnlSummary.get(trade.tokenMint) || { totalPnl: 0 };
      summary.totalPnl += trade.realizedPnLInSol;
      tokenPnlSummary.set(trade.tokenMint, summary);
    }

    const winners: string[] = [];
    const losers: string[] = [];

    for (const [mint, summary] of tokenPnlSummary.entries()) {
      if (summary.totalPnl > 0) {
        winners.push(` • ${mint.slice(0, 8)}...   Total PnL: +${summary.totalPnl.toFixed(2)} SOL`);
      } else if (summary.totalPnl < 0) {
        losers.push(` • ${mint.slice(0, 8)}...   Total PnL: ${summary.totalPnl.toFixed(2)} SOL`);
      }
    }

    let report = '📊 TOKEN PNL SUMMARY\n';
    report += `🟢 Profitable Tokens (${winners.length}):\n`;
    report += winners.length > 0 ? winners.join('\n') : ' (None in this period)';
    report += '\n\n';
    report += `🔴 Unprofitable Tokens (${losers.length}):\n`;
    report += losers.length > 0 ? losers.join('\n') : ' (None in this period)';

    return report;
  }
} 
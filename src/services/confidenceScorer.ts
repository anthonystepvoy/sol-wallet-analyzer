import { WalletAnalysis, Swap, ClosedTrade } from '../types';

export interface ConfidenceScore {
  overall: number;
  breakdown: {
    dataQuality: number;
    calculationLogic: number;
    reasonableness: number;
    consistency: number;
  };
  warnings: string[];
  recommendations: string[];
}

export class ConfidenceScorer {
  
  /**
   * Calculate confidence score for wallet analysis
   */
  calculateConfidenceScore(
    analysis: WalletAnalysis,
    swaps: Swap[],
    closedTrades: ClosedTrade[]
  ): ConfidenceScore {
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Initialize scores
    let dataQuality = 100;
    let calculationLogic = 100;
    let reasonableness = 100;
    let consistency = 100;
    
    // 1. Data Quality Assessment
    const dataQualityResult = this.assessDataQuality(swaps, analysis);
    dataQuality = dataQualityResult.score;
    warnings.push(...dataQualityResult.warnings);
    recommendations.push(...dataQualityResult.recommendations);
    
    // 2. Calculation Logic Assessment
    const calculationResult = this.assessCalculationLogic(analysis, swaps);
    calculationLogic = calculationResult.score;
    warnings.push(...calculationResult.warnings);
    recommendations.push(...calculationResult.recommendations);
    
    // 3. Reasonableness Assessment
    const reasonablenessResult = this.assessReasonableness(analysis, swaps);
    reasonableness = reasonablenessResult.score;
    warnings.push(...reasonablenessResult.warnings);
    recommendations.push(...reasonablenessResult.recommendations);
    
    // 4. Consistency Assessment
    const consistencyResult = this.assessConsistency(analysis, closedTrades);
    consistency = consistencyResult.score;
    warnings.push(...consistencyResult.warnings);
    recommendations.push(...consistencyResult.recommendations);
    
    // Calculate overall score (weighted average)
    const overall = Math.round(
      (dataQuality * 0.3) +
      (calculationLogic * 0.3) +
      (reasonableness * 0.2) +
      (consistency * 0.2)
    );
    
    return {
      overall,
      breakdown: {
        dataQuality,
        calculationLogic,
        reasonableness,
        consistency
      },
      warnings,
      recommendations
    };
  }
  
  /**
   * Assess data quality
   */
  private assessDataQuality(swaps: Swap[], analysis: WalletAnalysis): {
    score: number;
    warnings: string[];
    recommendations: string[];
  } {
    let score = 100;
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Check for missing data
    const swapsWithMissingData = swaps.filter(s => 
      !s.tokenMint || !s.tokenAmount || !s.solAmount || !s.pricePerToken
    );
    
    if (swapsWithMissingData.length > 0) {
      score -= 20;
      warnings.push(`${swapsWithMissingData.length} swaps have missing data`);
      recommendations.push('Review data acquisition process');
    }
    
    // Check for zero-value transactions
    const zeroValueSwaps = swaps.filter(s => s.solAmount === 0 || s.tokenAmount === 0);
    if (zeroValueSwaps.length > swaps.length * 0.1) {
      score -= 15;
      warnings.push(`${zeroValueSwaps.length} zero-value swaps detected`);
      recommendations.push('Filter out dust transactions');
    }
    
    // Check for extreme price variations
    const tokenPrices = new Map<string, number[]>();
    swaps.forEach(swap => {
      if (!tokenPrices.has(swap.tokenMint)) {
        tokenPrices.set(swap.tokenMint, []);
      }
      tokenPrices.get(swap.tokenMint)!.push(swap.pricePerToken);
    });
    
    let extremePriceVariations = 0;
    for (const [token, prices] of tokenPrices) {
      if (prices.length > 1) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        if (max / min > 1000) { // 1000x price variation
          extremePriceVariations++;
        }
      }
    }
    
    if (extremePriceVariations > 0) {
      score -= 10;
      warnings.push(`${extremePriceVariations} tokens have extreme price variations`);
      recommendations.push('Verify price data accuracy');
    }
    
    // Check transaction frequency
    const timestamps = swaps.map(s => s.timestamp).sort();
    const duplicateTimestamps = timestamps.filter((t, i) => timestamps[i + 1] === t);
    if (duplicateTimestamps.length > swaps.length * 0.2) {
      score -= 10;
      warnings.push('Many transactions have identical timestamps');
      recommendations.push('Review timestamp precision');
    }
    
    return { score: Math.max(0, score), warnings, recommendations };
  }
  
  /**
   * Assess calculation logic
   */
  private assessCalculationLogic(analysis: WalletAnalysis, swaps: Swap[]): {
    score: number;
    warnings: string[];
    recommendations: string[];
  } {
    let score = 100;
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Check Net SOL calculation
    const buySwaps = swaps.filter(s => s.direction === 'buy');
    const sellSwaps = swaps.filter(s => s.direction === 'sell');
    
    const calculatedSolSpent = buySwaps.reduce((sum, s) => sum + s.solAmount, 0);
    const calculatedSolReceived = sellSwaps.reduce((sum, s) => sum + s.solAmount, 0);
    const calculatedNetSol = calculatedSolReceived - calculatedSolSpent;
    
    // Compare with reported values
    const reportedSolSpent = analysis.solSpentBuyingTokens || 0;
    const reportedSolReceived = analysis.solReceivedSellingTokens || 0;
    const reportedNetSol = reportedSolReceived - reportedSolSpent;
    
    const netSolDiff = Math.abs(calculatedNetSol - reportedNetSol);
    if (netSolDiff > 0.1) {
      score -= 25;
      warnings.push(`Net SOL calculation mismatch: ${netSolDiff.toFixed(4)} SOL difference`);
      recommendations.push('Review PnL calculation logic');
    }
    
    // Check for impossible PnL ratios
    const extremePnlTrades = analysis.closedTrades.filter(t => 
      Math.abs(t.realizedPnLPercent) > 10000 && t.totalCostBasisInSol > 0.1
    );
    
    if (extremePnlTrades.length > 0) {
      score -= 20;
      warnings.push(`${extremePnlTrades.length} trades have extreme PnL ratios`);
      recommendations.push('Review price calculation for large trades');
    }
    
    // Check fee reasonableness
    const avgFeePerTrade = analysis.averageFeePerTrade || 0;
    if (avgFeePerTrade > 0.01) {
      score -= 15;
      warnings.push(`Average fee per trade seems high: ${avgFeePerTrade.toFixed(6)} SOL`);
      recommendations.push('Verify fee calculation methodology');
    }
    
    if (avgFeePerTrade < 0.000001) {
      score -= 10;
      warnings.push(`Average fee per trade seems low: ${avgFeePerTrade.toFixed(6)} SOL`);
      recommendations.push('Check if all fees are captured');
    }
    
    return { score: Math.max(0, score), warnings, recommendations };
  }
  
  /**
   * Assess reasonableness of results
   */
  private assessReasonableness(analysis: WalletAnalysis, swaps: Swap[]): {
    score: number;
    warnings: string[];
    recommendations: string[];
  } {
    let score = 100;
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Check win rate reasonableness
    const winRate = analysis.winRate || 0;
    if (winRate > 95) {
      score -= 20;
      warnings.push(`Win rate suspiciously high: ${winRate.toFixed(1)}%`);
      recommendations.push('Verify trade classification and PnL calculation');
    }
    
    if (winRate < 5 && analysis.totalTrades > 10) {
      score -= 15;
      warnings.push(`Win rate suspiciously low: ${winRate.toFixed(1)}%`);
      recommendations.push('Check for systematic calculation errors');
    }
    
    // Check token diversity
    const uniqueTokens = analysis.uniqueTokensTraded || 0;
    const totalTrades = analysis.totalTrades || 0;
    
    if (uniqueTokens > 100) {
      score -= 10;
      warnings.push(`Very high token diversity: ${uniqueTokens} unique tokens`);
      recommendations.push('Consider filtering out dust trades');
    }
    
    if (totalTrades > 0 && uniqueTokens / totalTrades > 0.8) {
      score -= 10;
      warnings.push('Most trades are single-token transactions');
      recommendations.push('Verify swap detection logic');
    }
    
    // Check PnL vs trading volume
    const totalPnL = analysis.totalRealizedPnLInSol || 0;
    const totalVolume = analysis.solSpentBuyingTokens || 0;
    
    if (totalVolume > 0 && Math.abs(totalPnL / totalVolume) > 10) {
      score -= 15;
      warnings.push(`Extreme PnL ratio: ${((totalPnL / totalVolume) * 100).toFixed(1)}%`);
      recommendations.push('Review large trades for calculation errors');
    }
    
    // Check holding duration distribution
    const avgHoldingDuration = analysis.closedTrades.reduce((sum, t) => 
      sum + t.holdingDurationSeconds, 0
    ) / (analysis.closedTrades.length || 1);
    
    if (avgHoldingDuration < 60) { // Less than 1 minute average
      score -= 10;
      warnings.push('Very short average holding duration');
      recommendations.push('Check timestamp accuracy');
    }
    
    return { score: Math.max(0, score), warnings, recommendations };
  }
  
  /**
   * Assess consistency of results
   */
  private assessConsistency(analysis: WalletAnalysis, closedTrades: ClosedTrade[]): {
    score: number;
    warnings: string[];
    recommendations: string[];
  } {
    let score = 100;
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    // Check for trades with zero cost basis (potential oversell issues)
    const zeroCostTrades = closedTrades.filter(t => t.totalCostBasisInSol === 0);
    if (zeroCostTrades.length > closedTrades.length * 0.1) {
      score -= 15;
      warnings.push(`${zeroCostTrades.length} trades have zero cost basis`);
      recommendations.push('Review oversell handling and data completeness');
    }
    
    // Check for trades with identical timestamps
    const tradeTimes = closedTrades.map(t => t.sellTimestamp);
    const uniqueTimes = new Set(tradeTimes);
    if (uniqueTimes.size < tradeTimes.length * 0.8) {
      score -= 10;
      warnings.push('Many trades have identical timestamps');
      recommendations.push('Improve timestamp precision');
    }
    
    // Check for extreme holding durations
    const extremeHoldings = closedTrades.filter(t => 
      t.holdingDurationSeconds > 86400 * 30 // More than 30 days
    );
    
    if (extremeHoldings.length > closedTrades.length * 0.2) {
      score -= 10;
      warnings.push(`${extremeHoldings.length} trades held for >30 days`);
      recommendations.push('Verify long-term holding detection');
    }
    
    return { score: Math.max(0, score), warnings, recommendations };
  }
  
  /**
   * Get confidence level description
   */
  getConfidenceDescription(score: number): string {
    if (score >= 85) return 'High - Results are reliable for most use cases';
    if (score >= 70) return 'Medium - Results are generally reliable with some caveats';
    if (score >= 55) return 'Low - Results should be verified manually';
    return 'Very Low - Results may contain significant errors';
  }
}
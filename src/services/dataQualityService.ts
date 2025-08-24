import { Swap, ClosedTrade, ParsedTransaction, Holding } from '../types';

export interface DataQualityReport {
  overallScore: number;
  issues: DataQualityIssue[];
  swapDetectionScore: number;
  pnlCalculationScore: number;
  dataCompletenessScore: number;
  priceDataScore: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendations: string[];
}

export interface DataQualityIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  category: 'OVERSELL' | 'MISSING_DATA' | 'PRICE_DATA' | 'SWAP_DETECTION' | 'PNL_CALCULATION';
  description: string;
  affectedTokens?: string[];
  impact: string;
  recommendation: string;
}

export class DataQualityService {
  
  /**
   * Comprehensive data quality assessment
   */
  assessDataQuality(
    transactions: ParsedTransaction[],
    swaps: Swap[],
    closedTrades: ClosedTrade[],
    openHoldings: Holding[]
  ): DataQualityReport {
    const issues: DataQualityIssue[] = [];
    
    // 1. Swap Detection Quality
    const swapDetectionScore = this.assessSwapDetection(transactions, swaps, issues);
    
    // 2. PnL Calculation Quality
    const pnlCalculationScore = this.assessPnLCalculation(swaps, closedTrades, issues);
    
    // 3. Data Completeness
    const dataCompletenessScore = this.assessDataCompleteness(transactions, swaps, issues);
    
    // 4. Price Data Quality
    const priceDataScore = this.assessPriceDataQuality(openHoldings, issues);
    
    // Calculate overall score
    const overallScore = (
      swapDetectionScore * 0.3 +
      pnlCalculationScore * 0.3 +
      dataCompletenessScore * 0.25 +
      priceDataScore * 0.15
    );
    
    // Determine confidence level
    const confidenceLevel = this.determineConfidenceLevel(overallScore, issues);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, overallScore);
    
    return {
      overallScore,
      issues,
      swapDetectionScore,
      pnlCalculationScore,
      dataCompletenessScore,
      priceDataScore,
      confidenceLevel,
      recommendations
    };
  }
  
  /**
   * Assess swap detection quality
   */
  private assessSwapDetection(
    transactions: ParsedTransaction[],
    swaps: Swap[],
    issues: DataQualityIssue[]
  ): number {
    let score = 100;
    
    // Check detection rate
    const detectionRate = swaps.length / transactions.length;
    if (detectionRate < 0.1) {
      issues.push({
        severity: 'WARNING',
        category: 'SWAP_DETECTION',
        description: `Low swap detection rate: ${(detectionRate * 100).toFixed(1)}%`,
        impact: 'May be missing legitimate trading activity',
        recommendation: 'Review swap detection algorithms and platform mappings'
      });
      score -= 20;
    }
    
    // Check for unknown platforms
    const unknownPlatformCount = swaps.filter(s => s.platform === 'unknown').length;
    if (unknownPlatformCount > swaps.length * 0.2) {
      issues.push({
        severity: 'WARNING',
        category: 'SWAP_DETECTION',
        description: `High unknown platform rate: ${(unknownPlatformCount / swaps.length * 100).toFixed(1)}%`,
        impact: 'Platform attribution may be inaccurate',
        recommendation: 'Improve platform detection mappings'
      });
      score -= 15;
    }
    
    // Check for suspiciously rapid trades
    const rapidTrades = this.findRapidTrades(swaps);
    if (rapidTrades.length > 0) {
      issues.push({
        severity: 'INFO',
        category: 'SWAP_DETECTION',
        description: `Found ${rapidTrades.length} rapid trades (< 5 seconds apart)`,
        impact: 'May indicate MEV bots or arbitrage activity',
        recommendation: 'Consider if these represent legitimate user trading'
      });
      score -= 5;
    }
    
    return Math.max(0, score);
  }
  
  /**
   * Assess PnL calculation quality
   */
  private assessPnLCalculation(
    swaps: Swap[],
    closedTrades: ClosedTrade[],
    issues: DataQualityIssue[]
  ): number {
    let score = 100;
    
    // Check for oversell situations
    const oversellAnalysis = this.analyzeOversellSituations(swaps);
    if (oversellAnalysis.oversellTokens.length > 0) {
      const severity = oversellAnalysis.oversellTokens.length > 5 ? 'ERROR' : 'WARNING';
      issues.push({
        severity,
        category: 'OVERSELL',
        description: `Oversell detected in ${oversellAnalysis.oversellTokens.length} tokens`,
        affectedTokens: oversellAnalysis.oversellTokens,
        impact: 'PnL calculations may be inflated due to missing buy transactions',
        recommendation: 'Review transaction data completeness for affected tokens'
      });
      score -= severity === 'ERROR' ? 40 : 25;
    }
    
    // Check for zero-cost trades (potential airdrops/oversells)
    const zeroCostTrades = closedTrades.filter(t => t.totalCostBasisInSol === 0);
    if (zeroCostTrades.length > closedTrades.length * 0.1) {
      issues.push({
        severity: 'WARNING',
        category: 'PNL_CALCULATION',
        description: `High zero-cost trade ratio: ${(zeroCostTrades.length / closedTrades.length * 100).toFixed(1)}%`,
        impact: 'May indicate airdrops or missing buy transactions',
        recommendation: 'Investigate zero-cost trades for data completeness'
      });
      score -= 15;
    }
    
    // Check for extreme PnL values
    const extremePnLTrades = closedTrades.filter(t => 
      Math.abs(t.realizedPnLPercent) > 10000 || // >100x gain/loss
      t.realizedPnLInSol > 1000 // >1000 SOL profit
    );
    if (extremePnLTrades.length > 0) {
      issues.push({
        severity: 'WARNING',
        category: 'PNL_CALCULATION',
        description: `Found ${extremePnLTrades.length} trades with extreme PnL values`,
        impact: 'May indicate data quality issues or exceptional market events',
        recommendation: 'Manually verify extreme PnL trades for accuracy'
      });
      score -= 10;
    }
    
    return Math.max(0, score);
  }
  
  /**
   * Assess data completeness
   */
  private assessDataCompleteness(
    transactions: ParsedTransaction[],
    swaps: Swap[],
    issues: DataQualityIssue[]
  ): number {
    let score = 100;
    
    // Check for data gaps (large time gaps between transactions)
    const timeGaps = this.findTimeGaps(transactions);
    if (timeGaps.length > 0) {
      const largeGaps = timeGaps.filter(gap => gap.hours > 168); // >1 week
      if (largeGaps.length > 0) {
        issues.push({
          severity: 'WARNING',
          category: 'MISSING_DATA',
          description: `Found ${largeGaps.length} large time gaps (>1 week) in transaction data`,
          impact: 'May be missing transactions during these periods',
          recommendation: 'Verify transaction completeness for identified time periods'
        });
        score -= 20;
      }
    }
    
    // Check for missing blockTime
    const missingBlockTime = transactions.filter(t => !t.blockTime).length;
    if (missingBlockTime > 0) {
      issues.push({
        severity: 'ERROR',
        category: 'MISSING_DATA',
        description: `${missingBlockTime} transactions missing blockTime`,
        impact: 'Cannot properly order transactions chronologically',
        recommendation: 'Re-fetch transaction data to include blockTime'
      });
      score -= 30;
    }
    
    // Check for missing signatures
    const missingSignatures = transactions.filter(t => !t.signature).length;
    if (missingSignatures > 0) {
      issues.push({
        severity: 'ERROR',
        category: 'MISSING_DATA',
        description: `${missingSignatures} transactions missing signatures`,
        impact: 'Cannot uniquely identify transactions',
        recommendation: 'Ensure all transactions have valid signatures'
      });
      score -= 25;
    }
    
    return Math.max(0, score);
  }
  
  /**
   * Assess price data quality
   */
  private assessPriceDataQuality(
    openHoldings: Holding[],
    issues: DataQualityIssue[]
  ): number {
    let score = 100;
    
    // This would require price data to be passed in
    // For now, we'll provide a basic assessment
    
    if (openHoldings.length > 0) {
      // Check for tokens with zero average cost (potential data issues)
      const zeroCostHoldings = openHoldings.filter(h => h.averageCostPerUnit === 0);
      if (zeroCostHoldings.length > 0) {
        issues.push({
          severity: 'WARNING',
          category: 'PRICE_DATA',
          description: `${zeroCostHoldings.length} holdings with zero average cost`,
          affectedTokens: zeroCostHoldings.map(h => h.tokenMint),
          impact: 'May indicate airdrops or data quality issues',
          recommendation: 'Investigate zero-cost holdings for accuracy'
        });
        score -= 15;
      }
    }
    
    return Math.max(0, score);
  }
  
  /**
   * Analyze oversell situations
   */
  private analyzeOversellSituations(swaps: Swap[]): {
    oversellTokens: string[];
    oversellDetails: Array<{
      tokenMint: string;
      totalBought: number;
      totalSold: number;
      oversellAmount: number;
    }>;
  } {
    const tokenSummary = new Map<string, { totalBought: number; totalSold: number }>();
    
    for (const swap of swaps) {
      const summary = tokenSummary.get(swap.tokenMint) || { totalBought: 0, totalSold: 0 };
      
      if (swap.direction === 'buy') {
        summary.totalBought += swap.tokenAmount;
      } else {
        summary.totalSold += swap.tokenAmount;
      }
      
      tokenSummary.set(swap.tokenMint, summary);
    }
    
    const oversellTokens: string[] = [];
    const oversellDetails: Array<{
      tokenMint: string;
      totalBought: number;
      totalSold: number;
      oversellAmount: number;
    }> = [];
    
    for (const [tokenMint, summary] of tokenSummary) {
      if (summary.totalSold > summary.totalBought * 1.01) { // 1% tolerance
        oversellTokens.push(tokenMint);
        oversellDetails.push({
          tokenMint,
          totalBought: summary.totalBought,
          totalSold: summary.totalSold,
          oversellAmount: summary.totalSold - summary.totalBought
        });
      }
    }
    
    return { oversellTokens, oversellDetails };
  }
  
  /**
   * Find rapid trades (potential MEV/arbitrage)
   */
  private findRapidTrades(swaps: Swap[]): Array<{
    swap1: Swap;
    swap2: Swap;
    timeDiff: number;
  }> {
    const rapidTrades: Array<{
      swap1: Swap;
      swap2: Swap;
      timeDiff: number;
    }> = [];
    
    const sortedSwaps = [...swaps].sort((a, b) => a.timestamp - b.timestamp);
    
    for (let i = 1; i < sortedSwaps.length; i++) {
      const timeDiff = sortedSwaps[i].timestamp - sortedSwaps[i-1].timestamp;
      if (timeDiff < 5 && sortedSwaps[i].tokenMint === sortedSwaps[i-1].tokenMint) {
        rapidTrades.push({
          swap1: sortedSwaps[i-1],
          swap2: sortedSwaps[i],
          timeDiff
        });
      }
    }
    
    return rapidTrades;
  }
  
  /**
   * Find time gaps in transaction data
   */
  private findTimeGaps(transactions: ParsedTransaction[]): Array<{
    start: number;
    end: number;
    hours: number;
  }> {
    const gaps: Array<{
      start: number;
      end: number;
      hours: number;
    }> = [];
    
    const sortedTransactions = [...transactions]
      .filter(t => t.blockTime)
      .sort((a, b) => a.blockTime! - b.blockTime!);
    
    for (let i = 1; i < sortedTransactions.length; i++) {
      const timeDiff = sortedTransactions[i].blockTime! - sortedTransactions[i-1].blockTime!;
      const hours = timeDiff / 3600;
      
      if (hours > 24) { // More than 24 hours gap
        gaps.push({
          start: sortedTransactions[i-1].blockTime!,
          end: sortedTransactions[i].blockTime!,
          hours
        });
      }
    }
    
    return gaps;
  }
  
  /**
   * Determine confidence level based on score and issues
   */
  private determineConfidenceLevel(
    score: number,
    issues: DataQualityIssue[]
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    const hasErrors = issues.some(issue => issue.severity === 'ERROR');
    const hasMultipleWarnings = issues.filter(issue => issue.severity === 'WARNING').length > 3;
    
    if (hasErrors || score < 60) {
      return 'LOW';
    } else if (hasMultipleWarnings || score < 80) {
      return 'MEDIUM';
    } else {
      return 'HIGH';
    }
  }
  
  /**
   * Generate recommendations based on issues
   */
  private generateRecommendations(
    issues: DataQualityIssue[],
    score: number
  ): string[] {
    const recommendations: string[] = [];
    
    if (score < 70) {
      recommendations.push('⚠️ DATA QUALITY CONCERNS: Use results with caution');
    }
    
    const oversellIssues = issues.filter(i => i.category === 'OVERSELL');
    if (oversellIssues.length > 0) {
      recommendations.push('🔍 OVERSELL DETECTED: Verify transaction data completeness');
    }
    
    const missingDataIssues = issues.filter(i => i.category === 'MISSING_DATA');
    if (missingDataIssues.length > 0) {
      recommendations.push('📋 MISSING DATA: Extend analysis period or check API limits');
    }
    
    const swapDetectionIssues = issues.filter(i => i.category === 'SWAP_DETECTION');
    if (swapDetectionIssues.length > 0) {
      recommendations.push('🔄 SWAP DETECTION: Review platform mappings and detection logic');
    }
    
    const pnlIssues = issues.filter(i => i.category === 'PNL_CALCULATION');
    if (pnlIssues.length > 0) {
      recommendations.push('💰 PNL CALCULATION: Verify extreme values and zero-cost trades');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ HIGH QUALITY: Data appears reliable and complete');
    }
    
    return recommendations;
  }
  
  /**
   * Generate detailed quality report
   */
  generateDetailedReport(qualityReport: DataQualityReport): string {
    const lines: string[] = [];
    
    lines.push('📊 DATA QUALITY ASSESSMENT');
    lines.push('=' .repeat(50));
    lines.push(`Overall Score: ${qualityReport.overallScore.toFixed(1)}/100`);
    lines.push(`Confidence Level: ${qualityReport.confidenceLevel}`);
    lines.push('');
    
    lines.push('📈 Component Scores:');
    lines.push(`  Swap Detection: ${qualityReport.swapDetectionScore.toFixed(1)}/100`);
    lines.push(`  PnL Calculation: ${qualityReport.pnlCalculationScore.toFixed(1)}/100`);
    lines.push(`  Data Completeness: ${qualityReport.dataCompletenessScore.toFixed(1)}/100`);
    lines.push(`  Price Data: ${qualityReport.priceDataScore.toFixed(1)}/100`);
    lines.push('');
    
    if (qualityReport.issues.length > 0) {
      lines.push('⚠️ Issues Found:');
      for (const issue of qualityReport.issues) {
        const icon = issue.severity === 'ERROR' ? '❌' : issue.severity === 'WARNING' ? '⚠️' : 'ℹ️';
        lines.push(`  ${icon} ${issue.description}`);
        lines.push(`     Impact: ${issue.impact}`);
        lines.push(`     Recommendation: ${issue.recommendation}`);
        lines.push('');
      }
    }
    
    lines.push('🎯 Recommendations:');
    for (const rec of qualityReport.recommendations) {
      lines.push(`  ${rec}`);
    }
    
    return lines.join('\n');
  }
}
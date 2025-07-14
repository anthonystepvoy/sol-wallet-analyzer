import { Swap } from '../types';

// Data validation service to identify potential issues

export class DataValidator {
  
  /**
   * Validate swap data for potential issues that could cause PnL discrepancies
   */
  static validateSwapData(swaps: Swap[]): {
    isValid: boolean;
    warnings: string[];
    errors: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];
    const recommendations: string[] = [];
    
    // Group swaps by token
    const tokenSwaps = new Map<string, { buys: Swap[], sells: Swap[] }>();
    
    for (const swap of swaps) {
      if (!tokenSwaps.has(swap.tokenMint)) {
        tokenSwaps.set(swap.tokenMint, { buys: [], sells: [] });
      }
      const tokenData = tokenSwaps.get(swap.tokenMint)!;
      if (swap.direction === 'buy') {
        tokenData.buys.push(swap);
      } else {
        tokenData.sells.push(swap);
      }
    }
    
    console.log('\n=== DATA VALIDATION REPORT ===');
    
    // Check for potential oversell situations
    let totalOversellRisk = 0;
    let tokensWithIssues = 0;
    
    for (const [tokenMint, data] of tokenSwaps) {
      const totalBought = data.buys.reduce((sum, s) => sum + s.tokenAmount, 0);
      const totalSold = data.sells.reduce((sum, s) => sum + s.tokenAmount, 0);
      const netBalance = totalBought - totalSold;
      
      console.log(`\nToken ${tokenMint.slice(0, 8)}...:`);
      console.log(`  Buys: ${data.buys.length} (${totalBought.toFixed(6)} tokens)`);
      console.log(`  Sells: ${data.sells.length} (${totalSold.toFixed(6)} tokens)`);
      console.log(`  Net: ${netBalance.toFixed(6)} tokens`);
      
      // Check for oversell
      if (totalSold > totalBought * 1.001) { // Allow for small rounding errors
        const oversellAmount = totalSold - totalBought;
        errors.push(`Token ${tokenMint.slice(0, 8)}... oversold by ${oversellAmount.toFixed(6)} tokens`);
        totalOversellRisk += oversellAmount;
        tokensWithIssues++;
        
        console.log(`  ❌ OVERSELL: ${oversellAmount.toFixed(6)} tokens`);
        
        // Check if missing buys at the beginning (chronologically)
        const sortedBuys = data.buys.sort((a, b) => a.timestamp - b.timestamp);
        const sortedSells = data.sells.sort((a, b) => a.timestamp - b.timestamp);
        
        if (sortedSells.length > 0 && sortedBuys.length > 0) {
          const firstSell = sortedSells[0];
          const firstBuy = sortedBuys[0];
          
          if (firstSell.timestamp < firstBuy.timestamp) {
            warnings.push(`Token ${tokenMint.slice(0, 8)}... has sells before first recorded buy - possible missing transactions`);
            console.log(`  ⚠️  First sell before first buy - missing early transactions?`);
          }
        }
        
      } else if (netBalance < -0.000001) {
        warnings.push(`Token ${tokenMint.slice(0, 8)}... has slight oversell (${(-netBalance).toFixed(6)} tokens)`);
        console.log(`  ⚠️  Slight oversell: ${(-netBalance).toFixed(6)} tokens`);
      }
      
      // Check for missing platform data
      const unknownPlatformSwaps = [...data.buys, ...data.sells].filter(s => 
        s.platform === 'unknown' || s.platform === 'inferred_swap'
      );
      
      if (unknownPlatformSwaps.length > 0) {
        warnings.push(`Token ${tokenMint.slice(0, 8)}... has ${unknownPlatformSwaps.length} swaps with unknown platforms`);
        console.log(`  ⚠️  ${unknownPlatformSwaps.length} swaps with unknown platforms`);
      }
      
      // Check for timing anomalies
      const allSwaps = [...data.buys, ...data.sells].sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 1; i < allSwaps.length; i++) {
        const timeDiff = allSwaps[i].timestamp - allSwaps[i-1].timestamp;
        if (timeDiff < 1) { // Swaps within 1 second
          warnings.push(`Token ${tokenMint.slice(0, 8)}... has rapid consecutive swaps (${timeDiff}s apart)`);
          console.log(`  ⚠️  Rapid swaps detected: ${timeDiff}s apart`);
        }
      }
    }
    
    // Overall validation
    console.log(`\n=== SUMMARY ===`);
    console.log(`Tokens analyzed: ${tokenSwaps.size}`);
    console.log(`Tokens with issues: ${tokensWithIssues}`);
    console.log(`Total oversell risk: ${totalOversellRisk.toFixed(6)} tokens`);
    
    // Generate recommendations
    if (totalOversellRisk > 0) {
      recommendations.push('Review transaction data acquisition - missing buy transactions detected');
      recommendations.push('Consider expanding time range to capture earlier transactions');
      recommendations.push('Verify Helius API configuration and rate limits');
    }
    
    if (errors.length > 0) {
      recommendations.push('Critical: Fix oversell issues before trusting PnL calculations');
    }
    
    const platformDistribution = new Map<string, number>();
    swaps.forEach(swap => {
      platformDistribution.set(swap.platform, (platformDistribution.get(swap.platform) || 0) + 1);
    });
    
    const unknownPlatformCount = platformDistribution.get('unknown') || 0;
    const inferredSwapCount = platformDistribution.get('inferred_swap') || 0;
    
    if (unknownPlatformCount + inferredSwapCount > swaps.length * 0.1) {
      recommendations.push('High number of unidentified platforms - improve swap detection logic');
    }
    
    return {
      isValid: errors.length === 0,
      warnings,
      errors,
      recommendations
    };
  }
  
  /**
   * Validate PnL calculation results
   */
  static validatePnLResults(analysis: any): {
    netSolCalculation: number;
    alternativeNetSol: number;
    discrepancyAnalysis: string[];
  } {
    const discrepancyAnalysis: string[] = [];
    
    // Calculate Net SOL using your current method
    const currentNetSol = analysis.solReceivedSellingTokens - analysis.solSpentBuyingTokens;
    
    // Alternative calculation: Sum of all realized PnL
    const alternativeNetSol = analysis.closedTrades.reduce((sum: number, trade: any) => 
      sum + trade.realizedPnLInSol, 0
    );
    
    console.log(`\n=== NET SOL ANALYSIS ===`);
    console.log(`Current method: ${currentNetSol.toFixed(6)} SOL`);
    console.log(`Alternative (sum PnL): ${alternativeNetSol.toFixed(6)} SOL`);
    console.log(`Difference: ${(currentNetSol - alternativeNetSol).toFixed(6)} SOL`);
    
    const difference = Math.abs(currentNetSol - alternativeNetSol);
    
    if (difference > 0.01) {
      discrepancyAnalysis.push(`Significant difference between Net SOL calculations: ${difference.toFixed(6)} SOL`);
      discrepancyAnalysis.push('This suggests either oversell issues or missing transaction data');
    }
    
    // Check for unrealistic profits
    if (alternativeNetSol > analysis.solSpentBuyingTokens * 2) {
      discrepancyAnalysis.push('Unusually high returns detected - verify for oversell artifacts');
    }
    
    return {
      netSolCalculation: currentNetSol,
      alternativeNetSol,
      discrepancyAnalysis
    };
  }
} 
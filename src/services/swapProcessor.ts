import { ParsedTransaction, Swap, PlatformMapping } from '../types';

export class SwapProcessorService {
  private platformMapping: PlatformMapping;

  constructor() {
    // Enhanced mapping with more Jupiter program IDs
    this.platformMapping = {
      // PUMP.FUN
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun',
      'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'Pumpswap',

      // JUPITER (Enhanced with more program IDs)
      'JUP6LkbZbjS1jKKwapdHch49T4B9iFPE9Z1b6dpVRfC': 'jupiter',
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'jupiter',
      'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo': 'jupiter',
      'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph': 'jupiter',

      // RAYDIUM
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium',
      'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C': 'Raydium',
      'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj': 'Raydium',
      
      // ORCA
      'whirLbMiFpS623VTM7grqDMLGj1joXNReeMvjt2M5B': 'Orca',
      
      // METEORA
      'METEorah8AIxagb27F2nXa5n2t4aenrNzz6u2sMv1': 'Meteora',
    };
  }

  private static canonicalPlatformMap: Record<string, string> = {
    'pumpfun': 'pumpfun',
    'pumpswapamm': 'pumpswap',
    'raydiumlaunchpad': 'raydium',
    'raydiumammv4': 'raydium',
    'raydiumcpmm': 'raydium',
    'jupiter': 'jupiter',
    'jupiteraggregator': 'jupiter',
    'jupiterv6': 'jupiter',
    'orcawhirlpool': 'orca',
    'meteora': 'meteora',
  };
    
  private static canonicalWhitelist = [
    'pumpfun',
    'pumpswap',
    'raydium',
    'jupiter',
    'orca',
    'meteora',
  ];

  private static normalizePlatformName(name: string): string {
    if (!name) return '';
    const cleaned = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return SwapProcessorService.canonicalPlatformMap[cleaned] || cleaned;
  }

  // NEW: Enhanced platform detection method
  private extractPlatformEnhanced(tx: ParsedTransaction, walletAddress: string): string {
    // PRIORITY 1: If Helius marks it as SWAP type, it's likely Jupiter
    if (tx.type === 'SWAP') {
      console.log(`  HELIUS SWAP detected -> defaulting to Jupiter`);
      return 'jupiter';
    }
    
    // PRIORITY 2: Check source string for Jupiter indicators
    const rawSource = tx.source || '';
    const sourceStr = rawSource.toLowerCase();
    
    if (sourceStr.includes('jupiter') || sourceStr.includes('jup')) {
      console.log(`  Jupiter detected from source: "${rawSource}"`);
      return 'jupiter';
    }
    
    // PRIORITY 3: Check normalized source
    const normalizedSource = SwapProcessorService.normalizePlatformName(rawSource);
    if (SwapProcessorService.canonicalWhitelist.includes(normalizedSource)) {
      console.log(`  Platform from normalized source: ${normalizedSource}`);
      return normalizedSource;
    }
    
    // PRIORITY 4: Check program IDs
    const programIds = (tx.instructions || []).map(i => i.programId).filter(Boolean);
    
    // Known Jupiter program IDs
    const jupiterProgramIds = [
      'JUP6LkbZbjS1jKKwapdHch49T4B9iFPE9Z1b6dpVRfC', // Jupiter V6 (main)
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter V4
      'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo', // Jupiter V2
    ];
    
    for (const pid of programIds) {
      if (jupiterProgramIds.includes(pid)) {
        console.log(`  Jupiter detected from program ID: ${pid}`);
        return 'jupiter';
      }
      
      if (this.platformMapping[pid]) {
        const normalized = SwapProcessorService.normalizePlatformName(this.platformMapping[pid]);
        if (SwapProcessorService.canonicalWhitelist.includes(normalized)) {
          console.log(`  Platform from program mapping: ${normalized}`);
          return normalized;
        }
      }
    }
    
    // PRIORITY 5: If it looks like a swap but no platform identified, assume Jupiter
    if (this.isLikelySwap(tx, walletAddress)) {
      console.log(`  Looks like swap -> defaulting to Jupiter`);
      return 'jupiter';
    }
    
    console.log(`  No platform detected`);
    return 'unknown';
  }

  // NEW: Simplified decision logic for processing transactions
  private shouldProcessTransaction(tx: ParsedTransaction, platform: string, walletAddress: string): boolean {
    // Process if:
    // 1. It's marked as SWAP by Helius
    // 2. It's from a known platform
    // 3. It looks like a swap transaction
    
    const isHeliusSwap = tx.type === 'SWAP';
    const isKnownPlatform = platform !== 'unknown';
    const looksLikeSwap = this.isLikelySwap(tx, walletAddress);
    
    return isHeliusSwap || isKnownPlatform || looksLikeSwap;
  }

  // Enhanced platform detection with better Jupiter detection
  private extractPlatform(tx: ParsedTransaction, walletAddress: string): string {
    const rawSource = tx.source || '';
    const normalizedSource = SwapProcessorService.normalizePlatformName(rawSource);
    
    // Debug logging to see what we're working with
    console.log(`Analyzing transaction ${tx.signature.substring(0, 8)}...`);
    console.log(`  Source: "${tx.source}"`);
    console.log(`  Normalized: "${normalizedSource}"`);
    console.log(`  Type: "${tx.type}"`);
    
    // First check if source matches whitelist
    if (SwapProcessorService.canonicalWhitelist.includes(normalizedSource)) {
      console.log(`  ✓ Platform detected from source: ${normalizedSource}`);
      return normalizedSource;
    }
    
    // Enhanced Jupiter detection - check source string variations
    const sourceStr = rawSource.toLowerCase();
    if (sourceStr.includes('jupiter') || 
        sourceStr.includes('jup') ||
        sourceStr === 'jupiter aggregator' ||
        sourceStr === 'jupiter v6' ||
        sourceStr === 'jupiter-v6' ||
        sourceStr === 'jupiter_v6') {
      console.log(`  ✓ Jupiter detected from source string: "${rawSource}"`);
      return 'jupiter';
    }
    
    // Check program IDs with enhanced Jupiter detection
    const programIds = (tx.instructions || []).map(i => i.programId).filter(Boolean);
    console.log(`  Program IDs: ${programIds.slice(0, 3).join(', ')}${programIds.length > 3 ? '...' : ''}`);
    
    // Known Jupiter program IDs (comprehensive list)
    const jupiterProgramIds = [
      'JUP6LkbZbjS1jKKwapdHch49T4B9iFPE9Z1b6dpVRfC', // Jupiter V6
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB', // Jupiter V4
      'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo', // Jupiter V2
      'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph', // Jupiter V3
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  // Jupiter old
    ];
    
    for (const pid of programIds) {
      if (jupiterProgramIds.includes(pid)) {
        console.log(`  ✓ Jupiter detected from program ID: ${pid}`);
        return 'jupiter';
      }
      
      if (this.platformMapping[pid]) {
        const normalized = SwapProcessorService.normalizePlatformName(this.platformMapping[pid]);
        if (SwapProcessorService.canonicalWhitelist.includes(normalized)) {
          console.log(`  ✓ Platform detected from program mapping: ${normalized}`);
          return normalized;
        }
      }
    }
    
    // Advanced Jupiter heuristics
    if (this.detectJupiterByPattern(tx, walletAddress)) {
      console.log(`  ✓ Jupiter detected by transaction pattern`);
      return 'jupiter';
    }
    
    // Check if Helius marked it as SWAP type - likely Jupiter
    if (tx.type === 'SWAP' && this.isLikelySwap(tx, walletAddress)) {
      console.log(`  ✓ Detected as Jupiter (Helius SWAP type + swap pattern)`);
      return 'jupiter';
    }
    
    // If no specific platform found but looks like a swap
    if (this.isLikelySwap(tx, walletAddress)) {
      console.log(`  ? Falling back to inferred_swap`);
      return 'inferred_swap';
    }
    
    console.log(`  ✗ No platform detected`);
    return 'unknown';
  }

  // Add this new method to detect Jupiter by transaction patterns
  private detectJupiterByPattern(tx: ParsedTransaction, walletAddress: string): boolean {
    const tokenTransfers = tx.tokenTransfers || [];
    const userTokenTransfers = tokenTransfers.filter(t => 
      t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress
    );
    
    // Jupiter characteristics:
    // 1. User typically has 2+ token interactions (send one, receive another)
    // 2. Multiple instructions (complex routing)
    // 3. May have intermediate token transfers for routing
    
    if (userTokenTransfers.length >= 2 && (tx.instructions || []).length >= 3) {
      const userReceives = userTokenTransfers.filter(t => t.toUserAccount === walletAddress);
      const userSends = userTokenTransfers.filter(t => t.fromUserAccount === walletAddress);
      
      // Check if user is trading different tokens
      const receivedMints = new Set(userReceives.map(t => t.mint));
      const sentMints = new Set(userSends.map(t => t.mint));
      
      // Remove WSOL as it's often used for routing
      const wsolMint = 'So11111111111111111111111111111111111111112';
      receivedMints.delete(wsolMint);
      sentMints.delete(wsolMint);
      
      // If trading different tokens, likely Jupiter
      if (receivedMints.size > 0 && sentMints.size > 0) {
        const hasNonOverlapping = [...receivedMints].some(mint => !sentMints.has(mint)) ||
                                  [...sentMints].some(mint => !receivedMints.has(mint));
        return hasNonOverlapping;
      }
    }
    
    // Alternative pattern: high instruction count with token swapping
    if ((tx.instructions || []).length > 5 && userTokenTransfers.length >= 1) {
      const tradeInfo = this.analyzeTradeDirection(tx, walletAddress);
      return tradeInfo !== null && tradeInfo.solAmount > 0;
    }
    
    return false;
  }

  private isLikelySwap(tx: ParsedTransaction, walletAddress: string): boolean {
    const hasTokenTransfers = (tx.tokenTransfers || []).length > 0;
    const hasNativeTransfers = (tx.nativeTransfers || []).length > 0;
    
    if (!hasTokenTransfers && !hasNativeTransfers) return false;
    
    const tokenTransfers = tx.tokenTransfers || [];
    const nativeTransfers = tx.nativeTransfers || [];
    
    const userTokenTransfers = tokenTransfers.filter(t => 
      t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress
    );
    
    const userNativeTransfers = nativeTransfers.filter(t => 
      t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress
    );
    
    const userReceivesToken = userTokenTransfers.some(t => t.toUserAccount === walletAddress);
    const userSendsToken = userTokenTransfers.some(t => t.fromUserAccount === walletAddress);
    const userReceivesSOL = userNativeTransfers.some(t => t.toUserAccount === walletAddress);
    const userSendsSOL = userNativeTransfers.some(t => t.fromUserAccount === walletAddress);
    
    const wsolTransfers = tokenTransfers.filter(t => this.isSolOrWsol(t.mint));
    const userReceivesWSOL = wsolTransfers.some(t => t.toUserAccount === walletAddress);
    const userSendsWSOL = wsolTransfers.some(t => t.fromUserAccount === walletAddress);
    
    const isBuyPattern = (userSendsSOL || userSendsWSOL) && userReceivesToken;
    const isSellPattern = userSendsToken && (userReceivesSOL || userReceivesWSOL);
    
    if (isBuyPattern || isSellPattern) {
      const tradeInfo = this.analyzeTradeDirection(tx, walletAddress);
      return tradeInfo !== null && tradeInfo.solAmount > 0.00001 && tradeInfo.tokenAmount > 0;
    }
    
    return false;
  }

  // CRITICAL FIX: The issue is likely that Helius is marking transactions as 'SWAP' type
  // but your logic isn't defaulting to Jupiter properly.

  // Replace your entire processSwaps method with this enhanced version:

  processSwaps(transactions: ParsedTransaction[], walletAddress: string): Swap[] {
    const swaps: Swap[] = [];
    const skippedTransactions: Array<{signature: string, reason: string, details: any}> = [];
    
    console.log(`Processing ${transactions.length} transactions for wallet ${walletAddress}...`);
    
    for (const tx of transactions) {
      if (!tx.blockTime) continue;

      // Enhanced platform detection
      const platform = this.extractPlatformEnhanced(tx, walletAddress);
      
      console.log(`TX ${tx.signature.substring(0, 8)}... -> Platform: ${platform}, Type: ${tx.type}, Source: ${tx.source}`);

      // More inclusive logic: process any swap-looking transaction
      if (this.shouldProcessTransaction(tx, platform, walletAddress)) {
        const swap = this.createSwapFromRawTransfers(tx, walletAddress, platform);

        if (swap && swap.solAmount > 0.00001) {
          swaps.push(swap);
        } else {
          const reason = !swap ? 'Failed to create swap' : 'Trivial SOL amount';
          skippedTransactions.push({
            signature: tx.signature,
            reason,
            details: { type: tx.type, source: tx.source, platform }
          });
        }
      } else {
        skippedTransactions.push({
          signature: tx.signature,
          reason: 'Not identified as processable swap',
          details: { type: tx.type, source: tx.source, platform }
        });
      }
    }
    
    console.log(`Processed ${swaps.length} swaps, skipped ${skippedTransactions.length} transactions`);
    
    // Log platform breakdown
    const platformBreakdown = new Map<string, number>();
    swaps.forEach(swap => {
      const count = platformBreakdown.get(swap.platform) || 0;
      platformBreakdown.set(swap.platform, count + 1);
    });
    
    console.log('Platform breakdown:', Object.fromEntries(platformBreakdown));
    
    return swaps;
  }

  private createSwapFromRawTransfers(tx: ParsedTransaction, walletAddress: string, platform: string): Swap | null {
    const tradeInfo = this.analyzeTradeDirection(tx, walletAddress);
    if (!tradeInfo || tradeInfo.solAmount === 0 || tradeInfo.tokenAmount === 0) {
      return null;
    }
    
    return {
      signature: tx.signature,
      timestamp: tx.blockTime,
      fee: tx.fee,
      tokenMint: tradeInfo.tokenMint,
      tokenAmount: tradeInfo.tokenAmount,
      solAmount: tradeInfo.solAmount,
      direction: tradeInfo.direction,
      platform,
      pricePerToken: tradeInfo.solAmount / tradeInfo.tokenAmount,
    };
  }

  private isSolOrWsol(mint: string): boolean {
    return mint === 'So11111111111111111111111111111111111111112';
  }

  // Enhanced trade direction analysis
  private analyzeTradeDirection(tx: ParsedTransaction, walletAddress: string): {
    direction: 'buy' | 'sell';
    tokenMint: string;
    tokenAmount: number;
    solAmount: number;
  } | null {
    const tokenChanges = new Map<string, number>();
    let solChange = 0;

    // Calculate token changes (excluding SOL/WSOL)
    (tx.tokenTransfers || []).forEach(t => {
      if (this.isSolOrWsol(t.mint)) {
        const amount = this.normalizeTokenAmount(t);
        if (t.toUserAccount === walletAddress) solChange += amount;
        if (t.fromUserAccount === walletAddress) solChange -= amount;
        return;
      }

      const amount = this.normalizeTokenAmount(t);
      const currentChange = tokenChanges.get(t.mint) || 0;
      
      let netChange = 0;
      if (t.toUserAccount === walletAddress) netChange = amount;
      if (t.fromUserAccount === walletAddress) netChange = -amount;
      
      tokenChanges.set(t.mint, currentChange + netChange);
    });

    // Calculate native SOL changes
    (tx.nativeTransfers || []).forEach(t => {
      const amount = t.amount / 1e9;
      if (t.toUserAccount === walletAddress) solChange += amount;
      if (t.fromUserAccount === walletAddress) solChange -= amount;
    });

    // Filter out tokens with no significant net change
    const significantChanges = new Map([...tokenChanges.entries()].filter(([_, change]) => 
      Math.abs(change) > 0.000001
    ));

    if (significantChanges.size === 0 || Math.abs(solChange) < 0.00001) {
      return null;
    }

    // Find the main token with the largest absolute change
    const [mainTokenMint, mainTokenNetAmount] = [...significantChanges.entries()].reduce((a, b) => 
      Math.abs(a[1]) > Math.abs(b[1]) ? a : b
    );

    const direction = mainTokenNetAmount > 0 ? 'buy' : 'sell';
    const tokenAmount = Math.abs(mainTokenNetAmount);
    const solAmount = Math.abs(solChange);

    // Validate the trade makes sense
    if (solAmount < 0.00001 || tokenAmount < 0.000001) {
      return null;
    }

    return {
      direction,
      tokenMint: mainTokenMint,
      tokenAmount,
      solAmount,
    };
  }

  private normalizeTokenAmount(tokenTransfer: any): number {
    return Math.abs(parseFloat(tokenTransfer.tokenAmount));
  }
} 
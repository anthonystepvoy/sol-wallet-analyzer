import { ParsedTransaction, Swap, PlatformMapping } from '../types';

export class SwapProcessorService {
  private platformMapping: PlatformMapping;

  constructor() {
    // This mapping links specific on-chain program IDs to a human-readable name.
    this.platformMapping = {
      // PUMP.FUN
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun',
      'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'Pumpswap',

      // JUPITER
      'JUP6LkbZbjS1jKKwapdHch49T4B9iFPE9Z1b6dpVRfC': 'jupiter',

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

  // This map groups all variants of a DEX under ONE single name.
  private static canonicalPlatformMap: Record<string, string> = {
    'pumpfun': 'pumpfun',
    'pumpswapamm': 'pumpswap',
    'raydiumlaunchpad': 'raydium',
    'raydiumammv4': 'raydium',
    'raydiumcpmm': 'raydium',
    'jupiter': 'jupiter',
    'orcawhirlpool': 'orca',
    'meteora': 'meteora',
  };
    
  // This whitelist uses the single, canonical names.
  private static canonicalWhitelist = [
    'pumpfun',
    'pumpswap',
    'raydium',
    'jupiter',
    'orca',
    'meteora',
  ];

  // Helper to normalize platform/source names
  private static normalizePlatformName(name: string): string {
    if (!name) return '';
    const cleaned = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return SwapProcessorService.canonicalPlatformMap[cleaned] || cleaned;
  }

  // New method to detect if a transaction looks like a swap even without platform match
  private isLikelySwap(tx: ParsedTransaction, walletAddress: string): boolean {
    // Check if transaction has both token transfers and SOL/WSOL movement
    const hasTokenTransfers = (tx.tokenTransfers || []).length > 0;
    const hasNativeTransfers = (tx.nativeTransfers || []).length > 0;
    
    if (!hasTokenTransfers && !hasNativeTransfers) return false;
    
    // Analyze if there's a meaningful trade pattern
    const tradeInfo = this.analyzeTradeDirection(tx, walletAddress);
    return tradeInfo !== null && tradeInfo.solAmount > 0 && tradeInfo.tokenAmount > 0;
  }

  // Enhanced method to extract platform from various sources
  private extractPlatform(tx: ParsedTransaction, walletAddress: string): string {
    const rawSource = tx.source || '';
    const normalizedSource = SwapProcessorService.normalizePlatformName(rawSource);
    
    // First check if source matches whitelist
    if (SwapProcessorService.canonicalWhitelist.includes(normalizedSource)) {
      return normalizedSource;
    }
    
    // Then check program IDs
    const programIds = (tx.instructions || []).map(i => i.programId).filter(Boolean);
    for (const pid of programIds) {
      if (this.platformMapping[pid]) {
        const normalized = SwapProcessorService.normalizePlatformName(this.platformMapping[pid]);
        if (SwapProcessorService.canonicalWhitelist.includes(normalized)) {
          return normalized;
        }
      }
    }
    
    // If no match found, use a generic label for likely swaps
    if (this.isLikelySwap(tx, walletAddress)) {
      return 'inferred_swap';
    }
    
    return 'unknown';
  }

  processSwaps(transactions: ParsedTransaction[], walletAddress: string): Swap[] {
    const swaps: Swap[] = [];
    const skippedTransactions: Array<{signature: string, reason: string, details: any}> = [];
    
    for (const tx of transactions) {
      if (!tx.blockTime) continue;

      // New, more inclusive logic: Trust Helius 'SWAP' type first, then our platform whitelist, OR if it appears to be a swap
      const isHeliusSwap = tx.type === 'SWAP';
      const platform = this.extractPlatform(tx, walletAddress);
      const isWhitelisted = SwapProcessorService.canonicalWhitelist.includes(platform);

      // Process if it's a known swap, from a whitelisted platform, OR if it appears to be a swap
      if (isHeliusSwap || isWhitelisted || this.isLikelySwap(tx, walletAddress)) {
        const swap = this.createSwapFromRawTransfers(tx, walletAddress, platform);

        if (swap) {
          // Additional safety check: ensure the swap has a non-trivial SOL amount
          if (swap.solAmount > 0.00001) {
            swaps.push(swap);
          } else {
            skippedTransactions.push({
              signature: tx.signature,
              reason: 'Swap created but has zero/trivial SOL amount',
              details: {
                type: tx.type,
                source: tx.source,
                platform,
                tokenTransfers: tx.tokenTransfers?.length || 0,
                nativeTransfers: tx.nativeTransfers?.length || 0
              }
            });
          }
        } else {
          skippedTransactions.push({
            signature: tx.signature,
            reason: 'Failed to create swap from transfers',
            details: {
              type: tx.type,
              source: tx.source,
              platform,
              tokenTransfers: tx.tokenTransfers?.length || 0,
              nativeTransfers: tx.nativeTransfers?.length || 0
            }
          });
        }
      } else {
        skippedTransactions.push({
          signature: tx.signature,
          reason: 'No platform match and not a Helius SWAP',
          details: {
            type: tx.type,
            source: tx.source,
            platform,
            tokenTransfers: tx.tokenTransfers?.length || 0,
            nativeTransfers: tx.nativeTransfers?.length || 0
          }
        });
        // Debug log for skipped transaction
        console.log(`Skipped: ${tx.signature} - No platform match and not a Helius SWAP`);
        console.log(`  Type: ${tx.type}, Source: ${tx.source}`);
      }
    }
    
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

  private analyzeTradeDirection(tx: ParsedTransaction, walletAddress: string): {
    direction: 'buy' | 'sell';
    tokenMint: string;
    tokenAmount: number;
    solAmount: number;
  } | null {
    const tokenChanges = new Map<string, number>();

    // 1. Calculate the net change for EACH token mint independently.
    (tx.tokenTransfers || []).forEach(t => {
      if (this.isSolOrWsol(t.mint)) return;

      const amount = this.normalizeTokenAmount(t);
      const currentChange = tokenChanges.get(t.mint) || 0;
      
      let netChange = 0;
      if (t.toUserAccount === walletAddress) netChange = amount;
      if (t.fromUserAccount === walletAddress) netChange = -amount;
      
      tokenChanges.set(t.mint, currentChange + netChange);
    });

    // Filter out tokens with no net change (e.g., intermediate routing tokens)
    const nonZeroChanges = new Map([...tokenChanges.entries()].filter(([_, change]) => change !== 0));

    // If no token had a net change, it's not a swap we can analyze this way.
    if (nonZeroChanges.size === 0) {
      return null;
    }

    // Heuristic: The main token of the swap is the one with the largest absolute change.
    const [mainTokenMint, mainTokenNetAmount] = [...nonZeroChanges.entries()].reduce((a, b) => 
        Math.abs(a[1]) > Math.abs(b[1]) ? a : b
    );

    const direction = mainTokenNetAmount > 0 ? 'buy' : 'sell';
    const tokenAmount = Math.abs(mainTokenNetAmount);

    // 2. Calculate the SOL amount using the existing symmetrical logic.
    let solAmount = 0;
    if (direction === 'buy') {
      let largestOutgoingSol = 0;
      (tx.nativeTransfers || []).forEach(t => {
        if (t.fromUserAccount === walletAddress) {
          const amount = t.amount / 1e9;
          if (amount > largestOutgoingSol) largestOutgoingSol = amount;
        }
      });
      (tx.tokenTransfers || []).forEach(t => {
        if (this.isSolOrWsol(t.mint) && t.fromUserAccount === walletAddress) {
          const amount = this.normalizeTokenAmount(t);
          if (amount > largestOutgoingSol) largestOutgoingSol = amount;
        }
      });
      solAmount = largestOutgoingSol;

    } else { // direction === 'sell'
      let largestIncomingSol = 0;
      (tx.nativeTransfers || []).forEach(t => {
        if (t.toUserAccount === walletAddress) {
          const amount = t.amount / 1e9;
          if (amount > largestIncomingSol) largestIncomingSol = amount;
        }
      });
      (tx.tokenTransfers || []).forEach(t => {
        if (this.isSolOrWsol(t.mint) && t.toUserAccount === walletAddress) {
          const amount = this.normalizeTokenAmount(t);
          if (amount > largestIncomingSol) largestIncomingSol = amount;
        }
      });
      solAmount = largestIncomingSol;
    }

    // Debug logging for direction detection
    console.log(`TX ${tx.signature}:`);
    console.log(`  Token: ${mainTokenMint}`);
    console.log(`  Net token change: ${mainTokenNetAmount}`);
    console.log(`  Classified as: ${direction}`);
    console.log(`  SOL amount: ${solAmount}`);

    // Final safety check. A swap must involve both a token and SOL.
    if (solAmount === 0 || tokenAmount === 0) {
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
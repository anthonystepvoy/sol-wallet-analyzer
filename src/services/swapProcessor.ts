import { ParsedTransaction, Swap, PlatformMapping } from '../types';

// Enhanced swap processor with more comprehensive Jupiter detection

export class SwapProcessorService {
  private platformMapping: PlatformMapping;

  constructor() {
    // EXPANDED mapping with ALL known Jupiter program IDs
    this.platformMapping = {
      // PUMP.FUN
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': 'pump.fun',
      'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA': 'Pumpswap',

      // JUPITER (Comprehensive list)
      'JUP6LkbZbjS1jKKwapdHch49T4B9iFPE9Z1b6dpVRfC': 'jupiter', // V6 (main)
      'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': 'jupiter', // V4
      'JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uJvfo': 'jupiter', // V2
      'JUP3c2Uh3WA4Ng34tw6kPd2G4C5BB21Xo36Je1s32Ph': 'jupiter', // V3
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'jupiter', // Legacy
      
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

  // Make platform detection more inclusive
  private extractPlatformEnhanced(tx: ParsedTransaction, walletAddress: string): string {
    const rawSource = tx.source || '';
    const sourceStr = rawSource.toLowerCase();
    
    // Map more source types to known platforms
    const sourceMapping: Record<string, string> = {
      'pump_amm': 'pumpfun',
      'pump_fun': 'pumpfun', 
      'pumpfun': 'pumpfun',
      'raydium': 'raydium',
      'raydiumv4': 'raydium',
      'raydiumcpmm': 'raydium',
      'jupiter': 'jupiter',
      'orca': 'orca',
      'meteora': 'meteora'
    };
    
    // Check source mapping first
    for (const [source, platform] of Object.entries(sourceMapping)) {
      if (sourceStr.includes(source)) {
        console.log(`  ✓ Platform from source mapping: ${platform}`);
        return platform;
      }
    }
    
    // If Helius marked it as SWAP and no specific source, default to jupiter
    if (tx.type === 'SWAP' && !sourceStr.includes('pump')) {
      console.log(`  ✓ Helius SWAP (non-pump) -> jupiter`);
      return 'jupiter';
    }
    
    // Check program IDs more thoroughly
    const programIds = (tx.instructions || []).map(i => i.programId).filter(Boolean);
    for (const pid of programIds) {
      if (this.platformMapping[pid]) {
        const platform = this.platformMapping[pid];
        console.log(`  ✓ Platform from program ID: ${platform}`);
        return platform;
      }
    }
    
    // If it has token activity and multiple instructions, likely a DEX trade
    if (this.hasUserTokenActivity(tx, walletAddress) && (tx.instructions || []).length > 2) {
      console.log(`  ? Complex transaction with tokens -> jupiter`);
      return 'jupiter';
    }
    
    return 'unknown';
  }

  // Enhanced Jupiter pattern detection
  private detectJupiterByAdvancedPattern(tx: ParsedTransaction, walletAddress: string): boolean {
    const tokenTransfers = tx.tokenTransfers || [];
    const userTokenTransfers = tokenTransfers.filter(t => 
      t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress
    );
    
    // Jupiter characteristics:
    // 1. Complex routing with multiple intermediate transfers
    // 2. High instruction count (usually 5+ for aggregation)
    // 3. Multiple token interactions with intermediate accounts
    // 4. WSOL wrapping/unwrapping patterns
    
    const instructionCount = (tx.instructions || []).length;
    const hasMultipleTokens = new Set(tokenTransfers.map(t => t.mint)).size > 1;
    const hasWSOL = tokenTransfers.some(t => t.mint === 'So11111111111111111111111111111111111111112');
    
    // Pattern 1: High complexity with token routing
    if (instructionCount > 5 && hasMultipleTokens && userTokenTransfers.length >= 1) {
      return true;
    }
    
    // Pattern 2: Jupiter-style routing with WSOL
    if (hasWSOL && instructionCount > 3 && userTokenTransfers.length >= 1) {
      // Check for wrap/unwrap patterns typical of Jupiter
      const wsolTransfers = tokenTransfers.filter(t => t.mint === 'So11111111111111111111111111111111111111112');
      if (wsolTransfers.length >= 2) {
        return true;
      }
    }
    
    // Pattern 3: Multiple intermediate accounts (typical of aggregation)
    const allAccounts = new Set([
      ...tokenTransfers.map(t => t.fromUserAccount),
      ...tokenTransfers.map(t => t.toUserAccount)
    ]);
    
    if (allAccounts.size > 4 && userTokenTransfers.length >= 1) {
      return true;
    }
    
    return false;
  }

  // In your swapProcessor.ts - make detection even more aggressive

  private shouldProcessTransaction(tx: ParsedTransaction, platform: string, walletAddress: string): boolean {
    // EXTREMELY aggressive - process almost anything with token activity
    
    const isHeliusSwap = tx.type === 'SWAP';
    const isTransfer = tx.type === 'TRANSFER';
    const isKnownPlatform = platform !== 'unknown';
    const hasTokenActivity = this.hasUserTokenActivity(tx, walletAddress);
    const isKnownDexSource = this.isKnownDexSource(tx.source);
    const hasMultipleInstructions = (tx.instructions || []).length > 1; // Lowered from 2
    const hasAnyFee = (tx.fee || 0) > 0.0001; // Lowered from 0.001
    
    // Process if ANY of these conditions are met (much more inclusive):
    const shouldProcess = 
      isHeliusSwap || 
      isKnownPlatform || 
      isKnownDexSource ||
      hasTokenActivity || // Process ANY transaction with token activity
      (isTransfer && hasAnyFee) ||
      hasMultipleInstructions;
    
    if (shouldProcess) {
      console.log(`    ✅ Processing: SWAP=${isHeliusSwap}, Platform=${isKnownPlatform}, DEX=${isKnownDexSource}, TokenActivity=${hasTokenActivity}`);
    } else {
      console.log(`    ❌ Skipping: No qualifying conditions met`);
    }
    
    return shouldProcess;
  }

  private hasUserTokenActivity(tx: ParsedTransaction, walletAddress: string): boolean {
    const tokenTransfers = tx.tokenTransfers || [];
    const userTokenTransfers = tokenTransfers.filter(t => 
      t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress
    );
    return userTokenTransfers.length > 0;
  }

  private isKnownDexSource(source: string): boolean {
    if (!source) return false;
    
    const knownDexSources = [
      'PUMP_AMM', 'PUMP_FUN', 'RAYDIUM', 'JUPITER', 'ORCA', 'METEORA',
      'PHANTOM' // Sometimes Phantom shows up for DEX trades
    ];
    
    return knownDexSources.includes(source.toUpperCase());
  }

  // Enhanced processSwaps method:
  processSwaps(transactions: ParsedTransaction[], walletAddress: string): Swap[] {
    const swaps: Swap[] = [];
    const debugInfo: Array<{signature: string, reason: string, platform: string, source: string}> = [];
    
    console.log(`Processing ${transactions.length} transactions for wallet ${walletAddress}...`);
    
    // Count transaction types for debugging
    const typeCounts: {[key: string]: number} = {};
    transactions.forEach(tx => {
      typeCounts[tx.type] = (typeCounts[tx.type] || 0) + 1;
    });
    console.log(`Transaction types: ${JSON.stringify(typeCounts)}`);
    
    for (const tx of transactions) {
      console.log(`\n  Examining ${tx.signature.substring(0, 8)}... (Type: ${tx.type}, Source: ${tx.source})`);
      
      if (!tx.blockTime) {
        debugInfo.push({signature: tx.signature, reason: 'No blockTime', platform: 'N/A', source: tx.source || 'N/A'});
        console.log(`    ❌ Skipped: No blockTime`);
        continue;
      }

      const platform = this.extractPlatformEnhanced(tx, walletAddress);
      const shouldProcess = this.shouldProcessTransaction(tx, platform, walletAddress);

      if (shouldProcess) {
        console.log(`  Processing ${tx.signature.substring(0, 8)}... (${platform})`);
        const swap = this.createSwapFromRawTransfers(tx, walletAddress, platform);

        if (swap && swap.solAmount > 0.000001) {
          swaps.push(swap);
          console.log(`    ✅ Created ${swap.direction}: ${swap.tokenAmount.toFixed(4)} tokens @ ${swap.pricePerToken.toFixed(8)} SOL/token`);
        } else {
          const reason = !swap ? 'createSwapFromRawTransfers returned null' : `SOL amount too small: ${swap.solAmount}`;
          debugInfo.push({signature: tx.signature, reason, platform, source: tx.source || 'N/A'});
          console.log(`    ❌ ${reason}`);
        }
      } else {
        debugInfo.push({signature: tx.signature, reason: 'shouldProcessTransaction = false', platform, source: tx.source || 'N/A'});
      }
    }
    
    console.log(`\n✅ Successfully processed ${swaps.length} swaps`);
    console.log(`❌ Failed to process ${debugInfo.length} transactions`);
    
    // Log failure reasons for debugging
    if (debugInfo.length > 0) {
      console.log('\n=== FAILURE ANALYSIS ===');
      const reasonCounts = new Map<string, number>();
      debugInfo.forEach(info => {
        const count = reasonCounts.get(info.reason) || 0;
        reasonCounts.set(info.reason, count + 1);
      });
      
      for (const [reason, count] of reasonCounts) {
        console.log(`${reason}: ${count} transactions`);
      }
    }
    
    return swaps;
  }

  // Rest of your existing methods remain the same...
  // (isLikelySwap, createSwapFromRawTransfers, analyzeTradeDirection, etc.)

  private isLikelySwap(tx: ParsedTransaction, walletAddress: string): boolean {
    const tokenTransfers = tx.tokenTransfers || [];
    const userTokenTransfers = tokenTransfers.filter(t => 
      t.toUserAccount === walletAddress || t.fromUserAccount === walletAddress
    );

    // Must have at least one token transfer involving the user
    if (userTokenTransfers.length === 0) {
      return false;
    }

    // Check if user is both sending and receiving tokens (typical swap pattern)
    const userReceives = userTokenTransfers.filter(t => t.toUserAccount === walletAddress);
    const userSends = userTokenTransfers.filter(t => t.fromUserAccount === walletAddress);

    // Pattern 1: User sends one token and receives another (classic swap)
    if (userSends.length > 0 && userReceives.length > 0) {
      const sentMints = new Set(userSends.map(t => t.mint));
      const receivedMints = new Set(userReceives.map(t => t.mint));
      
      // Remove WSOL from consideration as it's often used for routing
      const wsolMint = 'So11111111111111111111111111111111111111112';
      sentMints.delete(wsolMint);
      receivedMints.delete(wsolMint);
      
      // If trading different tokens, likely a swap
      if (sentMints.size > 0 && receivedMints.size > 0) {
        const hasDifferentTokens = [...sentMints].some(mint => !receivedMints.has(mint)) ||
                                  [...receivedMints].some(mint => !sentMints.has(mint));
        if (hasDifferentTokens) {
          return true;
        }
      }
    }

    // Pattern 2: User receives tokens and sends SOL (buy pattern)
    if (userReceives.length > 0 && userSends.length === 0) {
      const receivedNonWsol = userReceives.filter(t => t.mint !== 'So11111111111111111111111111111111111111112');
      if (receivedNonWsol.length > 0) {
        return true;
      }
    }

    // Pattern 3: User sends tokens and receives SOL (sell pattern)
    if (userSends.length > 0 && userReceives.length === 0) {
      const sentNonWsol = userSends.filter(t => t.mint !== 'So11111111111111111111111111111111111111112');
      if (sentNonWsol.length > 0) {
        return true;
      }
    }

    return false;
  }

  // Enhanced createSwapFromRawTransfers with debugging

  private createSwapFromRawTransfers(tx: ParsedTransaction, walletAddress: string, platform: string): Swap | null {
    console.log(`    Creating swap from transaction ${tx.signature.substring(0, 8)}...`);
    console.log(`    Platform: ${platform}, Source: ${tx.source}, Type: ${tx.type}`);
    
    const tradeInfo = this.analyzeTradeDirectionDebug(tx, walletAddress);
    
    if (!tradeInfo) {
      console.log(`    ❌ Failed to analyze trade direction`);
      return null;
    }
    
    if (tradeInfo.solAmount === 0 || tradeInfo.tokenAmount === 0) {
      console.log(`    ❌ Invalid amounts: SOL=${tradeInfo.solAmount}, Token=${tradeInfo.tokenAmount}`);
      return null;
    }
    
    console.log(`    ✅ Creating ${tradeInfo.direction}: ${tradeInfo.tokenAmount.toFixed(6)} tokens for ${tradeInfo.solAmount.toFixed(6)} SOL`);
    
    return {
      signature: tx.signature,
      timestamp: tx.blockTime,
      fee: tx.fee || 0,
      tokenMint: tradeInfo.tokenMint,
      tokenAmount: tradeInfo.tokenAmount,
      solAmount: tradeInfo.solAmount,
      direction: tradeInfo.direction,
      platform,
      pricePerToken: tradeInfo.solAmount / tradeInfo.tokenAmount,
    };
  }

  // Also make sure your isSolOrWsol method is correct:
  private isSolOrWsol(mint: string): boolean {
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    return mint === WSOL_MINT;
  }

  // Enhanced analyzeTradeDirection with detailed debugging
  private analyzeTradeDirectionDebug(tx: ParsedTransaction, walletAddress: string): {
    direction: 'buy' | 'sell';
    tokenMint: string;
    tokenAmount: number;
    solAmount: number;
  } | null {
    
    console.log(`      Analyzing trade direction for ${tx.signature.substring(0, 8)}...`);
    
    const tokenChanges = new Map<string, number>();
    let solChange = 0;
    
    // Debug token transfers
    const tokenTransfers = tx.tokenTransfers || [];
    console.log(`      Token transfers: ${tokenTransfers.length}`);
    
    tokenTransfers.forEach((t, index) => {
      console.log(`        Transfer ${index + 1}: ${t.mint.substring(0, 8)}... amount=${t.tokenAmount}`);
      console.log(`          From: ${t.fromUserAccount.substring(0, 8)}...`);
      console.log(`          To: ${t.toUserAccount.substring(0, 8)}...`);
      console.log(`          User is: ${t.fromUserAccount === walletAddress ? 'SENDER' : t.toUserAccount === walletAddress ? 'RECEIVER' : 'NOT_INVOLVED'}`);
    });

    // Calculate token changes (excluding SOL/WSOL)
    tokenTransfers.forEach(t => {
      if (this.isSolOrWsol(t.mint)) {
        const amount = this.normalizeTokenAmount(t);
        if (t.toUserAccount === walletAddress) {
          solChange += amount;
          console.log(`        User RECEIVED ${amount.toFixed(6)} WSOL`);
        }
        if (t.fromUserAccount === walletAddress) {
          solChange -= amount;
          console.log(`        User SENT ${amount.toFixed(6)} WSOL`);
        }
        return;
      }

      const amount = this.normalizeTokenAmount(t);
      const currentChange = tokenChanges.get(t.mint) || 0;
      
      let netChange = 0;
      if (t.toUserAccount === walletAddress) {
        netChange = amount;
        console.log(`        User RECEIVED ${amount.toFixed(6)} of ${t.mint.substring(0, 8)}...`);
      }
      if (t.fromUserAccount === walletAddress) {
        netChange = -amount;
        console.log(`        User SENT ${amount.toFixed(6)} of ${t.mint.substring(0, 8)}...`);
      }
      
      tokenChanges.set(t.mint, currentChange + netChange);
    });

    // Debug native transfers
    const nativeTransfers = tx.nativeTransfers || [];
    console.log(`      Native transfers: ${nativeTransfers.length}`);
    
    nativeTransfers.forEach((t, index) => {
      const amount = t.amount / 1e9;
      console.log(`        Native ${index + 1}: ${amount.toFixed(6)} SOL`);
      console.log(`          From: ${t.fromUserAccount.substring(0, 8)}...`);
      console.log(`          To: ${t.toUserAccount.substring(0, 8)}...`);
      
      if (t.toUserAccount === walletAddress) {
        solChange += amount;
        console.log(`          User RECEIVED ${amount.toFixed(6)} SOL`);
      }
      if (t.fromUserAccount === walletAddress) {
        solChange -= amount;
        console.log(`          User SENT ${amount.toFixed(6)} SOL`);
      }
    });

    console.log(`      Total SOL change: ${solChange.toFixed(6)}`);
    console.log(`      Token changes:`, Object.fromEntries(
      Array.from(tokenChanges.entries()).map(([mint, change]) => [
        mint.substring(0, 8) + '...', 
        change.toFixed(6)
      ])
    ));

    // Filter out tokens with no significant net change - be more lenient
    const significantChanges = new Map([...tokenChanges.entries()].filter(([_, change]) => 
      Math.abs(change) > 0.0000001 // Much lower threshold
    ));

    console.log(`      Significant token changes: ${significantChanges.size}`);
    console.log(`      Absolute SOL change: ${Math.abs(solChange).toFixed(6)}`);

    if (significantChanges.size === 0) {
      console.log(`      ❌ No significant token changes detected`);
      return null;
    }
    
    if (Math.abs(solChange) < 0.0000001) { // Much lower threshold
      console.log(`      ❌ No significant SOL change detected`);
      return null;
    }

    // Find the main token with the largest absolute change
    const [mainTokenMint, mainTokenNetAmount] = [...significantChanges.entries()].reduce((a, b) => 
      Math.abs(a[1]) > Math.abs(b[1]) ? a : b
    );

    const direction = mainTokenNetAmount > 0 ? 'buy' : 'sell';
    const tokenAmount = Math.abs(mainTokenNetAmount);
    const solAmount = Math.abs(solChange);

    console.log(`      Main token: ${mainTokenMint.substring(0, 8)}...`);
    console.log(`      Direction: ${direction.toUpperCase()}`);
    console.log(`      Token amount: ${tokenAmount.toFixed(6)}`);
    console.log(`      SOL amount: ${solAmount.toFixed(6)}`);

    // Validate the trade makes sense
    if (solAmount < 0.000001) {
      console.log(`      ❌ SOL amount too small: ${solAmount}`);
      return null;
    }
    
    if (tokenAmount < 0.000001) {
      console.log(`      ❌ Token amount too small: ${tokenAmount}`);
      return null;
    }

    // Price sanity check
    const pricePerToken = solAmount / tokenAmount;
    console.log(`      Price per token: ${pricePerToken.toFixed(8)} SOL`);
    
    if (pricePerToken > 100) {
      console.log(`      ⚠️  High price detected: ${pricePerToken} SOL/token`);
    }
    
    if (pricePerToken < 0.00000001) {
      console.log(`      ⚠️  Very low price detected: ${pricePerToken} SOL/token`);
    }

    console.log(`      ✅ Trade analysis successful`);
    
    return {
      direction,
      tokenMint: mainTokenMint,
      tokenAmount,
      solAmount,
    };
  }

  // And normalizeTokenAmount:
  private normalizeTokenAmount(tokenTransfer: any): number {
    // Handle both old and new format
    if (typeof tokenTransfer.tokenAmount === 'number') {
      return Math.abs(tokenTransfer.tokenAmount);
    }
    
    if (typeof tokenTransfer.tokenAmount === 'string') {
      return Math.abs(parseFloat(tokenTransfer.tokenAmount));
    }
    
    // Handle rawTokenAmount format
    if (tokenTransfer.rawTokenAmount && tokenTransfer.rawTokenAmount.tokenAmount) {
      const amount = parseFloat(tokenTransfer.rawTokenAmount.tokenAmount);
      const decimals = tokenTransfer.rawTokenAmount.decimals || 0;
      return Math.abs(amount / Math.pow(10, decimals));
    }
    
    return 0;
  }
}
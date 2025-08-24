import axios, { AxiosResponse } from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { TransactionSignature, ParsedTransaction } from '../types';
import https from 'https';
import crypto from 'crypto';

export class DataAcquisitionService {
  private connection: Connection;
  private heliusApiKey: string;
  private blockDaemonApiKey?: string;
  private instantNodesConnection?: Connection;
  private heliusConnection?: Connection;
  private requestCount = 0;
  private maxRequestsPerSession = 10000;
  private lastRequestTime = 0;
  private minRequestInterval = 50; // 50ms between requests
  private httpsAgent: https.Agent;

  constructor(rpcUrl: string, heliusApiKey: string, blockDaemonApiKey?: string) {
    this.validateInputs(rpcUrl, heliusApiKey, blockDaemonApiKey);
    
    this.connection = new Connection(rpcUrl);
    this.heliusApiKey = heliusApiKey;
    this.blockDaemonApiKey = blockDaemonApiKey;
    
    // Configure secure HTTPS agent
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      timeout: 30000,
      maxSockets: 10,
      rejectUnauthorized: true
    });
    
    // Create separate connections for different providers
    const instantNodesUrl = process.env.INSTANTNODES_RPC_URL;
    const heliusUrl = process.env.HELIUS_RPC_URL;
    
    if (instantNodesUrl) {
      this.instantNodesConnection = new Connection(instantNodesUrl);
      console.log('🚀 InstantNodes connection established');
    }
    
    if (heliusUrl) {
      this.heliusConnection = new Connection(heliusUrl);
      console.log('🔗 Helius connection established');
    }
  }

  /**
   * Validate constructor inputs
   */
  private validateInputs(rpcUrl: string, heliusApiKey: string, blockDaemonApiKey?: string): void {
    if (!rpcUrl || typeof rpcUrl !== 'string') {
      throw new Error('Invalid RPC URL');
    }
    
    if (!heliusApiKey || typeof heliusApiKey !== 'string' || heliusApiKey.length < 10) {
      throw new Error('Invalid Helius API key');
    }
    
    if (blockDaemonApiKey && typeof blockDaemonApiKey !== 'string') {
      throw new Error('Invalid BlockDaemon API key');
    }
    
    // Validate URL format
    try {
      new URL(rpcUrl);
    } catch {
      throw new Error('Invalid RPC URL format');
    }
  }

  /**
   * Hash address for privacy in logs
   */
  private hashAddress(address: string): string {
    return crypto.createHash('sha256').update(address).digest('hex').slice(0, 12);
  }

  /**
   * Enforce rate limiting between requests
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Validate API response for security
   */
  private validateApiResponse(response: AxiosResponse): void {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid API response format');
    }
    
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    if (!response.data) {
      throw new Error('API response missing data');
    }
    
    // Check for potential XSS in response
    const responseStr = JSON.stringify(response.data);
    if (responseStr.includes('<script>') || responseStr.includes('javascript:')) {
      throw new Error('Suspicious content detected in API response');
    }
  }

  /**
   * Stage 1: Fetch all transaction signatures for a wallet address
   * Uses getSignaturesForAddress with pagination to ensure no transactions are missed
   */
  async fetchAllTransactionSignatures(
    walletAddress: string,
    daysBack: number
  ): Promise<TransactionSignature[]> {
    const publicKey = new PublicKey(walletAddress);
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (daysBack * 24 * 60 * 60);
    
    const allSignatures: TransactionSignature[] = [];
    let before: string | undefined = undefined;
    
    console.log(`Fetching transaction signatures for ${this.hashAddress(walletAddress)} over the last ${daysBack} days...`);
    
    while (true) {
      try {
        // Try InstantNodes first, then Helius, then default connection
        let signatures;
        
        if (this.instantNodesConnection) {
          try {
            signatures = await this.instantNodesConnection.getSignaturesForAddress(
              publicKey,
              {
                limit: 1000,
                before: before,
              }
            );
            console.log('✅ Using InstantNodes for signature fetching');
          } catch (instantNodesError) {
            console.log('⚠️ InstantNodes failed, trying Helius...');
            if (this.heliusConnection) {
              signatures = await this.heliusConnection.getSignaturesForAddress(
                publicKey,
                {
                  limit: 1000,
                  before: before,
                }
              );
              console.log('✅ Using Helius for signature fetching');
            } else {
              throw instantNodesError;
            }
          }
        } else if (this.heliusConnection) {
          signatures = await this.heliusConnection.getSignaturesForAddress(
            publicKey,
            {
              limit: 1000,
              before: before,
            }
          );
          console.log('✅ Using Helius for signature fetching');
        } else {
          signatures = await this.connection.getSignaturesForAddress(
            publicKey,
            {
              limit: 1000,
              before: before,
            }
          );
          console.log('✅ Using default connection for signature fetching');
        }

        if (signatures.length === 0) {
          break;
        }

        // Filter signatures by blockTime - be more inclusive
        const filteredSignatures = signatures.filter(
          sig => sig.blockTime && sig.blockTime >= startTime
        );

        allSignatures.push(...filteredSignatures);

        // Check if we've reached transactions older than our analysis period
        const oldestSignature = signatures[signatures.length - 1];
        if (oldestSignature.blockTime && oldestSignature.blockTime < startTime) {
          break;
        }

        // Set the before parameter for the next iteration
        before = oldestSignature.signature;

        console.log(`Fetched ${signatures.length} signatures, total so far: ${allSignatures.length}`);
        
        // Rate limiting and request tracking
        await this.enforceRateLimit();
        this.requestCount++;
        
        if (this.requestCount > this.maxRequestsPerSession) {
          throw new Error('Maximum requests per session exceeded');
        }
        
      } catch (error) {
        console.error('Error fetching signatures:', error);
        throw error;
      }
    }

    console.log(`Total signatures fetched: ${allSignatures.length}`);
    return allSignatures;
  }

  /**
   * Parse transactions using BlockDaemon API
   */
  private async parseTransactionsBlockDaemon(signatures: string[]): Promise<ParsedTransaction[]> {
    if (!this.blockDaemonApiKey) {
      throw new Error('BlockDaemon API key not configured');
    }

    const parsedTransactions: ParsedTransaction[] = [];
    
    console.log(`Parsing ${signatures.length} transactions via BlockDaemon API...`);

    for (const signature of signatures) {
      try {
        const response = await axios.post(
          'https://svc.blockdaemon.com/solana/mainnet/native',
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }]
          },
          {
            headers: {
              'Authorization': `Bearer ${this.blockDaemonApiKey}`,
              'Content-Type': 'application/json',
              'User-Agent': 'SolanaWalletAnalyzer/1.0'
            },
            httpsAgent: this.httpsAgent,
            timeout: 30000,
            maxRedirects: 0
          }
        );
        
        // Validate response
        this.validateApiResponse(response);

        if (response.data?.result) {
          // Transform BlockDaemon format to match our expected format
          const tx = this.transformBlockDaemonTransaction(response.data.result, signature);
          if (tx) {
            parsedTransactions.push(tx);
          }
        }

        // Rate limiting - conservative approach
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`Error parsing transaction ${signature} via BlockDaemon:`, error);
        continue;
      }
    }

    console.log(`BlockDaemon parsed ${parsedTransactions.length} transactions`);
    return parsedTransactions;
  }

  /**
   * Transform BlockDaemon transaction format to our expected format
   */
  private transformBlockDaemonTransaction(bdTx: any, signature: string): ParsedTransaction | null {
    try {
      return {
        signature: signature,
        slot: bdTx.slot || 0,
        blockTime: bdTx.blockTime,
        fee: bdTx.meta?.fee ? bdTx.meta.fee / 1e9 : 0,
        type: this.inferTransactionTypeFromBlockDaemon(bdTx),
        source: 'blockdaemon',
        instructions: bdTx.transaction?.message?.instructions || [],
        tokenTransfers: this.extractTokenTransfers(bdTx),
        nativeTransfers: this.extractNativeTransfers(bdTx),
        events: bdTx.meta || {}
      };
    } catch (error) {
      console.error('Error transforming BlockDaemon transaction:', error);
      return null;
    }
  }

  /**
   * Infer transaction type from BlockDaemon data
   */
  private inferTransactionTypeFromBlockDaemon(bdTx: any): string {
    // Check for token transfers
    if (bdTx.meta?.preTokenBalances?.length > 0 || bdTx.meta?.postTokenBalances?.length > 0) {
      return 'TOKEN_TRANSFER';
    }
    
    // Check for SOL transfers
    if (bdTx.meta?.preBalances?.length > 0 && bdTx.meta?.postBalances?.length > 0) {
      const hasBalanceChange = bdTx.meta.preBalances.some((pre: number, index: number) => 
        pre !== bdTx.meta.postBalances[index]
      );
      if (hasBalanceChange) {
        return 'SOL_TRANSFER';
      }
    }
    
    // Check for swap-related instructions
    const instructions = bdTx.transaction?.message?.instructions || [];
    for (const instruction of instructions) {
      if (instruction.programId === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' ||
          instruction.programId === '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM') {
        return 'SWAP';
      }
    }
    
    return 'UNKNOWN';
  }

  /**
   * Extract token transfers from BlockDaemon transaction
   */
  private extractTokenTransfers(bdTx: any): any[] {
    const tokenTransfers: any[] = [];
    
    if (bdTx.meta?.preTokenBalances && bdTx.meta?.postTokenBalances) {
      // Compare pre and post token balances to identify transfers
      const preBalances = bdTx.meta.preTokenBalances;
      const postBalances = bdTx.meta.postTokenBalances;
      
      // This is a simplified extraction - you may need to enhance based on actual data structure
      for (let i = 0; i < Math.max(preBalances.length, postBalances.length); i++) {
        const preBal = preBalances[i];
        const postBal = postBalances[i];
        
        if (preBal && postBal && preBal.uiTokenAmount.amount !== postBal.uiTokenAmount.amount) {
          tokenTransfers.push({
            mint: preBal.mint || postBal.mint,
            fromTokenAccount: preBal.accountIndex,
            toTokenAccount: postBal.accountIndex,
            tokenAmount: Math.abs(postBal.uiTokenAmount.uiAmount - preBal.uiTokenAmount.uiAmount)
          });
        }
      }
    }
    
    return tokenTransfers;
  }

  /**
   * Extract native transfers from BlockDaemon transaction
   */
  private extractNativeTransfers(bdTx: any): any[] {
    const nativeTransfers: any[] = [];
    
    if (bdTx.meta?.preBalances && bdTx.meta?.postBalances) {
      for (let i = 0; i < bdTx.meta.preBalances.length; i++) {
        const preBalance = bdTx.meta.preBalances[i];
        const postBalance = bdTx.meta.postBalances[i];
        const diff = postBalance - preBalance;
        
        if (diff !== 0) {
          nativeTransfers.push({
            account: bdTx.transaction?.message?.accountKeys?.[i] || `index_${i}`,
            amount: Math.abs(diff) / 1e9, // Convert lamports to SOL
            direction: diff > 0 ? 'in' : 'out'
          });
        }
      }
    }
    
    return nativeTransfers;
  }

  /**
   * Parse transactions with dual API support and comparison
   */
  async parseTransactionsWithComparison(signatures: string[], signatureBlockTimeMap: Record<string, number | null>): Promise<{
    transactions: ParsedTransaction[],
    comparison: {
      heliusCount: number,
      solanaBeachCount: number,
      discrepancies: string[]
    }
  }> {
    const heliusResults = await this.parseTransactions(signatures, signatureBlockTimeMap);
    
    let solanaBeachResults: ParsedTransaction[] = [];
    let comparison = {
      heliusCount: heliusResults.length,
      solanaBeachCount: 0,
      discrepancies: [] as string[]
    };

    if (this.blockDaemonApiKey) {
      try {
        // Test with first 10 signatures to avoid rate limits during comparison
        const testSignatures = signatures.slice(0, 10);
        const blockDaemonResults = await this.parseTransactionsBlockDaemon(testSignatures);
        comparison.solanaBeachCount = blockDaemonResults.length;
        
        // Compare results
        comparison.discrepancies = this.compareTransactionResults(
          heliusResults.slice(0, 10),
          blockDaemonResults
        );
      } catch (error) {
        console.error('BlockDaemon comparison failed:', error);
        comparison.discrepancies.push(`BlockDaemon API failed: ${error}`);
      }
    }

    return {
      transactions: heliusResults,
      comparison
    };
  }

  /**
   * Compare transaction results between APIs
   */
  private compareTransactionResults(heliusResults: ParsedTransaction[], solanaBeachResults: ParsedTransaction[]): string[] {
    const discrepancies: string[] = [];
    
    // Create maps for easier comparison
    const heliusMap = new Map(heliusResults.map(tx => [tx.signature, tx]));
    const solanaBeachMap = new Map(solanaBeachResults.map(tx => [tx.signature, tx]));
    
    // Check for missing transactions
    for (const signature of heliusMap.keys()) {
      if (!solanaBeachMap.has(signature)) {
        discrepancies.push(`Missing from BlockDaemon: ${signature}`);
      }
    }
    
    for (const signature of solanaBeachMap.keys()) {
      if (!heliusMap.has(signature)) {
        discrepancies.push(`Missing from Helius: ${signature}`);
      }
    }
    
    // Compare matching transactions
    for (const [signature, heliusTx] of heliusMap) {
      const blockDaemonTx = solanaBeachMap.get(signature);
      if (blockDaemonTx) {
        if (heliusTx.type !== blockDaemonTx.type) {
          discrepancies.push(`Type mismatch for ${signature}: Helius=${heliusTx.type}, BlockDaemon=${blockDaemonTx.type}`);
        }
        
        if (Math.abs(heliusTx.fee - blockDaemonTx.fee) > 0.0001) {
          discrepancies.push(`Fee mismatch for ${signature}: Helius=${heliusTx.fee}, BlockDaemon=${blockDaemonTx.fee}`);
        }
      }
    }
    
    return discrepancies;
  }

  /**
   * Stage 2: Parse transaction signatures into human-readable JSON using Helius Enhanced Transactions API
   * Now with blockTime fallback from signature fetch.
   */
  async parseTransactions(signatures: string[], signatureBlockTimeMap: Record<string, number | null>): Promise<ParsedTransaction[]> {
    const batchSize = 100;
    const allParsedTransactions: ParsedTransaction[] = [];
    
    console.log(`Parsing ${signatures.length} transactions in batches of ${batchSize}...`);

    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      
      try {
        const response = await axios.post(
          `https://api.helius.xyz/v0/transactions/?api-key=${this.heliusApiKey}`,
          {
            transactions: batch
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'SolanaWalletAnalyzer/1.0'
            },
            httpsAgent: this.httpsAgent,
            timeout: 30000,
            maxRedirects: 0
          }
        );
        
        // Validate response
        this.validateApiResponse(response);

        if (response.data && Array.isArray(response.data)) {
          const parsedBatch = response.data.filter((tx: any) => tx !== null).map((tx: any) => {
            // Convert fee from lamports to SOL
            if (tx.fee && typeof tx.fee === 'number') {
              tx.fee = tx.fee / 1e9;
            }
            // Fallback: if blockTime is missing/null, set from signature map
            if ((!tx.blockTime || tx.blockTime === null) && tx.signature && signatureBlockTimeMap[tx.signature]) {
              tx.blockTime = signatureBlockTimeMap[tx.signature];
            }
            return tx;
          });
          allParsedTransactions.push(...parsedBatch);
        }

        console.log(`Parsed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(signatures.length / batchSize)}`);
        
        // Rate limiting and request tracking
        await this.enforceRateLimit();
        this.requestCount++;
        
        if (this.requestCount > this.maxRequestsPerSession) {
          throw new Error('Maximum requests per session exceeded');
        }
        
      } catch (error) {
        console.error(`Error parsing batch starting at index ${i}:`, error);
        // Continue with next batch instead of failing completely
        continue;
      }
    }

    console.log(`Successfully parsed ${allParsedTransactions.length} transactions`);
    return allParsedTransactions;
  }

  /**
   * Complete data acquisition pipeline with dual API support
   */
  async acquireTransactionData(
    walletAddress: string,
    daysBack: number,
    enableComparison: boolean = false
  ): Promise<ParsedTransaction[]> {
    console.log('Starting data acquisition pipeline...');
    
    try {
      // Stage 1: Fetch all signatures
      const signatures = await this.fetchAllTransactionSignatures(walletAddress, daysBack);
      if (signatures.length === 0) {
        console.log('No transactions found for the specified time period');
        return [];
      }
      
      // Build signature->blockTime map
      const signatureBlockTimeMap: Record<string, number | null> = {};
      for (const sig of signatures) {
        signatureBlockTimeMap[sig.signature] = sig.blockTime || null;
      }
      
      const signatureStrings = signatures.map(sig => sig.signature);
      
      // Stage 2: Parse transactions with optional comparison
      if (enableComparison && this.blockDaemonApiKey) {
        console.log('🔄 Running dual API comparison...');
        const result = await this.parseTransactionsWithComparison(signatureStrings, signatureBlockTimeMap);
        
        // Log comparison results
        if (result.comparison.discrepancies.length > 0) {
          console.log('⚠️  API Discrepancies found:');
          result.comparison.discrepancies.forEach(discrepancy => {
            console.log(`  - ${discrepancy}`);
          });
        } else {
          console.log('✅ No discrepancies found between APIs');
        }
        
        console.log(`📊 Comparison summary: Helius=${result.comparison.heliusCount}, BlockDaemon=${result.comparison.solanaBeachCount}`);
        
        return result.transactions;
      } else {
        // Standard parsing with fallback
        const parsedTransactions = await this.parseTransactionsWithFallback(signatureStrings, signatureBlockTimeMap);
        console.log('Data acquisition pipeline completed');
        return parsedTransactions;
      }
    } catch (error) {
      console.error('Data acquisition pipeline failed:', error);
      throw error;
    }
  }

  /**
   * Parse transactions with fallback support
   */
  private async parseTransactionsWithFallback(signatures: string[], signatureBlockTimeMap: Record<string, number | null>): Promise<ParsedTransaction[]> {
    // Try Helius first (enhanced parsing), then BlockDaemon
    // Note: InstantNodes is used for signature fetching, Helius for transaction parsing
    
    try {
      console.log('🔗 Attempting Helius transaction parsing...');
      return await this.parseTransactions(signatures, signatureBlockTimeMap);
    } catch (heliusError) {
      console.error('Helius parsing failed:', heliusError);
      
      if (this.blockDaemonApiKey) {
        console.log('🔄 Falling back to BlockDaemon API...');
        try {
          return await this.parseTransactionsBlockDaemon(signatures);
        } catch (blockDaemonError) {
          console.error('BlockDaemon fallback also failed:', blockDaemonError);
          throw new Error('Both Helius and BlockDaemon APIs failed to parse transactions');
        }
      } else {
        throw heliusError;
      }
    }
  }
} 
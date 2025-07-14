import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { TransactionSignature, ParsedTransaction } from '../types';

export class DataAcquisitionService {
  private connection: Connection;
  private heliusApiKey: string;

  constructor(rpcUrl: string, heliusApiKey: string) {
    this.connection = new Connection(rpcUrl);
    this.heliusApiKey = heliusApiKey;
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
    
    console.log(`Fetching transaction signatures for ${walletAddress} over the last ${daysBack} days...`);
    
    while (true) {
      try {
        const signatures = await this.connection.getSignaturesForAddress(
          publicKey,
          {
            limit: 1000,
            before: before,
          }
        );

        if (signatures.length === 0) {
          break;
        }

        // Filter signatures by blockTime
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
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error('Error fetching signatures:', error);
        throw error;
      }
    }

    console.log(`Total signatures fetched: ${allSignatures.length}`);
    return allSignatures;
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
              'Content-Type': 'application/json'
            }
          }
        );

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
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
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
   * Complete data acquisition pipeline
   */
  async acquireTransactionData(
    walletAddress: string,
    daysBack: number
  ): Promise<ParsedTransaction[]> {
    console.log('Starting data acquisition pipeline...');
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
    // Stage 2: Parse transactions (with blockTime fallback)
    const signatureStrings = signatures.map(sig => sig.signature);
    const parsedTransactions = await this.parseTransactions(signatureStrings, signatureBlockTimeMap);
    console.log('Data acquisition pipeline completed');
    return parsedTransactions;
  }
} 
import axios from 'axios';
import { TokenPrice } from '../types';

export class PriceService {
  private jupiterApiKey: string;

  constructor(jupiterApiKey: string) {
    this.jupiterApiKey = jupiterApiKey;
  }

  /**
   * Get current SOL/USD price from CoinGecko
   */
  async getSolUsdPrice(): Promise<number> {
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
      );
      
      if (response.data && response.data.solana && response.data.solana.usd) {
        return response.data.solana.usd;
      }
      
      throw new Error('Invalid response format from CoinGecko');
    } catch (error) {
      console.error('Error fetching SOL/USD price:', error);
      // Return a fallback price if API fails
      return 100; // Approximate SOL price as fallback
    }
  }

  /**
   * Get current token prices in SOL and USD using Jupiter Lite Price API
   */
  async getTokenPricesInSol(tokenMints: string[]): Promise<TokenPrice[]> {
    const prices: TokenPrice[] = [];
    const batchSize = 100; // This API can handle larger batches

    // Get current SOL/USD price for conversion
    const solUsdPrice = await this.getSolUsdPrice();

    for (let i = 0; i < tokenMints.length; i += batchSize) {
      const batch = tokenMints.slice(i, i + batchSize);
      try {
        const ids = batch.join(',');

        // Using the correct endpoint from your screenshot
        const response = await axios.get(
          `https://lite-api.jup.ag/price/v3?ids=${ids}`
        );
        
        if (response.data) {
          // The v3 API returns an object where keys are the mint addresses
          for (const mint of batch) {
            const priceData = response.data[mint];
            if (priceData && typeof priceData.usdPrice === 'number' && priceData.usdPrice > 0) {
              const priceInUsd = priceData.usdPrice;
              const priceInSol = priceInUsd / solUsdPrice; // Convert USD to SOL
              
              prices.push({
                mint: mint,
                priceInSol: priceInSol,
                priceInUsd: priceInUsd,
              });
            }
          }
        }
        
        // Add delay between batches to be respectful to the API
        if (i + batchSize < tokenMints.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        // Updated error logging for clarity
        console.error(`Failed to fetch price for batch. Error: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }
    
    return prices;
  }

  /**
   * Calculate USD prices for tokens (no-op, already in USD)
   */
  async calculateUsdPrices(tokenPrices: TokenPrice[]): Promise<TokenPrice[]> {
    return tokenPrices;
  }

  /**
   * Get comprehensive price data for a list of token mints
   */
  async getComprehensivePrices(tokenMints: string[]): Promise<TokenPrice[]> {
    console.log(`Fetching prices for ${tokenMints.length} tokens...`);
    const tokenPrices = await this.getTokenPricesInSol(tokenMints);
    const pricesWithUsd = await this.calculateUsdPrices(tokenPrices);
    console.log(`Successfully fetched prices for ${pricesWithUsd.length} tokens`);
    return pricesWithUsd;
  }
} 
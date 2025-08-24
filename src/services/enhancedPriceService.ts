import axios from 'axios';
import { TokenPrice } from '../types';
import { CacheService } from './cacheService';

interface PriceValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
}

interface HistoricalPriceRequest {
  tokenMint: string;
  timestamp: number;
  tolerance: number; // seconds
}

export class EnhancedPriceService {
  private jupiterApiKey: string;
  private cache: CacheService;
  private priceValidationCache: Map<string, PriceValidationResult> = new Map();
  private historicalPriceCache: Map<string, { price: number; timestamp: number }> = new Map();

  constructor(jupiterApiKey: string) {
    this.jupiterApiKey = jupiterApiKey;
    this.cache = CacheService.getInstance();
  }

  /**
   * Get current SOL/USD price with validation
   */
  async getSolUsdPrice(): Promise<{ price: number; confidence: number }> {
    const cacheKey = 'sol_usd_price';
    const cached = this.cache.get(cacheKey) as { price: number; confidence: number } | null;
    
    if (cached) {
      return cached;
    }

    try {
      // Try multiple sources for better reliability
      const sources = [
        () => this.fetchSolPriceFromCoinGecko(),
        () => this.fetchSolPriceFromJupiter()
      ];

      const prices: number[] = [];
      
      for (const source of sources) {
        try {
          const price = await source();
          if (price > 0 && price < 10000) { // Sanity check
            prices.push(price);
          }
        } catch (error) {
          console.warn('Price source failed:', error);
        }
      }

      if (prices.length === 0) {
        throw new Error('All price sources failed');
      }

      // Calculate consensus price and confidence
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const priceVariance = prices.reduce((sum, p) => sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
      const confidence = Math.max(0, 100 - (priceVariance / avgPrice * 100));

      const result = { price: avgPrice, confidence };
      
      // Cache for 1 minute
      this.cache.set(cacheKey, result, 60000);
      
      return result;
    } catch (error) {
      console.error('Error fetching SOL/USD price:', error);
      // Return fallback with low confidence
      return { price: 100, confidence: 10 };
    }
  }

  /**
   * Fetch SOL price from CoinGecko
   */
  private async fetchSolPriceFromCoinGecko(): Promise<number> {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { timeout: 5000 }
    );
    
    if (response.data && response.data.solana && response.data.solana.usd) {
      return response.data.solana.usd;
    }
    
    throw new Error('Invalid response from CoinGecko');
  }

  /**
   * Fetch SOL price from Jupiter (if available)
   */
  private async fetchSolPriceFromJupiter(): Promise<number> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const response = await axios.get(
      `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`,
      { timeout: 5000 }
    );
    
    if (response.data && response.data[SOL_MINT] && response.data[SOL_MINT].usdPrice) {
      return response.data[SOL_MINT].usdPrice;
    }
    
    throw new Error('SOL price not available from Jupiter');
  }


  /**
   * Get token prices with enhanced validation
   */
  async getTokenPricesInSol(tokenMints: string[]): Promise<TokenPrice[]> {
    const prices: TokenPrice[] = [];
    const batchSize = 100;

    // Get current SOL/USD price
    const solPriceResult = await this.getSolUsdPrice();
    const solUsdPrice = solPriceResult.price;

    console.log(`Fetching prices for ${tokenMints.length} tokens...`);
    console.log(`SOL/USD price: $${solUsdPrice.toFixed(2)} (confidence: ${solPriceResult.confidence.toFixed(1)}%)`);

    for (let i = 0; i < tokenMints.length; i += batchSize) {
      const batch = tokenMints.slice(i, i + batchSize);
      
      try {
        const batchPrices = await this.fetchTokenPriceBatch(batch, solUsdPrice);
        
        // Validate each price
        for (const price of batchPrices) {
          const validation = this.validateTokenPrice(price);
          if (validation.isValid) {
            prices.push(price);
          } else {
            console.warn(`Invalid price for ${price.mint.slice(0, 8)}...: ${validation.issues.join(', ')}`);
          }
        }
        
        // Rate limiting
        if (i + batchSize < tokenMints.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`Failed to fetch price batch: ${error}`);
        continue;
      }
    }
    
    console.log(`Successfully validated ${prices.length} prices out of ${tokenMints.length} requested`);
    return prices;
  }

  /**
   * Fetch a batch of token prices
   */
  private async fetchTokenPriceBatch(tokenMints: string[], solUsdPrice: number): Promise<TokenPrice[]> {
    const prices: TokenPrice[] = [];
    const ids = tokenMints.join(',');

    // Check cache first
    const cachedPrices: TokenPrice[] = [];
    const uncachedMints: string[] = [];
    
    for (const mint of tokenMints) {
      const cached = this.cache.getCachedPriceData(mint);
      if (cached !== null) {
        cachedPrices.push({
          mint,
          priceInSol: cached,
          priceInUsd: cached * solUsdPrice
        });
      } else {
        uncachedMints.push(mint);
      }
    }

    if (uncachedMints.length === 0) {
      return cachedPrices;
    }

    // Fetch uncached prices
    const response = await axios.get(
      `https://lite-api.jup.ag/price/v3?ids=${uncachedMints.join(',')}`,
      { timeout: 10000 }
    );
    
    if (response.data) {
      for (const mint of uncachedMints) {
        const priceData = response.data[mint];
        if (priceData && typeof priceData.usdPrice === 'number' && priceData.usdPrice > 0) {
          const priceInUsd = priceData.usdPrice;
          const priceInSol = priceInUsd / solUsdPrice;
          
          const tokenPrice: TokenPrice = {
            mint: mint,
            priceInSol: priceInSol,
            priceInUsd: priceInUsd,
          };
          
          prices.push(tokenPrice);
          
          // Cache the price
          this.cache.cachePriceData(mint, priceInSol);
        }
      }
    }
    
    return [...cachedPrices, ...prices];
  }

  /**
   * Validate token price for reasonableness
   */
  private validateTokenPrice(price: TokenPrice): PriceValidationResult {
    const issues: string[] = [];
    let confidence = 100;

    // Check for extreme values
    if (price.priceInUsd > 100000) {
      issues.push('Price too high (>$100k)');
      confidence -= 50;
    }

    if (price.priceInUsd < 0.0000001) {
      issues.push('Price too low (<$0.0000001)');
      confidence -= 30;
    }

    if (price.priceInSol > 1000) {
      issues.push('SOL price too high (>1000 SOL)');
      confidence -= 40;
    }

    if (price.priceInSol < 0.000000001) {
      issues.push('SOL price too low');
      confidence -= 20;
    }

    // Check for NaN or infinity
    if (!isFinite(price.priceInUsd) || !isFinite(price.priceInSol)) {
      issues.push('Non-finite price values');
      confidence = 0;
    }

    // Check price consistency
    const expectedSolPrice = price.priceInUsd / 100; // Assuming ~$100 SOL
    const actualSolPrice = price.priceInSol;
    const priceDifference = Math.abs(expectedSolPrice - actualSolPrice) / expectedSolPrice;

    if (priceDifference > 0.5) { // 50% difference threshold
      issues.push('Price inconsistency between USD and SOL');
      confidence -= 25;
    }

    return {
      isValid: issues.length === 0 && confidence > 50,
      confidence: Math.max(0, confidence),
      issues
    };
  }

  /**
   * Get historical price (simplified implementation)
   */
  async getHistoricalPrice(tokenMint: string, timestamp: number): Promise<TokenPrice | null> {
    const cacheKey = `historical_${tokenMint}_${timestamp}`;
    const cached = this.historicalPriceCache.get(cacheKey);
    
    if (cached && Math.abs(cached.timestamp - timestamp) < 3600) { // 1 hour tolerance
      const solPrice = await this.getSolUsdPrice();
      return {
        mint: tokenMint,
        priceInSol: cached.price,
        priceInUsd: cached.price * solPrice.price
      };
    }

    // For now, return current price as fallback
    // In a production system, you'd use a historical price API
    console.warn(`Historical price not available for ${tokenMint.slice(0, 8)}... at ${new Date(timestamp * 1000).toISOString()}`);
    
    try {
      const currentPrices = await this.getTokenPricesInSol([tokenMint]);
      return currentPrices.length > 0 ? currentPrices[0] : null;
    } catch (error) {
      console.error('Failed to get fallback current price:', error);
      return null;
    }
  }

  /**
   * Validate price data quality for a set of tokens
   */
  validatePriceDataQuality(prices: TokenPrice[]): {
    validPrices: number;
    invalidPrices: number;
    averageConfidence: number;
    issues: string[];
  } {
    let validPrices = 0;
    let invalidPrices = 0;
    let totalConfidence = 0;
    const issues: string[] = [];

    for (const price of prices) {
      const validation = this.validateTokenPrice(price);
      if (validation.isValid) {
        validPrices++;
      } else {
        invalidPrices++;
        issues.push(`${price.mint.slice(0, 8)}...: ${validation.issues.join(', ')}`);
      }
      totalConfidence += validation.confidence;
    }

    const averageConfidence = prices.length > 0 ? totalConfidence / prices.length : 0;

    return {
      validPrices,
      invalidPrices,
      averageConfidence,
      issues
    };
  }

  /**
   * Get comprehensive price data with quality assessment
   */
  async getComprehensivePrices(tokenMints: string[]): Promise<{
    prices: TokenPrice[];
    qualityReport: {
      validPrices: number;
      invalidPrices: number;
      averageConfidence: number;
      issues: string[];
    };
  }> {
    const prices = await this.getTokenPricesInSol(tokenMints);
    const qualityReport = this.validatePriceDataQuality(prices);
    
    console.log(`Price Quality Report:`);
    console.log(`  Valid prices: ${qualityReport.validPrices}`);
    console.log(`  Invalid prices: ${qualityReport.invalidPrices}`);
    console.log(`  Average confidence: ${qualityReport.averageConfidence.toFixed(1)}%`);
    
    if (qualityReport.issues.length > 0) {
      console.log(`  Issues found: ${qualityReport.issues.length}`);
    }
    
    return { prices, qualityReport };
  }

  /**
   * Cross-validate prices with multiple sources (future enhancement)
   */
  async crossValidatePrices(tokenMints: string[]): Promise<{
    prices: TokenPrice[];
    confidence: number;
    discrepancies: Array<{
      mint: string;
      prices: number[];
      variance: number;
    }>;
  }> {
    // This would implement cross-validation with multiple price sources
    // For now, return single source with confidence scoring
    const prices = await this.getTokenPricesInSol(tokenMints);
    
    return {
      prices,
      confidence: 85, // Placeholder
      discrepancies: []
    };
  }
}
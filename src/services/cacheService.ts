import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class CacheService {
  private static instance: CacheService;
  private cache: Map<string, CacheEntry<any>> = new Map();
  private cacheDir: string;
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.cacheDir = path.join(process.cwd(), '.cache');
    this.ensureCacheDirectory();
    this.loadCacheFromDisk();
    this.startCleanupTimer();
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate cache key from input
   */
  private generateCacheKey(prefix: string, input: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(input));
    return `${prefix}:${hash.digest('hex').slice(0, 16)}`;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Get cached value
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Set cached value
   */
  set<T>(key: string, value: T, ttl: number = this.DEFAULT_TTL): void {
    // Enforce cache size limit
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Cache transaction signatures
   */
  cacheTransactionSignatures(walletAddress: string, daysBack: number, signatures: any[]): void {
    const key = this.generateCacheKey('tx_sigs', { walletAddress, daysBack });
    this.set(key, signatures, 10 * 60 * 1000); // 10 minutes TTL
  }

  /**
   * Get cached transaction signatures
   */
  getCachedTransactionSignatures(walletAddress: string, daysBack: number): any[] | null {
    const key = this.generateCacheKey('tx_sigs', { walletAddress, daysBack });
    return this.get(key);
  }

  /**
   * Cache parsed transactions
   */
  cacheParsedTransactions(signatures: string[], transactions: any[]): void {
    const key = this.generateCacheKey('parsed_tx', signatures.slice(0, 10)); // Use first 10 signatures as key
    this.set(key, transactions, 30 * 60 * 1000); // 30 minutes TTL
  }

  /**
   * Get cached parsed transactions
   */
  getCachedParsedTransactions(signatures: string[]): any[] | null {
    const key = this.generateCacheKey('parsed_tx', signatures.slice(0, 10));
    return this.get(key);
  }

  /**
   * Cache price data
   */
  cachePriceData(tokenMint: string, price: number): void {
    const key = this.generateCacheKey('price', tokenMint);
    this.set(key, price, 2 * 60 * 1000); // 2 minutes TTL for price data
  }

  /**
   * Get cached price data
   */
  getCachedPriceData(tokenMint: string): number | null {
    const key = this.generateCacheKey('price', tokenMint);
    return this.get(key);
  }

  /**
   * Cache wallet analysis results
   */
  cacheWalletAnalysis(walletAddress: string, daysBack: number, analysis: any): void {
    const key = this.generateCacheKey('analysis', { walletAddress, daysBack });
    this.set(key, analysis, 60 * 60 * 1000); // 1 hour TTL
  }

  /**
   * Get cached wallet analysis
   */
  getCachedWalletAnalysis(walletAddress: string, daysBack: number): any | null {
    const key = this.generateCacheKey('analysis', { walletAddress, daysBack });
    return this.get(key);
  }

  /**
   * Evict oldest cache entries
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove oldest 10% of entries
    const toRemove = Math.floor(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Clean expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        toDelete.push(key);
      }
    }
    
    for (const key of toDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Run cleanup every minute
  }

  /**
   * Load cache from disk (simple implementation)
   */
  private loadCacheFromDisk(): void {
    try {
      const cacheFile = path.join(this.cacheDir, 'cache.json');
      if (fs.existsSync(cacheFile)) {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        
        // Only load non-expired entries
        const now = Date.now();
        for (const [key, entry] of Object.entries(cacheData)) {
          const cacheEntry = entry as CacheEntry<any>;
          if (now - cacheEntry.timestamp < cacheEntry.ttl) {
            this.cache.set(key, cacheEntry);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load cache from disk:', error);
    }
  }

  /**
   * Save cache to disk
   */
  saveCacheToDisk(): void {
    try {
      const cacheFile = path.join(this.cacheDir, 'cache.json');
      const cacheData = Object.fromEntries(this.cache.entries());
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.warn('Failed to save cache to disk:', error);
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const memoryUsage = JSON.stringify(Object.fromEntries(this.cache.entries())).length;
    
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
      memoryUsage
    };
  }
}
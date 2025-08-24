import { CacheService } from '../cacheService';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    cacheService = CacheService.getInstance();
    cacheService.clear();
  });

  describe('basic caching operations', () => {
    it('should store and retrieve cached values', () => {
      const key = 'test_key';
      const value = { data: 'test_value' };
      
      cacheService.set(key, value);
      const retrieved = cacheService.get(key);
      
      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', () => {
      const result = cacheService.get('non_existent_key');
      expect(result).toBeNull();
    });

    it('should handle TTL expiration', (done) => {
      const key = 'test_key';
      const value = { data: 'test_value' };
      const ttl = 100; // 100ms
      
      cacheService.set(key, value, ttl);
      
      // Should be available immediately
      expect(cacheService.get(key)).toEqual(value);
      
      // Should be expired after TTL
      setTimeout(() => {
        expect(cacheService.get(key)).toBeNull();
        done();
      }, ttl + 50);
    });
  });

  describe('specialized caching methods', () => {
    it('should cache and retrieve transaction signatures', () => {
      const walletAddress = 'So11111111111111111111111111111111111111112';
      const daysBack = 30;
      const signatures = ['sig1', 'sig2', 'sig3'];
      
      cacheService.cacheTransactionSignatures(walletAddress, daysBack, signatures);
      const retrieved = cacheService.getCachedTransactionSignatures(walletAddress, daysBack);
      
      expect(retrieved).toEqual(signatures);
    });

    it('should cache and retrieve parsed transactions', () => {
      const signatures = ['sig1', 'sig2', 'sig3'];
      const transactions = [{ signature: 'sig1' }, { signature: 'sig2' }];
      
      cacheService.cacheParsedTransactions(signatures, transactions);
      const retrieved = cacheService.getCachedParsedTransactions(signatures);
      
      expect(retrieved).toEqual(transactions);
    });

    it('should cache and retrieve price data', () => {
      const tokenMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const price = 1.0;
      
      cacheService.cachePriceData(tokenMint, price);
      const retrieved = cacheService.getCachedPriceData(tokenMint);
      
      expect(retrieved).toBe(price);
    });

    it('should cache and retrieve wallet analysis', () => {
      const walletAddress = 'So11111111111111111111111111111111111111112';
      const daysBack = 30;
      const analysis = { totalPnL: 100, winRate: 0.75 };
      
      cacheService.cacheWalletAnalysis(walletAddress, daysBack, analysis);
      const retrieved = cacheService.getCachedWalletAnalysis(walletAddress, daysBack);
      
      expect(retrieved).toEqual(analysis);
    });
  });

  describe('cache management', () => {
    it('should clear all cache entries', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      
      cacheService.clear();
      
      expect(cacheService.get('key1')).toBeNull();
      expect(cacheService.get('key2')).toBeNull();
    });

    it('should provide cache statistics', () => {
      cacheService.set('key1', 'value1');
      cacheService.set('key2', 'value2');
      
      const stats = cacheService.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });
});
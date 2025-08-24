import { SecurityUtils } from '../securityUtils';

describe('SecurityUtils', () => {
  describe('validateWalletAddress', () => {
    it('should validate valid Solana wallet addresses', () => {
      const validAddress = 'So11111111111111111111111111111111111111112';
      expect(SecurityUtils.validateWalletAddress(validAddress)).toBe(true);
    });

    it('should reject invalid wallet addresses', () => {
      expect(SecurityUtils.validateWalletAddress('')).toBe(false);
      expect(SecurityUtils.validateWalletAddress('invalid')).toBe(false);
      expect(SecurityUtils.validateWalletAddress('0x123')).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(SecurityUtils.validateWalletAddress(null as any)).toBe(false);
      expect(SecurityUtils.validateWalletAddress(undefined as any)).toBe(false);
      expect(SecurityUtils.validateWalletAddress(123 as any)).toBe(false);
    });
  });

  describe('sanitizeWalletAddress', () => {
    it('should sanitize valid wallet addresses', () => {
      const address = '  So11111111111111111111111111111111111111112  ';
      const sanitized = SecurityUtils.sanitizeWalletAddress(address);
      expect(sanitized).toBe('So11111111111111111111111111111111111111112');
    });

    it('should remove invalid characters', () => {
      const address = 'So11111111111111111111111111111111111111112@#$';
      const sanitized = SecurityUtils.sanitizeWalletAddress(address);
      expect(sanitized).toBe('So11111111111111111111111111111111111111112');
    });

    it('should throw error for invalid lengths', () => {
      expect(() => SecurityUtils.sanitizeWalletAddress('short')).toThrow();
      expect(() => SecurityUtils.sanitizeWalletAddress('verylongaddressthatistoobigforsolanawallets')).toThrow();
    });
  });

  describe('hashAddress', () => {
    it('should hash addresses consistently', () => {
      const address = 'So11111111111111111111111111111111111111112';
      const hash1 = SecurityUtils.hashAddress(address);
      const hash2 = SecurityUtils.hashAddress(address);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(12);
    });

    it('should produce different hashes for different addresses', () => {
      const address1 = 'So11111111111111111111111111111111111111112';
      const address2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const hash1 = SecurityUtils.hashAddress(address1);
      const hash2 = SecurityUtils.hashAddress(address2);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateAnalysisParameters', () => {
    it('should validate correct parameters', () => {
      expect(() => SecurityUtils.validateAnalysisParameters(30)).not.toThrow();
      expect(() => SecurityUtils.validateAnalysisParameters(1)).not.toThrow();
      expect(() => SecurityUtils.validateAnalysisParameters(365)).not.toThrow();
    });

    it('should reject invalid parameters', () => {
      expect(() => SecurityUtils.validateAnalysisParameters(0)).toThrow();
      expect(() => SecurityUtils.validateAnalysisParameters(-1)).toThrow();
      expect(() => SecurityUtils.validateAnalysisParameters(366)).toThrow();
      expect(() => SecurityUtils.validateAnalysisParameters(1.5)).toThrow();
      expect(() => SecurityUtils.validateAnalysisParameters('30' as any)).toThrow();
    });
  });

  describe('formatAddressForDisplay', () => {
    it('should format addresses for display', () => {
      const address = 'So11111111111111111111111111111111111111112';
      const formatted = SecurityUtils.formatAddressForDisplay(address);
      expect(formatted).toBe('So111111...11111112');
    });

    it('should handle short addresses', () => {
      const address = 'short';
      const formatted = SecurityUtils.formatAddressForDisplay(address);
      expect(formatted).toBe('short');
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should sanitize known error types', () => {
      const rateError = new Error('Rate limit exceeded for user');
      const sanitized = SecurityUtils.sanitizeErrorMessage(rateError);
      expect(sanitized).toBe('Rate limit exceeded. Please wait before making another request.');
    });

    it('should sanitize wallet address errors', () => {
      const walletError = new Error('Invalid wallet address format');
      const sanitized = SecurityUtils.sanitizeErrorMessage(walletError);
      expect(sanitized).toBe('Invalid wallet address format');
    });

    it('should sanitize API key errors', () => {
      const apiError = new Error('API key invalid');
      const sanitized = SecurityUtils.sanitizeErrorMessage(apiError);
      expect(sanitized).toBe('API configuration error');
    });

    it('should provide generic message for unknown errors', () => {
      const unknownError = new Error('Some internal error');
      const sanitized = SecurityUtils.sanitizeErrorMessage(unknownError);
      expect(sanitized).toBe('Analysis failed due to an internal error. Please try again later.');
    });
  });
});
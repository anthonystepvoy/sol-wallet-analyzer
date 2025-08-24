import { PublicKey } from '@solana/web3.js';
import crypto from 'crypto';

export class SecurityUtils {
  private static readonly MAX_DAILY_ANALYSES = 1000;
  private static readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private static readonly MIN_ANALYSIS_INTERVAL = 5000; // 5 seconds
  
  private static sessionStartTime = Date.now();
  private static dailyAnalysisCount = 0;
  private static lastAnalysisTime = 0;
  private static requestLog = new Map<string, { count: number; timestamp: number }>();

  /**
   * Validate wallet address format
   */
  static validateWalletAddress(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    try {
      new PublicKey(address.trim());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize wallet address input
   */
  static sanitizeWalletAddress(address: string): string {
    if (!address || typeof address !== 'string') {
      throw new Error('Invalid wallet address input');
    }
    
    // Remove whitespace and common invalid characters
    const sanitized = address.trim().replace(/[^123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]/g, '');
    
    if (sanitized.length < 32 || sanitized.length > 44) {
      throw new Error('Invalid wallet address length');
    }
    
    return sanitized;
  }

  /**
   * Hash address for privacy in logs
   */
  static hashAddress(address: string): string {
    return crypto.createHash('sha256').update(address).digest('hex').slice(0, 12);
  }

  /**
   * Check session timeout
   */
  static checkSessionTimeout(): void {
    const now = Date.now();
    if (now - this.sessionStartTime > this.SESSION_TIMEOUT) {
      console.log('⏰ Session timeout reached. Exiting for security.');
      process.exit(0);
    }
  }

  /**
   * Check daily analysis limits
   */
  static checkDailyLimits(): void {
    if (this.dailyAnalysisCount >= this.MAX_DAILY_ANALYSES) {
      console.log('📊 Daily analysis limit reached. Please try again tomorrow.');
      process.exit(0);
    }
  }

  /**
   * Rate limiting between analyses
   */
  static enforceAnalysisRateLimit(): void {
    const now = Date.now();
    const timeSinceLastAnalysis = now - this.lastAnalysisTime;
    
    if (timeSinceLastAnalysis < this.MIN_ANALYSIS_INTERVAL) {
      const waitTime = this.MIN_ANALYSIS_INTERVAL - timeSinceLastAnalysis;
      console.log(`⏳ Rate limiting: waiting ${Math.ceil(waitTime/1000)}s before next analysis`);
      
      // Sleep synchronously for security
      const start = Date.now();
      while (Date.now() - start < waitTime) {
        // Busy wait
      }
    }
    
    this.lastAnalysisTime = Date.now();
  }

  /**
   * Increment daily analysis count
   */
  static incrementAnalysisCount(): void {
    this.dailyAnalysisCount++;
  }

  /**
   * Reset session (for error recovery)
   */
  static resetSession(): void {
    this.sessionStartTime = Date.now();
    console.log('🔄 Session reset for security');
  }

  /**
   * Validate environment variables
   */
  static validateEnvironment(): void {
    const requiredEnvVars = ['HELIUS_API_KEY'];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        console.error(`❌ Missing required environment variable: ${envVar}`);
        process.exit(1);
      }
    }
    
    // Validate API key formats
    const heliusApiKey = process.env.HELIUS_API_KEY;
    if (heliusApiKey && (heliusApiKey.length < 10 || heliusApiKey.includes(' '))) {
      console.error('❌ Invalid Helius API key format');
      process.exit(1);
    }

    // Check for suspicious environment variables
    const suspiciousEnvVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'NODE_TLS_REJECT_UNAUTHORIZED'];
    for (const envVar of suspiciousEnvVars) {
      if (process.env[envVar]) {
        console.warn(`⚠️ Warning: Suspicious environment variable detected: ${envVar}`);
      }
    }
  }

  /**
   * Validate analysis parameters
   */
  static validateAnalysisParameters(daysBack: number): void {
    if (typeof daysBack !== 'number' || !Number.isInteger(daysBack)) {
      throw new Error('Days back must be a positive integer');
    }
    
    if (daysBack < 1 || daysBack > 365) {
      throw new Error('Days back must be between 1 and 365');
    }
  }

  /**
   * Format address for display (privacy-preserving)
   */
  static formatAddressForDisplay(address: string): string {
    if (!address || address.length < 16) {
      return address;
    }
    
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  }

  /**
   * Sanitize error messages to prevent information leakage
   */
  static sanitizeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message.includes('Rate limit exceeded')) {
        return 'Rate limit exceeded. Please wait before making another request.';
      }
      if (error.message.includes('Invalid wallet address')) {
        return 'Invalid wallet address format';
      }
      if (error.message.includes('API key')) {
        return 'API configuration error';
      }
      if (error.message.includes('network') || error.message.includes('timeout')) {
        return 'Network error. Please try again later.';
      }
    }
    
    return 'Analysis failed due to an internal error. Please try again later.';
  }
}
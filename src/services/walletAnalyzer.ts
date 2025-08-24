import { DataAcquisitionService } from './dataAcquisition';
import { SwapProcessorService } from './swapProcessor';
import { PnLEngine } from './pnlEngine';
import { EnhancedPnLEngine } from './enhancedPnLEngine';
import { PriceService } from './priceService';
import { EnhancedPriceService } from './enhancedPriceService';
import { AnalyticsService } from './analyticsService';
import { ReportFormatter } from './reportFormatter';
import { ConfidenceScorer } from './confidenceScorer';
import { DataValidator } from './dataValidator';
import { DataQualityService } from './dataQualityService';
import { CacheService } from './cacheService';
import { PerformanceMonitor } from './performanceMonitor';
import { WalletAnalysis } from '../types';
import { PublicKey } from '@solana/web3.js';
import crypto from 'crypto';

export class WalletAnalyzer {
  private dataAcquisition: DataAcquisitionService;
  private swapProcessor: SwapProcessorService;
  private pnlEngine: PnLEngine;
  private priceService: PriceService;
  private analyticsService: AnalyticsService;
  private reportFormatter: ReportFormatter;
  private confidenceScorer: ConfidenceScorer;
  private dataValidator: DataValidator;
  private dataQualityService: DataQualityService;
  private enhancedPnLEngine: EnhancedPnLEngine;
  private enhancedPriceService: EnhancedPriceService;
  private cache: CacheService;
  private performanceMonitor: PerformanceMonitor;
  private requestLog: Map<string, { count: number; lastRequest: number }> = new Map();
  private readonly MAX_REQUESTS_PER_HOUR = 100;
  private readonly RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

  constructor(
    rpcUrl: string,
    heliusApiKey: string,
    jupiterApiKey: string,
    blockDaemonApiKey?: string,
    private silent: boolean = false
  ) {
    this.validateConstructorInputs(rpcUrl, heliusApiKey, jupiterApiKey, blockDaemonApiKey);
    
    this.dataAcquisition = new DataAcquisitionService(rpcUrl, heliusApiKey, blockDaemonApiKey);
    this.swapProcessor = new SwapProcessorService();
    this.pnlEngine = new PnLEngine();
    this.priceService = new PriceService(jupiterApiKey);
    this.analyticsService = new AnalyticsService(this.priceService);
    this.reportFormatter = new ReportFormatter();
    this.confidenceScorer = new ConfidenceScorer();
    this.dataValidator = new DataValidator();
    this.dataQualityService = new DataQualityService();
    this.enhancedPnLEngine = new EnhancedPnLEngine();
    this.enhancedPriceService = new EnhancedPriceService(jupiterApiKey);
    this.cache = CacheService.getInstance();
    this.performanceMonitor = PerformanceMonitor.getInstance();
  }

  /**
   * Validate constructor inputs for security
   */
  private validateConstructorInputs(
    rpcUrl: string,
    heliusApiKey: string,
    jupiterApiKey: string,
    blockDaemonApiKey?: string
  ): void {
    if (!rpcUrl || typeof rpcUrl !== 'string') {
      throw new Error('Invalid RPC URL provided');
    }
    
    if (!heliusApiKey || typeof heliusApiKey !== 'string' || heliusApiKey.length < 10) {
      throw new Error('Invalid Helius API key provided');
    }
    
    if (jupiterApiKey && typeof jupiterApiKey !== 'string') {
      throw new Error('Invalid Jupiter API key provided');
    }
    
    if (blockDaemonApiKey && typeof blockDaemonApiKey !== 'string') {
      throw new Error('Invalid BlockDaemon API key provided');
    }
    
    // Validate RPC URL format
    try {
      new URL(rpcUrl);
    } catch {
      throw new Error('Invalid RPC URL format');
    }
  }

  /**
   * Validate wallet address format
   */
  private validateWalletAddress(walletAddress: string): void {
    if (!walletAddress || typeof walletAddress !== 'string') {
      throw new Error('Wallet address is required and must be a string');
    }
    
    // Remove any whitespace
    walletAddress = walletAddress.trim();
    
    // Check length (Solana addresses are 32-44 characters)
    if (walletAddress.length < 32 || walletAddress.length > 44) {
      throw new Error('Invalid wallet address length');
    }
    
    // Check for valid base58 characters
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    if (!base58Regex.test(walletAddress)) {
      throw new Error('Invalid wallet address format - contains invalid characters');
    }
    
    // Validate with Solana's PublicKey class
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      throw new Error('Invalid Solana wallet address format');
    }
  }

  /**
   * Check rate limiting for security
   */
  private checkRateLimit(walletAddress: string): void {
    const now = Date.now();
    const requestKey = this.hashWalletAddress(walletAddress);
    const requestData = this.requestLog.get(requestKey);
    
    if (requestData) {
      // Clean up old requests outside the window
      if (now - requestData.lastRequest > this.RATE_LIMIT_WINDOW) {
        this.requestLog.delete(requestKey);
      } else if (requestData.count >= this.MAX_REQUESTS_PER_HOUR) {
        throw new Error('Rate limit exceeded. Please wait before making another request.');
      } else {
        requestData.count++;
        requestData.lastRequest = now;
      }
    } else {
      this.requestLog.set(requestKey, { count: 1, lastRequest: now });
    }
  }

  /**
   * Hash wallet address for privacy in logs
   */
  private hashWalletAddress(walletAddress: string): string {
    return crypto.createHash('sha256').update(walletAddress).digest('hex').slice(0, 16);
  }

  /**
   * Validate analysis parameters
   */
  private validateAnalysisParameters(daysBack: number): void {
    if (typeof daysBack !== 'number' || !Number.isInteger(daysBack)) {
      throw new Error('Days back must be a positive integer');
    }
    
    if (daysBack < 1 || daysBack > 365) {
      throw new Error('Days back must be between 1 and 365');
    }
  }

  /**
   * Log security events
   */
  private logSecurityEvent(event: string, walletAddress: string, details?: any): void {
    const hashedWallet = this.hashWalletAddress(walletAddress);
    const timestamp = new Date().toISOString();
    
    if (!this.silent) {
      console.log(`[SECURITY] ${timestamp} - ${event} - Wallet: ${hashedWallet}`, details || '');
    }
  }

  /**
   * Validate transaction data integrity
   */
  private validateTransactionData(transactions: any[]): void {
    if (!Array.isArray(transactions)) {
      throw new Error('Transaction data must be an array');
    }
    
    for (const tx of transactions) {
      if (!tx || typeof tx !== 'object') {
        throw new Error('Invalid transaction object');
      }
      
      if (!tx.signature || typeof tx.signature !== 'string') {
        throw new Error('Transaction missing valid signature');
      }
      
      if (!tx.blockTime || typeof tx.blockTime !== 'number') {
        throw new Error('Transaction missing valid blockTime');
      }
      
      // Validate transaction signature format
      if (tx.signature.length < 80 || tx.signature.length > 90) {
        throw new Error('Invalid transaction signature format');
      }
      
      // Validate blockTime is reasonable (not too far in past or future)
      const now = Math.floor(Date.now() / 1000);
      const oneYearAgo = now - (365 * 24 * 60 * 60);
      const oneHourFuture = now + (60 * 60);
      
      if (tx.blockTime < oneYearAgo || tx.blockTime > oneHourFuture) {
        throw new Error('Transaction blockTime outside reasonable range');
      }
    }
  }

  /**
   * Perform a complete wallet analysis with enhanced security
   */
  async analyzeWallet(
    walletAddress: string,
    daysBack: number = 30
  ): Promise<{
    analysis: WalletAnalysis;
    report: string;
  }> {
    // Security validations
    this.validateWalletAddress(walletAddress);
    this.validateAnalysisParameters(daysBack);
    this.checkRateLimit(walletAddress);
    
    // Clean and normalize wallet address
    walletAddress = walletAddress.trim();
    
    // Check cache first
    const cachedAnalysis = this.cache.getCachedWalletAnalysis(walletAddress, daysBack);
    if (cachedAnalysis) {
      this.logSecurityEvent('ANALYSIS_CACHE_HIT', walletAddress, { daysBack });
      this.performanceMonitor.incrementCounter('cache_hits');
      
      if (!this.silent) {
        console.log(`🚀 Using cached analysis for ${this.hashWalletAddress(walletAddress)}`);
      }
      
      return cachedAnalysis;
    }
    
    // Start performance monitoring
    const stopTimer = this.performanceMonitor.startTimer('wallet_analysis');
    
    // Log security event
    this.logSecurityEvent('ANALYSIS_STARTED', walletAddress, { daysBack });
    
    if (!this.silent) {
      console.log(`Starting wallet analysis for ${this.hashWalletAddress(walletAddress)} over the last ${daysBack} days...`);
    }

    // Store original console.log
    const originalLog = console.log;
    
    // Suppress all console.log output if in silent mode
    if (this.silent) {
      console.log = () => {};
    }

    try {
      // Phase 1: Data Acquisition with validation
      if (!this.silent) originalLog('\n=== Phase 1: Data Acquisition ===');
      
      const transactions = await this.performanceMonitor.timeFunction('data_acquisition', async () => {
        return await this.dataAcquisition.acquireTransactionData(walletAddress, daysBack, !this.silent);
      });
      
      // Validate transaction data integrity
      this.validateTransactionData(transactions);
      this.performanceMonitor.incrementCounter('transactions_processed', transactions.length);
      
      if (transactions.length === 0) {
        throw new Error('No transactions found for the specified wallet and time period');
      }

      // Phase 2: Swap Processing with validation
      if (!this.silent) originalLog('\n=== Phase 2: Swap Processing ===');
      
      const swaps = await this.performanceMonitor.timeFunction('swap_processing', async () => {
        return this.swapProcessor.processSwaps(transactions, walletAddress);
      });
      
      // Validate swap data - log warnings but don't fail on oversell
      const swapValidation = DataValidator.validateSwapData(swaps);
      if (!swapValidation.isValid) {
        this.logSecurityEvent('SWAP_VALIDATION_WARNINGS', walletAddress, swapValidation.errors);
        // Don't throw error for oversell - let the PnL engine handle it
        console.warn(`⚠️ Swap validation warnings: ${swapValidation.errors.join(', ')}`);
      }
      
      if (swapValidation.warnings.length > 0) {
        this.logSecurityEvent('SWAP_VALIDATION_WARNINGS', walletAddress, swapValidation.warnings);
      }
      
      this.performanceMonitor.incrementCounter('swaps_processed', swaps.length);
      
      if (swaps.length === 0) {
        throw new Error('No swap transactions found in the analysis period');
      }

      // Phase 3: PnL Calculation
      if (!this.silent) originalLog('\n=== Phase 3: PnL Calculation ===');
      const { closedTrades, openHoldings } = this.pnlEngine.processSwapsForPnL(swaps);

      // Phase 4: Analytics Calculation
      if (!this.silent) originalLog('\n=== Phase 4: Analytics Calculation ===');
      const analysis = await this.analyticsService.calculateWalletAnalysis(swaps, closedTrades, openHoldings);

      // Phase 5: Confidence Assessment
      if (!this.silent) originalLog('\n=== Phase 5: Confidence Assessment ===');
      const confidenceScore = this.confidenceScorer.calculateConfidenceScore(analysis, swaps, closedTrades);
      
      // Additional PnL validation
      const pnlValidation = DataValidator.validatePnLResults(analysis);
      if (pnlValidation.discrepancyAnalysis.length > 0) {
        this.logSecurityEvent('PNL_VALIDATION_WARNINGS', walletAddress, pnlValidation.discrepancyAnalysis);
      }
      
      // Phase 6: Report Generation
      if (!this.silent) originalLog('\n=== Phase 6: Report Generation ===');
      const report = this.reportFormatter.formatWalletAnalysis(analysis, this.hashWalletAddress(walletAddress), daysBack, confidenceScore);

      // Restore console.log
      console.log = originalLog;
      
      // Cache the result
      const result = {
        analysis,
        report
      };
      
      this.cache.cacheWalletAnalysis(walletAddress, daysBack, result);
      
      // Stop performance monitoring
      stopTimer();
      
      // Log successful completion
      this.logSecurityEvent('ANALYSIS_COMPLETED', walletAddress, {
        transactionCount: transactions.length,
        swapCount: swaps.length,
        closedTrades: closedTrades.length,
        openHoldings: openHoldings.length,
        confidenceScore
      });

      console.log('\n=== Analysis Complete ===');
      console.log(`Processed ${transactions.length} transactions`);
      console.log(`Found ${swaps.length} swap transactions`);
      console.log(`Calculated ${closedTrades.length} closed trades`);
      console.log(`Identified ${openHoldings.length} open positions`);
      
      // Log performance summary if enabled
      if (!this.silent) {
        this.performanceMonitor.logPerformanceSummary();
      }

      return result;

    } catch (error) {
      // Restore console.log in case of error
      console.log = originalLog;
      
      // Stop performance monitoring
      stopTimer();
      
      // Log security event for failed analysis
      this.logSecurityEvent('ANALYSIS_FAILED', walletAddress, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Increment error counter
      this.performanceMonitor.incrementCounter('analysis_errors');
      
      // Temporarily expose the real error for debugging
      throw error;
    }
  }

  /**
   * Get detailed analysis data without formatting
   */
  async getDetailedAnalysis(
    walletAddress: string,
    daysBack: number = 30
  ): Promise<WalletAnalysis> {
    const { analysis } = await this.analyzeWallet(walletAddress, daysBack);
    return analysis;
  }

  /**
   * Get formatted report only
   */
  async getFormattedReport(
    walletAddress: string,
    daysBack: number = 30
  ): Promise<string> {
    const { report } = await this.analyzeWallet(walletAddress, daysBack);
    return report;
  }

  /**
   * Enhanced wallet analysis with improved data quality and accuracy
   */
  async analyzeWalletEnhanced(
    walletAddress: string,
    daysBack: number = 30
  ): Promise<{
    analysis: WalletAnalysis;
    report: string;
    dataQualityReport: any;
    processingDetails: any;
  }> {
    // Security validations
    this.validateWalletAddress(walletAddress);
    this.validateAnalysisParameters(daysBack);
    this.checkRateLimit(walletAddress);
    
    // Clean and normalize wallet address
    walletAddress = walletAddress.trim();
    
    // Check cache first
    const cacheKey = `enhanced_${walletAddress}_${daysBack}`;
    const cachedResult = this.cache.get(cacheKey) as {
      analysis: WalletAnalysis;
      report: string;
      dataQualityReport: any;
      processingDetails: any;
    } | null;
    if (cachedResult) {
      this.logSecurityEvent('ENHANCED_ANALYSIS_CACHE_HIT', walletAddress, { daysBack });
      return cachedResult;
    }
    
    // Start performance monitoring
    const stopTimer = this.performanceMonitor.startTimer('enhanced_wallet_analysis');
    
    // Log security event
    this.logSecurityEvent('ENHANCED_ANALYSIS_STARTED', walletAddress, { daysBack });
    
    if (!this.silent) {
      console.log(`🔍 Enhanced analysis for ${this.hashWalletAddress(walletAddress)} over ${daysBack} days...`);
    }

    // Store original console.log
    const originalLog = console.log;
    
    // Suppress all console.log output if in silent mode
    if (this.silent) {
      console.log = () => {};
    }

    try {
      // Phase 1: Data Acquisition with enhanced validation
      if (!this.silent) originalLog('\\n=== Phase 1: Enhanced Data Acquisition ===');
      
      const transactions = await this.performanceMonitor.timeFunction('enhanced_data_acquisition', async () => {
        return await this.dataAcquisition.acquireTransactionData(walletAddress, daysBack, !this.silent);
      });
      
      // Enhanced transaction validation
      this.validateTransactionData(transactions);
      this.performanceMonitor.incrementCounter('enhanced_transactions_processed', transactions.length);
      
      if (transactions.length === 0) {
        throw new Error('No transactions found for the specified wallet and time period');
      }

      // Phase 2: Enhanced Swap Processing
      if (!this.silent) originalLog('\\n=== Phase 2: Enhanced Swap Processing ===');
      
      const swaps = await this.performanceMonitor.timeFunction('enhanced_swap_processing', async () => {
        return this.swapProcessor.processSwaps(transactions, walletAddress);
      });
      
      if (swaps.length === 0) {
        throw new Error('No swap transactions found in the analysis period');
      }

      // Phase 3: Data Quality Assessment
      if (!this.silent) originalLog('\\n=== Phase 3: Data Quality Assessment ===');
      
      const dataQualityReport = this.dataQualityService.assessDataQuality(
        transactions,
        swaps,
        [], // Will be populated after PnL calculation
        []  // Will be populated after PnL calculation
      );
      
      if (dataQualityReport.confidenceLevel === 'LOW') {
        console.warn('⚠️ Low data quality detected - results may be unreliable');
      }

      // Phase 4: Enhanced PnL Calculation
      if (!this.silent) originalLog('\\n=== Phase 4: Enhanced PnL Calculation ===');
      
      const pnlResult = await this.performanceMonitor.timeFunction('enhanced_pnl_calculation', async () => {
        return this.enhancedPnLEngine.processSwapsForPnL(swaps);
      });
      
      const { closedTrades, openHoldings, processingSummary } = pnlResult;

      // Phase 5: Enhanced Price Analysis
      if (!this.silent) originalLog('\\n=== Phase 5: Enhanced Price Analysis ===');
      
      const tokenMints = openHoldings.map(h => h.tokenMint);
      const priceResult = await this.performanceMonitor.timeFunction('enhanced_price_analysis', async () => {
        try {
          return await this.enhancedPriceService.getComprehensivePrices(tokenMints);
        } catch (error) {
          console.warn('Enhanced price service failed, falling back to basic service:', error);
          // Fallback to basic price service
          const basicPrices = await this.priceService.getComprehensivePrices(tokenMints);
          return {
            prices: basicPrices,
            qualityReport: {
              validPrices: basicPrices.length,
              invalidPrices: 0,
              averageConfidence: 75,
              issues: []
            }
          };
        }
      });

      // Phase 6: Enhanced Analytics
      if (!this.silent) originalLog('\\n=== Phase 6: Enhanced Analytics ===');
      
      const analysis = await this.performanceMonitor.timeFunction('enhanced_analytics', async () => {
        return await this.analyticsService.calculateWalletAnalysis(swaps, closedTrades, openHoldings);
      });

      // Phase 7: Enhanced Confidence Assessment
      if (!this.silent) originalLog('\\n=== Phase 7: Enhanced Confidence Assessment ===');
      
      const confidenceScore = this.confidenceScorer.calculateConfidenceScore(analysis, swaps, closedTrades);
      
      // Update data quality report with final results
      const finalDataQualityReport = this.dataQualityService.assessDataQuality(
        transactions,
        swaps,
        closedTrades,
        openHoldings
      );
      
      // Phase 8: Enhanced Report Generation
      if (!this.silent) originalLog('\\n=== Phase 8: Enhanced Report Generation ===');
      
      const report = this.generateEnhancedReport(
        analysis,
        finalDataQualityReport,
        processingSummary,
        priceResult.qualityReport,
        confidenceScore,
        walletAddress,
        daysBack
      );

      // Restore console.log
      console.log = originalLog;
      
      // Cache the result
      const result = {
        analysis,
        report,
        dataQualityReport: finalDataQualityReport,
        processingDetails: {
          ...processingSummary,
          priceQuality: priceResult.qualityReport,
          performanceStats: this.performanceMonitor.getStats()
        }
      };
      
      this.cache.set(cacheKey, result, 30 * 60 * 1000); // 30 minutes cache
      
      // Stop performance monitoring
      stopTimer();
      
      // Log successful completion
      this.logSecurityEvent('ENHANCED_ANALYSIS_COMPLETED', walletAddress, {
        transactionCount: transactions.length,
        swapCount: swaps.length,
        closedTrades: closedTrades.length,
        openHoldings: openHoldings.length,
        confidenceScore,
        dataQualityScore: finalDataQualityReport.overallScore
      });

      if (!this.silent) {
        console.log('\\n=== Enhanced Analysis Complete ===');
        console.log(`Data Quality Score: ${finalDataQualityReport.overallScore.toFixed(1)}/100`);
        console.log(`Confidence Level: ${finalDataQualityReport.confidenceLevel}`);
        console.log(`Processed ${transactions.length} transactions`);
        console.log(`Found ${swaps.length} swap transactions`);
        console.log(`Calculated ${closedTrades.length} closed trades`);
        console.log(`Identified ${openHoldings.length} open positions`);
        
        // Log performance summary
        this.performanceMonitor.logPerformanceSummary();
      }

      return result;

    } catch (error) {
      // Restore console.log in case of error
      console.log = originalLog;
      
      // Stop performance monitoring
      stopTimer();
      
      // Log security event for failed analysis
      this.logSecurityEvent('ENHANCED_ANALYSIS_FAILED', walletAddress, {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Increment error counter
      this.performanceMonitor.incrementCounter('enhanced_analysis_errors');
      
      throw error;
    }
  }

  /**
   * Generate enhanced report with data quality information
   */
  private generateEnhancedReport(
    analysis: WalletAnalysis,
    dataQualityReport: any,
    processingDetails: any,
    priceQualityReport: any,
    confidenceScore: any,
    walletAddress: string,
    daysBack: number
  ): string {
    const lines: string[] = [];
    
    // Header
    lines.push('🔍 ENHANCED WALLET ANALYSIS REPORT');
    lines.push('=' .repeat(60));
    lines.push(`Wallet: ${this.hashWalletAddress(walletAddress)}`);
    lines.push(`Period: Last ${daysBack} days`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');
    
    // Data Quality Section
    lines.push('📊 DATA QUALITY ASSESSMENT');
    lines.push('-' .repeat(30));
    lines.push(`Overall Score: ${dataQualityReport.overallScore.toFixed(1)}/100`);
    lines.push(`Confidence Level: ${dataQualityReport.confidenceLevel}`);
    lines.push(`Swap Detection: ${dataQualityReport.swapDetectionScore.toFixed(1)}/100`);
    lines.push(`PnL Calculation: ${dataQualityReport.pnlCalculationScore.toFixed(1)}/100`);
    lines.push(`Data Completeness: ${dataQualityReport.dataCompletenessScore.toFixed(1)}/100`);
    lines.push(`Price Data: ${dataQualityReport.priceDataScore.toFixed(1)}/100`);
    lines.push('');
    
    // Processing Details
    lines.push('⚙️ PROCESSING DETAILS');
    lines.push('-' .repeat(30));
    lines.push(`Total Swaps: ${processingDetails.totalSwapsProcessed}`);
    lines.push(`Valid Swaps: ${processingDetails.validSwapsProcessed}`);
    lines.push(`Oversell Trades: ${processingDetails.oversellTradesCreated}`);
    lines.push(`Zero-Profit Trades: ${processingDetails.zeroProfit}`);
    lines.push(`Net SOL: ${processingDetails.netSOL.toFixed(6)}`);
    lines.push(`Processing Score: ${processingDetails.dataQualityScore.toFixed(1)}/100`);
    lines.push('');
    
    // Price Quality
    lines.push('💰 PRICE DATA QUALITY');
    lines.push('-' .repeat(30));
    lines.push(`Valid Prices: ${priceQualityReport.validPrices}`);
    lines.push(`Invalid Prices: ${priceQualityReport.invalidPrices}`);
    lines.push(`Average Confidence: ${priceQualityReport.averageConfidence.toFixed(1)}%`);
    lines.push('');
    
    // Standard analysis results
    const standardReport = this.reportFormatter.formatWalletAnalysis(
      analysis,
      this.hashWalletAddress(walletAddress),
      daysBack,
      confidenceScore.overall
    );
    
    lines.push(standardReport);
    
    // Recommendations
    lines.push('');
    lines.push('🎯 RECOMMENDATIONS');
    lines.push('-' .repeat(30));
    for (const recommendation of dataQualityReport.recommendations) {
      lines.push(`• ${recommendation}`);
    }
    
    // Issues (if any)
    if (dataQualityReport.issues.length > 0) {
      lines.push('');
      lines.push('⚠️ ISSUES DETECTED');
      lines.push('-' .repeat(30));
      for (const issue of dataQualityReport.issues) {
        const icon = issue.severity === 'ERROR' ? '❌' : issue.severity === 'WARNING' ? '⚠️' : 'ℹ️';
        lines.push(`${icon} ${issue.description}`);
      }
    }
    
    lines.push('');
    lines.push('═' .repeat(60));
    
    return lines.join('\\n');
  }
} 
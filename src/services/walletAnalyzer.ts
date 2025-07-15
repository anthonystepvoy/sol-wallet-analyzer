import { DataAcquisitionService } from './dataAcquisition';
import { SwapProcessorService } from './swapProcessor';
import { PnLEngine } from './pnlEngine';
import { PriceService } from './priceService';
import { AnalyticsService } from './analyticsService';
import { ReportFormatter } from './reportFormatter';
import { ConfidenceScorer } from './confidenceScorer';
import { WalletAnalysis } from '../types';

export class WalletAnalyzer {
  private dataAcquisition: DataAcquisitionService;
  private swapProcessor: SwapProcessorService;
  private pnlEngine: PnLEngine;
  private priceService: PriceService;
  private analyticsService: AnalyticsService;
  private reportFormatter: ReportFormatter;
  private confidenceScorer: ConfidenceScorer;

  constructor(
    rpcUrl: string,
    heliusApiKey: string,
    jupiterApiKey: string,
    blockDaemonApiKey?: string,
    private silent: boolean = false
  ) {
    this.dataAcquisition = new DataAcquisitionService(rpcUrl, heliusApiKey, blockDaemonApiKey);
    this.swapProcessor = new SwapProcessorService();
    this.pnlEngine = new PnLEngine();
    this.priceService = new PriceService(jupiterApiKey);
    this.analyticsService = new AnalyticsService(this.priceService);
    this.reportFormatter = new ReportFormatter();
    this.confidenceScorer = new ConfidenceScorer();
  }

  /**
   * Perform a complete wallet analysis
   */
  async analyzeWallet(
    walletAddress: string,
    daysBack: number = 30
  ): Promise<{
    analysis: WalletAnalysis;
    report: string;
  }> {
    if (!this.silent) {
      console.log(`Starting wallet analysis for ${walletAddress} over the last ${daysBack} days...`);
    }

    // Store original console.log
    const originalLog = console.log;
    
    // Suppress all console.log output if in silent mode
    if (this.silent) {
      console.log = () => {};
    }

    try {
      // Phase 1: Data Acquisition
      if (!this.silent) originalLog('\n=== Phase 1: Data Acquisition ===');
      const transactions = await this.dataAcquisition.acquireTransactionData(walletAddress, daysBack, !this.silent);
      
      if (transactions.length === 0) {
        throw new Error('No transactions found for the specified wallet and time period');
      }

      // Phase 2: Swap Processing
      if (!this.silent) originalLog('\n=== Phase 2: Swap Processing ===');
      const swaps = this.swapProcessor.processSwaps(transactions, walletAddress);
      
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
      
      // Phase 6: Report Generation
      if (!this.silent) originalLog('\n=== Phase 6: Report Generation ===');
      const report = this.reportFormatter.formatWalletAnalysis(analysis, walletAddress, daysBack, confidenceScore);

      // Restore console.log
      console.log = originalLog;

      console.log('\n=== Analysis Complete ===');
      console.log(`Processed ${transactions.length} transactions`);
      console.log(`Found ${swaps.length} swap transactions`);
      console.log(`Calculated ${closedTrades.length} closed trades`);
      console.log(`Identified ${openHoldings.length} open positions`);

      return {
        analysis,
        report
      };

    } catch (error) {
      // Restore console.log in case of error
      console.log = originalLog;
      console.error('Error during wallet analysis:', error);
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
} 
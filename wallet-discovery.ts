#!/usr/bin/env ts-node

/**
 * Wallet Discovery Engine
 * 
 * Monitors Solana DEX transactions in real-time to discover profitable traders.
 * Automatically analyzes promising wallets and identifies copytrading candidates.
 * 
 * Usage: npx ts-node wallet-discovery.ts
 */

import dotenv from 'dotenv';
import { LiveSwapMonitor } from './src/services/liveSwapMonitor';
import { WalletAnalyzer } from './src/services/walletAnalyzer';

dotenv.config();

interface DiscoveredWallet {
  address: string;
  firstSeen: number;
  totalSwapVolume: number;
  swapCount: number;
  platforms: Set<string>;
  analyzed: boolean;
}

class WalletDiscoveryEngine {
  private monitor: LiveSwapMonitor;
  private wallets: Map<string, DiscoveredWallet> = new Map();
  private analyzer: WalletAnalyzer;
  private analysisQueue: string[] = [];
  private isAnalyzing = false;

  constructor() {
    // Monitor swaps > 1 SOL
    this.monitor = new LiveSwapMonitor(1.0, (swap) => this.handleSwapDetection(swap));
    
    // Initialize analyzer
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const heliusApiKey = process.env.HELIUS_API_KEY!;
    const jupiterApiKey = process.env.JUPITER_API_KEY || '';
    const blockDaemonApiKey = process.env.BLOCK_DAEMON_KEY;
    
    this.analyzer = new WalletAnalyzer(rpcUrl, heliusApiKey, jupiterApiKey, blockDaemonApiKey, true);
  }

  public start(): void {
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║                  🎯 WALLET DISCOVERY ENGINE                       ║');
    console.log('║         🔍 Finding Profitable Solana Traders in Real-Time        ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
    
    this.monitor.start();
    this.startAnalysisWorker();
    
    // Print stats every 30 seconds
    setInterval(() => {
      this.printStats();
    }, 30000);
  }

  private handleSwapDetection(swap: any): void {
    const { wallet, solAmount, platform } = swap;
    
    // Update or create wallet record
    if (!this.wallets.has(wallet)) {
      this.wallets.set(wallet, {
        address: wallet,
        firstSeen: Date.now(),
        totalSwapVolume: 0,
        swapCount: 0,
        platforms: new Set(),
        analyzed: false
      });
    }
    
    const walletData = this.wallets.get(wallet)!;
    walletData.totalSwapVolume += solAmount;
    walletData.swapCount++;
    walletData.platforms.add(platform);
    
    // Queue for analysis if meets criteria
    if (this.shouldAnalyze(walletData) && !walletData.analyzed) {
      this.queueForAnalysis(wallet);
    }
  }

  private shouldAnalyze(wallet: DiscoveredWallet): boolean {
    // Analyze if:
    // - More than 20 SOL total volume, OR
    // - More than 3 swaps, OR
    // - Single swap > 10 SOL
    return wallet.totalSwapVolume > 20 || 
           wallet.swapCount > 3 || 
           (wallet.totalSwapVolume / wallet.swapCount) > 10;
  }

  private queueForAnalysis(walletAddress: string): void {
    if (!this.analysisQueue.includes(walletAddress)) {
      this.analysisQueue.push(walletAddress);
      console.log(`📋 Queued for analysis: ${walletAddress} (Queue size: ${this.analysisQueue.length})`);
    }
  }

  private async startAnalysisWorker(): Promise<void> {
    while (true) {
      if (this.analysisQueue.length > 0 && !this.isAnalyzing) {
        this.isAnalyzing = true;
        const walletAddress = this.analysisQueue.shift()!;
        
        try {
          await this.analyzeWallet(walletAddress);
        } catch (error) {
          console.error(`❌ Analysis failed for ${walletAddress}:`, error);
        }
        
        this.isAnalyzing = false;
        
        // Wait 10 seconds between analyses to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        // Check queue every 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private async analyzeWallet(walletAddress: string): Promise<void> {
    console.log(`🔍 ANALYZING WALLET: ${walletAddress}`);
    console.log('─'.repeat(50));
    
    try {
      const result = await this.analyzer.analyzeWallet(walletAddress, 7); // 7 days analysis
      const analysis = result.analysis;
      
      // Mark as analyzed
      const walletData = this.wallets.get(walletAddress)!;
      walletData.analyzed = true;
      
      // Print results
      const winRate = analysis.closedTrades && analysis.closedTrades.length > 0 
        ? (analysis.closedTrades.filter((t: any) => t.realizedPnL > 0).length / analysis.closedTrades.length) * 100 
        : 0;
      
      const totalPnL = analysis.closedTrades?.reduce((sum: number, trade: any) => sum + trade.realizedPnL, 0) || 0;
      
      console.log(`💼 Wallet: ${walletAddress}`);
      console.log(`📊 Win Rate: ${winRate.toFixed(1)}%`);
      console.log(`💰 PnL: ${totalPnL.toFixed(2)} SOL`);
      console.log(`🔄 Trades: ${analysis.closedTrades?.length || 0}`);
      console.log(`📈 Volume: ${walletData.totalSwapVolume.toFixed(2)} SOL`);
      console.log(`🏢 Platforms: ${Array.from(walletData.platforms).join(', ')}`);
      
      // Highlight promising wallets
      if (winRate > 70 && totalPnL > 10 && (analysis.closedTrades?.length || 0) > 5) {
        console.log('🌟 PROMISING WALLET FOUND! 🌟');
        console.log(`   Consider adding to copytrading portfolio`);
      }
      
      console.log('═'.repeat(50));
      
    } catch (error) {
      console.error(`Failed to analyze ${walletAddress}:`, error);
    }
  }

  private printStats(): void {
    const monitorStats = this.monitor.getStats();
    const walletsFound = this.wallets.size;
    const analyzed = Array.from(this.wallets.values()).filter(w => w.analyzed).length;
    const queueSize = this.analysisQueue.length;
    const uptime = Math.floor(monitorStats.uptime/60);
    
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│                      📊 LIVE STATISTICS                        │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│ ⏰ Uptime: ${uptime.toString().padEnd(3)}m                                            │`);
    console.log(`│ 🔍 Wallets Found: ${walletsFound.toString().padEnd(8)}                               │`);
    console.log(`│ ✅ Analyzed: ${analyzed.toString().padEnd(12)}                                   │`);
    console.log(`│ 📋 Queue: ${queueSize.toString().padEnd(15)}                                      │`);
    console.log(`│ 🎯 Status: ${queueSize > 0 ? 'Processing...' : 'Monitoring...'.padEnd(11)}                        │`);
    console.log('└─────────────────────────────────────────────────────────────────┘\n');
  }

  public stop(): void {
    this.monitor.stop();
    console.log('🛑 Wallet Discovery Engine stopped');
  }
}

// CLI mode - start if called directly
if (require.main === module) {
  const engine = new WalletDiscoveryEngine();
  engine.start();

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    engine.stop();
    process.exit(0);
  });
}

export { WalletDiscoveryEngine };
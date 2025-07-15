#!/usr/bin/env ts-node

/**
 * Wallet Analyzer - Main Entry Point
 * 
 * Analyzes specific Solana wallet addresses for trading performance.
 * Provides detailed insights including PnL, win rates, and trading patterns.
 * 
 * Usage: 
 *   Interactive: npx ts-node src/index.ts
 *   Single wallet: npx ts-node src/index.ts <wallet_address> [days]
 *   npm scripts: npm start <wallet_address> [days]
 */

import dotenv from 'dotenv';
import { WalletAnalyzer } from './services/walletAnalyzer';

// Load environment variables
dotenv.config();

async function main() {
  // Configuration
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const blockDaemonApiKey = process.env.BLOCK_DAEMON_KEY;
  const jupiterApiKey = process.env.JUPITER_API_KEY || '';

  if (!heliusApiKey) {
    console.error('❌ HELIUS_API_KEY is required. Please set it in your .env file.');
    console.log('You can get a free API key from: https://dev.helius.xyz/');
    process.exit(1);
  }

  // Display API configuration
  const instantNodesUrl = process.env.INSTANTNODES_RPC_URL;
  const heliusUrl = process.env.HELIUS_RPC_URL;
  
  if (instantNodesUrl && heliusUrl && blockDaemonApiKey) {
    console.log('🚀 Triple API mode enabled:');
    console.log('   1️⃣ Primary: InstantNodes (signatures)');
    console.log('   2️⃣ Secondary: Helius (transaction parsing)');
    console.log('   3️⃣ Fallback: BlockDaemon (validation)');
  } else if (instantNodesUrl && heliusUrl) {
    console.log('🚀 Dual API mode enabled:');
    console.log('   1️⃣ Primary: InstantNodes (signatures)');
    console.log('   2️⃣ Secondary: Helius (transaction parsing)');
  } else if (blockDaemonApiKey) {
    console.log('🚀 BlockDaemon API key detected - dual API mode enabled');
  }

  const args = process.argv.slice(2);
  const walletFromArgs = args[0];
  let daysBack = args[1] ? parseInt(args[1], 10) : 15;

  // Create analyzer instance once with silent mode enabled by default
  const analyzer = new WalletAnalyzer(rpcUrl, heliusApiKey, jupiterApiKey, blockDaemonApiKey, true);

  // If wallet provided as argument, run once and exit
  if (walletFromArgs) {
    try {
      console.log('\n🚀 Solana Wallet Analyzer');
      const walletAddress = walletFromArgs;

      console.log(`📊 Analyzing wallet: ${walletAddress}`);
      console.log(`📅 Time period: Last ${daysBack} days`);
      console.log('');

      // Perform analysis
      const { analysis, report } = await analyzer.analyzeWallet(walletAddress, daysBack);

      // Display results
      console.log('\n' + '='.repeat(60));
      console.log(report);
      console.log('='.repeat(60));
      process.exit(0);

    } catch (error) {
      console.error('❌ Analysis failed:', error);
      process.exit(1);
    }
  }

  // Interactive mode
  while (true) {
    try {
      console.log('\n🚀 Solana Wallet Analyzer');
      console.log('Enter "quit" or "exit" to close the program');
      console.log('');

      // Prompt user for wallet address
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const walletAddress = await new Promise<string>(resolve => {
        rl.question('Paste your Solana wallet address here: ', (answer: string) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (!walletAddress || walletAddress.toLowerCase() === 'quit' || walletAddress.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        process.exit(0);
      }

      console.log(`📊 Analyzing wallet: ${walletAddress}`);
      console.log(`📅 Time period: Last ${daysBack} days`);
      console.log('');

      // Perform analysis
      const { analysis, report } = await analyzer.analyzeWallet(walletAddress, daysBack);

      // Display results
      console.log('\n' + '='.repeat(60));
      console.log(report);
      console.log('='.repeat(60));

    } catch (error) {
      console.error('❌ Analysis failed:', error);
      console.log('Please try again with a different wallet address.\n');
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main();
}

export { WalletAnalyzer }; 
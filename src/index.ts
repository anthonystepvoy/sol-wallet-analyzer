import dotenv from 'dotenv';
import { WalletAnalyzer } from './services/walletAnalyzer';

// Load environment variables
dotenv.config();

async function main() {
  // Configuration
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const jupiterApiKey = process.env.JUPITER_API_KEY || '';

  if (!heliusApiKey) {
    console.error('❌ HELIUS_API_KEY is required. Please set it in your .env file.');
    console.log('You can get a free API key from: https://dev.helius.xyz/');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let daysBack = args[0] ? parseInt(args[0], 10) : 15;

  // Create analyzer instance once
  const analyzer = new WalletAnalyzer(rpcUrl, heliusApiKey, jupiterApiKey);

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
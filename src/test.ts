import { WalletAnalyzer } from './services/walletAnalyzer';

// Mock data for testing
const mockWalletAddress = 'YOUR_WALLET_ADDRESS_HERE';

async function testWalletAnalyzer() {
  console.log('🧪 Testing Wallet Analyzer...');
  
  try {
    // Test with mock API keys (these won't work but will test the structure)
    const analyzer = new WalletAnalyzer(
      'https://api.mainnet-beta.solana.com',
      'test_helius_key',
      'test_jupiter_key'
    );

    console.log('✅ WalletAnalyzer instance created successfully');
    console.log('📋 Test wallet address:', mockWalletAddress);
    
    // Note: This will fail without real API keys, but tests the structure
    console.log('⚠️  Note: Full test requires valid API keys');
    console.log('💡 To run a real test:');
    console.log('   1. Set up your .env file with API keys');
    console.log('   2. Run: npm start <wallet_address>');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testWalletAnalyzer();
}

export { testWalletAnalyzer }; 
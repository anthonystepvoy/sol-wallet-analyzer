# Solana Wallet Analyzer

A comprehensive Solana wallet analyzer that calculates profit and loss using the FIFO (First-In-First-Out) method. This tool provides detailed analytics for trading performance, including realized PnL, win rates, holding durations, and more.

## Features

- **Complete Transaction History**: Fetches all transactions for a wallet using Solana RPC with pagination
- **Enhanced Transaction Parsing**: Uses Helius Enhanced Transactions API for detailed swap analysis
- **FIFO PnL Calculation**: Implements First-In-First-Out accounting for accurate profit/loss tracking
- **Platform Identification**: Automatically identifies trading platforms (pump.fun, Raydium, etc.)
- **Real-time Price Data**: Fetches current token prices using Jupiter and CoinGecko APIs
- **Comprehensive Analytics**: Calculates win rates, distributions, capital flow, and fee analysis
- **Detailed Reporting**: Generates human-readable reports with emojis and formatting

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd solana-wallet-analyzer
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env
```

4. Edit `.env` file with your API keys:
```env
# Required: Get from https://dev.helius.xyz/
HELIUS_API_KEY=your_helius_api_key_here

# Optional: For enhanced price fetching
JUPITER_API_KEY=your_jupiter_api_key_here

# Optional: Custom RPC endpoint
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## Usage

### Basic Usage

Analyze a wallet for the last 30 days:
```bash
npm start YOUR_WALLET_ADDRESS_HERE
```

Analyze a wallet for the last 60 days:
```bash
npm start YOUR_WALLET_ADDRESS_HERE 60
```

### Programmatic Usage

```typescript
import { WalletAnalyzer } from './src';

const analyzer = new WalletAnalyzer(
  'https://api.mainnet-beta.solana.com',
  'your_helius_api_key',
  'your_jupiter_api_key'
);

// Get formatted report
const report = await analyzer.getFormattedReport(walletAddress, 30);
console.log(report);

// Get detailed analysis data
const analysis = await analyzer.getDetailedAnalysis(walletAddress, 30);
console.log(analysis);
```

## Output

The analyzer generates a comprehensive report including:

### 📊 High-Level Statistics
- Unique tokens traded
- Winners vs losses
- Win rate percentage
- Open positions

### 📈 Profit & Loss Metrics
- Total realized PnL in SOL and USD
- Average PnL per trade
- PnL ratio and percentages

### 💰 Current Holdings
- Current token holdings value in SOL and USD

### 📊 Trading Metrics
- Total number of trades
- Average trading size
- Sum of all PnL

### 💸 Capital Flow
- SOL spent buying tokens
- SOL received from selling tokens
- Net capital flow

### 💸 Fee Analysis
- Total spent on transaction fees
- Average fee per trade

### 📊 Distributions
- PnL distribution percentiles
- Holding duration distribution

### 📋 Detailed Trades
- Top 10 trades by absolute PnL
- Open positions with quantities and average costs

## Architecture

The analyzer follows a 5-phase architecture:

1. **Data Acquisition**: Fetches transaction signatures and parses them using Helius
2. **Swap Processing**: Filters and standardizes swap transactions
3. **PnL Calculation**: Implements FIFO algorithm for realized PnL
4. **Analytics**: Calculates comprehensive metrics and distributions
5. **Report Generation**: Formats results into human-readable reports

## API Requirements

### Required APIs
- **Helius API**: For enhanced transaction parsing
  - Get free API key: https://dev.helius.xyz/
  - Used for: Transaction parsing, swap detection, platform identification

### Optional APIs
- **Jupiter Price API**: For real-time token prices
  - Used for: Current holdings valuation
- **CoinGecko API**: For SOL/USD conversion
  - Used for: USD value calculations

## Supported Platforms

The analyzer automatically identifies trading platforms:
- **pump.fun**: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- **Pumpswap AMM**: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`
- **Raydium Launchpad**: `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj`
- **Raydium AMM v4**: `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`

## FIFO Methodology

The analyzer uses First-In-First-Out (FIFO) accounting:
- When buying: Creates new "lots" with purchase price and quantity
- When selling: Consumes oldest lots first to calculate cost basis
- Tracks holding duration from first purchase to sale
- Calculates realized PnL as: (Sale Proceeds - Cost Basis)

## Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Testing
```bash
npm test
```

## File Structure

```
src/
├── types/
│   └── index.ts          # TypeScript interfaces
├── services/
│   ├── dataAcquisition.ts    # Transaction fetching
│   ├── swapProcessor.ts       # Swap filtering & standardization
│   ├── pnlEngine.ts          # FIFO PnL calculation
│   ├── priceService.ts       # Price fetching
│   ├── analyticsService.ts   # Metrics calculation
│   ├── reportFormatter.ts    # Report formatting
│   └── walletAnalyzer.ts     # Main orchestrator
└── index.ts                   # CLI entry point
```

## Error Handling

The analyzer includes comprehensive error handling:
- Graceful handling of API rate limits
- Fallback prices when APIs are unavailable
- Detailed error messages for debugging
- Continues processing even if some transactions fail

## Performance

- Processes transactions in batches to avoid rate limits
- Implements caching for price data
- Optimized for large transaction histories
- Memory-efficient FIFO implementation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the error logs
3. Ensure API keys are valid
4. Verify wallet address format

## Troubleshooting

### Common Issues

1. **"No transactions found"**
   - Verify wallet address is correct
   - Check if wallet has activity in the time period
   - Ensure RPC endpoint is accessible

2. **"API rate limit exceeded"**
   - Reduce analysis time period
   - Add delays between API calls
   - Upgrade API plan if needed

3. **"Invalid API key"**
   - Verify Helius API key is correct
   - Check API key permissions
   - Ensure key is active

4. **"Price fetch failed"**
   - Check Jupiter API key (optional)
   - Verify internet connection
   - Fallback prices will be used

## Roadmap

- [ ] Web interface
- [ ] Historical price tracking
- [ ] Advanced filtering options
- [ ] Export to CSV/Excel
- [ ] Real-time monitoring
- [ ] Portfolio comparison tools 
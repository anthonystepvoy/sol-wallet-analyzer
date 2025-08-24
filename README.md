# 🚀 Solana Wallet Analyzer & Trader Discovery

> **Professional-grade Solana wallet analysis tool with real-time trader discovery capabilities**
<div align="center">
    
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana&logoColor=white)](https://solana.com/)
    
</div>

A sophisticated, enterprise-grade tool for analyzing Solana wallet trading performance and discovering profitable traders in real-time. Built with advanced FIFO accounting, multi-API redundancy, and comprehensive security features.

## Features

### 📊 Wallet Analysis
- **PnL Calculation**: Accurate profit/loss using FIFO methodology
- **Trading Metrics**: Win rates, trade counts, volume analysis
- **Multi-API Support**: InstantNodes (primary) + Helius + BlockDaemon
- **Token Filtering**: Focuses on legitimate projects, filters stablecoins
- **Confidence Scoring**: Data quality assessment

### 🔍 Live Trader Discovery
- **Real-time Monitoring**: WebSocket connection to DEX transactions
- **Auto-discovery**: Identifies active traders with significant volume
- **Smart Filtering**: Queues promising wallets for analysis
- **Platform Detection**: Jupiter, Raydium, pump.fun support

## 🎯 Key Features

### 🏆 **Professional-Grade Analysis**
- **FIFO Accounting**: Industry-standard First-In-First-Out methodology for accurate PnL calculations
- **Multi-API Redundancy**: Seamless failover between InstantNodes, Helius, and BlockDaemon
- **Real-time Discovery**: Live monitoring of DEX transactions to identify profitable traders
- **Security-First**: Built-in rate limiting, input validation, and secure API handling

### 📈 **Advanced Analytics**
- **Comprehensive Metrics**: Win rates, trade frequency, volume analysis, and risk assessment
- **Token Intelligence**: Automatic filtering of legitimate projects vs. scam tokens
- **Platform Detection**: Support for Jupiter, Raydium, pump.fun, and other major DEXs
- **Confidence Scoring**: Data quality assessment for reliable analysis

### ⚡ **Performance Optimized**
- **Intelligent Caching**: Reduces API calls and improves response times
- **Batch Processing**: Efficient handling of large transaction datasets
- **Memory Management**: Optimized for analyzing high-volume traders
<div align="center">
<img width="602" height="764" alt="image" src="https://github.com/user-attachments/assets/5150ec30-31f9-4d0c-9529-7bce1a18737b" />

<img width="594" height="842" alt="image" src="https://github.com/user-attachments/assets/68088015-5742-489c-a8c9-587b4aa4706a" />
</div>

## 🚀 Quick Start

### Prerequisites
```bash
npm install
```

### Environment Setup
Copy `.env.example` to `.env` and configure:
```bash
# Required
HELIUS_API_KEY=your_helius_api_key

# Optional but recommended
INSTANTNODES_RPC_URL=your_instantnodes_url
HELIUS_RPC_URL=your_helius_rpc_url
BLOCK_DAEMON_KEY=your_blockdaemon_key
JUPITER_API_KEY=your_jupiter_key
```

## Usage

### Analyze Specific Wallet
```bash
# Interactive mode
npm run analyze

# Single wallet analysis
npm run analyze <wallet_address> [days]

# Example
npm run analyze FzMxzVHtfEfQBNNHGV4cKdpL6GZmG5mWxr3LVrWxsKL 30
```

### Discover Profitable Traders
```bash
# Start live discovery engine
npm run discover
```

The discovery engine will:
1. Monitor live DEX transactions
2. Identify wallets with significant trading volume
3. Automatically analyze promising traders
4. Highlight potential copytrading candidates

## API Configuration

### Single API (Helius only)
- Basic functionality with Helius API key only

### Dual API (Recommended)
- InstantNodes for signature fetching (faster, cost-effective)
- Helius for transaction parsing and WebSocket monitoring

### Triple API (Enterprise)
- Adds BlockDaemon for validation and fallback

## Core Services

### Data Acquisition (`dataAcquisition.ts`)
- Multi-provider transaction fetching
- Automatic fallback between APIs
- Rate limit optimization

### PnL Engine (`pnlEngine.ts`)
- FIFO-based profit/loss calculation
- Handles complex swap scenarios
- SOL/WSOL normalization

### Swap Processor (`swapProcessor.ts`)
- Transaction parsing and classification
- Platform identification
- Token transfer analysis

### Live Monitoring (`liveSwapMonitor.ts`)
- WebSocket-based real-time monitoring
- DEX program log subscriptions
- Large transaction detection

## Project Structure

```
src/
├── index.ts              # Main wallet analyzer
├── services/
│   ├── walletAnalyzer.ts     # Core analysis engine
│   ├── dataAcquisition.ts    # Multi-API data fetching
│   ├── pnlEngine.ts          # PnL calculations
│   ├── swapProcessor.ts      # Transaction processing
│   ├── liveSwapMonitor.ts    # Real-time monitoring
│   ├── analyticsService.ts   # Trading metrics
│   ├── reportFormatter.ts    # Output formatting
│   └── ...
└── types/
    └── index.ts          # TypeScript definitions

wallet-discovery.ts       # Live trader discovery engine
```

## Analysis Output

The analyzer provides:
- **Trading Performance**: Win rate, total PnL, trade frequency
- **Token Analysis**: Most traded tokens, performance per token
- **Platform Usage**: DEX platform distribution
- **Risk Metrics**: Confidence scores and data quality indicators
- **Time-based Insights**: Performance trends over time

## Discovery Criteria

Wallets are automatically analyzed if they meet any of:
- Total volume > 20 SOL
- Number of swaps > 3
- Single swap > 10 SOL

Promising traders are identified with:
- Win rate > 70%
- Total PnL > 10 SOL
- Minimum 5 completed trades

## FIFO Methodology

The analyzer uses First-In-First-Out (FIFO) accounting:
- When buying: Creates new "lots" with purchase price and quantity
- When selling: Consumes oldest lots first to calculate cost basis
- Tracks holding duration from first purchase to sale
- Calculates realized PnL as: (Sale Proceeds - Cost Basis)

## Supported Platforms

- **Jupiter**: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`
- **Raydium**: `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`
- **pump.fun**: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`

## Contributing

This project focuses on defensive security and trading analysis. Contributions should maintain this focus and avoid any functionality that could be used maliciously.

## License

MIT License

// Core data structures for the wallet analyzer

export interface TransactionSignature {
  signature: string;
  slot: number;
  err: any;
  memo: string | null;
  blockTime?: number | null;
  confirmationStatus?: string;
}

export interface TokenTransfer {
  mint: string;
  fromUserAccount: string;
  toUserAccount: string;
  rawTokenAmount: {
    tokenAmount: string;
    decimals: number;
  };
  tokenAmount: number;
  tokenStandard: string;
}

export interface NativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

export interface ParsedTransaction {
  signature: string;
  slot: number;
  blockTime: number;
  fee: number;
  type: string;
  source: string;
  tokenTransfers: TokenTransfer[];
  nativeTransfers: NativeTransfer[];
  instructions: any[];
  events: any;
}

export interface Swap {
  signature: string;
  timestamp: number;
  fee: number;
  tokenMint: string;
  tokenAmount: number;
  solAmount: number;
  direction: 'buy' | 'sell';
  platform: string;
  pricePerToken: number;
}

export interface Lot {
  quantity: number;
  costPerUnit: number;
  timestamp: number;
  signature: string;
}

export interface Holding {
  tokenMint: string;
  purchaseLots: Lot[];
  totalQuantity: number;
  averageCostPerUnit: number;
}

export interface ClosedTrade {
  tokenMint: string;
  totalCostBasisInSol: number;
  totalProceedsInSol: number;
  realizedPnLInSol: number;
  realizedPnLPercent: number;
  holdingDurationSeconds: number;
  buyTimestamp: number;
  sellTimestamp: number;
  quantity: number;
}

export interface TokenPrice {
  mint: string;
  priceInSol: number;
  priceInUsd: number;
}

export interface WalletAnalysis {
  // High-level stats
  uniqueTokensTraded: number;
  winners: number;
  losses: number;
  winRate: number;
  openTrades: number;
  tokenWinners: number;
  tokenLosers: number;
  
  // Holdings
  tokenHoldingsInSol: number;
  tokenHoldingsInUsd: number;
  
  // PnL metrics
  totalRealizedPnLInSol: number;
  totalRealizedPnLInUsd: number;
  averagePnLInSol: number;
  averagePnLPercent: number;
  pnlRatio: number;
  
  // Trading metrics
  totalTrades: number;
  averageTradingSizeInSol: number;
  sumOfPnLInSol: number;
  
  // Capital flow
  solSpentBuyingTokens: number;
  solReceivedSellingTokens: number;
  
  // Fee analysis
  totalSpentOnFees: number;
  averageFeePerTrade: number;
  
  // Distributions
  pnlDistribution: {
    min: number;
    max: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  
  holdingDurationDistribution: {
    min: number;
    max: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  
  // Detailed data
  closedTrades: ClosedTrade[];
  openHoldings: Holding[];
  allSwaps: Swap[];
}

export interface PlatformMapping {
  [programId: string]: string;
} 
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

interface SwapDetection {
  signature: string;
  wallet: string;
  tokenMint: string;
  solAmount: number;
  direction: 'buy' | 'sell';
  platform: string;
  timestamp: number;
}

export class LiveSwapMonitor {
  private ws: WebSocket | null = null;
  private heliusApiKey: string;
  private minSolAmount: number;
  private discoveredWallets: Set<string> = new Set();
  private swapCallback?: (swap: SwapDetection) => void;

  constructor(minSolAmount: number = 5.0, swapCallback?: (swap: SwapDetection) => void) {
    this.heliusApiKey = process.env.HELIUS_API_KEY!;
    this.minSolAmount = minSolAmount;
    this.swapCallback = swapCallback;
  }

  public start(): void {
    console.clear();
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│                    🎯 LIVE SWAP MONITOR                         │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│ 💰 Threshold: ${this.minSolAmount} SOL                                           │`);
    console.log('│ 🔗 Provider: Helius WebSocket                                   │');
    console.log('│ 📡 Status: Connecting...                                       │');
    console.log('└─────────────────────────────────────────────────────────────────┘');

    const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${this.heliusApiKey}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('\n✅ WebSocket Connected Successfully!');
      console.log('📡 Subscribing to DEX program logs...');
      this.subscribeToSwaps();
    });

    this.ws.on('message', (data) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] 📨 Message received (${data.toString().length} bytes)`);
      this.handleMessage(data);
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        this.start();
      }, 5000);
    });
  }

  private subscribeToSwaps(): void {
    if (!this.ws) return;

    // Subscribe to transaction logs for major DEX programs
    const subscriptionRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        {
          mentions: [
            'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
            '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
            '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // pump.fun
          ]
        },
        {
          commitment: 'confirmed'
        }
      ]
    };

    this.ws.send(JSON.stringify(subscriptionRequest));
    
    console.log('┌─────────────────────────────────────────────────────────────────┐');
    console.log('│                   📡 SUBSCRIPTION ACTIVE                        │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ 🎯 Jupiter:  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4     │');
    console.log('│ 🌊 Raydium:  675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8     │');
    console.log('│ 🚀 pump.fun: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P     │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log('│ ⏳ Waiting for transactions...                                  │');
    console.log('└─────────────────────────────────────────────────────────────────┘\n');
  }

  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.method === 'logsNotification') {
        const signature = message.params.result.signature;
        
        // Fetch full transaction details
        await this.analyzeTransaction(signature);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  private async analyzeTransaction(signature: string): Promise<void> {
    try {
      // Use Helius Enhanced API to get parsed transaction
      const response = await fetch(`https://api.helius.xyz/v0/transactions?api-key=${this.heliusApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactions: [signature]
        })
      });

      const data = await response.json();
      const transaction = data[0];

      if (!transaction || !transaction.tokenTransfers) return;

      // Look for SOL swaps
      const solTransfers = transaction.tokenTransfers.filter((transfer: any) => 
        transfer.mint === 'So11111111111111111111111111111111111111112' || // WSOL
        transfer.tokenAmount >= this.minSolAmount * 1e9 // Convert to lamports
      );

      if (solTransfers.length === 0) return;

      // Extract wallet and swap details
      for (const transfer of solTransfers) {
        const solAmount = transfer.tokenAmount / 1e9;
        
        if (solAmount >= this.minSolAmount) {
          const swap: SwapDetection = {
            signature,
            wallet: transfer.fromUserAccount || transfer.toUserAccount,
            tokenMint: transfer.mint,
            solAmount,
            direction: transfer.fromUserAccount ? 'sell' : 'buy',
            platform: this.detectPlatform(transaction),
            timestamp: Date.now()
          };

          this.processSwapDetection(swap);
        }
      }
    } catch (error) {
      console.error('Error analyzing transaction:', error);
    }
  }

  private detectPlatform(transaction: any): string {
    const instructions = transaction.instructions || [];
    
    for (const instruction of instructions) {
      const programId = instruction.programId;
      
      if (programId === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4') return 'Jupiter';
      if (programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') return 'Raydium';
      if (programId === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P') return 'pump.fun';
    }
    
    return 'Unknown';
  }

  private processSwapDetection(swap: SwapDetection): void {
    // Track discovered wallets
    if (!this.discoveredWallets.has(swap.wallet)) {
      this.discoveredWallets.add(swap.wallet);
      
      console.log('┌─────────────────────────────────────────────────────────────────┐');
      console.log('│                    🎯 NEW WALLET DISCOVERED                     │');
      console.log('├─────────────────────────────────────────────────────────────────┤');
      console.log(`│ 💼 Address: ${swap.wallet.substring(0, 40)}... │`);
      console.log(`│ 💰 Amount:  ${swap.solAmount.toFixed(2).padEnd(10)} SOL                               │`);
      console.log(`│ 📊 Platform: ${swap.platform.padEnd(15)}                            │`);
      console.log(`│ 🔄 Direction: ${swap.direction.padEnd(4)} trade                               │`);
      console.log(`│ ⏰ Time: ${new Date().toLocaleTimeString()}                                   │`);
      console.log('└─────────────────────────────────────────────────────────────────┘\n');
    }

    // Call external callback if provided
    if (this.swapCallback) {
      this.swapCallback(swap);
    }
  }

  public getDiscoveredWallets(): string[] {
    return Array.from(this.discoveredWallets);
  }

  public stop(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    console.log('🛑 Live Swap Monitor stopped');
  }

  public getStats(): { walletsFound: number; uptime: number } {
    return {
      walletsFound: this.discoveredWallets.size,
      uptime: process.uptime()
    };
  }
}
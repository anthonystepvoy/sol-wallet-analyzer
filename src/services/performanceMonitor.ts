export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private timings: Map<string, number[]> = new Map();
  private counters: Map<string, number> = new Map();
  private memoryUsage: number[] = [];
  private readonly MAX_HISTORY = 100;

  private constructor() {
    // Start memory monitoring
    this.startMemoryMonitoring();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing an operation
   */
  startTimer(operation: string): () => void {
    const startTime = Date.now();
    
    return () => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      if (!this.timings.has(operation)) {
        this.timings.set(operation, []);
      }
      
      const timings = this.timings.get(operation)!;
      timings.push(duration);
      
      // Keep only recent timings
      if (timings.length > this.MAX_HISTORY) {
        timings.shift();
      }
    };
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const stopTimer = this.startTimer(operation);
    try {
      const result = await fn();
      return result;
    } finally {
      stopTimer();
    }
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    timings: Record<string, {
      avg: number;
      min: number;
      max: number;
      count: number;
      recent: number;
    }>;
    counters: Record<string, number>;
    memoryUsage: {
      current: number;
      average: number;
      peak: number;
    };
  } {
    const timingStats: Record<string, any> = {};
    
    for (const [operation, timings] of this.timings.entries()) {
      const avg = timings.reduce((sum, time) => sum + time, 0) / timings.length;
      const min = Math.min(...timings);
      const max = Math.max(...timings);
      const recent = timings[timings.length - 1] || 0;
      
      timingStats[operation] = {
        avg: Math.round(avg),
        min,
        max,
        count: timings.length,
        recent
      };
    }
    
    const currentMemory = this.getCurrentMemoryUsage();
    const averageMemory = this.memoryUsage.reduce((sum, mem) => sum + mem, 0) / this.memoryUsage.length;
    const peakMemory = Math.max(...this.memoryUsage);
    
    return {
      timings: timingStats,
      counters: Object.fromEntries(this.counters.entries()),
      memoryUsage: {
        current: currentMemory,
        average: Math.round(averageMemory),
        peak: peakMemory
      }
    };
  }

  /**
   * Get current memory usage in MB
   */
  private getCurrentMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    setInterval(() => {
      const currentMemory = this.getCurrentMemoryUsage();
      this.memoryUsage.push(currentMemory);
      
      // Keep only recent memory usage
      if (this.memoryUsage.length > this.MAX_HISTORY) {
        this.memoryUsage.shift();
      }
    }, 30000); // Monitor every 30 seconds
  }

  /**
   * Log performance summary
   */
  logPerformanceSummary(): void {
    const stats = this.getStats();
    
    console.log('\\n📊 Performance Summary:');
    console.log('========================');
    
    // Timing statistics
    if (Object.keys(stats.timings).length > 0) {
      console.log('⏱️  Operation Timings:');
      for (const [operation, timing] of Object.entries(stats.timings)) {
        console.log(`  ${operation}: ${timing.avg}ms avg (${timing.min}-${timing.max}ms, ${timing.count} calls)`);
      }
    }
    
    // Counter statistics
    if (Object.keys(stats.counters).length > 0) {
      console.log('\\n🔢 Counters:');
      for (const [name, count] of Object.entries(stats.counters)) {
        console.log(`  ${name}: ${count}`);
      }
    }
    
    // Memory usage
    console.log('\\n💾 Memory Usage:');
    console.log(`  Current: ${stats.memoryUsage.current}MB`);
    console.log(`  Average: ${stats.memoryUsage.average}MB`);
    console.log(`  Peak: ${stats.memoryUsage.peak}MB`);
    
    console.log('========================\\n');
  }

  /**
   * Check for performance issues
   */
  checkPerformanceIssues(): string[] {
    const issues: string[] = [];
    const stats = this.getStats();
    
    // Check for slow operations
    for (const [operation, timing] of Object.entries(stats.timings)) {
      if (timing.avg > 30000) { // 30 seconds
        issues.push(`Slow operation detected: ${operation} (${timing.avg}ms average)`);
      }
    }
    
    // Check for high memory usage
    if (stats.memoryUsage.current > 1000) { // 1GB
      issues.push(`High memory usage: ${stats.memoryUsage.current}MB`);
    }
    
    // Check for memory leaks
    if (stats.memoryUsage.peak > stats.memoryUsage.average * 2) {
      issues.push(`Potential memory leak: Peak usage (${stats.memoryUsage.peak}MB) is much higher than average (${stats.memoryUsage.average}MB)`);
    }
    
    return issues;
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.timings.clear();
    this.counters.clear();
    this.memoryUsage = [];
  }
}
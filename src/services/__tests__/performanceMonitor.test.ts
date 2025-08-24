import { PerformanceMonitor } from '../performanceMonitor';

describe('PerformanceMonitor', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    performanceMonitor = PerformanceMonitor.getInstance();
    performanceMonitor.reset();
  });

  describe('timing operations', () => {
    it('should measure operation timing', (done) => {
      const stopTimer = performanceMonitor.startTimer('test_operation');
      
      setTimeout(() => {
        stopTimer();
        
        const stats = performanceMonitor.getStats();
        expect(stats.timings.test_operation).toBeDefined();
        expect(stats.timings.test_operation.count).toBe(1);
        expect(stats.timings.test_operation.avg).toBeGreaterThan(95);
        expect(stats.timings.test_operation.avg).toBeLessThan(150);
        done();
      }, 100);
    });

    it('should time async functions', async () => {
      const testFunction = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'result';
      };

      const result = await performanceMonitor.timeFunction('async_test', testFunction);
      
      expect(result).toBe('result');
      
      const stats = performanceMonitor.getStats();
      expect(stats.timings.async_test).toBeDefined();
      expect(stats.timings.async_test.count).toBe(1);
      expect(stats.timings.async_test.avg).toBeGreaterThan(95);
    });
  });

  describe('counter operations', () => {
    it('should increment counters', () => {
      performanceMonitor.incrementCounter('test_counter');
      performanceMonitor.incrementCounter('test_counter', 5);
      
      const stats = performanceMonitor.getStats();
      expect(stats.counters.test_counter).toBe(6);
    });

    it('should handle multiple counters', () => {
      performanceMonitor.incrementCounter('counter1', 10);
      performanceMonitor.incrementCounter('counter2', 20);
      
      const stats = performanceMonitor.getStats();
      expect(stats.counters.counter1).toBe(10);
      expect(stats.counters.counter2).toBe(20);
    });
  });

  describe('statistics aggregation', () => {
    it('should calculate timing statistics correctly', () => {
      // Simulate multiple operations
      const times = [100, 200, 300];
      
      times.forEach(time => {
        const start = Date.now();
        const stopTimer = performanceMonitor.startTimer('multi_test');
        
        // Simulate time passing
        while (Date.now() - start < time) {
          // Busy wait
        }
        
        stopTimer();
      });

      const stats = performanceMonitor.getStats();
      const timingStats = stats.timings.multi_test;
      
      expect(timingStats.count).toBe(3);
      expect(timingStats.min).toBeGreaterThanOrEqual(90);
      expect(timingStats.max).toBeLessThan(350);
      expect(timingStats.avg).toBeGreaterThan(150);
      expect(timingStats.avg).toBeLessThan(250);
    });
  });

  describe('performance issue detection', () => {
    it('should detect slow operations', () => {
      // Simulate a slow operation
      const stopTimer = performanceMonitor.startTimer('slow_operation');
      const start = Date.now();
      while (Date.now() - start < 31000) {
        // Simulate 31 seconds (over the 30s threshold)
        break; // Don't actually wait in tests
      }
      
      // Manually set a high timing for testing
      performanceMonitor['timings'].set('slow_operation', [31000]);
      
      const issues = performanceMonitor.checkPerformanceIssues();
      expect(issues).toContain('Slow operation detected: slow_operation (31000ms average)');
    });
  });

  describe('reset functionality', () => {
    it('should reset all statistics', () => {
      performanceMonitor.incrementCounter('test_counter', 10);
      performanceMonitor.startTimer('test_timer')();
      
      performanceMonitor.reset();
      
      const stats = performanceMonitor.getStats();
      expect(Object.keys(stats.counters)).toHaveLength(0);
      expect(Object.keys(stats.timings)).toHaveLength(0);
    });
  });
});
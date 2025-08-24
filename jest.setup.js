// Jest setup file for global configurations
global.console = {
  ...console,
  // Mock console methods to avoid noise in tests
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
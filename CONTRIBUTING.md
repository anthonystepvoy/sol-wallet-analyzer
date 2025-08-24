# Contributing to Solana Wallet Analyzer

Thank you for your interest in contributing to the Solana Wallet Analyzer! This document provides guidelines and information for contributors.

## Code of Conduct

This project is committed to providing a welcoming and inclusive environment for all contributors. We expect all contributors to:

- Be respectful and considerate of others
- Focus on constructive feedback and collaboration
- Maintain a professional and ethical approach
- Follow security best practices

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Git
- TypeScript knowledge
- Understanding of Solana blockchain concepts

### Development Setup

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Copy `.env.example` to `.env` and configure your API keys
5. Run tests: `npm test`

## Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and single-purpose

### Testing

- Write tests for new functionality
- Ensure all tests pass before submitting PRs
- Maintain good test coverage
- Use descriptive test names

### Security

- Never commit API keys or sensitive data
- Validate all user inputs
- Follow security best practices
- Report security vulnerabilities privately

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Add tests for new functionality
4. Ensure all tests pass
5. Update documentation if needed
6. Submit a pull request with a clear description

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Areas for Contribution

### High Priority
- Bug fixes and performance improvements
- Enhanced error handling
- Additional DEX platform support
- Improved PnL calculation accuracy

### Medium Priority
- New trading metrics and analytics
- Enhanced reporting features
- Better token filtering algorithms
- Additional API provider support

### Low Priority
- Documentation improvements
- Code refactoring
- Test coverage improvements
- Performance optimizations

## Questions and Support

- Open an issue for bugs or feature requests
- Use discussions for questions and ideas
- Join our community channels (if available)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

Thank you for contributing to the Solana Wallet Analyzer!

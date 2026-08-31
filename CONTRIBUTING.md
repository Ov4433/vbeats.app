# Contributing to VbeatS

Thank you for your interest in contributing to VbeatS! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Support fellow contributors

## Getting Started

### 1. Fork & Clone
```bash
git clone https://github.com/Ov4433/vbeats.app.git
cd vbeats.app
npm install
```

### 2. Create a Feature Branch
```bash
git checkout -b feature/description
# or
git checkout -b fix/description
# or
git checkout -b docs/description
```

### 3. Make Changes
- Keep commits atomic and well-documented
- Follow existing code style
- Update tests and documentation

### 4. Test Your Changes
```bash
npm test
npm start  # Test on your platform
```

### 5. Submit a Pull Request
- Provide clear description of changes
- Reference related issues
- Ensure CI/CD checks pass

## Branch Naming Convention

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `chore/` - Build, dependencies, etc.
- `test/` - Test additions or fixes

## Commit Message Convention

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- feat: A new feature
- fix: A bug fix
- docs: Documentation only
- style: Changes that don't affect code meaning
- refactor: Code change without new features or fixes
- perf: Code improvement for performance
- test: Adding or updating tests
- chore: Build, dependencies, etc.

## Code Style

- Use 2-space indentation
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused
- Use TypeScript where possible

## Testing

- Write tests for new features
- Update tests for bug fixes
- Maintain test coverage above 80%
- Test on multiple platforms (iOS, Android, Web)

## Documentation

- Update README for new features
- Add inline code comments
- Update CHANGELOG if applicable
- Document breaking changes

## Pull Request Process

1. Update documentation and tests
2. Ensure all tests pass
3. Request review from maintainers
4. Address feedback promptly
5. Keep PR focused on single concern

## Reporting Issues

### Bug Reports
Include:
- Platform (iOS, Android, Web)
- Reproducible steps
- Expected behavior
- Actual behavior
- Environment info (versions, device)

### Feature Requests
Include:
- Clear description of feature
- Use cases
- Proposed implementation (optional)

## Questions or Need Help?

- Open a Discussion on GitHub
- Check existing issues and PRs
- Review documentation

Thank you for contributing! 🎵

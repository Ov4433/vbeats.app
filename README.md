# VbeatS - Verified Beat Studios

A cross-platform mobile and web application for independent beat producers and artists to create, share, and monetize music beats using blockchain technology and Web3 integration.

## 🎵 Features

- **Beat Creation & Management**: Create and manage your music beats with professional audio tools
- **Audio Recording**: Record performances with high-quality microphone access
- **Web3 Integration**: Blockchain-based verification and transactions using ethers.js
- **Payment Processing**: Stripe integration for seamless payment handling
- **Cross-Platform**: iOS, Android, and Web support via Expo
- **Navigation**: Bottom tab navigation for intuitive UI/UX
- **Gesture Support**: Smooth animations and gesture recognition with Reanimated

## 🏗️ Project Structure

```
vbeats.app/
├── app/                      # Application source code
│   ├── screens/             # Screen components
│   ├── components/          # Reusable components
│   ├── navigation/          # Navigation configuration
│   ├── services/            # API and blockchain services
│   ├── hooks/               # Custom React hooks
│   ├── context/             # Context providers
│   └── utils/               # Utility functions
├── assets/                  # Images, icons, fonts
├── features/                # Feature-specific modules
├── tests/                   # Test files
├── app.json                 # Expo configuration
├── eas.json                 # EAS build configuration
├── package.json             # Dependencies
├── .env.example             # Environment variables template
├── .gitignore               # Git ignore rules
└── setup.sh                 # Setup script
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 16.x
- **npm** or **yarn**
- **Expo CLI**: `npm install -g expo-cli`
- **EAS CLI** (for building): `npm install -g eas-cli`

### Installation

```bash
# Clone the repository
git clone https://github.com/Ov4433/vbeats.app.git
cd vbeats.app

# Run setup script
bash setup.sh

# Or manually install dependencies
npm install
```

### Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Configure your environment variables
# - API URLs
# - Blockchain RPC endpoints
# - Stripe API keys
# - EAS Project ID
```

### Development

```bash
# Start the Expo development server
npm start

# Run on specific platforms
npm run ios          # iOS simulator
npm run android      # Android emulator
npm run web          # Web browser
```

### Building

```bash
# Development build
npm run eas:build:dev

# Preview build
npm run eas:build:preview

# Production build
npm run eas:build:prod

# Submit to app stores
npm run eas:submit
```

## 🌐 Live Release Scope

VbeatS production rollout targets **all three platforms**:
- iOS App Store release
- Android Play Store release
- Web deployment

Production runtime targets:
- API: `https://api.vbeats.app`
- Blockchain RPC: `https://mainnet.base.org`
- EAS project linkage: `EAS_PROJECT_ID` via environment

## ✅ Release Readiness

Run release validation before production builds:

```bash
npm run release:readiness
```

This check verifies:
- No placeholder EAS project ID remains
- Production profile does not use localhost
- Production blockchain RPC uses mainnet
- `.env.example` does not contain test keys or staging defaults

## 🚢 Staged Rollout

1. Build and test internal development profile (`eas:build:dev`)
2. Run preview/internal QA (`eas:build:preview`)
3. Trigger production build (`eas:build:prod`)
4. Submit production binaries (`eas:submit`)
5. Deploy web build and monitor startup health

## 📈 Post-Launch Operations

- Enable crash and error monitoring for mobile and web
- Monitor API uptime and payment webhook health
- Track signups, activations, purchases, and retention metrics
- Keep a first-week hotfix branch/process ready for rapid patches
- Maintain rollback runbooks for app/web/API incidents

## 📦 Tech Stack

### Frontend
- **React Native** v0.73
- **Expo** v50 - Cross-platform development
- **React Navigation** v6 - Navigation management
- **React Native Reanimated** - Smooth animations
- **React Native Gesture Handler** - Touch interactions

### Web3 & Payments
- **ethers.js** v6.8 - Blockchain interactions
- **thirdweb** - Web3 SDK for React Native
- **Stripe React Native** - Payment processing

### Audio
- **Expo AV** - Audio and video handling
- **Audio Recording API** - Native microphone access

### Development
- **Babel** - JavaScript transpiler
- **Jest** - Testing framework
- **TypeScript** - Type safety (optional, ready to implement)

## 🔌 API Integration

### Environment Variables Required

```env
# Blockchain
BLOCKCHAIN_RPC_URL=https://mainnet.base.org
BLOCKCHAIN_NETWORK_ID=8453

# API
API_URL=https://api.vbeats.app
API_VERSION=v1

# Payments
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...

# Web3
THIRDWEB_CLIENT_ID=your_client_id

# EAS
EAS_PROJECT_ID=your_eas_project_id
```

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run ios` | Run on iOS simulator |
| `npm run android` | Run on Android emulator |
| `npm run web` | Run web version |
| `npm run test` | Run Jest tests |
| `npm run eas:build:dev` | Build development version |
| `npm run eas:build:preview` | Build preview version |
| `npm run eas:build:prod` | Build production version |
| `npm run eas:submit` | Submit to app stores |

## 🧪 Testing

```bash
npm test
```

## 📱 Platform Support

- ✅ iOS (13.0+)
- ✅ Android (API 21+)
- ✅ Web

## 🔐 Security Considerations

- Private keys and sensitive data should NEVER be committed
- Use `.env` files for local development (already in .gitignore)
- Implement wallet security best practices
- Validate all user inputs
- Use HTTPS for all API communications

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -am 'Add your feature'`
3. Push to branch: `git push origin feature/your-feature`
4. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Troubleshooting

### Microphone Permission Issues
- Ensure microphone permissions are granted in system settings
- Check `app.json` for correct permission descriptions

### Blockchain Connection
- Verify RPC endpoint is accessible
- Check network ID configuration in `.env`

### Build Issues
- Clear cache: `expo prebuild --clean`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check EAS credentials: `eas whoami`

## 📞 Support

For issues and questions, please open an issue on GitHub or contact the VbeatS team.

---

**Built with ❤️ by VbeatS Team**

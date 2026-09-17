const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const checks = [
  {
    name: 'app config exists',
    run: () => fs.existsSync(path.join(root, 'app.config.js')),
    message: 'app.config.js is required to inject EAS project configuration at release time.',
  },
  {
    name: 'EAS project id provided',
    run: () => Boolean(process.env.EAS_PROJECT_ID || process.env.EXPO_PUBLIC_EAS_PROJECT_ID),
    message: 'Set EAS_PROJECT_ID (or EXPO_PUBLIC_EAS_PROJECT_ID) before release builds.',
  },
  {
    name: 'production API is not localhost',
    run: () => {
      const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
      const apiUrl = eas?.build?.production?.env?.EXPO_PUBLIC_API_URL || '';
      return apiUrl && !apiUrl.includes('localhost');
    },
    message: 'eas.json production profile must use a non-localhost EXPO_PUBLIC_API_URL.',
  },
  {
    name: 'production blockchain RPC is mainnet',
    run: () => {
      const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
      const rpc = eas?.build?.production?.env?.EXPO_PUBLIC_BLOCKCHAIN_RPC || '';
      return rpc.includes('mainnet');
    },
    message: 'eas.json production profile must point EXPO_PUBLIC_BLOCKCHAIN_RPC to mainnet.',
  },
  {
    name: 'no placeholder IDs in app.json',
    run: () => {
      const appJson = fs.readFileSync(path.join(root, 'app.json'), 'utf8');
      return !appJson.includes('YOUR_EAS_PROJECT_ID');
    },
    message: 'Remove placeholder values from app.json before release.',
  },
  {
    name: '.env.example has no dev keys/endpoints',
    run: () => {
      const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
      return (
        !envExample.includes('localhost') &&
        !envExample.includes('sepolia') &&
        !envExample.includes('sk_test_')
      );
    },
    message: '.env.example must not contain localhost, sepolia, or Stripe test keys.',
  },
];

const failures = checks
  .map((check) => ({
    ...check,
    passed: Boolean(check.run()),
  }))
  .filter((check) => !check.passed);

if (failures.length > 0) {
  console.error('Release readiness checks failed:');
  failures.forEach((failure) => {
    console.error(`- ${failure.name}: ${failure.message}`);
  });
  process.exit(1);
}

console.log('Release readiness checks passed.');

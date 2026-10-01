module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  // backend/ and contracts/ have their own CI workflow (backend-ci);
  // keep the mobile test run from picking up their test files
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/backend/', '<rootDir>/contracts/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'babel-jest',
      { presets: ['babel-preset-expo'] },
    ],
  },
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    '!app/**/*.d.ts',
    '!app/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
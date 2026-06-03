const path = require('path');

module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/jestUnitTesting/**/*.test.ts',
              '**/jestUnitTesting/**/*.test.tsx',
              '**/__tests__/**/*.[jt]s?(x)',
              '**/?(*.)+(spec|test).[jt]s?(x)',],
  testTimeout: 10000,
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['@swc/jest', {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: true,
        },
        transform: {
          react: {
            runtime: 'automatic',
          },
        },
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  collectCoverage: true,

  collectCoverageFrom: [
    // Audits your custom components
    'components/**/*.{js,jsx,ts,tsx}',
    
    // Audits Next.js UI pages and API routes
    'app/**/page.{js,jsx,ts,tsx}',
    'app/api/**/route.{js,jsx,ts,tsx}',
    
    // EXCLUSIONS: Prevents Jest from auditing configurations or test files themselves
    '!**/node_modules/**',
    '!**/*.test.{js,jsx,ts,tsx}',
    '!**/*.spec.{js,jsx,ts,tsx}',
    '!app/layout.{js,jsx,ts,tsx}', 
    '!app/providers.{js,jsx,ts,tsx}',
  ],
  
  // Optional: Sets up directory target for generated report files
  coverageDirectory: 'coverage',
}
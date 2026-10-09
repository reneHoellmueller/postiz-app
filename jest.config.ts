import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/libraries/nestjs-libraries/src'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    '^@gitroom/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
    '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
  },
  collectCoverageFrom: [
    'libraries/nestjs-libraries/src/scheduler/**/*.ts',
    'libraries/nestjs-libraries/src/database/prisma/inbox/**/*.ts',
  ],
};

export default config;

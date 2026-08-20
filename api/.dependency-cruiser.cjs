module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      from: { pathNot: '^node_modules' },
      to: { circular: true },
    },
    {
      name: 'no-core-to-infrastructure',
      severity: 'error',
      from: { path: '^src/core' },
      to: { path: '^src/infrastructure' },
    },
    {
      name: 'no-core-to-features',
      severity: 'error',
      from: { path: '^src/core' },
      to: { path: '^src/features' },
    },
    {
      name: 'no-domain-to-application',
      severity: 'error',
      from: { path: '^src/core/domain' },
      to: { path: '^src/core/application' },
    },
    {
      name: 'no-application-to-nestjs',
      severity: 'error',
      from: { path: '^src/core/application' },
      to: { path: '^node_modules/@nestjs/' },
    },
    {
      name: 'no-application-to-prisma',
      severity: 'error',
      from: { path: '^src/core/application' },
      to: { path: '^node_modules/@prisma/' },
    },
    {
      name: 'no-inbound-to-prisma',
      severity: 'error',
      from: { path: '^src/infrastructure/transport' },
      to: { path: '^node_modules/@prisma/' },
    },
    {
      name: 'no-inbound-to-outbound-adapters',
      severity: 'error',
      from: { path: '^src/infrastructure/transport' },
      to: { path: '^src/infrastructure/(ai|calendar|http|persistence|queue|security|sync)' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: '^node_modules' },
  },
};

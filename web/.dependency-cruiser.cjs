module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      from: { pathNot: '^node_modules' },
      to: { circular: true },
    },
    {
      name: 'no-shared-to-features',
      severity: 'error',
      from: { path: '^src/shared' },
      to: { path: '^src/features' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: '^node_modules' },
  },
};

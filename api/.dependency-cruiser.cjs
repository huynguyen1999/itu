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
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: '^node_modules' },
  },
};

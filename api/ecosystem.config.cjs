module.exports = {
  apps: [
    {
      name: 'quizme-api',
      cwd: __dirname,
      script: 'dist/main.js',
      exec_mode: 'cluster',
      instances: 4,
      env: {
        NODE_ENV: 'uat',
      },
    },
  ],
};

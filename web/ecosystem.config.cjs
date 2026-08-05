module.exports = {
  apps: [
    {
      name: 'quizme-web',
      cwd: __dirname,
      script: './node_modules/.bin/serve',
      args: ['-s', 'dist', '-l', 'tcp://0.0.0.0:5173', '--no-port-switching'],
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'uat',
      },
    },
  ],
};

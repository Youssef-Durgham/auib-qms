module.exports = {
  apps: [
    {
      name: 'auib-qms',
      script: './node_modules/next/dist/bin/next',
      args: 'start -H 0.0.0.0 -p 3070',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      node_args: '--max-old-space-size=450',
      env: {
        NODE_ENV: 'production',
        PORT: 3070,
      },
    },
  ],
};

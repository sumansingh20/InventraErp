module.exports = {
  apps: [
    {
      name: 'inventra-erp-backend',
      script: './backend/src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        MONGO_URI: 'mongodb://127.0.0.1:27017/inventra_erp',
        REDIS_URL: 'redis://127.0.0.1:6379',
        JWT_SECRET: 'df0516b2cfd84e8a8b13c7a00f162db8ea5fa879571ff2be201a4ad848e3e4a9',
        JWT_EXPIRE: '24h'
      }
    }
  ]
};

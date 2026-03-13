/**
 * PM2 Ecosystem Configuration — Paga Diario
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
module.exports = {
  apps: [
    {
      name: 'paga-diario',
      script: 'src/server.js',

      // ---------- Cluster ----------
      exec_mode: 'cluster',
      instances: 'max',

      // ---------- Entorno ----------
      node_args: '--max-old-space-size=512',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // ---------- Memoria ----------
      max_memory_restart: '512M',

      // ---------- Logs ----------
      out_file: './logs/app-out.log',
      error_file: './logs/app-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // ---------- Reinicios ----------
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,

      // ---------- Monitoreo ----------
      watch: false,
      kill_timeout: 5000,

      // ---------- Señales ----------
      listen_timeout: 10000,
      shutdown_with_message: true,
    },
  ],
};

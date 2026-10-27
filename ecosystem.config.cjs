module.exports = {
  apps: [
    {
      name: 'hufra',
      script: 'npx',
      // NOTE: do NOT pass --d1/--r2/--kv flags here. Passing them causes
      // `wrangler pages dev` to spin up *fresh, separate* local resources
      // instead of the ones declared in wrangler.jsonc, which silently have
      // no migrations/seed data applied ("no such table: regions" etc).
      // Bindings declared in wrangler.jsonc are picked up automatically.
      args: 'wrangler pages dev dist --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
}

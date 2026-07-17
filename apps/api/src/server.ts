import { createServer } from 'node:http';
import { app } from './app.js';
import { env, isLocalDevelopment } from './config/env.js';
import { createSocketServer } from './socket/index.js';

const httpServer = createServer(app);
const io = createSocketServer(httpServer);
app.set('io', io);

httpServer.listen(env.PORT, '0.0.0.0', () => {
  console.info(`NOVA Connect API listening on port ${env.PORT}`);
  if (isLocalDevelopment) console.info('Local development database is enabled');
});

const shutdown = (signal: string) => {
  console.info(`${signal} received, shutting down`);
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

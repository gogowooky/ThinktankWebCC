// Wait for Express server to be ready before starting Vite
import { createConnection } from 'net';

const PORT = process.env.PORT ?? 8080;
const TIMEOUT_MS = 30_000;
const INTERVAL_MS = 300;

function tryConnect() {
  return new Promise((resolve) => {
    const socket = createConnection({ port: Number(PORT), host: '127.0.0.1' });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

const start = Date.now();
while (true) {
  if (await tryConnect()) break;
  if (Date.now() - start > TIMEOUT_MS) {
    console.error(`[wait-for-server] Timed out waiting for port ${PORT}`);
    process.exit(1);
  }
  await new Promise(r => setTimeout(r, INTERVAL_MS));
}

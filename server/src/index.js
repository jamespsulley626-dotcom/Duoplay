import { createGameServer } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const { httpServer } = createGameServer();

httpServer.listen(PORT, () => {
  console.log(`Duoplay server listening on http://localhost:${PORT}`);
});

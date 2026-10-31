import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repo } from './repo';
import { api } from './routes';
import { seed } from './seed';

const PORT = Number(process.env.PORT ?? 3001);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const app = express();
app.use(express.json());
app.use('/api', api);

// Production (`npm start`): serve the built React app from the same port.
const dist = path.join(root, 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// First boot: seed demo data so the app isn't empty.
if ((await repo.listWeeks()).length === 0) {
  console.log('Empty database — seeding demo data…');
  await seed();
}

app.listen(PORT, () => {
  const prod = process.env.NODE_ENV === 'production';
  console.log(`🏈 Prediction League API on http://localhost:${PORT}/api`);
  if (prod) console.log(`   App: http://localhost:${PORT}`);
});

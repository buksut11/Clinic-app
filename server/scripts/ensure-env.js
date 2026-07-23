// Creates server/.env from .env.example if it does not exist yet, so a fresh clone
// can run `npm run setup` / `npm run dev` with zero manual steps. The committed
// .env.example uses a local SQLite file and a clearly-marked dev JWT secret —
// change JWT_SECRET before any real deployment.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('Created server/.env from .env.example (edit JWT_SECRET before deploying).');
  } else {
    console.warn('No .env or .env.example found — create server/.env manually.');
  }
}

import express from 'express';
import path from 'path';
import handler from './api/generate-document.js';
import rankingSheetHandler from './api/ranking-sheet.js';
import clientSheetHandler from './api/consultar.js';
import createUserHandler from './api/admin/create-user.js';
import setUserDisabledHandler from './api/admin/set-user-disabled.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount API handler
app.get('/api/generate-document', (req, res) => handler(req, res));
app.post('/api/generate-document', (req, res) => handler(req, res));
app.get('/api/ranking-sheet', (req, res) => rankingSheetHandler(req, res));
app.get('/api/consultar', (req, res) => clientSheetHandler(req, res));
app.post('/api/admin/create-user', (req, res) => createUserHandler(req, res));
app.post('/api/admin/set-user-disabled', (req, res) => setUserDisabledHandler(req, res));

// Serve static files from project root (index.html, assets, modelos-originais)
app.use(express.static(path.resolve(process.cwd())));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Use Ctrl+C to stop. Dynamic PDF generator is ready.');
});

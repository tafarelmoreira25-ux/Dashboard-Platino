import express from 'express';
import path from 'path';
import firebaseConfigHandler from './api/firebase-config.js';
import handler from './api/generate-document.js';
import rankingSheetHandler from './api/ranking-sheet.js';
import clientSheetHandler from './api/consultar.js';
import createUserHandler from './api/admin/create-user.js';
import listUsersHandler from './api/admin/list-users.js';
import setUserDisabledHandler from './api/admin/set-user-disabled.js';
import setUserOperationalRoleHandler from './api/admin/set-user-operational-role.js';
import sdrHandler from './api/sdr.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount API handler
app.get('/api/firebase-config', (req, res) => firebaseConfigHandler(req, res));
app.get('/api/generate-document', (req, res) => handler(req, res));
app.post('/api/generate-document', (req, res) => handler(req, res));
app.get('/api/ranking-sheet', (req, res) => rankingSheetHandler(req, res));
app.get('/api/consultar', (req, res) => clientSheetHandler(req, res));
app.post('/api/admin/create-user', (req, res) => createUserHandler(req, res));
app.post('/api/admin/list-users', (req, res) => listUsersHandler(req, res));
app.post('/api/admin/set-user-disabled', (req, res) => setUserDisabledHandler(req, res));
app.post('/api/admin/set-user-operational-role', (req, res) => setUserOperationalRoleHandler(req, res));
app.post('/api/sdr', (req, res) => sdrHandler(req, res));

// Serve static files from project root (index.html, assets, modelos-originais)
app.use(express.static(path.resolve(process.cwd())));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Use Ctrl+C to stop. Dynamic PDF generator is ready.');
});


import express from 'express';
import path from 'path';
import handler from './api/generate-document.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Mount API handler
app.get('/api/generate-document', (req, res) => handler(req, res));
app.post('/api/generate-document', (req, res) => handler(req, res));

// Serve static files from project root (index.html, assets, modelos-originais)
app.use(express.static(path.resolve(process.cwd())));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Use Ctrl+C to stop. Ensure Word is installed for faithful PDF generation.');
});

'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
fs.mkdirSync(PDF_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'biblioteca-dev.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS app_state (state_key TEXT PRIMARY KEY, json_value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS pdf_files (book_id TEXT PRIMARY KEY, stored_name TEXT NOT NULL, original_name TEXT NOT NULL, size_bytes INTEGER NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
const getState = db.prepare('SELECT json_value FROM app_state WHERE state_key = ?');
const putState = db.prepare(`INSERT INTO app_state(state_key,json_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(state_key) DO UPDATE SET json_value=excluded.json_value, updated_at=CURRENT_TIMESTAMP`);
const upload = multer({ dest: path.join(DATA_DIR, 'tmp'), limits: { fileSize: 30 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const valid = file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname);
  cb(valid ? null : new Error('Envie um arquivo PDF válido.'), valid);
} });
app.use(express.json({ limit: '2mb' }));
// Nunca exponha o banco SQLite, PDFs privados ou dependências como arquivos estáticos.
app.use(['/data', '/node_modules', '/.git'], (_req, res) => res.sendStatus(404));
app.use(['/server.js', '/package.json', '/package-lock.json'], (_req, res) => res.sendStatus(404));
app.use(express.static(ROOT, { extensions: ['html'], dotfiles: 'deny' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, database: 'SQLite', app: 'Biblioteca Dev' }));
app.get('/api/state/:key', (req, res) => {
  const row = getState.get(req.params.key);
  if (!row) return res.json({ value: null });
  try { return res.json({ value: JSON.parse(row.json_value) }); }
  catch (_) { return res.status(500).json({ error: 'Dados armazenados inválidos.' }); }
});
app.put('/api/state/:key', (req, res) => {
  const allowed = new Set(['bd_users', 'bd_books', 'bd_loans']);
  if (!allowed.has(req.params.key) || !Object.prototype.hasOwnProperty.call(req.body || {}, 'value')) return res.status(400).json({ ok: false, error: 'Atualização inválida.' });
  try {
    const json = JSON.stringify(req.body.value);
    if (json.length > 8 * 1024 * 1024) return res.status(413).json({ ok: false, error: 'Dados muito grandes.' });
    putState.run(req.params.key, json);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ ok: false, error: 'Falha ao gravar no SQLite.' }); }
});

function getUser(id) {
  const row = getState.get('bd_users');
  if (!row) return null;
  try { return JSON.parse(row.json_value).find(u => u.id === id) || null; } catch (_) { return null; }
}
function getLoans() { const row = getState.get('bd_loans'); try { return row ? JSON.parse(row.json_value) : []; } catch (_) { return []; } }
function getBooks() { const row = getState.get('bd_books'); try { return row ? JSON.parse(row.json_value) : []; } catch (_) { return []; } }
function pdfPath(bookId) { const row = db.prepare('SELECT stored_name FROM pdf_files WHERE book_id=?').get(bookId); return row ? path.join(PDF_DIR, row.stored_name) : null; }
app.get('/api/files/:bookId/info', (req, res) => {
  const row = db.prepare('SELECT original_name,size_bytes,updated_at FROM pdf_files WHERE book_id=?').get(req.params.bookId);
  return row ? res.json({ ok: true, ...row }) : res.status(404).json({ error: 'PDF não cadastrado.' });
});
app.post('/api/files/:bookId', upload.single('pdf'), (req, res) => {
  const user = getUser(req.get('X-User-Id'));
  if (!user || user.role !== 'admin') { if (req.file) fs.unlinkSync(req.file.path); return res.status(403).json({ error: 'Apenas o administrador pode enviar PDFs.' }); }
  if (!getBooks().some(b => b.id === req.params.bookId)) { if (req.file) fs.unlinkSync(req.file.path); return res.status(404).json({ error: 'Livro não encontrado.' }); }
  if (!req.file) return res.status(400).json({ error: 'Selecione um PDF.' });
  const storedName = req.params.bookId.replace(/[^a-zA-Z0-9_-]/g, '_') + '-' + Date.now() + '.pdf';
  const target = path.join(PDF_DIR, storedName);
  fs.renameSync(req.file.path, target);
  const old = db.prepare('SELECT stored_name FROM pdf_files WHERE book_id=?').get(req.params.bookId);
  db.prepare(`INSERT INTO pdf_files(book_id,stored_name,original_name,size_bytes,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(book_id) DO UPDATE SET stored_name=excluded.stored_name,original_name=excluded.original_name,size_bytes=excluded.size_bytes,updated_at=CURRENT_TIMESTAMP`)
    .run(req.params.bookId, storedName, path.basename(req.file.originalname), req.file.size);
  if (old && old.stored_name !== storedName) { try { fs.unlinkSync(path.join(PDF_DIR, old.stored_name)); } catch (_) {} }
  res.json({ ok: true });
});
app.get('/api/files/:bookId', (req, res) => {
  const userId = String(req.query.userId || '');
  const user = getUser(userId);
  if (!user || user.role !== 'leitor') return res.status(403).json({ error: 'Entre como leitor para acessar o PDF.' });
  const loan = getLoans().find(l => l.userId === userId && l.bookId === req.params.bookId && !l.returnedAt && Date.now() <= l.dueAt);
  if (!loan) return res.status(403).json({ error: 'O PDF fica disponível somente durante um empréstimo válido.' });
  const row = db.prepare('SELECT stored_name,original_name FROM pdf_files WHERE book_id=?').get(req.params.bookId);
  if (!row) return res.status(404).json({ error: 'O administrador ainda não disponibilizou o PDF.' });
  const file = path.join(PDF_DIR, row.stored_name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Arquivo PDF não encontrado no servidor.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-File-Name', encodeURIComponent(row.original_name));
  res.sendFile(file);
});
app.delete('/api/files/:bookId', (req, res) => {
  const user = getUser(req.get('X-User-Id'));
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Apenas o administrador pode remover PDFs.' });
  const row = db.prepare('SELECT stored_name FROM pdf_files WHERE book_id=?').get(req.params.bookId);
  if (row) { try { fs.unlinkSync(path.join(PDF_DIR, row.stored_name)); } catch (_) {} db.prepare('DELETE FROM pdf_files WHERE book_id=?').run(req.params.bookId); }
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err.message);
  const status = err instanceof multer.MulterError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : 400;
  res.status(status).json({ error: err.message || 'Erro na solicitação.' });
});
app.listen(PORT, '127.0.0.1', () => console.log(`Biblioteca Dev disponível em http://localhost:${PORT}`));
process.on('SIGINT', () => { db.close(); process.exit(0); });

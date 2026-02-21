import express from "express";
import cors from "cors";
import fs from 'fs';
import path from 'path';
import dotenv from "dotenv";
import mysql from "mysql2/promise";
dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Habilita CORS explicitamente. Defina ALLOWED_ORIGIN na produção para restringir.
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
// Allow larger JSON bodies for non-file endpoints (safe moderate limit)
app.use(express.json({ limit: '15mb' }));

// --------------------
// MySQL Pool
// --------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'karrega',
  waitForConnections: true,
  multipleStatements: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Utilities
const uploadsDir = path.resolve('./uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

async function initDatabase() {
  const initSql = fs.readFileSync(path.resolve('./init_db.sql'), 'utf8');
  await pool.query(initSql);
  console.log('Banco inicializado (init_db.sql executado).');
}

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Root
app.get('/', (req, res) => res.send('Karrega backend is running'));

// Register client
app.post('/api/register/client', async (req, res) => {
  try {
    const { nome, numero, numero_bi } = req.body;
    if (!nome || !numero || !numero_bi) return res.status(400).json({ error: 'nome, numero e numero_bi são obrigatórios' });

    const [resInsert] = await pool.query(
      'INSERT INTO clientes (nome, numero, numero_bi) VALUES (?, ?, ?)',
      [nome, numero, numero_bi]
    );
    const insertId = resInsert.insertId || null;
    return res.json({ ok: true, id: insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Register transporter
app.post('/api/register/driver', async (req, res) => {
  try {
    const { nome, numero, numero_bi, foto_bi_base64 } = req.body;
    if (!nome || !numero || !numero_bi) return res.status(400).json({ error: 'nome, numero e numero_bi são obrigatórios' });

    let fotoPath = null;
    if (foto_bi_base64) {
      // Expect base64 string like 'data:image/png;base64,...' or raw base64
      const matches = foto_bi_base64.match(/^data:(image\/\w+);base64,(.+)$/);
      let ext = 'png';
      let data = foto_bi_base64;
      if (matches) {
        const mime = matches[1];
        data = matches[2];
        ext = mime.split('/')[1] || 'png';
      }
      const buffer = Buffer.from(data, 'base64');
      const filename = `bi_${Date.now()}_${numero.replace(/\D+/g, '')}.${ext}`;
      const target = path.join(uploadsDir, filename);
      fs.writeFileSync(target, buffer);
      fotoPath = `/uploads/${filename}`;
    }

    const [resInsert] = await pool.query(
      'INSERT INTO transportadores (nome, numero, numero_bi, foto_bi_path) VALUES (?, ?, ?, ?)',
      [nome, numero, numero_bi, fotoPath]
    );
    const insertId = resInsert.insertId || null;
    return res.json({ ok: true, id: insertId, fotoPath });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Serve uploads statically
app.use('/uploads', express.static(path.resolve('./uploads')));

// Inicializa o banco (cria tabelas) e depois sobe o servidor
(async () => {
  try {
    await initDatabase();
  } catch (err) {
    console.warn('Continuando mesmo se initDatabase falhar.', err?.message || err);
  }

  app.listen(PORT, () => console.log(`Karrega API rodando na porta ${PORT}`));
})();

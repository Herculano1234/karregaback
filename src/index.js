// index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json({ limit: '20mb' }));

// Configuração do MySQL Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  multipleStatements: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Função de inicialização corrigida para não derrubar o servidor
async function initDatabase() {
  try {
    const sqlPath = path.join(process.cwd(), "init_db.sql"); // Usa process.cwd() para garantir a raiz
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, "utf8");
      console.log("🟢 Inicializando o banco de dados...");
      await pool.query(sql);
      console.log("✅ Banco de dados sincronizado.");
    }
  } catch (err) {
    console.error("❌ Alerta Banco:", err.message);
    // Não damos throw aqui para o servidor não crashar na Vercel
  }
}

// Inicia a sincronização em background
initDatabase();

// --- ROTAS ---

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => res.send('Karrega backend is running (DB Storage Mode)'));

// Register client
app.post('/api/register/client', async (req, res) => {
  try {
    const { nome, numero, numero_bi, password } = req.body;
    if (!nome || !numero || !numero_bi || !password) return res.status(400).json({ error: 'Dados obrigatórios faltando' });

    const hashed = await bcrypt.hash(password, 10);
    const [resInsert] = await pool.query(
      'INSERT INTO clientes (nome, numero, numero_bi, password) VALUES (?, ?, ?, ?)',
      [nome, numero, numero_bi, hashed]
    );
    return res.json({ ok: true, id: resInsert.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Número já registado' });
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Register driver
app.post('/api/register/driver', async (req, res) => {
  try {
    const { nome, numero, numero_bi, foto_bi_base64, password } = req.body;
    if (!nome || !numero || !numero_bi || !password) return res.status(400).json({ error: 'Dados obrigatórios faltando' });

    const hashed = await bcrypt.hash(password, 10);
    const [resInsert] = await pool.query(
      'INSERT INTO transportadores (nome, numero, numero_bi, foto_bi_path, password) VALUES (?, ?, ?, ?, ?)',
      [nome, numero, numero_bi, foto_bi_base64 || null, hashed]
    );
    return res.json({ ok: true, id: resInsert.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Número já registado' });
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Login client
app.post('/api/login/client', async (req, res) => {
  try {
    const { numero, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM clientes WHERE numero = ? LIMIT 1', [numero]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });

    const ok = await bcrypt.compare(password, rows[0].password);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

    const { password: _, ...safeUser } = rows[0];
    return res.json({ ok: true, user: safeUser });
  } catch (err) {
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Listar tabelas (Debug)
app.get("/tabelas", async (req, res) => {
  try {
    const [rows] = await pool.query("SHOW TABLES");
    const tabelas = rows.map(row => Object.values(row)[0]);
    res.json({ sucesso: true, total: tabelas.length, tabelas });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// Trips (Create, List, Get, Update) - Mantidas conforme sua lógica
app.post('/api/trips', async (req, res) => {
  try {
    const { cliente_id, transportador_id, tipo, scheduled_at, status } = req.body;
    const tripStatus = status || 'adiado';
    const [result] = await pool.query(
      'INSERT INTO viagens (cliente_id, transportador_id, status, tipo, scheduled_at) VALUES (?, ?, ?, ?, ?)',
      [cliente_id, transportador_id || null, tripStatus, tipo, scheduled_at || null]
    );
    return res.json({ ok: true, id: result.insertId });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.get('/api/trips', async (req, res) => {
  try {
    const { cliente_id, transportador_id } = req.query;
    let sql = `SELECT v.*, c.nome AS cliente_nome, t.nome AS transportador_nome FROM viagens v 
               LEFT JOIN clientes c ON v.cliente_id = c.id 
               LEFT JOIN transportadores t ON v.transportador_id = t.id`;
    const params = [];
    if (cliente_id) { sql += ' WHERE v.cliente_id = ?'; params.push(cliente_id); }
    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Listar todos os clientes
app.get('/cliente', async (req, res) => {
  try {
    // Selecionamos apenas os campos necessários, excluindo a senha
    const [rows] = await pool.query(
      'SELECT id, nome, numero, numero_bi, created_at FROM clientes ORDER BY nome ASC'
    );
    
    return res.json({
      sucesso: true,
      total: rows.length,
      clientes: rows
    });
  } catch (err) {
    console.error('Erro ao listar clientes:', err.message);
    return res.status(500).json({ error: 'Erro ao buscar clientes no servidor' });
  }
});

// Listar apenas viagens do tipo 'agendado'
app.get('/agendamento', async (req, res) => {
  try {
    const sql = `
      SELECT 
        v.id, 
        v.tipo, 
        v.status, 
        v.scheduled_at, 
        c.nome AS cliente_nome, 
        c.numero AS cliente_contato,
        t.nome AS transportador_nome 
      FROM viagens v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN transportadores t ON v.transportador_id = t.id
      WHERE v.tipo = 'agendado'
      ORDER BY v.scheduled_at ASC
    `;

    const [rows] = await pool.query(sql);

    return res.json({
      sucesso: true,
      total: rows.length,
      agendamentos: rows
    });
  } catch (err) {
    console.error('Erro ao listar agendamentos:', err.message);
    return res.status(500).json({ error: 'Erro ao buscar agendamentos no servidor' });
  }
});





















// --- FINALIZAÇÃO ---

// EXPORTAÇÃO OBRIGATÓRIA PARA VERCEL
export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 Servidor rodando em http://localhost:${PORT}`));
}
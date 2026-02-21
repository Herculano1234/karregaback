import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
// Aumentamos o limite pois strings Base64 de imagens são pesadas
app.use(express.json({ limit: '20mb' }));

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
// Health & Root
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
    console.error(err);
    // Tratamento de duplicate key na coluna `numero`
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Número já registado' });
    }
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Register transporter (Salvando imagem no DB)
app.post('/api/register/driver', async (req, res) => {
  try {
    const { nome, numero, numero_bi, foto_bi_base64, password } = req.body;
    if (!nome || !numero || !numero_bi || !password) return res.status(400).json({ error: 'Dados obrigatórios faltando' });

    const hashed = await bcrypt.hash(password, 10);

    // Salvamos a string Base64 diretamente no banco (foto) e o hash da password
    const [resInsert] = await pool.query(
      'INSERT INTO transportadores (nome, numero, numero_bi, foto_bi_path, password) VALUES (?, ?, ?, ?, ?)',
      [nome, numero, numero_bi, foto_bi_base64 || null, hashed]
    );

    return res.json({ ok: true, id: resInsert.insertId });
  } catch (err) {
    console.error(err);
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Número já registado' });
    }
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Login client - autenticação por `numero` + `password` (hash)
app.post('/api/login/client', async (req, res) => {
  try {
    const { numero, password } = req.body;
    if (!numero || !password) return res.status(400).json({ error: 'Dados obrigatórios faltando' });

    const [rows] = await pool.query('SELECT id, nome, numero, numero_bi, created_at, password FROM clientes WHERE numero = ? LIMIT 1', [numero]);
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

    const user = rows[0];
    const hash = user.password;
    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

    // Remover password do objeto retornado
    const safeUser = { id: user.id, nome: user.nome, numero: user.numero, numero_bi: user.numero_bi, created_at: user.created_at };
    return res.json({ ok: true, user: safeUser });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});
// Endpoint para listar todas as tabelas do banco de dados
app.get("/tabelas", async (req, res) => {
  try {
    const [rows] = await pool.query("SHOW TABLES");
    
    // Extrai o nome das tabelas (a chave depende do nome do banco)
    const tabelas = rows.map(row => Object.values(row)[0]);
    
    res.json({
      sucesso: true,
      total: tabelas.length,
      tabelas
    });
  } catch (err) {
    console.error("Erro ao listar tabelas:", err.message);
    res.status(500).json({
      sucesso: false,
      erro: "Erro ao listar tabelas do banco de dados."
    });
  }
});
// Exportação necessária para o Vercel
export default app;

// O Vercel gerencia o listen, mas mantemos para rodar local
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Rodando local na porta ${PORT}`));
}
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

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
  ssl: { rejectUnauthorized: false } // Geralmente necessário para bancos na nuvem
});

// Health & Root
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/', (req, res) => res.send('Karrega backend is running (DB Storage Mode)'));

// Register client
app.post('/api/register/client', async (req, res) => {
  try {
    const { nome, numero, numero_bi } = req.body;
    if (!nome || !numero || !numero_bi) return res.status(400).json({ error: 'Dados obrigatórios faltando' });

    const [resInsert] = await pool.query(
      'INSERT INTO clientes (nome, numero, numero_bi) VALUES (?, ?, ?)',
      [nome, numero, numero_bi]
    );
    return res.json({ ok: true, id: resInsert.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Register transporter (Salvando imagem no DB)
app.post('/api/register/driver', async (req, res) => {
  try {
    const { nome, numero, numero_bi, foto_bi_base64 } = req.body;
    if (!nome || !numero || !numero_bi) return res.status(400).json({ error: 'Dados obrigatórios faltando' });

    // Salvamos a string Base64 diretamente no banco
    const [resInsert] = await pool.query(
      'INSERT INTO transportadores (nome, numero, numero_bi, foto_bi_path) VALUES (?, ?, ?, ?)',
      [nome, numero, numero_bi, foto_bi_base64 || null]
    );

    return res.json({ ok: true, id: resInsert.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Exportação necessária para o Vercel
export default app;

// O Vercel gerencia o listen, mas mantemos para rodar local
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`Rodando local na porta ${PORT}`));
}
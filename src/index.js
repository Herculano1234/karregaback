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

// Ensure OPTIONS preflight requests are handled and CORS headers returned
app.options('*', cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

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

// Login driver
app.post('/api/login/driver', async (req, res) => {
  try {
    const { numero, password } = req.body;
    const [rows] = await pool.query('SELECT * FROM transportadores WHERE numero = ? LIMIT 1', [numero]);
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
    let { cliente_id, cliente_numero, transportador_id, tipo, scheduled_at, status, origin, destination, descricao_da_carga, tamanho_carga, tipo_de_transporte } = req.body;

    // Resolve cliente_id from numero if provided
    if (!cliente_id && cliente_numero) {
      const [crows] = await pool.query('SELECT id FROM clientes WHERE numero = ? LIMIT 1', [cliente_numero]);
      if (crows && crows.length > 0) cliente_id = crows[0].id;
    }

    if (!cliente_id) return res.status(400).json({ error: 'cliente_id ou cliente_numero é obrigatório' });

    // Ensure tipo is set; default to 'na hora' for quick requests
    tipo = tipo || 'na hora';
    const tripStatus = status || 'pendente';
    // Default to 'ligeiro' if not specified
    tipo_de_transporte = tipo_de_transporte || 'ligeiro';

    const [result] = await pool.query(
      'INSERT INTO viagens (cliente_id, transportador_id, status, tipo, scheduled_at, origin, destination, descricao_da_carga, tamanho_carga, tipo_de_transporte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [cliente_id, transportador_id || null, tripStatus, tipo, scheduled_at || null, origin || null, destination || null, descricao_da_carga || null, tamanho_carga || null, tipo_de_transporte]
    );
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.get('/api/trips', async (req, res) => {
  try {
    const { cliente_id, transportador_id } = req.query;
    let sql = `SELECT v.*, c.nome AS cliente_nome, c.numero AS cliente_numero, t.nome AS transportador_nome, t.numero AS transportador_numero FROM viagens v 
               LEFT JOIN clientes c ON v.cliente_id = c.id 
               LEFT JOIN transportadores t ON v.transportador_id = t.id`;
    const params = [];
    if (cliente_id) { sql += ' WHERE v.cliente_id = ?'; params.push(cliente_id); }
    const [rows] = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Get single trip with client and driver contact details
app.get('/api/trips/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query(
      `SELECT v.*, c.nome AS cliente_nome, c.numero AS cliente_numero, t.nome AS transportador_nome, t.numero AS transportador_numero
       FROM viagens v
       LEFT JOIN clientes c ON v.cliente_id = c.id
       LEFT JOIN transportadores t ON v.transportador_id = t.id
       WHERE v.id = ? LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    return res.json(rows[0]);
  } catch (err) { console.error('Erro get trip:', err); return res.status(500).json({ error: 'Erro no servidor' }); }
});

// Driver accepts a pending 'na hora' request
app.post('/api/trips/:id/accept', async (req, res) => {
  try {
    const tripId = req.params.id;
    const { transportador_id } = req.body;
    if (!transportador_id) return res.status(400).json({ error: 'transportador_id é obrigatório' });

    // Only accept if currently pending and unassigned
    const [result] = await pool.query(
      "UPDATE viagens SET transportador_id = ?, status = 'aceito' WHERE id = ? AND status = 'pendente'",
      [transportador_id, tripId]
    );
    if (result.affectedRows === 0) return res.status(400).json({ error: 'Viagem não está pendente ou já foi atribuída' });
    // return updated trip
    const [rows] = await pool.query('SELECT id, status, transportador_id FROM viagens WHERE id = ? LIMIT 1', [tripId]);
    return res.json({ sucesso: true, trip: rows[0] });
  } catch (err) { console.error('Erro accept trip:', err); return res.status(500).json({ error: 'Erro no servidor' }); }
});

// Driver cancels (rescind) an accepted assignment or client cancels
app.post('/api/trips/:id/cancel', async (req, res) => {
  try {
    const tripId = req.params.id;
    const { by } = req.body; // optional reason/source
    const [result] = await pool.query("UPDATE viagens SET status = 'cancelado' WHERE id = ? AND status <> 'feito'", [tripId]);
    if (result.affectedRows === 0) return res.status(400).json({ error: 'Não foi possível cancelar a viagem' });
    return res.json({ sucesso: true });
  } catch (err) { console.error('Erro cancelar viagem:', err); return res.status(500).json({ error: 'Erro no servidor' }); }
});

// Start the trip: set started_at and move to 'em_transito'
app.post('/api/trips/:id/start', async (req, res) => {
  try {
    const tripId = req.params.id;
    // Optionally validate transportador_id matches (to prevent others starting)
    const { transportador_id } = req.body;

    // Check current status
    const [vrows] = await pool.query('SELECT status, transportador_id FROM viagens WHERE id = ? LIMIT 1', [tripId]);
    if (!vrows || vrows.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });
    const viagem = vrows[0];
    if (viagem.status !== 'aceito') return res.status(400).json({ error: 'Viagem deve estar em estado aceito para iniciar' });
    if (transportador_id && viagem.transportador_id !== parseInt(transportador_id, 10)) return res.status(403).json({ error: 'Transportador não autorizado a iniciar esta viagem' });

    const now = new Date();
    try {
      await pool.query("UPDATE viagens SET status = 'em_transito', started_at = ? WHERE id = ?", [now, tripId]);
    } catch (sqlErr) {
      console.error('Erro ao atualizar status started_at:', sqlErr);
      // If enum value 'em_transito' is not allowed in the current DB schema, try to at least set started_at
      try {
        await pool.query("UPDATE viagens SET started_at = ? WHERE id = ?", [now, tripId]);
        // proceed and return partial success
        const [rows] = await pool.query('SELECT * FROM viagens WHERE id = ? LIMIT 1', [tripId]);
        return res.json({ sucesso: true, partial: true, message: 'started_at gravado, mas não foi possível alterar status (ver logs)', started_at: now, trip: rows[0] });
      } catch (e2) {
        console.error('Erro ao gravar started_at fallback:', e2);
        return res.status(500).json({ error: 'Erro ao iniciar viagem', details: e2.message || e2 });
      }
    }

    // Return updated trip so clients can refresh immediately
    const [updated] = await pool.query(
      `SELECT v.*, c.nome AS cliente_nome, c.numero AS cliente_numero, t.nome AS transportador_nome, t.numero AS transportador_numero
       FROM viagens v
       LEFT JOIN clientes c ON v.cliente_id = c.id
       LEFT JOIN transportadores t ON v.transportador_id = t.id
       WHERE v.id = ? LIMIT 1`,
      [tripId]
    );
    return res.json({ sucesso: true, started_at: now, trip: updated[0] });
  } catch (err) { console.error('Erro iniciar viagem:', err); return res.status(500).json({ error: 'Erro no servidor' }); }
});

// Requests endpoint: list realtime 'na hora' pending requests (for drivers), filtered by vehicle type
app.get('/api/requests', async (req, res) => {
  try {
    const { tipo_de_transporte } = req.query;
    let sql = `SELECT v.id, v.tipo, v.status, v.origin, v.destination, v.tamanho_carga, v.descricao_da_carga, v.tipo_de_transporte, v.created_at, 
               c.id AS cliente_id, c.nome AS cliente_nome, c.numero AS cliente_numero
               FROM viagens v
               LEFT JOIN clientes c ON v.cliente_id = c.id
               WHERE v.tipo = 'na hora' AND v.status = 'pendente'`;
    const params = [];
    
    // Filter by vehicle type if provided
    if (tipo_de_transporte) {
      sql += ' AND v.tipo_de_transporte = ?';
      params.push(tipo_de_transporte);
    }
    
    const [rows] = await pool.query(sql, params);
    return res.json({ sucesso: true, total: rows.length, requests: rows });
  } catch (err) {
    console.error('Erro listar requests:', err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Agendamentos - endpoint dedicado
app.post('/api/agendamentos', async (req, res) => {
  try {
    let { cliente_id, cliente_numero, transportador_id, scheduled_at, origin, destination } = req.body;

    // resolve cliente_id from numero if needed
    if (!cliente_id && cliente_numero) {
      const [crows] = await pool.query('SELECT id FROM clientes WHERE numero = ? LIMIT 1', [cliente_numero]);
      if (!crows || crows.length === 0) return res.status(400).json({ error: 'Cliente não encontrado para o número informado' });
      cliente_id = crows[0].id;
    }

    if (!cliente_id) return res.status(400).json({ error: 'cliente_id ou cliente_numero obrigatório' });

    // scheduled_at is required and must be a valid future datetime
    if (!scheduled_at) return res.status(400).json({ error: 'scheduled_at é obrigatório para agendamentos' });
    const dt = new Date(scheduled_at);
    if (isNaN(dt.getTime())) return res.status(400).json({ error: 'scheduled_at inválido (formato esperado: ISO 8601)' });
    const now = new Date();
    if (dt.getTime() <= now.getTime()) return res.status(400).json({ error: 'scheduled_at deve ser uma data/hora futura' });

    // tipo fixo 'agendado'
    const tipo = 'agendado';
    const status = 'adiado';

    // accept optional cargo fields (vehicle type comes from transportador.tipo_transporte)
    const { descricao_da_carga, tamanho_carga } = req.body;
    const scheduledSql = dt.toISOString().slice(0, 19).replace('T', ' ');
    const [result] = await pool.query(
      'INSERT INTO viagens (cliente_id, transportador_id, status, tipo, scheduled_at, origin, destination, descricao_da_carga, tamanho_carga) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [cliente_id, transportador_id || null, status, tipo, scheduledSql, origin || null, destination || null, descricao_da_carga || null, tamanho_carga || null]
    );

    // Optionally store origin/destination in a lightweight table or log - for now we return them back
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error('Erro agendamentos:', err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.get('/api/agendamentos', async (req, res) => {
  try {
    // list only tipo = 'agendado'
    const [rows] = await pool.query(`SELECT v.*, c.nome AS cliente_nome, t.nome AS transportador_nome FROM viagens v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN transportadores t ON v.transportador_id = t.id
      WHERE v.tipo = 'agendado' ORDER BY v.scheduled_at ASC`);
    return res.json({ sucesso: true, total: rows.length, agendamentos: rows });
  } catch (err) {
    console.error('Erro listar agendamentos:', err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Estatísticas agregadas (opcionalmente por transportador)
app.get('/api/stats', async (req, res) => {
  try {
    const { transportador_id } = req.query;
    let where = '';
    const params = [];
    if (transportador_id) {
      where = ' WHERE transportador_id = ?';
      params.push(transportador_id);
    }

    const [totalRows] = await pool.query(`SELECT COUNT(*) AS total FROM viagens${where}`, params);
    // build conditional queries for week and pending safely
    let weekSql = 'SELECT COUNT(*) AS weekCount FROM viagens WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
    let pendingSql = "SELECT COUNT(*) AS pending FROM viagens WHERE status <> 'feito'";
    const qParams = [];
    if (transportador_id) {
      weekSql = `SELECT COUNT(*) AS weekCount FROM viagens WHERE transportador_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
      pendingSql = `SELECT COUNT(*) AS pending FROM viagens WHERE transportador_id = ? AND status <> 'feito'`;
      qParams.push(transportador_id);
    }
    const [weekRows] = await pool.query(weekSql, qParams);
    const [pendingRows] = await pool.query(pendingSql, qParams);

    const total = totalRows[0]?.total || 0;
    const weekCount = weekRows[0]?.weekCount || 0;
    const pending = pendingRows[0]?.pending || 0;

    return res.json({ sucesso: true, total, weekCount, pending });
  } catch (err) {
    console.error('Erro ao calcular estatísticas:', err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Incomes: criar e listar registros financeiros pós-viagem
app.post('/api/incomes', async (req, res) => {
  try {
    const { viagem_id, taxa, valor_pago_cliente, valor_transportador, valor_app } = req.body;
    if (!viagem_id) return res.status(400).json({ error: 'viagem_id é obrigatório' });

    // Verifica se a viagem existe
    const [vrows] = await pool.query('SELECT id FROM viagens WHERE id = ? LIMIT 1', [viagem_id]);
    if (!vrows || vrows.length === 0) return res.status(404).json({ error: 'Viagem não encontrada' });

    const [result] = await pool.query(
      'INSERT INTO incomes (viagem_id, taxa, valor_pago_cliente, valor_transportador, valor_app) VALUES (?, ?, ?, ?, ?)',
      [viagem_id, taxa || null, valor_pago_cliente || 0.0, valor_transportador || 0.0, valor_app || 0.0]
    );
    return res.status(201).json({ sucesso: true, id: result.insertId });
  } catch (err) {
    console.error('Erro criar income:', err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

app.get('/api/incomes', async (req, res) => {
  try {
    const { viagem_id } = req.query;
    let sql = 'SELECT i.*, v.tipo, v.status, v.cliente_id, v.transportador_id FROM incomes i LEFT JOIN viagens v ON i.viagem_id = v.id';
    const params = [];
    if (viagem_id) { sql += ' WHERE i.viagem_id = ?'; params.push(viagem_id); }
    const [rows] = await pool.query(sql, params);
    return res.json({ sucesso: true, total: rows.length, incomes: rows });
  } catch (err) {
    console.error('Erro listar incomes:', err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Estatísticas financeiras agregadas a partir da tabela incomes
app.get('/api/incomes/stats', async (req, res) => {
  try {
    const { transportador_id } = req.query;
    let sql = `SELECT 
      COUNT(*) AS count, 
      COALESCE(SUM(i.valor_pago_cliente),0) AS total_paid, 
      COALESCE(SUM(i.valor_transportador),0) AS total_transportador, 
      COALESCE(SUM(i.valor_app),0) AS total_app
      FROM incomes i
      LEFT JOIN viagens v ON i.viagem_id = v.id`;
    const params = [];
    if (transportador_id) {
      sql += ' WHERE v.transportador_id = ?';
      params.push(transportador_id);
    }
    const [rows] = await pool.query(sql, params);
    const r = rows[0] || { count: 0, total_paid: 0, total_transportador: 0, total_app: 0 };
    return res.json({ sucesso: true, count: r.count, total_paid: r.total_paid, total_transportador: r.total_transportador, total_app: r.total_app });
  } catch (err) {
    console.error('Erro incomes stats:', err);
    return res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Finalizar viagem: marca como 'feito', registra ended_at e cria automaticamente um income
app.post('/api/trips/:id/finish', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const viagemId = req.params.id;
    const { valor_pago_cliente, taxa } = req.body;

    // load viagem
    await conn.beginTransaction();
    const [vrows] = await conn.query('SELECT * FROM viagens WHERE id = ? FOR UPDATE', [viagemId]);
    if (!vrows || vrows.length === 0) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ error: 'Viagem não encontrada' });
    }
    const viagem = vrows[0];

    // compute financial split
    // Prefer explicit valor_pago_cliente from request; otherwise try fields on viagem
    let paid = parseFloat(valor_pago_cliente || viagem.valor || 0) || 0.0;
    // APP_PERCENTAGE env var (ex: 0.20 for 20%)
    const appPct = process.env.APP_PERCENTAGE ? parseFloat(process.env.APP_PERCENTAGE) : 0.20;
    const valor_app = Math.round((paid * appPct) * 100) / 100; // 2 decimals
    const valor_transportador = Math.round((paid - valor_app) * 100) / 100;

    // update viagem status and ended_at
    await conn.query('UPDATE viagens SET status = ?, ended_at = ? WHERE id = ?', ['feito', new Date(), viagemId]);

    // insert into incomes
    const [ins] = await conn.query(
      'INSERT INTO incomes (viagem_id, taxa, valor_pago_cliente, valor_transportador, valor_app) VALUES (?, ?, ?, ?, ?)',
      [viagemId, taxa || null, paid, valor_transportador, valor_app]
    );

    await conn.commit();
    conn.release();
    return res.json({ sucesso: true, income_id: ins.insertId, valor_pago_cliente: paid, valor_transportador, valor_app });
  } catch (err) {
    try { await conn.rollback(); } catch (e) {}
    conn.release();
    console.error('Erro finalizar viagem:', err);
    return res.status(500).json({ error: 'Erro ao finalizar viagem' });
  }
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

// src/admin.js — rotas do painel administrativo
import { Router } from "express";
import crypto from "crypto";

export default function adminRoutes(pool) {
  const r = Router();
  const secret = process.env.ADMIN_SECRET || "troque-este-segredo";
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const mac = (s) => crypto.createHmac("sha256", secret).update(s).digest("base64url");

  // Colunas novas (ignora erro se já existirem)
  (async () => {
    for (const q of [
      "ALTER TABLE clientes ADD COLUMN estado VARCHAR(20) DEFAULT 'ativo'",
      "ALTER TABLE transportadores ADD COLUMN estado VARCHAR(20) DEFAULT 'ativo'",
      "ALTER TABLE transportadores ADD COLUMN verificado VARCHAR(20) DEFAULT 'pendente'",
    ]) { try { await pool.query(q); } catch (_) {} }
  })();

  // Login (credenciais em ADMIN_EMAIL / ADMIN_PASSWORD no .env da Vercel)
  r.post("/login", (req, res) => {
    const { email, password } = req.body;
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: "Credenciais inválidas" });
    const body = b64({ email, exp: Date.now() + 12 * 3600e3 });
    res.json({ ok: true, token: body + "." + mac(body) });
  });

  // Autenticação das restantes rotas
  r.use((req, res, next) => {
    try {
      const [body, sig] = (req.headers.authorization || "").replace("Bearer ", "").split(".");
      if (!body || sig !== mac(body) || JSON.parse(Buffer.from(body, "base64url")).exp < Date.now()) throw 0;
      next();
    } catch { res.status(401).json({ error: "Não autorizado" }); }
  });

  const q = async (sql, p = []) => (await pool.query(sql, p))[0];

  r.get("/stats", async (_, res) => {
    try {
      const [c] = await q("SELECT COUNT(*) n FROM clientes");
      const [t] = await q("SELECT COUNT(*) n FROM transportadores");
      const status = await q("SELECT status, COUNT(*) n FROM viagens GROUP BY status");
      const [rev] = await q("SELECT COALESCE(SUM(valor_pago_cliente),0) total, COALESCE(SUM(valor_app),0) app FROM incomes");
      const rotas = await q("SELECT origin, destination, COUNT(*) n FROM viagens WHERE origin IS NOT NULL GROUP BY origin, destination ORDER BY n DESC LIMIT 5");
      const diario = await q("SELECT DATE(created_at) d, COUNT(*) n FROM viagens WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY d ORDER BY d");
      res.json({ clientes: c.n, cargueiros: t.n, status, receita: rev, rotas, diario });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.get("/clientes", async (_, res) => {
    try {
      res.json(await q(`SELECT c.id, c.nome, c.numero, c.created_at, COALESCE(c.estado,'ativo') estado,
        COUNT(v.id) pedidos, MAX(v.created_at) ultimo_pedido
        FROM clientes c LEFT JOIN viagens v ON v.cliente_id=c.id GROUP BY c.id ORDER BY c.nome`));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.get("/cargueiros", async (_, res) => {
    try {
      res.json(await q(`SELECT t.id, t.nome, t.numero, t.numero_bi, t.tipo_transporte, t.created_at,
        COALESCE(t.estado,'ativo') estado, COALESCE(t.verificado,'pendente') verificado,
        COUNT(v.id) pedidos, SUM(v.status='feito') concluidos, SUM(v.status='cancelado') cancelados
        FROM transportadores t LEFT JOIN viagens v ON v.transportador_id=t.id GROUP BY t.id ORDER BY t.nome`));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  const ESTADOS = ["ativo", "suspenso", "banido"];
  const tabela = { clientes: "clientes", cargueiros: "transportadores" };

  r.post("/:tipo(clientes|cargueiros)/:id/estado", async (req, res) => {
    const { estado } = req.body;
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: "Estado inválido" });
    await q(`UPDATE ${tabela[req.params.tipo]} SET estado=? WHERE id=?`, [estado, req.params.id]);
    res.json({ ok: true });
  });

  r.delete("/:tipo(clientes|cargueiros)/:id", async (req, res) => {
    try { await q(`DELETE FROM ${tabela[req.params.tipo]} WHERE id=?`, [req.params.id]); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.post("/cargueiros/:id/verificar", async (req, res) => {
    const v = req.body.aprovar ? "verificado" : "rejeitado";
    await q("UPDATE transportadores SET verificado=? WHERE id=?", [v, req.params.id]);
    res.json({ ok: true });
  });

  r.get("/pedidos", async (_, res) => {
    try {
      res.json(await q(`SELECT v.id, v.status, v.tipo, v.origin, v.destination, v.valor, v.created_at,
        c.nome cliente, t.nome cargueiro FROM viagens v
        LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN transportadores t ON t.id=v.transportador_id
        ORDER BY v.created_at DESC LIMIT 500`));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.get("/financeiro", async (_, res) => {
    try {
      res.json(await q(`SELECT i.id, i.viagem_id, i.valor_pago_cliente, i.valor_app, i.valor_transportador, i.created_at,
        c.nome cliente, t.nome cargueiro FROM incomes i
        LEFT JOIN viagens v ON v.id=i.viagem_id LEFT JOIN clientes c ON c.id=v.cliente_id
        LEFT JOIN transportadores t ON t.id=v.transportador_id ORDER BY i.created_at DESC LIMIT 500`));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return r;
}

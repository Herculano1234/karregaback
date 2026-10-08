// src/admin.js — rotas do painel administrativo
import { Router } from "express";
import crypto from "crypto";
import { enviarWhatsApp, mensagem } from "./whatsapp.js";

export default function adminRoutes(pool) {
  const r = Router();
  const secret = process.env.ADMIN_SECRET || "troque-este-segredo";
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const mac = (s) => crypto.createHmac("sha256", secret).update(s).digest("base64url");
  const q = async (sql, p = []) => (await pool.query(sql, p))[0];

  (async () => {
    for (const s of [
      "ALTER TABLE clientes ADD COLUMN estado VARCHAR(20) DEFAULT 'ativo'",
      "ALTER TABLE transportadores ADD COLUMN estado VARCHAR(20) DEFAULT 'ativo'",
      "ALTER TABLE transportadores ADD COLUMN verificado VARCHAR(20) DEFAULT 'pendente'",
    ]) { try { await pool.query(s); } catch (_) {} }
  })();

  r.post("/login", (req, res) => {
    const { email, password } = req.body;
    if (!process.env.ADMIN_EMAIL || email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ error: "Credenciais inválidas" });
    const body = b64({ email, exp: Date.now() + 12 * 3600e3 });
    res.json({ ok: true, token: body + "." + mac(body) });
  });

  r.use((req, res, next) => {
    try {
      const [body, sig] = (req.headers.authorization || "").replace("Bearer ", "").split(".");
      if (!body || sig !== mac(body) || JSON.parse(Buffer.from(body, "base64url")).exp < Date.now()) throw 0;
      next();
    } catch { res.status(401).json({ error: "Não autorizado" }); }
  });

  r.get("/stats", async (_, res) => {
    try {
      const [c] = await q("SELECT COUNT(*) n FROM clientes");
      const [t] = await q("SELECT COUNT(*) n FROM transportadores");
      const status = await q("SELECT status, COUNT(*) n FROM viagens GROUP BY status");
      const [rev] = await q("SELECT COALESCE(SUM(valor_pago_cliente),0) total, COALESCE(SUM(valor_app),0) app FROM incomes");
      const rotas = await q("SELECT origin, destination, COUNT(*) n FROM viagens WHERE origin IS NOT NULL GROUP BY origin, destination ORDER BY n DESC LIMIT 5");
      res.json({ clientes: c.n, cargueiros: t.n, status, receita: rev, rotas });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Série temporal: g = dia | semana | mes | ano
  const GRUPOS = {
    dia: ["DATE_FORMAT(created_at,'%Y-%m-%d')", "30 DAY"],
    semana: ["DATE_FORMAT(DATE_SUB(created_at, INTERVAL WEEKDAY(created_at) DAY),'%Y-%m-%d')", "84 DAY"],
    mes: ["DATE_FORMAT(created_at,'%Y-%m')", "12 MONTH"],
    ano: ["DATE_FORMAT(created_at,'%Y')", "5 YEAR"],
  };
  r.get("/series", async (req, res) => {
    try {
      const [k, intv] = GRUPOS[req.query.g] || GRUPOS.dia;
      const a = await q(`SELECT ${k} k, COUNT(*) pedidos, COUNT(DISTINCT cliente_id) demanda FROM viagens
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${intv}) GROUP BY k ORDER BY k`);
      const b = await q(`SELECT ${k} k, SUM(valor_pago_cliente) movimentado, SUM(valor_app) receita FROM incomes
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${intv}) GROUP BY k ORDER BY k`);
      const map = {};
      a.forEach((x) => (map[x.k] = { k: x.k, pedidos: x.pedidos, demanda: x.demanda, movimentado: 0, receita: 0 }));
      b.forEach((x) => { map[x.k] = { k: x.k, pedidos: 0, demanda: 0, ...map[x.k], movimentado: Number(x.movimentado), receita: Number(x.receita) }; });
      res.json(Object.values(map).sort((x, y) => x.k.localeCompare(y.k)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.get("/clientes", async (_, res) => {
    try {
      res.json(await q(`SELECT c.id, c.nome, c.numero, c.created_at, COALESCE(c.estado,'ativo') estado,
        COUNT(v.id) pedidos, MAX(v.created_at) ultimo_pedido
        FROM clientes c LEFT JOIN viagens v ON v.cliente_id=c.id GROUP BY c.id ORDER BY c.nome`));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.get("/clientes/:id", async (req, res) => {
    try {
      const [c] = await q("SELECT id, nome, numero, numero_bi, created_at, COALESCE(estado,'ativo') estado FROM clientes WHERE id=?", [req.params.id]);
      if (!c) return res.status(404).json({ error: "Cliente não encontrado" });
      const pedidos = await q(`SELECT v.id, v.status, v.origin, v.destination, v.valor, v.created_at
        FROM viagens v WHERE v.cliente_id=? ORDER BY v.created_at DESC`, [c.id]);
      const [s] = await q("SELECT COALESCE(SUM(i.valor_pago_cliente),0) mov FROM incomes i JOIN viagens v ON v.id=i.viagem_id WHERE v.cliente_id=?", [c.id]);
      res.json({ ...c, pedidos, movimentado: Number(s.mov) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.get("/cargueiros", async (_, res) => {
    try {
      res.json(await q(`SELECT t.id, t.nome, t.numero, t.tipo_transporte, t.created_at,
        COALESCE(t.estado,'ativo') estado, COALESCE(t.verificado,'pendente') verificado,
        COUNT(v.id) pedidos, SUM(v.status='feito') concluidos, SUM(v.status='cancelado') cancelados
        FROM transportadores t LEFT JOIN viagens v ON v.transportador_id=t.id GROUP BY t.id ORDER BY t.nome`));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.get("/cargueiros/:id", async (req, res) => {
    try {
      const [t] = await q(`SELECT id, nome, numero, numero_bi, tipo_transporte, foto_bi_path, created_at,
        COALESCE(estado,'ativo') estado, COALESCE(verificado,'pendente') verificado FROM transportadores WHERE id=?`, [req.params.id]);
      if (!t) return res.status(404).json({ error: "Cargueiro não encontrado" });
      const pedidos = await q(`SELECT v.id, v.status, v.origin, v.destination, v.valor, v.created_at
        FROM viagens v WHERE v.transportador_id=? ORDER BY v.created_at DESC`, [t.id]);
      const [s] = await q("SELECT COALESCE(SUM(i.valor_transportador),0) rend FROM incomes i JOIN viagens v ON v.id=i.viagem_id WHERE v.transportador_id=?", [t.id]);
      res.json({ ...t, pedidos, rendimento: Number(s.rend) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  const ESTADOS = ["ativo", "suspenso", "banido"];
  const tabela = { clientes: "clientes", cargueiros: "transportadores" };
  const notificar = (row, ev) => row && enviarWhatsApp(row.numero, mensagem(ev, row.nome));

  r.post("/:tipo(clientes|cargueiros)/:id/estado", async (req, res) => {
    const { estado } = req.body;
    if (!ESTADOS.includes(estado)) return res.status(400).json({ error: "Estado inválido" });
    const T = tabela[req.params.tipo];
    const [row] = await q(`SELECT nome, numero FROM ${T} WHERE id=?`, [req.params.id]);
    await q(`UPDATE ${T} SET estado=? WHERE id=?`, [estado, req.params.id]);
    await notificar(row, estado);
    res.json({ ok: true });
  });

  r.delete("/:tipo(clientes|cargueiros)/:id", async (req, res) => {
    try {
      const T = tabela[req.params.tipo];
      const [row] = await q(`SELECT nome, numero FROM ${T} WHERE id=?`, [req.params.id]);
      await q(`DELETE FROM ${T} WHERE id=?`, [req.params.id]);
      await notificar(row, "eliminado");
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  r.post("/cargueiros/:id/verificar", async (req, res) => {
    const [row] = await q("SELECT nome, numero FROM transportadores WHERE id=?", [req.params.id]);
    await q("UPDATE transportadores SET verificado=? WHERE id=?", [req.body.aprovar ? "verificado" : "rejeitado", req.params.id]);
    await notificar(row, req.body.aprovar ? "aprovado" : "rejeitado");
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

  r.get("/pedidos/:id", async (req, res) => {
    try {
      const [p] = await q(`SELECT v.*, c.nome cliente, c.numero cliente_numero, t.nome cargueiro, t.numero cargueiro_numero,
        t.tipo_transporte, i.valor_pago_cliente, i.valor_app, i.valor_transportador
        FROM viagens v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN transportadores t ON t.id=v.transportador_id
        LEFT JOIN incomes i ON i.viagem_id=v.id WHERE v.id=? LIMIT 1`, [req.params.id]);
      if (!p) return res.status(404).json({ error: "Pedido não encontrado" });
      res.json(p);
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

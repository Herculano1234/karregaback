import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool();

// Obter o diretório atual do arquivo
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Função para executar o script SQL de inicialização
async function initializeDatabase(pool) {
  const initScript = fs.readFileSync(path.join(__dirname, "../init_db.sql"), "utf-8");
  try {
    await pool.query(initScript);
    console.log("Banco de dados inicializado com sucesso.");
  } catch (err) {
    console.error("Erro ao inicializar o banco de dados:", err);
  }
}

// Executar a inicialização do banco de dados
initializeDatabase(pool);
// Listar hospitais
app.get("/hospitais", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM hospitais ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar hospitais" });
  }
});
// Listar consultas de um paciente específico
app.get("/pacientes/:id/consultas", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, paciente_id, profissional_id, data_hora, status, prioridade, local, created_at
       FROM consultas WHERE paciente_id = $1 ORDER BY data_hora DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Erro ao buscar consultas do paciente:", err);
    res.status(500).json({ error: "Erro ao buscar consultas do paciente", detalhes: err.message });
  }
});

// Cadastrar consulta para um paciente específico
app.post("/pacientes/:id/consultas", async (req, res) => {
  const { id } = req.params;
  const {
    data_hora,
    status = 'agendada',
    prioridade = null,
    local = null
  } = req.body;
  if (!data_hora) return res.status(400).json({ error: "Campo data_hora é obrigatório" });
  try {
    // profissional_id começa como null ("A ser definido" será tratado na aplicação)
    const result = await pool.query(
      `INSERT INTO consultas (paciente_id, profissional_id, data_hora, status, prioridade, local)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, null, data_hora, status, prioridade, local]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao agendar consulta:", err);
    res.status(500).json({ error: "Erro ao agendar consulta", detalhes: err.message });
  }
});
app.get("/", (req, res) => {
  res.send("API Moyo rodando!");
});

// Listar pacientes
app.get("/pacientes", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, nome, email, data_nascimento, sexo, telefone, endereco, bi, foto_perfil FROM pacientes");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar pacientes" });
  }
});
// Listar pacientes
app.get("/pacientesf", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, nome, email, data_nascimento, sexo, telefone, endereco, bi FROM pacientes");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar pacientes" });
  }
});

// Atualizar dados do paciente
app.put("/pacientes/:id", async (req, res) => {
  const { id } = req.params;
  const { email, telefone, endereco, foto_perfil } = req.body;
  try {
    // Atualiza apenas os campos permitidos
    const result = await pool.query(
      `UPDATE pacientes SET email = $1, telefone = $2, endereco = $3, foto_perfil = $4 WHERE id = $5 RETURNING id, nome, email, telefone, endereco, foto_perfil`,
      [email, telefone, endereco, foto_perfil, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Paciente não encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar paciente" });
  }
});
// Cadastro de paciente
app.post("/pacientes", async (req, res) => {
  const { nome, email, senha, data_nascimento, sexo, telefone, endereco, bi, foto_perfil } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: "Campos obrigatórios" });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      `INSERT INTO pacientes (nome, email, senha_hash, data_nascimento, sexo, telefone, endereco, bi, foto_perfil) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, nome, email, foto_perfil`,
      [nome, email, hash, data_nascimento, sexo, telefone, endereco, bi, foto_perfil]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao cadastrar paciente ; {err}" + err });
  }
});

// Login de paciente
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: "Campos obrigatórios" });
  try {
    const result = await pool.query("SELECT * FROM pacientes WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Usuário não encontrado" });
    const paciente = result.rows[0];
    const match = await bcrypt.compare(senha, paciente.senha_hash);
    if (!match) return res.status(401).json({ error: "Senha incorreta" });
    res.json({ id: paciente.id, nome: paciente.nome, email: paciente.email, foto_perfil: paciente.foto_perfil });
  } catch (err) {
    res.status(500).json({ error: "Erro ao autenticar" });
  }
});

// Listar consultas
app.get("/consultas", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM consultas");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar consultas" });
  }
});
// Listar profissionais
app.get("/profissionais", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT nome, data_nascimento, bi, sexo, morada, email, telefone, unidade, municipio, especialidade, cargo, registro_profissional FROM profissionais");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar profissionais" });
  }
});

// Agendar consulta
app.post("/consultas", async (req, res) => {
  const { paciente_id, data_consulta, descricao } = req.body;
  if (!paciente_id || !data_consulta) return res.status(400).json({ error: "Campos obrigatórios" });
  try {
    const result = await pool.query(
      `INSERT INTO consultas (paciente_id, data_consulta, descricao) VALUES ($1, $2, $3) RETURNING *`,
      [paciente_id, data_consulta, descricao]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao agendar consulta" });
  }
});

// Listar exames
app.get("/exames", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM exames");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar exames" });
  }
});

// Solicitar exame
app.post("/exames", async (req, res) => {
  const { paciente_id, tipo, data } = req.body;
  if (!paciente_id || !tipo || !data) return res.status(400).json({ error: "Campos obrigatórios" });
  try {
    const result = await pool.query(
      `INSERT INTO exames (paciente_id, tipo, data) VALUES ($1,$2,$3) RETURNING *`,
      [paciente_id, tipo, data]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Erro ao solicitar exame" });
  }
});

// Cadastro de profissional
app.post("/profissionais", async (req, res) => {
  const {
    nome,
    data_nascimento,
    bi,
    sexo,
    morada,
    email,
    telefone,
    unidade,
    municipio,
    especialidade,
    cargo,
    registro_profissional,
    senha,
    foto_perfil
  } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: "Campos obrigatórios" });
  try {
    const hash = await bcrypt.hash(senha, 10);
    const result = await pool.query(
      `INSERT INTO profissionais (
        nome, data_nascimento, bi, sexo, morada, email, telefone, unidade, municipio, especialidade, cargo, registro_profissional, foto_perfil, senha_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
      ) RETURNING id, nome, email, especialidade, foto_perfil`,
      [
        nome,
        data_nascimento,
        bi,
        sexo,
        morada,
        email,
        telefone,
        unidade,
        municipio,
        especialidade,
        cargo,
        registro_profissional,
        foto_perfil,
        hash
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao cadastrar profissional:", err);
    res.status(500).json({ error: "Erro ao cadastrar profissional", detalhes: err.message });
  }
});
// Cadastrar hospital ou clínica

// Cadastrar hospital ou clínica
app.post("/hospitais", async (req, res) => {
  let {
    nome,
    endereco,
    cidade,
    provincia,
    latitude,
    longitude,
    areas_trabalho,
    exames_disponiveis,
    telefone,
    email,
    site,
    tipo_unidade,
    categoria,
    nivel,
    data_fundacao,
    redes_sociais,
    diretor,
    cargo_diretor,
    nif,
    horario,
    capacidade = 0,
    num_medicos,
    num_enfermeiros,
    capacidade_internamento,
    urgencia,
    salas_cirurgia,
    especialidades,
    laboratorio,
    farmacia,
    banco_sangue,
    servicos_imagem,
    ambulancia,
    seguradoras,
    acessibilidade,
    estacionamento,
    status = 'ativo'
  } = req.body;

  // Converter arrays para string, se necessário
  if (Array.isArray(especialidades)) {
    especialidades = especialidades.join(',');
  }
  if (Array.isArray(exames_disponiveis)) {
    exames_disponiveis = exames_disponiveis.join(',');
  }
  // Garantir que todos os campos estejam definidos
  const safe = v => v === undefined ? '' : v;
  const values = [
    safe(nome), safe(endereco), safe(cidade), safe(provincia), safe(latitude), safe(longitude), safe(areas_trabalho), safe(exames_disponiveis), safe(telefone), safe(email), safe(site), safe(tipo_unidade), safe(categoria), safe(nivel), safe(data_fundacao), safe(redes_sociais), safe(diretor), safe(cargo_diretor), safe(nif), safe(horario), safe(capacidade), safe(num_medicos), safe(num_enfermeiros), safe(capacidade_internamento), safe(urgencia), safe(salas_cirurgia), safe(especialidades), safe(laboratorio), safe(farmacia), safe(banco_sangue), safe(servicos_imagem), safe(ambulancia), safe(seguradoras), safe(acessibilidade), safe(estacionamento), safe(status)
  ];
  if (!nome) return res.status(400).json({ error: "Campo nome é obrigatório" });
  try {
    const result = await pool.query(
      `INSERT INTO hospitais (nome, endereco, cidade, provincia, latitude, longitude, areas_trabalho, exames_disponiveis, telefone, email, site, tipo_unidade, categoria, nivel, data_fundacao, redes_sociais, diretor, cargo_diretor, nif, horario, capacidade, num_medicos, num_enfermeiros, capacidade_internamento, urgencia, salas_cirurgia, especialidades, laboratorio, farmacia, banco_sangue, servicos_imagem, ambulancia, seguradoras, acessibilidade, estacionamento, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36)
      RETURNING *`,
      values
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao cadastrar hospital:", err);
    res.status(500).json({ error: "Erro ao cadastrar hospital", detalhes: err.message });
  }
});

// Editar hospital ou clínica
app.put("/hospitais/:id", async (req, res) => {
  const { id } = req.params;
  let {
    nome,
    endereco,
    cidade,
    provincia,
    latitude,
    longitude,
    areas_trabalho,
    exames_disponiveis,
    telefone,
    email,
    site,
    tipo_unidade,
    categoria,
    nivel,
    data_fundacao,
    redes_sociais,
    diretor,
    cargo_diretor,
    nif,
    horario,
    capacidade = 0,
    num_medicos,
    num_enfermeiros,
    capacidade_internamento,
    urgencia,
    salas_cirurgia,
    especialidades,
    laboratorio,
    farmacia,
    banco_sangue,
    servicos_imagem,
    ambulancia,
    seguradoras,
    acessibilidade,
    estacionamento,
    status = 'ativo'
  } = req.body;

  // Converter arrays para string, se necessário
  if (Array.isArray(especialidades)) {
    especialidades = especialidades.join(',');
  }
  if (Array.isArray(exames_disponiveis)) {
    exames_disponiveis = exames_disponiveis.join(',');
  }
  try {
    const result = await pool.query(
      `UPDATE hospitais SET nome=$1, endereco=$2, cidade=$3, provincia=$4, latitude=$5, longitude=$6, areas_trabalho=$7, exames_disponiveis=$8, telefone=$9, email=$10, site=$11, tipo_unidade=$12, categoria=$13, nivel=$14, data_fundacao=$15, redes_sociais=$16, diretor=$17, cargo_diretor=$18, nif=$19, horario=$20, capacidade=$21, num_medicos=$22, num_enfermeiros=$23, capacidade_internamento=$24, urgencia=$25, salas_cirurgia=$26, especialidades=$27, laboratorio=$28, farmacia=$29, banco_sangue=$30, servicos_imagem=$31, ambulancia=$32, seguradoras=$33, acessibilidade=$34, estacionamento=$35, status=$36 WHERE id=$37 RETURNING *`,
      [
        nome, endereco, cidade, provincia, latitude, longitude, areas_trabalho, exames_disponiveis, telefone, email, site, tipo_unidade, categoria, nivel, data_fundacao, redes_sociais, diretor, cargo_diretor, nif, horario, capacidade, num_medicos, num_enfermeiros, capacidade_internamento, urgencia, salas_cirurgia, especialidades, laboratorio, farmacia, banco_sangue, servicos_imagem, ambulancia, seguradoras, acessibilidade, estacionamento, status, id
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Hospital não encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao editar hospital:", err);
    res.status(500).json({ error: "Erro ao editar hospital", detalhes: err.message });
  }
});

// Remover hospital ou clínica
app.delete("/hospitais/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`DELETE FROM hospitais WHERE id = $1 RETURNING *`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Hospital não encontrado" });
    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao remover hospital:", err);
    res.status(500).json({ error: "Erro ao remover hospital", detalhes: err.message });
  }
});

// Login de profissional
app.post("/login-profissional", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: "Campos obrigatórios" });
  try {
    const result = await pool.query("SELECT * FROM profissionais WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Usuário não encontrado" });
    const prof = result.rows[0];
    const match = await bcrypt.compare(senha, prof.senha_hash);
    if (!match) return res.status(401).json({ error: "Senha incorreta" });
    res.json({ id: prof.id, nome: prof.nome, email: prof.email, especialidade: prof.especialidade, foto_perfil: prof.foto_perfil });
  } catch (err) {
    res.status(500).json({ error: "Erro ao autenticar profissional" });
  }
});

// Rota temporária para listar tabelas existentes
app.get("/debug/tabelas", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao listar tabelas", detalhes: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// ...existing code...

// Listar administradores hospitalares
app.get("/administradores_hospital", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT *, 'ativo' AS status FROM administradores_hospital ORDER BY id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar administradores hospitalares" });
  }
});

// Cadastrar administrador hospitalar
app.post("/administradores_hospital", async (req, res) => {
  const { nome, email, telefone, foto_url, data_nascimento, senha } = req.body;
  if (!nome || !email || !senha) return res.status(400).json({ error: "Campos obrigatórios" });
  try {
    // Use hash de senha em produção!
    await pool.query(
      `INSERT INTO administradores_hospital (nome, email, telefone, foto_url, data_nascimento, senha)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nome, email, telefone, foto_url, data_nascimento, senha]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "Erro ao cadastrar administrador hospitalar" });
  }
});

// Editar administrador hospitalar
app.put("/administradores_hospital/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, email, telefone, foto_url, data_nascimento, senha } = req.body;
  try {
    await pool.query(
      `UPDATE administradores_hospital SET nome=$1, email=$2, telefone=$3, foto_url=$4, data_nascimento=$5, senha=$6 WHERE id=$7`,
      [nome, email, telefone, foto_url, data_nascimento, senha, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "Erro ao atualizar administrador hospitalar" });
  }
});

// Excluir administrador hospitalar
app.delete("/administradores_hospital/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM administradores_hospital WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: "Erro ao excluir administrador hospitalar" });
  }
});

// ...existing code...
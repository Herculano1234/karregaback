
-- Script de inicialização do banco de dados PostgreSQL para o projeto Moyo
CREATE TABLE IF NOT EXISTS hospitais (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    endereco VARCHAR(255),
    cidade VARCHAR(100),
    provincia VARCHAR(100),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    areas_trabalho TEXT,
    exames_disponiveis TEXT,
    telefone VARCHAR(50),
    email VARCHAR(100),
    site VARCHAR(255),
    tipo_unidade VARCHAR(100),
    categoria VARCHAR(100),
    nivel VARCHAR(100),
    data_fundacao DATE,
    redes_sociais TEXT,
    diretor VARCHAR(100),
    cargo_diretor VARCHAR(100),
    nif VARCHAR(50),
    horario VARCHAR(100),
    capacidade INTEGER DEFAULT 0,
    num_medicos INTEGER,
    num_enfermeiros INTEGER,
    capacidade_internamento VARCHAR(100),
    urgencia VARCHAR(10),
    salas_cirurgia VARCHAR(100),
    especialidades TEXT,
    laboratorio VARCHAR(10),
    farmacia VARCHAR(10),
    banco_sangue VARCHAR(10),
    servicos_imagem TEXT,
    ambulancia VARCHAR(10),
    seguradoras TEXT,
    acessibilidade VARCHAR(10),
    estacionamento VARCHAR(100),
    status VARCHAR(30),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Criar tabela de pacientes
CREATE TABLE IF NOT EXISTS pacientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    data_nascimento DATE  NOT NULL,
    sexo VARCHAR(10) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    endereco TEXT NOT NULL,
    bi VARCHAR(50),
    foto_perfil TEXT NOT NULL,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de profissionais
CREATE TABLE IF NOT EXISTS profissionais (
    id SERIAL PRIMARY KEY,
    hospital_id INT REFERENCES hospitais(id),
    nome VARCHAR(100) NOT NULL,
    data_nascimento DATE  NOT NULL,
    bi VARCHAR(50) NOT NULL,
    sexo VARCHAR(10) NOT NULL,
    morada TEXT NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    unidade VARCHAR(100) NOT NULL,
    municipio VARCHAR(100) NOT NULL,
    especialidade VARCHAR(100) NOT NULL,
    cargo VARCHAR(50) NOT NULL,
    registro_profissional VARCHAR(50) NOT NULL,
    foto_perfil TEXT NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS administradores_hospital (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  telefone VARCHAR(20),
  foto_url TEXT,
  data_nascimento DATE,
  senha VARCHAR(100) NOT NULL,
  data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Criar tabela de consultas
CREATE TABLE IF NOT EXISTS consultas (
    id SERIAL PRIMARY KEY,
    paciente_id INT REFERENCES pacientes(id) ON DELETE CASCADE,
    profissional_id INT REFERENCES profissionais(id) ON DELETE CASCADE,
    data_hora TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'agendada',
    prioridade VARCHAR(10),
    local VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
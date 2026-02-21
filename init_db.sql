-- Inicialização do esquema Karrega
CREATE TABLE IF NOT EXISTS clientes (
	id INT AUTO_INCREMENT PRIMARY KEY,
	nome VARCHAR(200) NOT NULL,
	numero VARCHAR(50) NOT NULL UNIQUE,
	numero_bi VARCHAR(100) NOT NULL,
	password VARCHAR(255) NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transportadores (
	id INT AUTO_INCREMENT PRIMARY KEY,
	nome VARCHAR(200) NOT NULL,
	numero VARCHAR(50) NOT NULL UNIQUE,
	numero_bi VARCHAR(100) NOT NULL,
	password VARCHAR(255) NULL,
	foto_bi_path VARCHAR(500),
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS taxas (
	id INT AUTO_INCREMENT PRIMARY KEY,
	nome VARCHAR(200) NOT NULL,
	valor DECIMAL(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS planos (
	id INT AUTO_INCREMENT PRIMARY KEY,
	nome VARCHAR(200) NOT NULL,
	descricao TEXT,
	valor DECIMAL(12,2) NOT NULL
);

-- Inserir taxas e planos iniciais (opcionais)
INSERT INTO taxas (nome, valor) VALUES
	('Taxa padrão', 5.00)
ON DUPLICATE KEY UPDATE nome=nome;

INSERT INTO planos (nome, descricao, valor) VALUES
	('Básico', 'Pacote básico para iniciar', 0.00),
	('Profissional', 'Pacote com prioridade e mais visibilidade', 29.90)
ON DUPLICATE KEY UPDATE nome=nome;

-- Adicionar coluna `password` para clientes e transportadores (se não existir)
--ALTER TABLE clientes ADD COLUMN IF NOT EXISTS `password` VARCHAR(255) NULL;
--ALTER TABLE transportadores ADD COLUMN IF NOT EXISTS `password` VARCHAR(255) NULL;

-- Criar tabela de viagens com relacionamentos e status/tipos
CREATE TABLE IF NOT EXISTS viagens (
	id INT AUTO_INCREMENT PRIMARY KEY,
	cliente_id INT NOT NULL,
	transportador_id INT NULL,
	status ENUM('feito','pendente','cancelado') NOT NULL DEFAULT 'pendente',
	tipo ENUM('agendado','na hora') NOT NULL,
	scheduled_at DATETIME NULL,
	started_at DATETIME NULL,
	ended_at DATETIME NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	INDEX idx_cliente (cliente_id),
	INDEX idx_transportador (transportador_id),
	CONSTRAINT fk_viagens_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT fk_viagens_transportador FOREIGN KEY (transportador_id) REFERENCES transportadores(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

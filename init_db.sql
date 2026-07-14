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
	tipo_transporte VARCHAR(32) DEFAULT 'ligeiro',
	foto_bi_path VARCHAR(500),
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS taxas (
	id INT AUTO_INCREMENT PRIMARY KEY,
	nome VARCHAR(200) NOT NULL,
	valor DECIMAL(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS valor_inicial (
	id INT AUTO_INCREMENT PRIMARY KEY,
	valor DECIMAL(12,2) NOT NULL,
	updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

INSERT INTO valor_inicial (id, valor) VALUES (1, 5000.00)
ON DUPLICATE KEY UPDATE valor = VALUES(valor);

-- Adicionar coluna `password` para clientes e transportadores (se não existir)
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS `password` VARCHAR(255) NULL;
-- ALTER TABLE transportadores ADD COLUMN IF NOT EXISTS `password` VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS viagens (
	id INT AUTO_INCREMENT PRIMARY KEY,
	cliente_id INT NOT NULL,
	transportador_id INT NULL,
	status ENUM('feito','pendente','cancelado','aceito','em_transito') NOT NULL DEFAULT 'pendente',
	tipo ENUM('agendado','na hora') NOT NULL,
	scheduled_at DATETIME NULL,
	started_at DATETIME NULL,
	ended_at DATETIME NULL,
	origin VARCHAR(255),
	destination VARCHAR(255),
	tamanho_carga VARCHAR(64),
	descricao_da_carga TEXT,
	tipo_de_transporte VARCHAR(32) DEFAULT 'ligeiro',
	valor DECIMAL(12,2) DEFAULT 5000.00,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	INDEX idx_cliente (cliente_id),
	INDEX idx_transportador (transportador_id),
	CONSTRAINT fk_viagens_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT fk_viagens_transportador FOREIGN KEY (transportador_id) REFERENCES transportadores(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



-- If older migrations added tipo_carro, drop it here (we use transportadores.tipo_transporte instead)

-- Tabela que registra a distribuição financeira após cada viagem
CREATE TABLE IF NOT EXISTS incomes (
	id INT AUTO_INCREMENT PRIMARY KEY,
	viagem_id INT NOT NULL,
	taxa VARCHAR(200) DEFAULT NULL,
	valor_pago_cliente DECIMAL(12,2) NOT NULL DEFAULT 0.00,
	valor_transportador DECIMAL(12,2) NOT NULL DEFAULT 0.00,
	valor_app DECIMAL(12,2) NOT NULL DEFAULT 0.00,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	INDEX idx_viagem (viagem_id),
	CONSTRAINT fk_income_viagem FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabela que registra propostas de preço feitas por transportadores
CREATE TABLE IF NOT EXISTS propostas (
	id INT AUTO_INCREMENT PRIMARY KEY,
	viagem_id INT NOT NULL,
	transportador_id INT NOT NULL,
	valor_proposto DECIMAL(12,2) NOT NULL,
	status ENUM('pendente', 'aceito', 'recusado') NOT NULL DEFAULT 'pendente',
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	INDEX idx_viagem_proposta (viagem_id),
	CONSTRAINT fk_propostas_viagem FOREIGN KEY (viagem_id) REFERENCES viagens(id) ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT fk_propostas_transportador FOREIGN KEY (transportador_id) REFERENCES transportadores(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

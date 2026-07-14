-- Add tipo_de_transporte column to viagens table for filtering by transporter type
ALTER TABLE viagens ADD COLUMN tipo_de_transporte VARCHAR(32) DEFAULT 'ligeiro';

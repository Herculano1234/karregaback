import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool();

(async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('Conexão com o banco de dados bem-sucedida!');
  } catch (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } finally {
    await pool.end();
  }
})();

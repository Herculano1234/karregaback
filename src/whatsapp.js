// src/whatsapp.js — envio de mensagens por WhatsApp (credenciais só via variáveis de ambiente)
const TXT = {
  boasvindas_cliente: (n) => `Olá ${n}! Bem-vindo(a) à Karrega, movendo cargas, conectando pessoas. A sua conta foi criada com sucesso e já pode solicitar transportes na aplicação.`,
  registo_cargueiro: (n) => `Olá ${n}! Recebemos o seu registo na Karrega. A sua conta está a ser verificada pela nossa equipa e, assim que for aprovada, começará a receber pedidos de transporte.`,
  aprovado: (n) => `Boas notícias, ${n}! A sua conta Karrega foi verificada e aprovada. Já pode receber pedidos de transporte.`,
  rejeitado: (n) => `Olá ${n}. A verificação da sua conta Karrega não foi aprovada. Contacte o suporte para mais informações.`,
  ativo: (n) => `Olá ${n}! A sua conta Karrega foi ativada. Já pode utilizar a aplicação.`,
  suspenso: (n) => `Olá ${n}. A sua conta Karrega foi suspensa temporariamente. Contacte o suporte para mais informações.`,
  banido: (n) => `Olá ${n}. A sua conta Karrega foi banida por violação das regras da plataforma.`,
  eliminado: (n) => `Olá ${n}. A sua conta Karrega foi eliminada. Se acha que foi engano, contacte o suporte.`,
};
export const mensagem = (ev, nome) => (TXT[ev] ? TXT[ev](nome) : null);

export async function enviarWhatsApp(numero, texto) {
  const { WHATSAPP_URL: u, WHATSAPP_INSTANCE: i, WHATSAPP_APIKEY: k } = process.env;
  if (!u || !i || !k || !numero || !texto) return false;
  let n = String(numero).replace(/\D/g, "");
  if (n.length === 9) n = "244" + n; // números angolanos sem indicativo
  try {
    const r = await fetch(`${u}/message/sendText/${i}`, {
      method: "POST",
      headers: { apikey: k, "Content-Type": "application/json" },
      body: JSON.stringify({ number: n, text: texto }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error("WhatsApp erro", r.status, await r.text());
    return r.ok;
  } catch (e) { console.error("WhatsApp falhou:", e.message); return false; }
}

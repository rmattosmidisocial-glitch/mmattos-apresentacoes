// Recebe o diagnóstico preenchido: guarda o PDF e os dados do lead na base (Vercel Blob).
const { put } = require("@vercel/blob");
const origemOk = require("./_origem");

const limpa = (v, n = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const slug = s => limpa(s, 60).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente";

// Aviso automático no WhatsApp da agência (CallMeBot, grátis). Só vai para o seu número; o cliente não vê.
// Variáveis na Vercel: CALLMEBOT_APIKEY (chave recebida do bot) e AVISO_WHATSAPP (opcional, padrão 5521967640607).
async function avisarWhatsApp(l) {
  const key = process.env.CALLMEBOT_APIKEY;
  if (!key) return;
  const fone = process.env.AVISO_WHATSAPP || "5521967640607";
  const d = l.telefone, tel = d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}` : d;
  const brl = n => "R$ " + Math.round(n || 0).toLocaleString("pt-BR");
  const texto = [
    `*Novo diagnóstico concluído*`,
    `${l.diagnostico}`,
    ``,
    `*Empresa:* ${l.empresa} ${l.instagram}`,
    `*Responsável:* ${l.nome}`,
    `*WhatsApp:* ${tel} — https://wa.me/55${d.replace(/^55/, "")}`,
    `*Nota Vitrine:* ${l.nota}/100`,
    `*Faturamento:* ${brl(l.faturamentoHoje)} hoje → meta ${brl(l.faturamentoMeta)}`,
    l.plano ? `*Plano escolhido:* ${l.plano}` : null,
    `*Condição especial até:* ${l.validade}`,
    ``,
    `*PDF:* ${l.pdfUrl}`
  ].filter(x => x !== null).join("\n");
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(fone)}&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) console.error("callmebot", r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error("callmebot", e?.message); }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  if (!origemOk(req)) return res.status(403).json({ erro: "origem" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const l = body.lead || {};
  const tel = limpa(l.telefone, 30).replace(/\D/g, "");
  if (!limpa(l.nome) || tel.length < 10) return res.status(400).json({ erro: "dados" });
  if (typeof body.pdf !== "string" || body.pdf.length > 4_200_000) return res.status(400).json({ erro: "pdf" });

  try {
    const agora = new Date();
    const dia = agora.toISOString().slice(0, 10);
    const pdf = await put(`diagnosticos/${dia}-${slug(l.empresa)}.pdf`, Buffer.from(body.pdf, "base64"), {
      access: "public", contentType: "application/pdf", addRandomSuffix: true
    });
    const registro = {
      criadoEm: agora.toISOString(),
      diagnostico: limpa(l.diagnostico, 60),
      empresa: limpa(l.empresa), instagram: limpa(l.instagram, 80), nicho: limpa(l.nicho, 80),
      nome: limpa(l.nome), telefone: tel,
      nota: Number(l.nota) || 0,
      faturamentoHoje: Number(l.faturamentoHoje) || 0, faturamentoMeta: Number(l.faturamentoMeta) || 0,
      plano: limpa(l.plano, 80), validade: limpa(l.validade, 20),
      pdfUrl: pdf.url
    };
    await put(`leads/${agora.getTime()}-${slug(l.empresa)}.json`, JSON.stringify(registro), {
      access: "public", contentType: "application/json", addRandomSuffix: true
    });
    await avisarWhatsApp(registro);
    return res.status(200).json({ ok: true }); // o link do PDF fica só na base (página /leads)
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "falha" });
  }
};

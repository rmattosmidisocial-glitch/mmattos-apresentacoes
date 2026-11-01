// Recebe o diagnóstico preenchido: guarda o PDF e os dados do lead na base (Vercel Blob).
const { put } = require("@vercel/blob");
const origemOk = require("./_origem");

const limpa = (v, n = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const slug = s => limpa(s, 60).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cliente";

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
    return res.status(200).json({ ok: true, pdfUrl: pdf.url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "falha" });
  }
};

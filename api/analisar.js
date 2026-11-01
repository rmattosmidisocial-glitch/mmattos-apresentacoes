// Análise com IA dos diagnósticos (Feed Vitrine e Perfil que Vende).
// Variáveis na Vercel:
//   GEMINI_API_KEY      chave gratuita do Google AI Studio (usada primeiro, se existir)
//   GEMINI_MODEL        opcional, padrão gemini-flash-latest
//   ANTHROPIC_API_KEY   opcional, chave paga da API do Claude (usada se não houver Gemini)
//   ANTHROPIC_MODEL     opcional, padrão claude-sonnet-5-5
//   ACESSO_DIAGNOSTICO  senha da página /leads (e acesso à IA fora do site)
const crypto = require("crypto");

const iguais = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const FIM = "\n\nResponda apenas com o JSON pedido, sem nenhum texto antes ou depois.";

async function gemini(key, prompt, img) {
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const parts = [];
  if (img) parts.push({ inline_data: { mime_type: img.media_type, data: img.data } });
  parts.push({ text: prompt + FIM });
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 } })
  });
  const data = await r.json();
  if (!r.ok) return { status: r.status, detalhe: data?.error?.message };
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  return text ? { text } : { status: 502, detalhe: data?.promptFeedback?.blockReason || "resposta vazia" };
}

async function claude(key, prompt, img) {
  const content = [];
  if (img) content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  content.push({ type: "text", text: prompt + FIM });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 4000, messages: [{ role: "user", content }] })
  });
  const data = await r.json();
  if (!r.ok) return { status: r.status, detalhe: data?.error?.message };
  return { text: (data.content || []).filter(c => c.type === "text").map(c => c.text).join("") };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  const { GEMINI_API_KEY, ANTHROPIC_API_KEY, ACESSO_DIAGNOSTICO } = process.env;
  if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) return res.status(503).json({ erro: "sem_chave" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  // Liberado para o próprio site (cliente pode usar sozinho); o código é opcional.
  if (!require("./_origem")(req) && !(ACESSO_DIAGNOSTICO && iguais(body.code, ACESSO_DIAGNOSTICO))) return res.status(401).json({ erro: "codigo" });

  const prompt = String(body.prompt || "").slice(0, 30000);
  if (!prompt) return res.status(400).json({ erro: "sem_prompt" });
  let img = null;
  if (body.image && typeof body.image.data === "string") {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(body.image.media_type || "")) return res.status(400).json({ erro: "imagem" });
    if (body.image.data.length > 4_000_000) return res.status(413).json({ erro: "imagem_grande" });
    img = body.image;
  }
  try {
    const out = GEMINI_API_KEY ? await gemini(GEMINI_API_KEY, prompt, img) : await claude(ANTHROPIC_API_KEY, prompt, img);
    if (out.text) return res.status(200).json({ text: out.text });
    console.error("ia", out.status, out.detalhe);
    return res.status(out.status === 429 ? 429 : 502).json({ erro: "ia", status: out.status });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ erro: "falha" });
  }
};

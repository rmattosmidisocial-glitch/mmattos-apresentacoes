// Lista os leads guardados na base. Protegido pela senha ACESSO_DIAGNOSTICO.
const { list } = require("@vercel/blob");
const crypto = require("crypto");

module.exports = async (req, res) => {
  const senha = String(req.headers["x-senha"] || ""), certa = String(process.env.ACESSO_DIAGNOSTICO || "");
  const a = Buffer.from(senha), b = Buffer.from(certa);
  if (!certa || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ erro: "senha" });
  try {
    const blobs = [];
    let cursor;
    do {
      const r = await list({ prefix: "leads/", limit: 1000, cursor });
      blobs.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor && blobs.length < 5000);
    const leads = (await Promise.all(blobs.map(bl => fetch(bl.url).then(r => r.json()).catch(() => null)))).filter(Boolean);
    leads.sort((x, y) => String(y.criadoEm).localeCompare(String(x.criadoEm)));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ leads });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: "falha" });
  }
};

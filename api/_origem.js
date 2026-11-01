// Só aceita chamadas vindas do próprio site (evita uso da IA e da base por terceiros).
module.exports = req => {
  const o = String(req.headers.origin || req.headers.referer || "");
  try {
    const h = new URL(o).hostname;
    return h === "mmattosmkt.com" || h.endsWith(".mmattosmkt.com") || (h.endsWith(".vercel.app") && h.startsWith("mmattos-apresentacoes")) || h === "localhost";
  } catch { return false; }
};

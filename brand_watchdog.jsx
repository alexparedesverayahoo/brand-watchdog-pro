import { useState, useMemo, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const BRANDS = [
  { t: "Marca Producto", n: "Multiclase PROTEKTOR", c: [17, 19] },
  { t: "Marca Producto", n: "NEFUSAC", c: [19] },
  { t: "Nombre comercial", n: "NEGOCIACION FUTURA", c: [20, 19, 35] },
  { t: "Marca Producto", n: "RODO METAL", c: [6] },
  { t: "Marca Producto", n: "RODO TOP", c: [19] },
  { t: "Marca Producto", n: "RODOCINTA", c: [19] },
  { t: "Marca Producto", n: "RODOMETAL EVO", c: [6] },
  { t: "Marca Producto", n: "RODOPASO", c: [19] },
  { t: "Marca Producto", n: "RODOPLAST", c: [20, 17, 19] },
  { t: "Marca Producto", n: "ZOCALPLAST", c: [19, 20] },
];

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let p = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const c = [i];
    for (let j = 1; j <= n; j++)
      c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
    p = c;
  }
  return p[n];
}

function bSim(marca, signo) {
  const a = marca.toUpperCase().trim(), b = signo.toUpperCase().trim();
  if (!a || !b) return 0;
  const lS = (1 - lev(a, b) / Math.max(a.length, b.length)) * 100;
  let cS = 0;
  if (a.length >= 4 && b.includes(a)) cS = Math.min(95, 70 + (a.length / b.length) * 30);
  if (b.length >= 4 && a.includes(b)) cS = Math.max(cS, Math.min(95, 70 + (b.length / a.length) * 30));
  const aT = new Set(a.split(/\s+/).filter(x => x.length >= 3));
  const bT = new Set(b.split(/\s+/).filter(x => x.length >= 3));
  const cm = [...aT].filter(x => bT.has(x));
  const tS = cm.length > 0 ? Math.min(95, 60 + (cm.length / Math.max(aT.size || 1, bT.size || 1)) * 35) : 0;
  return Math.round(Math.max(lS, cS, tS) * 10) / 10;
}

function rLbl(s, o) {
  if (s >= 85) return "CRITICO";
  if (s >= 75) return o ? "CRITICO" : "ALTO";
  if (s >= 60) return o ? "ALTO" : "MEDIO";
  return o ? "MEDIO" : "BAJO";
}

function parseXLS(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const d = new Uint8Array(e.target.result);
        const wb = XLSX.read(d, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        let h = -1;
        for (let i = 0; i < Math.min(20, rows.length); i++) {
          if (String(rows[i]?.[1] || "").includes("Nro. de Expediente")) { h = i; break; }
        }
        if (h < 0) { rej(new Error("Formato no reconocido")); return; }
        const out = [];
        for (let i = h + 1; i < rows.length; i++) {
          const x = rows[i];
          const sg = String(x[12] || "").trim();
          if (!sg) continue;
          out.push({ sg, ex: String(x[1]||""), fp: String(x[2]||""), fl: String(x[5]||""), ts: String(x[7]||""), so: String(x[9]||""), cl: String(x[10]||""), lk: String(x[11]||""), ti: String(x[13]||""), pa: String(x[14]||"") });
        }
        res(out);
      } catch (err) { rej(err); }
    };
    r.onerror = () => rej(new Error("Error leyendo archivo"));
    r.readAsArrayBuffer(file);
  });
}

function cruce(recs) {
  const out = [];
  for (const b of BRANDS) {
    const ns = [b.n];
    if (b.n.toLowerCase().startsWith("multiclase ")) ns.push(b.n.substring(11));
    for (const g of recs) {
      let best = 0;
      for (const nm of ns) best = Math.max(best, bSim(nm, g.sg));
      if (best < 45) continue;
      const bS = new Set(b.c);
      const gS = new Set(g.cl.replace(/\s/g, "").split(",").map(Number).filter(n => !isNaN(n)));
      const ov = [...bS].filter(x => gS.has(x)).sort((a, b) => a - b);
      out.push({ marca: b.n, mt: b.t, mc: b.c, signo: g.sg, sim: best, ex: g.ex, fp: g.fp, fl: g.fl, ts: g.ts, so: g.so, gc: g.cl, ti: g.ti, pa: g.pa, lk: g.lk, ov, rk: rLbl(best, ov.length > 0) });
    }
  }
  out.sort((a, b) => b.sim - a.sim);
  return out;
}

const RC = { CRITICO: "#DC2626", ALTO: "#EA580C", MEDIO: "#D97706", BAJO: "#6B7280" };
const RB = { CRITICO: "#FEE2E2", ALTO: "#FFEDD5", MEDIO: "#FEF3C7", BAJO: "#F3F4F6" };
const TODAY = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

export default function App() {
  const [phase, setPhase] = useState("upload");
  const [rawRecs, setRawRecs] = useState([]);
  const [data, setData] = useState([]);
  const [fi, setFi] = useState([]);
  const [tot, setTot] = useState(0);
  const [pr, setPr] = useState("");
  const [thr, setThr] = useState(60);
  const [sb, setSb] = useState(null);
  const [so, setSo] = useState("sim");
  const [oo, setOo] = useState(false);

  const onFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPr("Leyendo archivos...");
    setPhase("processing");
    try {
      let all = [];
      const inf = [];
      for (const f of files) {
        setPr(`Leyendo ${f.name}...`);
        const r = await parseXLS(f);
        all = all.concat(r);
        inf.push({ n: f.name, c: r.length });
      }
      const seen = new Set();
      const uniq = all.filter(r => { const k = r.ex + "|" + r.sg; if (seen.has(k)) return false; seen.add(k); return true; });
      setRawRecs(uniq);
      setFi(inf);
      setTot(uniq.length);
      setPhase("ready");
    } catch (err) { alert("Error: " + err.message); setPhase("upload"); }
  }, []);

  const startAnalysis = useCallback(async () => {
    setPhase("processing");
    setPr(`Analizando ${BRANDS.length} marcas vs ${rawRecs.length.toLocaleString()} signos...`);
    await new Promise(r => setTimeout(r, 120));
    const m = cruce(rawRecs);
    setData(m);
    setPhase("dashboard");
  }, [rawRecs]);

  const filt = useMemo(() => {
    let f = data.filter(m => m.sim >= thr);
    if (sb) f = f.filter(m => m.marca === sb);
    if (oo) f = f.filter(m => m.ov.length > 0);
    const ord = { CRITICO: 0, ALTO: 1, MEDIO: 2, BAJO: 3 };
    if (so === "sim") f.sort((a, b) => b.sim - a.sim);
    else if (so === "risk") f.sort((a, b) => (ord[a.rk] ?? 4) - (ord[b.rk] ?? 4) || b.sim - a.sim);
    else f.sort((a, b) => (b.fl || "").localeCompare(a.fl || ""));
    return f;
  }, [data, thr, sb, so, oo]);

  const stats = useMemo(() => {
    const r = { CRITICO: 0, ALTO: 0, MEDIO: 0, BAJO: 0 };
    filt.forEach(m => r[m.rk]++);
    const u = filt.filter(m => { const p = m.fl?.split("/"); if (p?.length !== 3) return false; const d = (new Date(+p[2], +p[1] - 1, +p[0]) - new Date()) / 864e5; return d >= 0 && d <= 30; }).length;
    return { r, u, t: filt.length };
  }, [filt]);

  const genWord = () => {
    const grp = {}; filt.forEach(m => { (grp[m.marca] ??= []).push(m); });
    const secs = Object.entries(grp).map(([marca, ms]) => {
      const b = BRANDS.find(x => x.n === marca);
      return `<h2 style="color:#0B1D3A;font-size:16pt;border-bottom:3px solid #1D4ED8;padding-bottom:6px;margin-top:24px;">${marca}</h2>
        <p style="color:#64748B;font-size:10pt;margin-bottom:10px;">${b?.t || ""} &mdash; Clases Niza: ${b?.c.join(", ") || ""} &mdash; ${ms.length} alerta${ms.length !== 1 ? "s" : ""} detectada${ms.length !== 1 ? "s" : ""}</p>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:9pt;border-color:#D1D5DB;">
          <thead><tr style="background-color:#E2E8F0;">
            <th style="text-align:left;font-weight:bold;color:#334155;">N\u00B0</th>
            <th style="text-align:left;font-weight:bold;color:#334155;">Signo Solicitado</th>
            <th style="text-align:center;font-weight:bold;color:#334155;">Similitud</th>
            <th style="text-align:center;font-weight:bold;color:#334155;">Riesgo</th>
            <th style="text-align:left;font-weight:bold;color:#334155;">Expediente</th>
            <th style="text-align:left;font-weight:bold;color:#334155;">Clases</th>
            <th style="text-align:center;font-weight:bold;color:#334155;">Coincid. Clase</th>
            <th style="text-align:left;font-weight:bold;color:#334155;">Solicitante</th>
            <th style="text-align:left;font-weight:bold;color:#334155;">Tipo</th>
            <th style="text-align:left;font-weight:bold;color:#334155;">L\u00EDmite Oposici\u00F3n</th>
          </tr></thead>
          <tbody>${ms.map((m, i) => `<tr style="${m.ov.length ? 'background-color:#FFFBEB;' : (i % 2 === 0 ? '' : 'background-color:#F8FAFC;')}">
            <td style="color:#64748B;">${i + 1}</td>
            <td style="font-weight:bold;">${m.signo}</td>
            <td style="text-align:center;font-weight:bold;color:${RC[m.rk]};">${m.sim}%</td>
            <td style="text-align:center;font-weight:bold;color:${RC[m.rk]};">${m.rk}</td>
            <td style="font-family:Courier New,monospace;font-size:8pt;">${m.ex}</td>
            <td>${m.gc}</td>
            <td style="text-align:center;font-weight:bold;color:${m.ov.length ? '#DC2626' : '#CBD5E1'};">${m.ov.length ? "\u26A0 " + m.ov.join(", ") : "\u2014"}</td>
            <td style="font-size:8pt;">${m.so}</td>
            <td>${m.ti}</td>
            <td style="font-weight:${(() => { const p = m.fl?.split("/"); if (p?.length === 3) { const d = (new Date(+p[2],+p[1]-1,+p[0]) - new Date()) / 864e5; if (d >= 0 && d <= 15) return "bold;color:#DC2626"; } return "normal;color:#334155"; })()}">${m.fl}</td>
          </tr>`).join("")}</tbody></table>`;
    }).join("");

    const riskTable = `<table border="0" cellpadding="10" cellspacing="0" style="width:100%;margin:16px 0;">
      <tr>
        ${[["CR\u00CDTICO", stats.r.CRITICO, "#DC2626"], ["ALTO", stats.r.ALTO, "#EA580C"], ["MEDIO", stats.r.MEDIO, "#D97706"], ["BAJO", stats.r.BAJO, "#6B7280"]].map(([l, v, c]) =>
          `<td style="text-align:center;border-left:4px solid ${c};background-color:#F8FAFC;"><span style="font-size:24pt;font-weight:bold;color:${c};">${v}</span><br/><span style="font-size:8pt;color:${c};">${l}</span></td>`
        ).join("")}
      </tr>
    </table>`;

    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<style>
  @page { size: landscape; margin: 1.5cm; }
  body { font-family: Calibri, Arial, sans-serif; color: #0F172A; font-size: 10pt; }
  h1 { font-size: 22pt; color: #0B1D3A; }
  h2 { font-size: 16pt; color: #0B1D3A; }
  table { font-size: 9pt; }
</style>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
</head><body>

<div style="text-align:center;margin-bottom:24px;">
  <p style="font-size:9pt;letter-spacing:3px;color:#64748B;">NEGOCIACI\u00D3N FUTURA S.A.C.</p>
  <h1 style="margin:8px 0;">REPORTE DE MONITOREO DE MARCAS</h1>
  <p style="font-size:11pt;color:#64748B;">Gaceta Electr\u00F3nica INDECOPI &mdash; An\u00E1lisis de Similitud de Signos Distintivos</p>
  <p style="font-size:9pt;color:#94A3B8;">${TODAY} &bull; Umbral de similitud: ${thr}% &bull; ${tot.toLocaleString()} signos procesados &bull; Brand Watchdog Pro</p>
</div>

<hr style="border:none;border-top:3px solid #1D4ED8;margin:16px 0;" />

<h2 style="color:#0B1D3A;font-size:14pt;">RESUMEN EJECUTIVO</h2>
<p style="font-size:10pt;line-height:1.8;color:#334155;">
  Se realiz\u00F3 un an\u00E1lisis exhaustivo de similitud entre <b>${BRANDS.length} marcas registradas</b> del portafolio y <b>${tot.toLocaleString()} signos</b> publicados en la Gaceta Electr\u00F3nica de INDECOPI.
  Con un umbral del <b>${thr}%</b>, se identificaron <b>${stats.t} alertas</b> que requieren evaluaci\u00F3n profesional.
  ${stats.u > 0 ? `<span style="color:#DC2626;font-weight:bold;">\u26A0 ${stats.u} alertas tienen fecha l\u00EDmite de oposici\u00F3n dentro de los pr\u00F3ximos 30 d\u00EDas.</span>` : "Ninguna alerta con plazo urgente."}
</p>
${riskTable}

<hr style="border:none;border-top:2px solid #E2E8F0;margin:20px 0;" />

<h2 style="color:#0B1D3A;font-size:14pt;">DETALLE POR MARCA REGISTRADA</h2>
${secs}

<hr style="border:none;border-top:2px solid #E2E8F0;margin:24px 0;" />

<p style="font-size:8pt;color:#94A3B8;line-height:1.6;">
  <b>NOTA METODOL\u00D3GICA:</b> El an\u00E1lisis emplea algoritmos de distancia de edici\u00F3n (Levenshtein), detecci\u00F3n de subcadenas y coincidencia de tokens.
  El nivel de riesgo se determina combinando el porcentaje de similitud ortogr\u00E1fica/fon\u00E9tica con la coincidencia de clases de la Clasificaci\u00F3n Internacional de Niza.
  La presencia de clases compartidas eleva autom\u00E1ticamente el nivel de riesgo. Este reporte tiene car\u00E1cter referencial y no constituye opini\u00F3n legal vinculante.
</p>
<p style="font-size:8pt;color:#64748B;margin-top:8px;">
  <b>PAREDES VERA Estudio Contable Legal S.A.C.</b> &mdash; Sistema Brand Watchdog Pro &mdash; ${TODAY}
</p>

</body></html>`;

    const blob = new Blob(['\ufeff' + doc], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reporte_Marcas_NEFUSAC_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const CSS = `@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');
@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes glow{0%,100%{box-shadow:0 0 24px rgba(59,130,246,0.3)}50%{box-shadow:0 0 48px rgba(59,130,246,0.6)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
input[type=range]{-webkit-appearance:none;height:8px;border-radius:4px;background:linear-gradient(90deg,#3B82F6,#8B5CF6);outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;cursor:pointer;border:3px solid #0B1D3A;box-shadow:0 2px 8px rgba(0,0,0,0.2)}
select{outline:none}select:focus{border-color:#3B82F6;box-shadow:0 0 0 3px rgba(59,130,246,0.12)}
tr:hover td{background:#EFF6FF!important}`;

  if (phase === "upload") return (
    <div style={{ fontFamily: "'Sora',sans-serif", minHeight: "100vh", background: "linear-gradient(160deg, #0B1D3A 0%, #1E3A6E 40%, #1D4ED8 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center", maxWidth: 560, width: "100%", animation: "fadeIn 0.6s ease" }}>
        <div style={{ width: 100, height: 100, borderRadius: 24, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px", animation: "glow 3s ease infinite" }}>
          <span style={{ fontSize: 52 }}>🛡</span>
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, color: "#FFF", letterSpacing: "-1.5px" }}>Brand Watchdog Pro</h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.45)", margin: "10px 0 40px", fontWeight: 300 }}>Sistema de Monitoreo de Marcas · INDECOPI</p>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 20, padding: "44px 36px", border: "2px dashed rgba(255,255,255,0.18)", cursor: "pointer", transition: "all 0.3s" }}
          onClick={() => document.getElementById("xlsIn").click()}
          onMouseOver={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.45)"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}>
          <input id="xlsIn" type="file" accept=".xls,.xlsx" multiple onChange={onFiles} style={{ display: "none" }} />
          <div style={{ fontSize: 56, marginBottom: 18 }}>📂</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#FFF", marginBottom: 10 }}>Cargar Excel de Gaceta</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.7 }}>Selecciona uno o más archivos .xls/.xlsx<br />exportados de la Gaceta Electrónica de INDECOPI</div>
          <div style={{ marginTop: 24, display: "inline-block", background: "#FFF", color: "#0B1D3A", padding: "14px 36px", borderRadius: 10, fontSize: 16, fontWeight: 800 }}>Seleccionar Archivos</div>
        </div>
        <div style={{ marginTop: 32, background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: "20px 24px", border: "1px solid rgba(255,255,255,0.06)", textAlign: "left" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>Portafolio · {BRANDS.length} marcas</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {BRANDS.map(b => (
              <span key={b.n} style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.8)", padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, border: "1px solid rgba(255,255,255,0.06)" }}>
                {b.n} <span style={{ opacity: 0.35, fontSize: 12 }}>({b.c.join(",")})</span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 24, fontSize: 11, color: "rgba(255,255,255,0.15)" }}>PAREDES VERA Estudio Contable Legal S.A.C.</div>
      </div>
    </div>
  );

  if (phase === "ready") return (
    <div style={{ fontFamily: "'Sora',sans-serif", minHeight: "100vh", background: "linear-gradient(160deg, #0B1D3A 0%, #1E3A6E 40%, #1D4ED8 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center", maxWidth: 560, width: "100%", animation: "fadeIn 0.5s ease" }}>
        <div style={{ width: 100, height: 100, borderRadius: 24, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 28px" }}>
          <span style={{ fontSize: 52 }}>✅</span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, color: "#FFF", letterSpacing: "-1px" }}>Archivos Cargados</h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", margin: "10px 0 32px" }}>
          {fi.length} archivo{fi.length !== 1 ? "s" : ""} · <strong style={{ color: "#93C5FD" }}>{tot.toLocaleString()}</strong> signos encontrados
        </p>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "20px 24px", border: "1px solid rgba(255,255,255,0.08)", textAlign: "left", marginBottom: 28 }}>
          {fi.map((f, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < fi.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24 }}>📄</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)", wordBreak: "break-all" }}>{f.n}</div>
              </div>
              <span style={{ background: "rgba(59,130,246,0.15)", color: "#93C5FD", padding: "4px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>{f.c.toLocaleString()} signos</span>
            </div>
          ))}
        </div>
        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "16px 20px", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 32 }}>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Se cruzarán contra <strong style={{ color: "#FFF" }}>{BRANDS.length} marcas</strong> del portafolio</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {BRANDS.map(b => (
              <span key={b.n} style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)", padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500 }}>{b.n}</span>
            ))}
          </div>
        </div>
        <button onClick={startAnalysis}
          style={{ background: "linear-gradient(135deg, #22C55E, #16A34A)", color: "#FFF", border: "none", padding: "18px 56px", borderRadius: 14, fontSize: 20, fontWeight: 800, cursor: "pointer", letterSpacing: "0.3px", boxShadow: "0 8px 32px rgba(34,197,94,0.4)", transition: "transform 0.2s", animation: "pulse 2s ease infinite" }}
          onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"}
          onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
          🚀 Iniciar Análisis
        </button>
        <div style={{ marginTop: 16 }}>
          <button onClick={() => { setPhase("upload"); setRawRecs([]); setFi([]); }}
            style={{ background: "transparent", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.1)", padding: "10px 24px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
            ← Volver a cargar otros archivos
          </button>
        </div>
      </div>
    </div>
  );

  if (phase === "processing") return (
    <div style={{ fontFamily: "'Sora',sans-serif", minHeight: "100vh", background: "linear-gradient(160deg, #0B1D3A, #1D4ED8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 64, height: 64, border: "5px solid rgba(255,255,255,0.1)", borderTop: "5px solid #fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 20px" }} />
        <div style={{ fontSize: 20, fontWeight: 700, color: "#FFF" }}>Procesando...</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 8 }}>{pr}</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Sora',sans-serif", maxWidth: 1400, margin: "0 auto", padding: 20, background: "#F1F5F9", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div style={{ background: "linear-gradient(135deg, #0B1D3A, #1E3A6E, #1D4ED8)", borderRadius: 18, padding: "30px 36px", marginBottom: 22, position: "relative", overflow: "hidden", animation: "fadeIn 0.5s ease" }}>
        <div style={{ position: "absolute", top: -60, right: -40, width: 240, height: 240, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.12), transparent 70%)" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 5, color: "#93C5FD", textTransform: "uppercase" }}>NEGOCIACIÓN FUTURA S.A.C.</div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: "#FFF", margin: "4px 0", letterSpacing: "-0.7px" }}>🛡 Brand Watchdog Pro</h1>
            <div style={{ fontSize: 14, color: "#93C5FD" }}>{TODAY} · <strong>{tot.toLocaleString()}</strong> signos · {fi.length} archivo{fi.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => { setPhase("upload"); setData([]); setRawRecs([]); setFi([]); }} style={{ background: "rgba(255,255,255,0.1)", color: "#BFDBFE", border: "1px solid rgba(255,255,255,0.15)", padding: "12px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>+ Nueva Gaceta</button>
            <button onClick={genWord} style={{ background: "#FFF", color: "#0B1D3A", border: "none", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>📄 Descargar Word</button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 22 }}>
        {[["🔴 CRÍTICO", stats.r.CRITICO, "#DC2626", "#FEE2E2"], ["🟠 ALTO", stats.r.ALTO, "#EA580C", "#FFEDD5"], ["🟡 MEDIO", stats.r.MEDIO, "#D97706", "#FEF3C7"], ["⚪ BAJO", stats.r.BAJO, "#6B7280", "#F3F4F6"], ["📊 TOTAL", stats.t, "#1D4ED8", "#DBEAFE"], ["⏰ URGENTE", stats.u, "#DC2626", "#FEE2E2"]].map(([l, v, c, bg]) => (
          <div key={l} style={{ background: bg, borderRadius: 14, padding: "22px 18px", borderLeft: `6px solid ${c}`, textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 12, color: c, marginTop: 8, fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#FFF", borderRadius: 16, padding: "24px 28px", marginBottom: 22, border: "1px solid #E2E8F0" }}>
        <div style={{ display: "flex", gap: 28, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#475569", display: "block", marginBottom: 10 }}>
              Umbral de Similitud: <span style={{ color: "#1D4ED8", fontSize: 20, fontWeight: 800 }}>{thr}%</span>
            </label>
            <input type="range" min={45} max={95} step={5} value={thr} onChange={e => setThr(+e.target.value)} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: "1 1 220px" }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#475569", display: "block", marginBottom: 10 }}>Filtrar Marca</label>
            <select value={sb || ""} onChange={e => setSb(e.target.value || null)} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "2px solid #E2E8F0", fontSize: 15, fontWeight: 500 }}>
              <option value="">Todas ({BRANDS.length})</option>
              {BRANDS.map(b => <option key={b.n} value={b.n}>{b.n} — Cl. {b.c.join(",")}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: "#475569", display: "block", marginBottom: 10 }}>Ordenar</label>
            <select value={so} onChange={e => setSo(e.target.value)} style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: "2px solid #E2E8F0", fontSize: 15, fontWeight: 500 }}>
              <option value="sim">📈 Similitud</option>
              <option value="risk">⚠ Riesgo</option>
              <option value="date">📅 Fecha</option>
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#334155", cursor: "pointer", fontWeight: 500, paddingBottom: 6 }}>
            <input type="checkbox" checked={oo} onChange={e => setOo(e.target.checked)} style={{ width: 20, height: 20, accentColor: "#DC2626" }} />
            Solo coincidencia clases
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(195px, 1fr))", gap: 14, marginBottom: 22 }}>
        {BRANDS.map(b => {
          const cnt = filt.filter(m => m.marca === b.n).length;
          const mx = filt.filter(m => m.marca === b.n).reduce((a, m) => Math.max(a, m.sim), 0);
          const sel = sb === b.n;
          return (
            <div key={b.n} onClick={() => setSb(sel ? null : b.n)}
              style={{ background: sel ? "linear-gradient(135deg, #0B1D3A, #1D4ED8)" : "#FFF", borderRadius: 14, padding: "20px 22px", cursor: "pointer", transition: "all 0.2s", border: `2px solid ${sel ? "#1D4ED8" : "#E2E8F0"}`, boxShadow: sel ? "0 8px 24px rgba(29,78,216,0.25)" : "none" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: sel ? "#FFF" : "#0B1D3A", marginBottom: 4 }}>{b.n}</div>
              <div style={{ fontSize: 12, color: sel ? "#93C5FD" : "#94A3B8" }}>Clases: {b.c.join(", ")}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: sel ? "#FFF" : cnt > 0 ? "#1D4ED8" : "#CBD5E1", lineHeight: 1 }}>{cnt}</div>
                  <div style={{ fontSize: 11, color: sel ? "#93C5FD" : "#94A3B8", marginTop: 2 }}>alertas</div>
                </div>
                {mx > 0 && <span style={{ background: sel ? "rgba(255,255,255,0.15)" : RB[rLbl(mx, false)], color: sel ? "#FFF" : RC[rLbl(mx, false)], padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 800 }}>{mx}%</span>}
              </div>
            </div>
          );
        })}
      </div>

      {filt.length > 0 ? (
        <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ padding: "18px 28px", borderBottom: "2px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#0B1D3A" }}>📋 Alertas de Similitud</span>
            <span style={{ fontSize: 14, color: "#64748B" }}>{filt.length} resultado{filt.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#F8FAFC" }}>
                {["Tu Marca", "Signo Solicitado", "Similitud", "Riesgo", "Expediente", "Clases", "⚠ Clase", "Solicitante", "Tipo", "Límite", "Link"].map((h, i) => (
                  <th key={i} style={{ padding: "14px 16px", textAlign: [2, 3, 6].includes(i) ? "center" : "left", fontWeight: 700, color: "#64748B", fontSize: 12, borderBottom: "2px solid #E2E8F0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filt.map((m, i) => {
                  const isU = (() => { const p = m.fl?.split("/"); if (p?.length !== 3) return false; const d = (new Date(+p[2], +p[1] - 1, +p[0]) - new Date()) / 864e5; return d >= 0 && d <= 15; })();
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #F1F5F9", background: isU ? "#FEF2F2" : "transparent" }}>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "#0B1D3A", fontSize: 13 }}>{m.marca}</td>
                      <td style={{ padding: "14px 16px", fontWeight: 800, fontSize: 15 }}>{m.signo}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                          <div style={{ width: 80, height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${m.sim}%`, height: "100%", background: RC[m.rk], borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 800, color: RC[m.rk] }}>{m.sim}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <span style={{ background: RB[m.rk], color: RC[m.rk], padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 800 }}>{m.rk}</span>
                      </td>
                      <td style={{ padding: "14px 16px", fontFamily: "monospace", fontSize: 12, color: "#475569" }}>{m.ex}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: "#475569" }}>{m.gc}</td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        {m.ov.length > 0 ? <span style={{ color: "#DC2626", fontWeight: 800, fontSize: 13 }}>⚠ {m.ov.join(",")}</span> : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>
                      <td style={{ padding: "14px 16px", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#475569" }} title={m.so}>{m.so}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, color: "#475569" }}>{m.ti}</td>
                      <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: isU ? 800 : 500, color: isU ? "#DC2626" : "#475569", whiteSpace: "nowrap" }}>{isU && "🔴 "}{m.fl}</td>
                      <td style={{ padding: "14px 16px" }}>
                        {m.lk && <a href={m.lk} target="_blank" rel="noopener noreferrer" style={{ color: "#1D4ED8", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>Ver →</a>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: 72, background: "#FFF", borderRadius: 16, border: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 60 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0B1D3A", marginTop: 14 }}>Sin alertas al {thr}%</div>
          <div style={{ fontSize: 15, color: "#64748B", marginTop: 8 }}>Reduce el umbral para ampliar el análisis</div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 28, padding: "18px 0", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ fontSize: 12, color: "#94A3B8" }}>PAREDES VERA Estudio Contable Legal S.A.C. — Brand Watchdog Pro v4</div>
        <div style={{ fontSize: 11, color: "#CBD5E1", marginTop: 4 }}>{fi.map(f => `${f.n} (${f.c.toLocaleString()})`).join(" · ")}</div>
      </div>
    </div>
  );
}

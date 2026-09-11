// Проверка всех схем Mermaid (полных и пошаговых срезов) в headless Chrome — без сборки index.html.
//   NODE_PATH=/tmp/pptr/node_modules node tools/check_visuals.js [concept-id ...]
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const only = process.argv.slice(2);

(async () => {
  const items = [];
  for (const f of fs.readdirSync(path.join(ROOT, "content/concepts")).sort()) {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, "content/concepts", f), "utf8"));
    if (only.length && !only.includes(c.id)) continue;
    const vis = (c.short_answer && c.short_answer.visuals) || {};
    for (const [lvl, list] of Object.entries(vis)) (list || []).forEach((v, i) => items.push({ where: `${c.id} ${lvl}[${i}] «${v.title}»`, v }));
  }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body><div id='x'></div></body></html>");
  for (const f of ["app/vendor/mermaid.min.js", "app/js/00-core.js", "app/js/20-render.js"]) await page.addScriptTag({ path: path.join(ROOT, f) });
  const results = await page.evaluate(async (items) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    const out = [];
    let n = 0;
    for (const it of items) {
      const srcs = [["целиком", it.v.mermaid]];
      if (Array.isArray(it.v.steps)) for (let k = 1; k < it.v.steps.length; k++) srcs.push([`шаг ${k}`, Visuals.partial(it.v.mermaid, k)]);
      for (const [label, src] of srcs) {
        try { await mermaid.render("chk" + ++n, src); } catch (e) {
          out.push(`${it.where} (${label}): ${String(e && e.message || e).split("\n")[0].slice(0, 200)}`);
          document.querySelectorAll('[id^="dchk"]').forEach((el) => el.remove());
        }
      }
    }
    return { errors: out, rendered: n };
  }, items);
  await browser.close();
  for (const e of results.errors) console.log("  ERROR " + e);
  console.log(`${items.length} схем, ${results.rendered} отрисовок, ${results.errors.length} ошибок`);
  process.exitCode = results.errors.length ? 1 : 0;
})();

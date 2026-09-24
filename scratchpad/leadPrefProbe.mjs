/** Valget slik det faktisk ser ut. Tall og skjermbilder har vært uenige før. */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4591;
const TYPES = { '.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
const server = http.createServer((req,res)=>{
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'index.html';
  const f = path.join(DIST, rel);
  if(!f.startsWith(DIST)||!fs.existsSync(f)||fs.statSync(f).isDirectory()) return void res.writeHead(404).end('x');
  res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});
  res.end(fs.readFileSync(f));
});
await new Promise(r=>server.listen(PORT,r));
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const scheme of ['dark','light']) {
  const ctx = await browser.newContext({ viewport:{width:414,height:900}, deviceScaleFactor:2 });
  const page = await ctx.newPage();
  await page.addInitScript((s)=>{
    localStorage.setItem('__activeProfile','default');
    localStorage.setItem('default::t.theme', s);
  }, scheme);
  await page.goto('http://localhost:'+PORT+'/', { waitUntil:'networkidle' });
  await page.waitForTimeout(700);
  // Valget bor i v-prefs, ikke v-settings — og veien dit går gjennom
  // stasjonsnavnet i toppen og så «innstillinger». (Første utgave gjettet på
  // en #settings-btn som ikke finnes, og meldte «ikke synlig» om et valg som
  // sto der hele tiden.)
  // Uten en valgt rute starter appen på onboarding, så #station-name-btn
  // finnes ikke å klikke på. Skjermen tegnes derfor direkte — det samme
  // `show('v-prefs')` gjør. FORBEHOLDET SAGT HØYT: dette er ikke veien en
  // leser går, så prøven sier noe om hvordan valget SER UT og oppfører seg,
  // ikke om at det er mulig å navigere dit.
  await page.evaluate(()=>{
    window._showPrefs && window._showPrefs();
    document.querySelectorAll('div[id^="v-"]').forEach(e=>{ e.style.display='none'; });
    const v=document.getElementById('v-prefs'); if(v) v.style.display='';
  });
  await page.waitForTimeout(500);
  // SJEKK FØR DU MÅLER.
  const ok = await page.evaluate(()=>{ const g=document.getElementById('pref-lead');
    return !!g && g.offsetHeight>0; });
  console.log('\n══ '+scheme+' ══\n  valget synlig: '+ok);
  if (ok) {
    const info = await page.evaluate(()=>{
      const g=document.getElementById('pref-lead');
      const akt=[...g.querySelectorAll('.pref-btn')].filter(b=>b.classList.contains('active'));
      const r=g.getBoundingClientRect();
      return { knapper:[...g.querySelectorAll('.pref-btn')].map(b=>b.textContent.trim()),
        aktiv: akt.map(b=>b.dataset.val),
        hint: (g.parentElement.querySelector('.set-hint')||{}).textContent,
        // blafrer den? fem knapper på 414 px kan gå i to rader
        hoyde: Math.round(r.height), bredde: Math.round(r.width),
        utenfor: r.right > document.documentElement.clientWidth + 1 };
    });
    console.log('  knapper: '+info.knapper.join(' · '));
    console.log('  aktiv: '+JSON.stringify(info.aktiv)+'  (skal være ["auto"])');
    console.log('  forklaring: '+info.hint);
    console.log('  rad '+info.bredde+'x'+info.hoyde+' · renner utenfor: '+info.utenfor);
    // og at et trykk fester seg
    await page.locator('#pref-lead .pref-btn[data-val="15"]').click();
    await page.waitForTimeout(250);
    console.log('  etter trykk på 15: aktiv='+JSON.stringify(await page.evaluate(()=>
      [...document.querySelectorAll('#pref-lead .pref-btn.active')].map(b=>b.dataset.val)))
      +' · lagret='+await page.evaluate(()=>localStorage.getItem('default::t.lead')));
    await page.locator('#pref-lead').screenshot({ path:'scratchpad/lead-'+scheme+'.png' });
  }
  await ctx.close();
}
await browser.close(); server.close();

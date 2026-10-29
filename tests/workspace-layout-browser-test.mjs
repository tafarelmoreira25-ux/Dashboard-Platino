// Visual fixtures use the real HTML/renderers with Firebase and API traffic blocked.
// Run against a local static server. No production account or database is used.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.LAYOUT_TEST_URL || 'http://127.0.0.1:8765';
const out = new URL('../tmp/layout-qa/', import.meta.url);
mkdirSync(out, { recursive: true });
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const routes = [...html.matchAll(/<section id="section-([^"]+)"/g)].map(match => match[1]);
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {}) });
const results = [];
try {
  const page = await browser.newPage({viewport: {width: 1440,height: 1000}, reducedMotion: 'reduce'});
  await page.route('**/*', async route => {
    const url = route.request().url();
    const tailwind = new URL('tailwind-runtime.js', out);
    if (url.startsWith('https://cdn.tailwindcss.com') && existsSync(tailwind)) return route.fulfill({contentType:'text/javascript',body:readFileSync(tailwind)});
    if (url === base + '/') {
      const body = html.replace(/<script type="module">[\s\S]*?<\/script>/g, '');
      return route.fulfill({contentType:'text/html',body});
    }
    if (url.endsWith('/src/sdr/sdr-module.js')) {
      let body = readFileSync(new URL('../src/sdr/sdr-module.js', import.meta.url), 'utf8');
      body = body.replace(/import \{[\s\S]*?\} from "https:\/\/www.gstatic.com[^;]+;/, 'const onSnapshot=()=>()=>{}, collection=()=>{}, query=()=>{}, where=()=>{}, limit=()=>{};');
      body += `\nwindow.layoutSdrFixture = (view='sdr',step=-1) => {
        state.role='admin'; state.user={uid:'layout-fixture',displayName:'Equipe Platino',email:'fixture@example.invalid'};
        state.profile={}; state.view=view; mount();
        if(step>=0) { saveLocalDraft(emptyLead()); state.step=step; }
        renderAll();
      };`;
      return route.fulfill({contentType:'text/javascript',body});
    }
    if (url.includes('/api/') || url.includes('firebase') || url.includes('googleapis.com/identity')) return route.abort();
    if (!url.startsWith(base + '/') && !url.startsWith('data:')) return route.abort();
    return route.continue();
  });
  await page.goto(base, {waitUntil:'networkidle'});
  // Tailwind must be loaded; screenshots without the actual utility CSS are invalid.
  assert.equal(await page.evaluate(() => {
    const el=document.createElement('div'); el.className='hidden'; document.body.append(el);
    const hidden=getComputedStyle(el).display==='none'; el.remove(); return hidden;
  }), true, 'Tailwind CDN did not load');
  await page.evaluate(() => {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-content').classList.remove('hidden');
    document.querySelectorAll('.gestor-only').forEach(el => el.classList.remove('hidden'));
    window.renderHomeOperationalHub?.();
  });
  await page.waitForFunction(() => Boolean(window.layoutSdrFixture));
  for (const width of [1440,1280,1024,768,390]) {
    await page.setViewportSize({width,height:1000});
    for (const route of routes) {
      await page.evaluate(id => { window.navigateTo(id); document.getElementById('content-viewport').scrollTop=0; }, route);
      if(route==='sdr') await page.evaluate(() => window.layoutSdrFixture());
      await page.waitForTimeout(50);
      const geometry = await page.evaluate(() => {
        const main=document.querySelector('#app-container > main').getBoundingClientRect();
        const viewport=document.getElementById('content-viewport');
        return {mainX:main.x,mainWidth:main.width,bodyWidth:document.documentElement.scrollWidth,
          contentWidth:viewport.clientWidth,contentScrollWidth:viewport.scrollWidth,
          offenders:[...viewport.querySelectorAll('*')].filter(el => {
            const rect=el.getBoundingClientRect(); return rect.width && rect.right>viewport.getBoundingClientRect().right+2 && !el.closest('.overflow-x-auto,.table-scroll,.team-carousel,.sdr-view-tabs,.sdr-stepper,.sdr-shortcuts');
          }).slice(0,8).map(el=>({tag:el.tagName,id:el.id,cls:el.className}))};
      });
      results.push({width,route,...geometry});
      if(width>=768) assert.equal(geometry.mainX,240,`Sidebar offset ${route}/${width}`);
      else assert.equal(geometry.mainX,0);
      assert.ok(geometry.bodyWidth<=width+1,`Page overflow ${route}/${width}`);
      if(['inicio','avisos','perfil','sdr','rh'].includes(route)) await page.screenshot({path:new URL(`${route}-${width}.png`,out).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
    }
    for(const [view,step] of [['sdr',0],['sdr',1],['sdr',2],['sdr',3],['sdr',4],['sdr',5],['sdr',6],['consultant',0],['settings',-1]]) {
      await page.evaluate(([view,step]) => { window.navigateTo('sdr'); window.layoutSdrFixture(view,step); }, [view,step]);
      const overflow=await page.evaluate(() => {const v=document.getElementById('content-viewport');return v.scrollWidth-v.clientWidth;});
      results.push({width,route:`sdr-${view}-${step}`,overflow});
    }
  }
  await page.evaluate(() => { window.navigateTo('inicio'); window.toggleSidebar(true); });
  assert.equal(await page.locator('#sidebar').getAttribute('aria-modal'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[aria-controls="sidebar"]').getAttribute('aria-expanded'),'false');
  assert.ok(await page.locator('#sidebar').evaluate(el=>el.inert));
  await page.locator('#chat-toggle-btn').click();
  assert.equal(await page.locator('#chat-window').getAttribute('aria-hidden'),'false');
  assert.equal(await page.locator('#chat-toggle-btn').getAttribute('aria-expanded'),'true');
  await page.locator('#chat-toggle-btn').click();
  assert.ok(await page.locator('#chat-window').evaluate(el=>el.inert));
  await page.evaluate(() => {
    window.navigateTo('ideias');
    const table=document.createElement('table'); table.id='layout-fixture-table';
    table.innerHTML='<tr><td style="white-space:nowrap">'+ 'Coluna extensa '.repeat(100)+'</td></tr>';
    document.querySelector('#section-ideias > div').append(table);
  });
  await page.waitForSelector('#layout-fixture-table');
  assert.ok(await page.locator('#layout-fixture-table').evaluate(el=>el.parentElement.classList.contains('table-scroll')));
  assert.ok(await page.locator('#layout-fixture-table').evaluate(el=>el.parentElement.scrollWidth>el.parentElement.clientWidth));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#layout-fixture-table').evaluate(el=>el.parentElement.remove());
  // Department accordions remain available after homepage simplification.
  for(const id of ['comercial','adm','juridico']) {
    await page.evaluate(id=>window.navigateTo(id),id);
    const accordion=page.locator(`#section-${id} .procedure-toggle`).first();
    await accordion.click(); assert.equal(await accordion.getAttribute('aria-expanded'),'true');
    await accordion.click(); assert.equal(await accordion.getAttribute('aria-expanded'),'false');
  }
  for(const file of ['apresentacao_platino.html','abertura-de-grupos.html','treinamento-trilho-revisao-contratos.html']) {
    await page.goto(`${base}/${file}`,{waitUntil:'networkidle'});
    for(const width of [1440,1280,1024,768,390]) {
      await page.setViewportSize({width,height:1000});
      await page.waitForTimeout(100);
      const slides=page.locator('.slide-container,.slide');
      for(let index=0;index<await slides.count();index++) {
        // Activate the original slide markup without rewriting its content.
        await page.evaluate(index=>{
          const slides=[...document.querySelectorAll('.slide-container,.slide')];
          slides.forEach((el,i)=>{el.classList.toggle('active',i===index);el.classList.toggle('ativo',i===index);});
          window.scrollTo(0,0);
          document.querySelectorAll('.slide,.slide-container').forEach(el=>el.scrollTop=0);
        },index);
        await page.waitForTimeout(50);
        const geometry=await page.evaluate(()=>({bodyWidth:document.documentElement.scrollWidth,
          contentWidth:innerWidth,contentScrollWidth:document.documentElement.scrollWidth}));
        results.push({width,route:`${file}#${index}`,...geometry});
      }
      if([1440,390].includes(width)) await page.screenshot({path:new URL(`${file}-${width}.png`,out).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
    }
  }
  writeFileSync(new URL('report.json',out),JSON.stringify(results,null,2));
  const overflow=results.filter(row => row.contentScrollWidth>row.contentWidth+2 || row.overflow>2);
  console.log(JSON.stringify({screens:routes,widths:[1440,1280,1024,768,390],checks:results.length,overflow},null,2));
  assert.equal(overflow.length,0,'Content overflows: see tmp/layout-qa/report.json');
} finally { await browser.close(); }

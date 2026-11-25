/**
 * D6.1 interactive browser QA via Chrome CDP (no new deps).
 * STRICTLY_OFFLINE — local app only.
 */
import { writeFileSync } from "node:fs";

const CDP_PORT = 9222;
const EVID = "docs/day6/evidence";
const BASE = "http://127.0.0.1:3000";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      this.ws.send(JSON.stringify(payload));
    });
  }
}

async function main() {
  const ver = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const send = (method, params = {}) => cdp.send(method, params, sessionId);

  await send("Page.enable");
  await send("Runtime.enable");

  const results = [];

  async function goto(url, w = 1280, h = 1000) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: w < 500,
    });
    await send("Page.navigate", { url });
    await sleep(1100);
  }

  async function shot(name) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${EVID}/${name}.png`, Buffer.from(data, "base64"));
  }

  async function ev(expr) {
    const r = await send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails, null, 2));
    }
    return r.result.value;
  }

  // 1 Home
  await goto(`${BASE}/`);
  results.push({
    id: 1,
    name: "home",
    ...(await ev(`({
      brand: document.querySelector('.hero-brand')?.textContent,
      h1: document.querySelector('.hero h1')?.textContent,
      brandOpacity: getComputedStyle(document.querySelector('.hero-brand')).opacity,
      h1Opacity: getComputedStyle(document.querySelector('.hero h1')).opacity,
      h1Color: getComputedStyle(document.querySelector('.hero h1')).color,
      disclaimer: !!document.querySelector('.banner-demo'),
      counts: document.querySelector('.facts-row')?.textContent?.replace(/\\s+/g,' ').trim(),
      skip: !!document.querySelector('a.skip-link, a[href="#main-content"]'),
      nav: [...document.querySelectorAll('.nav a')].map(a=>a.textContent.trim()),
    })`)),
  });
  await shot("10-home-after-animation");

  // 2 Search SEC (form GET)
  await ev(`(() => {
    const input = document.querySelector('#q');
    const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    native.call(input, 'SEC');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('form[role=search]').submit();
    return true;
  })()`);
  await sleep(1200);
  results.push({
    id: 2,
    name: "search-sec",
    ...(await ev(`({
      url: location.href,
      meta: document.querySelector('.results-meta')?.textContent?.replace(/\\s+/g,' ').trim(),
      cards: document.querySelectorAll('.capability-card').length,
      hasSec: [...document.querySelectorAll('.capability-card')].some(c => /SEC/i.test(c.textContent)),
    })`)),
  });
  await shot("11-search-sec-interactive");

  // 3 Category filter
  await goto(`${BASE}/?category=data-analytics`);
  results.push({
    id: 3,
    name: "category-filter",
    ...(await ev(`({
      url: location.href,
      meta: document.querySelector('.results-meta')?.textContent?.replace(/\\s+/g,' ').trim(),
      selectVal: document.querySelector('#category')?.value,
    })`)),
  });

  // 4 Pagination
  await goto(`${BASE}/?page=2`);
  results.push({
    id: 4,
    name: "pagination",
    ...(await ev(`({
      meta: document.querySelector('.results-meta')?.textContent?.replace(/\\s+/g,' ').trim(),
      current: document.querySelector('.pagination .current')?.textContent,
      hasPrev: [...document.querySelectorAll('.pagination a')].some(a => /Previous/.test(a.textContent)),
    })`)),
  });

  // 5 Empty
  await goto(`${BASE}/?q=zzznomatchagentHireXYZ`);
  results.push({
    id: 5,
    name: "empty",
    ...(await ev(`({
      empty: document.querySelector('.empty')?.textContent?.trim(),
      role: document.querySelector('.empty')?.getAttribute('role'),
    })`)),
  });

  // 6 Categories
  await goto(`${BASE}/categories`);
  results.push({
    id: 6,
    name: "categories",
    ...(await ev(`({
      h1: document.querySelector('h1')?.textContent,
      links: document.querySelectorAll('.category-link').length,
    })`)),
  });
  await shot("12-categories");

  // 7 Category detail
  await goto(`${BASE}/categories/research-intelligence`);
  results.push({
    id: 7,
    name: "category-detail",
    ...(await ev(`({
      h1: document.querySelector('h1')?.textContent,
      cards: document.querySelectorAll('.capability-card').length,
      pagination: !!document.querySelector('.pagination'),
    })`)),
  });

  // 8 SEC detail
  await goto(`${BASE}/capabilities/cap%3A79da211975c2`);
  results.push({
    id: 8,
    name: "sec-detail",
    ...(await ev(`({
      h1: document.querySelector('h1')?.textContent,
      chips: [...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()),
      tryDemo: document.querySelector('a.btn')?.textContent?.trim(),
      unknowns: (document.body.innerText.match(/\\bUnknown\\b/g)||[]).length,
    })`)),
  });
  await shot("13-sec-detail-interactive");

  // 9 Non-SEC blocked
  await goto(
    `${BASE}/capabilities/${encodeURIComponent("agenthire:planned:wallet-activity-summary@1.0")}`,
  );
  results.push({
    id: 9,
    name: "nonsec-blocked",
    ...(await ev(`({
      h1: document.querySelector('h1')?.textContent,
      disabledHire: document.querySelector('button.btn[disabled]')?.textContent?.trim(),
      callout: document.querySelector('.callout.danger')?.textContent?.trim(),
    })`)),
  });
  await shot("14-nonsec-blocked");

  // 10 Hire console load
  await goto(`${BASE}/hire/cap%3A79da211975c2`);
  results.push({
    id: 10,
    name: "hire-load",
    ...(await ev(`({
      title: document.querySelector('h2')?.textContent,
      createDisabled: [...document.querySelectorAll('button')].find(b=>/Create HireJob/.test(b.textContent))?.disabled,
      validateDisabled: [...document.querySelectorAll('button')].find(b=>/Validate input/.test(b.textContent))?.disabled,
    })`)),
  });

  // 11 Validate + create job
  results.push({
    id: 11,
    name: "validate-create-job",
    ...(await ev(`(async () => {
      const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      const value = document.querySelector('#hire-value');
      const btn = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.textContent));
      native.call(value, '   ');
      value.dispatchEvent(new Event('input', { bubbles: true }));
      btn(/Validate input/).click();
      await new Promise(r => setTimeout(r, 900));
      const err1 = document.querySelector('[role=alert], .callout.danger')?.textContent || null;
      native.call(value, 'AAPL');
      value.dispatchEvent(new Event('input', { bubbles: true }));
      btn(/Validate input/).click();
      await new Promise(r => setTimeout(r, 1000));
      const configured = document.body.innerText.includes('configured:');
      const createDisabled = btn(/Create HireJob/)?.disabled;
      btn(/Create HireJob/).click();
      await new Promise(r => setTimeout(r, 1200));
      return {
        err1,
        configured,
        createDisabledBeforeCreate: createDisabled,
        jobVisible: document.body.innerText.includes('hireJobId'),
        quoteUnavailable: /Live quote unavailable/i.test(document.body.innerText),
        paidFalse: /paidVerified[\\s\\S]{0,30}false/.test(document.body.innerText),
      };
    })()`)),
  });
  await shot("15-hire-after-job");

  // 12 Quote + approve + modified fingerprint
  results.push({
    id: 12,
    name: "quote-approve",
    ...(await ev(`(async () => {
      const btn = (re) => {
        const b = [...document.querySelectorAll('button')].find(x => re.test(x.textContent));
        if (!b) throw new Error('missing ' + re);
        b.click();
      };
      btn(/Reveal synthetic quote/);
      await new Promise(r => setTimeout(r, 900));
      const synth = /SYNTHETIC quote/i.test(document.body.innerText);
      btn(/Simulation approve/);
      await new Promise(r => setTimeout(r, 900));
      const approved = /approval\\.state=simulationApproved/.test(document.body.innerText);
      const noExec = /executionAuthorization=false/.test(document.body.innerText);
      const noPay = /paymentExecutionAuthorization=false/.test(document.body.innerText);
      btn(/Try modified fingerprint/);
      await new Promise(r => setTimeout(r, 900));
      const mod = /modified-binding approve ok=false/.test(document.body.innerText);
      return { synth, approved, noExec, noPay, mod };
    })()`)),
  });
  await shot("16-hire-after-approve");

  // 13 Fixture + banner
  results.push({
    id: 13,
    name: "fixture-banner",
    ...(await ev(`(async () => {
      [...document.querySelectorAll('button')].find(b=>/Run fixture/.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 1200));
      return {
        banner: document.querySelector('.sim-banner')?.textContent?.trim() || null,
        providerVerifiedFalse: /providerExecutionVerified=false/.test(document.body.innerText),
        hasPayload: !!document.querySelector('pre.mono'),
      };
    })()`)),
  });
  await shot("17-hire-fixture-banner");

  // 14 How / demo / blocked hire / not-found
  await goto(`${BASE}/how-it-works`);
  results.push({
    id: 14,
    name: "how-it-works",
    ...(await ev(`({
      h1: document.querySelector('h1')?.textContent,
      notReady: /not ready to hire/i.test(document.body.innerText),
    })`)),
  });

  await goto(`${BASE}/demo`);
  results.push({
    id: "14b",
    name: "demo",
    ...(await ev(`({
      h1: document.querySelector('h1')?.textContent,
      hasSim: /SIMULATED RESULT/.test(document.body.innerText),
    })`)),
  });

  await goto(
    `${BASE}/hire/${encodeURIComponent("agenthire:planned:wallet-activity-summary@1.0")}`,
  );
  results.push({
    id: "14c",
    name: "hire-blocked-route",
    ...(await ev(`({
      callout: document.querySelector('.callout.danger')?.textContent?.trim(),
      generic: /No generic executor/.test(document.body.innerText),
    })`)),
  });
  await shot("18-hire-blocked");

  await goto(`${BASE}/capabilities/cap%3Adoes-not-exist-zzzz`);
  results.push({
    id: "14d",
    name: "not-found",
    ...(await ev(`({
      title: document.querySelector('h1')?.textContent,
      main: !!document.querySelector('main'),
      body: document.body.innerText.slice(0, 240),
    })`)),
  });
  await shot("19-not-found");

  // Mobile + focus
  await goto(`${BASE}/`, 390, 844);
  await sleep(800);
  await shot("20-home-mobile-post-animation");
  results.push({
    id: "mobile",
    name: "mobile-home",
    ...(await ev(`({
      brandOpacity: getComputedStyle(document.querySelector('.hero-brand')).opacity,
      headerFlex: getComputedStyle(document.querySelector('.site-header-inner')).flexDirection,
      searchCols: getComputedStyle(document.querySelector('.search-row')).gridTemplateColumns,
    })`)),
  });

  await goto(`${BASE}/`);
  results.push({
    id: "a11y",
    name: "focus-styles",
    ...(await ev(`(() => {
      const btn = document.querySelector('button[type=submit]');
      btn.focus();
      const cs = getComputedStyle(btn);
      return { outline: cs.outline, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    })()`)),
  });

  writeFileSync(`${EVID}/qa-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

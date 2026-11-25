/**
 * D6.1 extended browser QA — representative capabilities + PO findings.
 * Chrome CDP only; no new deps. STRICTLY_OFFLINE / localhost.
 */
import { writeFileSync } from "node:fs";

const CDP_PORT = 9222;
const EVID = "docs/day6/evidence";
const BASE = "http://127.0.0.1:3000";

const CAPS = {
  mainnet: "cap:00939f16e744", // Agent402 Base Mainnet URL-named
  sepolia: "cap:7b2e5a7406dd", // QuantJourney MCP Base Sepolia
  weak: "cap:00afcd5ae140", // weak URL-as-name Agent402
  documented: "cap:34b6cb6beba6", // openapi-lint advertised (not L1)
  sec: "cap:79da211975c2",
};

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
    await sleep(1200);
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
      throw new Error(JSON.stringify(r.exceptionDetails));
    }
    return r.result?.value;
  }

  // --- Discover vs Categories (PO #1) ---
  await goto(`${BASE}/`);
  await shot("30-discover-home");
  const discover = await ev(`({
    h1: document.querySelector('h1')?.textContent,
    categoryLinks: [...document.querySelectorAll('.category-link')].map(a => a.textContent.trim().replace(/\\s+/g,' ')),
    cards: document.querySelectorAll('.capability-card').length,
    search: !!document.querySelector('form'),
    skip: !!document.querySelector('.skip-link'),
    networkTags: [...document.querySelectorAll('.capability-card .tag')].slice(0,12).map(t=>t.textContent)
  })`);
  results.push({ id: "po1-discover", ...discover });

  await goto(`${BASE}/categories`);
  await shot("31-categories-index");
  const categories = await ev(`({
    h1: document.querySelector('h1')?.textContent,
    categoryLinks: [...document.querySelectorAll('.category-link')].map(a => a.textContent.trim().replace(/\\s+/g,' ')),
    cards: document.querySelectorAll('.capability-card').length,
    search: !!document.querySelector('form')
  })`);
  results.push({ id: "po1-categories", ...categories });

  // --- Search (PO #2) ---
  await goto(`${BASE}/?q=Agent402`);
  await shot("32-search-agent402");
  const search = await ev(`({
    meta: document.querySelector('.results-meta')?.textContent?.trim(),
    cards: document.querySelectorAll('.capability-card').length,
    hasNetworkMainnet: document.body.innerText.includes('Base Mainnet'),
    placeholder: document.querySelector('input[name="q"]')?.placeholder || document.querySelector('input[type="search"]')?.placeholder || null
  })`);
  results.push({ id: "po2-search", ...search });

  // --- Representative capability details ---
  for (const [key, id] of Object.entries(CAPS)) {
    await goto(`${BASE}/capabilities/${encodeURIComponent(id)}`);
    await shot(`33-${key}-detail`);
    const detail = await ev(`({
      key: ${JSON.stringify(key)},
      id: ${JSON.stringify(id)},
      h1: document.querySelector('h1')?.textContent,
      chips: [...document.querySelectorAll('.facts-row .chip')].map(c=>c.textContent.trim()),
      unknowns: (document.body.innerText.match(/Unknown/g)||[]).length,
      hireDisabled: !!document.querySelector('button[disabled]'),
      tryDemo: document.querySelector('a.btn')?.textContent?.trim() || null,
      networkChip: [...document.querySelectorAll('.facts-row .chip')].some(c=>/Base |External|AgentHire|Network/.test(c.textContent)),
      bodyHasSimClaim: /verified live|payment completed|ready to hire/i.test(document.body.innerText)
    })`);
    results.push({ id: `cap-${key}`, ...detail });
  }

  // --- SEC hire console guidance + stale invalidation (PO #7 + Task D) ---
  await goto(`${BASE}/hire/${encodeURIComponent(CAPS.sec)}`);
  await shot("34-hire-guidance");
  const hireLoad = await ev(`({
    guidance: !!document.querySelector('[data-testid="hire-task-guidance"]'),
    guidanceText: document.querySelector('[data-testid="hire-task-guidance"]')?.textContent?.slice(0,180),
    valueHint: document.querySelector('#hire-value-hint')?.textContent,
    createDisabled: document.querySelector('button') && [...document.querySelectorAll('button')].find(b=>/Create HireJob/.test(b.textContent))?.disabled
  })`);
  results.push({ id: "hire-guidance", ...hireLoad });

  // validate AAPL → create → synth → approve → reconfigure MSFT → session cleared
  await ev(`(() => {
    const input = document.querySelector('#hire-value');
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSet.call(input, 'AAPL');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await ev(`([...document.querySelectorAll('button')].find(b=>/Validate input/.test(b.textContent)).click())`);
  await sleep(700);
  await ev(`([...document.querySelectorAll('button')].find(b=>/Create HireJob/.test(b.textContent)).click())`);
  await sleep(700);
  await ev(`([...document.querySelectorAll('button')].find(b=>/Reveal synthetic quote/.test(b.textContent)).click())`);
  await sleep(700);
  await ev(`([...document.querySelectorAll('button')].find(b=>/^Simulation approve$/.test(b.textContent)).click())`);
  await sleep(700);
  const afterApprove = await ev(`({
    feedback: document.querySelector('[data-testid="hire-action-feedback"]')?.textContent,
    approval: document.body.innerText.includes('simulationApproved'),
    execFalse: document.body.innerText.includes('executionAuthorization=false'),
    payFalse: document.body.innerText.includes('paymentExecutionAuthorization=false')
  })`);
  results.push({ id: "hire-approve", ...afterApprove });

  await ev(`(() => {
    const input = document.querySelector('#hire-value');
    const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSet.call(input, 'MSFT');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await ev(`([...document.querySelectorAll('button')].find(b=>/Validate input/.test(b.textContent)).click())`);
  await sleep(800);
  const afterReconfig = await ev(`({
    feedback: document.querySelector('[data-testid="hire-action-feedback"]')?.textContent,
    noApprovalState: !document.body.innerText.includes('approval.state=simulationApproved'),
    configuredMsft: document.body.innerText.includes('MSFT')
  })`);
  results.push({ id: "hire-stale-invalidate", ...afterReconfig });
  await shot("35-hire-after-reconfig");

  // fixture banner
  await ev(`([...document.querySelectorAll('button')].find(b=>/Run fixture/.test(b.textContent)).click())`);
  await sleep(900);
  const fixture = await ev(`({
    banner: document.querySelector('.sim-banner')?.textContent?.trim(),
    verifiedFalse: document.body.innerText.includes('providerExecutionVerified=false')
  })`);
  results.push({ id: "hire-fixture", ...fixture });
  await shot("36-hire-fixture-banner");

  // mobile discover
  await goto(`${BASE}/`, 390, 844);
  await sleep(800);
  await shot("37-home-mobile");
  const mobile = await ev(`({
    headerFlex: getComputedStyle(document.querySelector('.site-header-inner')).flexDirection,
    brand: document.querySelector('.hero-brand')?.textContent
  })`);
  results.push({ id: "mobile", ...mobile });

  // a11y: skip + focus-visible
  await goto(`${BASE}/`);
  const a11y = await ev(`({
    skipHref: document.querySelector('.skip-link')?.getAttribute('href'),
    mainId: document.querySelector('main')?.id,
    focusCss: (() => {
      const el = document.querySelector('a.site-logo, .site-header a');
      if (!el) return null;
      el.focus();
      const cs = getComputedStyle(el);
      return { outline: cs.outline, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    })()
  })`);
  results.push({ id: "a11y", ...a11y });

  writeFileSync(`${EVID}/qa-results-extend.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

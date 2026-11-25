/**
 * D7.1 browser QA via Chrome CDP (no new deps).
 * STRICTLY_OFFLINE — local app only.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const CDP_PORT = 9222;
const EVID = "docs/day7/evidence";
const BASE = "http://127.0.0.1:3000";

mkdirSync(EVID, { recursive: true });

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

  async function goto(url, w = 1280, h = 1100) {
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
      throw new Error(JSON.stringify(r.exceptionDetails, null, 2));
    }
    return r.result.value;
  }

  // 1 Discover home (agent-first)
  await goto(`${BASE}/`);
  results.push({
    id: 1,
    name: "discover-home",
    ...(await ev(`({
      brand: document.querySelector('.hero-brand')?.textContent,
      h1: document.querySelector('.hero h1')?.textContent,
      prompt: document.querySelector('label[for=q] strong')?.textContent,
      nav: [...document.querySelectorAll('.nav a')].map(a=>a.textContent.trim()),
      agentCards: document.querySelectorAll('.agent-card').length,
      networkFilter: !!document.querySelector('#network'),
      listingFilter: !!document.querySelector('#listing'),
      footer: document.querySelector('.site-footer')?.textContent?.trim(),
    })`)),
  });
  await shot("01-discover-home");

  // 2 Network filter Base Sepolia
  await goto(`${BASE}/?network=base-sepolia&listing=all`);
  results.push({
    id: 2,
    name: "network-sepolia",
    ...(await ev(`({
      url: location.href,
      agentNames: [...document.querySelectorAll('.agent-card h3')].map(h=>h.textContent.trim()),
      labels: [...document.querySelectorAll('.agent-card .tag')].slice(0,6).map(t=>t.textContent.trim()),
    })`)),
  });
  await shot("02-network-sepolia");

  // 3 Network filter Base Mainnet
  await goto(`${BASE}/?network=base-mainnet&listing=curated`);
  results.push({
    id: 3,
    name: "network-mainnet-curated",
    ...(await ev(`({
      agentNames: [...document.querySelectorAll('.agent-card h3')].map(h=>h.textContent.trim()),
      agentCount: document.querySelectorAll('.agent-card').length,
    })`)),
  });
  await shot("03-network-mainnet-curated");

  // 4 Search SEC identity
  await goto(`${BASE}/?q=${encodeURIComponent("Find company SEC identity")}&listing=all`);
  results.push({
    id: 4,
    name: "search-sec",
    ...(await ev(`({
      agentNames: [...document.querySelectorAll('.agent-card h3')].map(h=>h.textContent.trim()),
      explanations: [...document.querySelectorAll('[data-testid=match-explanation]')].map(e=>e.textContent.trim()),
      hasSecLink: [...document.querySelectorAll('a')].some(a=>a.href.includes('cap:79da211975c2')),
    })`)),
  });
  await shot("04-search-sec");

  // 5 Categories taxonomy hub (not duplicate discover)
  await goto(`${BASE}/categories`);
  results.push({
    id: 5,
    name: "categories-hub",
    ...(await ev(`({
      h1: document.querySelector('.hero h1')?.textContent,
      lede: document.querySelector('.hero .lede')?.textContent?.slice(0,160),
      categoryLinks: document.querySelectorAll('.category-link').length,
      hasAgentCards: document.querySelectorAll('.agent-card').length,
      mentionsTaxonomy: (document.body.innerText||'').includes('Taxonomy'),
    })`)),
  });
  await shot("05-categories-hub");

  // 6 Category agent listing
  await goto(`${BASE}/categories/research-intelligence?listing=curated`);
  results.push({
    id: 6,
    name: "category-agents",
    ...(await ev(`({
      h1: document.querySelector('.hero h1')?.textContent,
      agentCards: document.querySelectorAll('.agent-card').length,
    })`)),
  });
  await shot("06-category-agents");

  // 7 Agents directory
  await goto(`${BASE}/agents?listing=all`);
  results.push({
    id: 7,
    name: "agents-directory",
    ...(await ev(`({
      h1: document.querySelector('.hero h1')?.textContent,
      agentCards: document.querySelectorAll('.agent-card').length,
    })`)),
  });
  await shot("07-agents-directory");

  // 8 Discovery QuantJourney profile (unregistered)
  await goto(`${BASE}/agents/${encodeURIComponent("agent:external:1589ec8e8059")}`);
  results.push({
    id: 8,
    name: "agent-qj-discovery",
    ...(await ev(`({
      h1: document.querySelector('.hero h1')?.textContent,
      linkage: [...document.querySelectorAll('.callout')].map(c=>c.textContent.trim().slice(0,120)),
      hasSec: (document.body.innerText||'').includes('cap:79da211975c2') || [...document.querySelectorAll('a')].some(a=>a.href.includes('79da211975c2')),
      registeredChip: [...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()),
    })`)),
  });
  await shot("08-agent-qj-discovery");

  // 9 Registered QuantJourney Sepolia profile (no SEC merge)
  await goto(
    `${BASE}/agents/${encodeURIComponent("agent:eip155:84532/0x8004A818BFB912233c491871b3d84c89A494BD9e/9136")}`,
  );
  results.push({
    id: 9,
    name: "agent-qj-registered",
    ...(await ev(`({
      h1: document.querySelector('.hero h1')?.textContent,
      network: [...document.querySelectorAll('.chip')].map(c=>c.textContent.trim()),
      hasSecHire: [...document.querySelectorAll('a')].some(a=>a.href.includes('/hire/') && a.href.includes('79da211975c2')),
      incompleteSection: (document.body.innerText||'').includes('incomplete'),
    })`)),
  });
  await shot("09-agent-qj-registered");

  // 10 Capability SEC detail
  await goto(`${BASE}/capabilities/${encodeURIComponent("cap:79da211975c2")}`);
  results.push({
    id: 10,
    name: "capability-sec",
    ...(await ev(`({
      h1: document.querySelector('.hero h1')?.textContent,
      parentAgent: [...document.querySelectorAll('a')].find(a=>a.href.includes('/agents/'))?.textContent?.trim(),
      hireCta: [...document.querySelectorAll('a.btn')].map(a=>a.textContent.trim()),
      notInspected: (document.body.innerText||'').includes('Not inspected yet'),
    })`)),
  });
  await shot("10-capability-sec");

  // 11 Unsupported hire unavailable
  await goto(`${BASE}/hire/${encodeURIComponent("cap:00939f16e744")}`);
  results.push({
    id: 11,
    name: "hire-unavailable",
    ...(await ev(`({
      heading: document.querySelector('#hire-console-heading')?.textContent,
      danger: document.querySelector('.callout.danger')?.textContent?.slice(0,160),
    })`)),
  });
  await shot("11-hire-unavailable");

  // 12 Guided hire SEC — steps + fixture
  await goto(`${BASE}/hire/${encodeURIComponent("cap:79da211975c2")}`);
  results.push({
    id: 12,
    name: "hire-guided-initial",
    ...(await ev(`({
      steps: [...document.querySelectorAll('.hire-steps li')].map(li=>li.textContent.trim()),
      guidance: document.querySelector('[data-testid=hire-task-guidance]')?.textContent?.includes('Task:'),
    })`)),
  });
  await shot("12-hire-guided-initial");

  await ev(`(() => {
    const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    const input = document.querySelector('#hire-value');
    native.call(input, 'AAPL');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  // Validate input
  await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Validate input'));
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(700);
  await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create HireJob'));
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(700);
  await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Reveal synthetic quote'));
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(700);
  await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Simulation approve'));
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(700);
  await ev(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Run fixture'));
    btn?.click();
    return Boolean(btn);
  })()`);
  await sleep(900);
  results.push({
    id: 13,
    name: "hire-guided-after-fixture",
    ...(await ev(`({
      banner: document.querySelector('.sim-banner')?.textContent?.trim(),
      feedback: document.querySelector('[data-testid=hire-action-feedback]')?.textContent?.trim(),
      stepActive: document.querySelector('.hire-steps li.active')?.textContent?.trim(),
    })`)),
  });
  await shot("13-hire-guided-after-fixture");

  // 14 Mobile discover
  await goto(`${BASE}/`, 390, 844);
  results.push({
    id: 14,
    name: "discover-mobile",
    ...(await ev(`({
      brand: document.querySelector('.hero-brand')?.textContent,
      agentCards: document.querySelectorAll('.agent-card').length,
      width: window.innerWidth,
    })`)),
  });
  await shot("14-discover-mobile");

  // 15 Incomplete listing scope
  await goto(`${BASE}/?listing=incomplete&network=base-mainnet`);
  results.push({
    id: 15,
    name: "listing-incomplete-mainnet",
    ...(await ev(`({
      agentCards: document.querySelectorAll('.agent-card').length,
      bodyHasIncomplete: (document.body.innerText||'').toLowerCase().includes('incomplete'),
    })`)),
  });
  await shot("15-listing-incomplete-mainnet");

  writeFileSync(`${EVID}/qa-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

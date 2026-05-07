#!/usr/bin/env node
// TradingAgentsLab — Clawless / OpenClaw gateway probe (v3, real protocol)
//
// Run with:  node --env-file=.env tools/clawless-probe.mjs
//
// Protocol: type=req frames with method+params, type=res frames with ok+payload.
// `connect` is the first request, `health` is a follow-up sanity check.
// Reference: openclaw scripts/dev/gateway-smoke.ts (operator role + token auth).

const URL = process.env.CLAWLESS_GATEWAY_URL || 'ws://127.0.0.1:18789';
const TOKEN = process.env.CLAWLESS_GATEWAY_TOKEN;

if (!TOKEN) {
  console.error('FAIL: CLAWLESS_GATEWAY_TOKEN missing');
  process.exit(2);
}

const TOKEN_REDACTED = `${TOKEN.slice(0, 4)}...${TOKEN.slice(-4)}`;
const redact = (s) => s.replaceAll(TOKEN, TOKEN_REDACTED);
const log = (label, obj) => console.log(label, redact(JSON.stringify(obj, null, 2)));

const ws = new WebSocket(URL);
let seq = 0;
const newId = () => `tal-${++seq}-${Date.now().toString(36)}`;
const pending = new Map();

const overall = setTimeout(() => {
  console.error('[probe] FAIL — overall timeout (15s)');
  ws.close();
  process.exit(3);
}, 15000);

function request(method, params = {}, timeoutMs = 5000) {
  const id = newId();
  const frame = { type: 'req', id, method, params };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout waiting for ${method} (#${id})`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer, method });
    log(`[probe] >>> req ${method} #${id}:`, frame);
    ws.send(JSON.stringify(frame));
  });
}

ws.addEventListener('message', (ev) => {
  let msg;
  try { msg = JSON.parse(ev.data); } catch { console.log('[probe] <<< (non-JSON)', ev.data); return; }

  if (msg.type === 'event') {
    if (msg.event === 'connect.challenge') {
      console.log('[probe] <<< event connect.challenge (token-auth ignores; logging for visibility)');
    } else {
      log('[probe] <<< event:', msg);
    }
    return;
  }

  if (msg.type === 'res' && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(p.timer);
    log(`[probe] <<< res #${msg.id} (${p.method}):`, msg);
    msg.ok ? p.resolve(msg) : p.reject(new Error(`${p.method} failed: ${JSON.stringify(msg.error)}`));
    return;
  }

  log('[probe] <<< (unhandled):', msg);
});

ws.addEventListener('error', (ev) => console.error('[probe] socket error:', ev.message || ev.type));
ws.addEventListener('close', (ev) => {
  if (ev.code !== 1000 && ev.code !== 1005) {
    console.error(`[probe] socket closed unexpectedly — code=${ev.code} reason=${ev.reason || '(none)'}`);
  }
});

ws.addEventListener('open', async () => {
  console.log(`[probe] socket open at ${URL}`);
  const start = Date.now();

  try {
    const connectRes = await request('connect', {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'cli',
        version: '0.0.1',
        platform: 'node',
        mode: 'ui',
      },
      role: 'operator',
      scopes: ['operator.read'],
      caps: [],
      commands: [],
      permissions: {},
      auth: { token: TOKEN },
      locale: 'en-US',
      userAgent: 'tradingagentslab-probe/0.0.1',
    });

    console.log('\n[probe] ✓ CONNECT OK');

    const healthRes = await request('health');
    console.log('\n[probe] ✓ HEALTH OK');

    const totalMs = Date.now() - start;
    console.log(`\n[probe] DONE in ${totalMs}ms — multi-client gateway access CONFIRMED`);
    console.log('[probe] Summary:');
    console.log(`        - WebSocket reachable from external process: YES`);
    console.log(`        - Token auth via 'connect' req: WORKS`);
    console.log(`        - 'health' RPC callable: YES`);
    console.log(`        - Clawless desktop is unaffected: assumed (verify by clicking around in Clawless)`);

    clearTimeout(overall);
    ws.close(1000);
    process.exit(0);
  } catch (e) {
    console.error('\n[probe] FAIL —', e.message);
    clearTimeout(overall);
    ws.close();
    process.exit(4);
  }
});

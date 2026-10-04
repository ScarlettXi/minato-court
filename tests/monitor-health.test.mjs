import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {registerHooks} from 'node:module';
import test from 'node:test';
const runtime='data:text/javascript,export const env = {};';
registerHooks({resolve(specifier,context,next){
  if(specifier==='cloudflare:workers')return {url:runtime,shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);
  return next(specifier,context);
}});
const {env}=await import(runtime);
const {cleanHealth,courtFreshness,readHealth}=await import('../lib/monitor-health.ts');
const {fetchDashboard}=await import('../lib/dashboard-fetch.ts');
const {POST}=await import('../app/api/monitor-health/route.ts');
const now=Date.now();
const snapshot=()=>({perCourt:{shiba:{lastSuccessAt:new Date(now).toISOString(),consecutiveFailures:0,status:'healthy'}},lastEndToEndSuccessAt:new Date(now).toISOString(),officialBlocks:[],status:'healthy',telegramStatus:'not_needed'});

test('health has a bounded allowlist and cannot carry tokens, unselected courts or future evidence',()=>{
  const input=snapshot();input.token='do-not-store';input.perCourt.azabu=input.perCourt.shiba;
  const result=cleanHealth(input,['shiba'],now);
  assert.equal(result.token,undefined);assert.equal(result.perCourt.azabu,undefined);
  input.lastEndToEndSuccessAt=new Date(now+120_000).toISOString();
  assert.throws(()=>cleanHealth(input,['shiba'],now));
});
test('pause is not a failure; blocked, unknown, failed and stale are not healthy',()=>{
  const h=snapshot();
  assert.equal(courtFreshness(h,'shiba',null,true,now),'healthy');
  assert.equal(courtFreshness(h,'shiba',null,true,now+600_001),'stale');
  assert.equal(courtFreshness(h,'shiba',null,false,now+600_001),'paused');
  h.perCourt.shiba.status='blocked';assert.equal(courtFreshness(h,'shiba',null,true,now),'blocked');
  h.perCourt.shiba.status='error';assert.equal(courtFreshness(h,'shiba',null,true,now),'partial');
  assert.equal(courtFreshness(null,'shiba',null,true,now),'unknown');
});
test('only read requests recover automatically, transient retries are bounded, auth never retries',async()=>{
  let calls=0;const waits=[];
  let response=await fetchDashboard(async(path,options)=>{assert.equal(path,'/api/dashboard');assert.equal(options.method,undefined);return new Response('',{status:++calls<3?503:200});},async ms=>waits.push(ms));
  assert.equal(response.status,200);assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);
  calls=0;await fetchDashboard(async()=>{calls++;return new Response('',{status:401});},async()=>{});assert.equal(calls,1);
  calls=0;await assert.rejects(fetchDashboard(async()=>{calls++;throw new Error('offline');},async()=>{}));assert.equal(calls,3);
});
test('health endpoint uses existing monitor auth, writes only tenant health and preserves records',async()=>{
  const raw=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())raw.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  env.MONITOR_INGEST_KEY='test-only';
  env.DB={prepare(sql){let values=[];const query={bind(...v){values=v;return query;},async first(){return raw.prepare(sql).get(...values)??null;},async run(){return raw.prepare(sql).run(...values);}};return query;}};
  raw.prepare('INSERT INTO watch_settings(user_id,start_date,end_date,selected_court_keys) VALUES(?,?,?,?)').run('owner','2026-10-02','2026-10-02','["shiba"]');
  const before=raw.prepare('SELECT * FROM watch_settings').get();
  const send=(body,key='test-only')=>POST(new Request('https://example.test/api/monitor-health',{method:'POST',headers:{'x-monitor-key':key},body:JSON.stringify(body)}));
  try {
    assert.equal((await send({health:snapshot()},'wrong')).status,401);
    assert.equal((await send({userId:'missing',health:snapshot()})).status,404);
    assert.equal((await send({health:snapshot()})).status,200);
    const health=await readHealth(env.DB,'owner');assert.equal(health.status,'healthy');assert.ok(health.reportedAt);
    assert.equal(await readHealth(env.DB,'someone-else'),null);
    assert.deepEqual(raw.prepare('SELECT * FROM watch_settings').get(),before);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM booking_requests').get().n,0);
  } finally {raw.close();delete env.DB;delete env.MONITOR_INGEST_KEY;}
});

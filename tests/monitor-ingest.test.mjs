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
const {POST,GET}=await import('../app/api/monitor-ingest/route.ts');
const {cleanHealth,slotIsFresh}=await import('../lib/monitor-health.ts');
const window={startDate:'2099-01-01',endDate:'2099-01-07'};
const slot=(day='2099-01-02')=>({courtKey:'shiba',slotDate:day,startTime:'17:00',endTime:'19:00',sourceUrl:'https://example.test/',reservationType:'first_come'});

function setup(){
  const raw=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())raw.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const prepare=sql=>{let values=[];const q={bind(...v){values=v;return q;},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){return raw.prepare(sql).run(...values);}};return q;};
  env.DB={prepare,async batch(queries){raw.exec('BEGIN');try{const result=[];for(const q of queries)result.push(await q.run());raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}};
  env.MONITOR_INGEST_KEY='test-only';
  const send=(body,key='test-only')=>POST(new Request('https://example.test/api/monitor-ingest',{method:'POST',headers:{'x-monitor-key':key},body:JSON.stringify(body)}));
  const close=()=>{raw.close();delete env.DB;delete env.MONITOR_INGEST_KEY;};
  return {raw,send,close};
}

test('date-scoped empty results expire only checked court/date/type/account, preserving bookings',async()=>{
  const {raw,send,close}=setup();
  try{
    assert.equal((await send({checkedCourts:['shiba'],slots:[slot(),slot('2099-02-01')]})).status,200);
    // A different account and an unscanned lottery observation must be preserved.
    raw.exec(`INSERT INTO availability_slots(id,user_id,court_key,court_name,slot_date,start_time,end_time,reservation_type,status,source_url)
      VALUES('other','other','shiba','Shiba','2099-01-02','17:00','19:00','first_come','available','https://example.test/'),
      ('lottery','owner','shiba','Shiba','2099-01-03','17:00','19:00','lottery','lottery_open','https://example.test/');`);
    raw.exec(`INSERT INTO booking_requests(id,user_id,slot_id,status) VALUES('request','owner','shiba:2099-01-02:17:00:19:00','pending')`);
    assert.equal((await send({checkedCourts:['shiba'],slots:[],scanWindow:window})).status,200);
    const rows=raw.prepare('SELECT id,status FROM availability_slots ORDER BY id').all();
    assert.equal(rows.find(r=>r.id==='shiba:2099-01-02:17:00:19:00').status,'expired');
    assert.equal(rows.find(r=>r.id==='shiba:2099-02-01:17:00:19:00').status,'available');
    assert.equal(rows.find(r=>r.id==='other').status,'available');
    assert.equal(rows.find(r=>r.id==='lottery').status,'lottery_open');
    assert.equal(raw.prepare("SELECT status FROM booking_requests WHERE id='request'").get().status,'pending');
  }finally{close();}
});

test('invalid windows, dates, auth and paused monitoring cannot destroy previous observations',async()=>{
  const {raw,send,close}=setup();
  try{
    await send({checkedCourts:['shiba'],slots:[slot()]});
    for(const scanWindow of [{...window,startDate:'2099-02-30'},{...window,endDate:'2099-02-01'},{...window,startDate:'2099-01-08'},null]){
      assert.equal((await send({checkedCourts:['shiba'],slots:[],scanWindow})).status,400);
    }
    assert.equal((await send({checkedCourts:['shiba'],slots:[slot('2099-02-01')],scanWindow:window})).status,400);
    assert.equal((await send({checkedCourts:['shiba'],slots:[{...slot(),reservationType:'lottery'}],scanWindow:window})).status,400);
    assert.equal((await send({checkedCourts:['shiba'],slots:[],scanWindow:window},'wrong')).status,401);
    raw.exec("UPDATE watch_settings SET active=0 WHERE user_id='owner'");
    assert.equal((await send({checkedCourts:['shiba'],slots:[],scanWindow:window})).status,409);
    assert.equal(raw.prepare('SELECT status FROM availability_slots').get().status,'available');
  }finally{close();}
});

test('scanner requires advertised date-scope protocol and reads back tenant health',async()=>{
  const {send,close}=setup();
  try{
    await send({checkedCourts:[],slots:[]});
    const response=await GET(new Request('https://example.test/api/monitor-ingest',{headers:{'x-monitor-key':'test-only'}}));
    const body=await response.json();
    assert.equal(response.status,200);assert.equal(body.protocolVersion,2);assert.equal(body.userId,'owner');assert.equal(body.health,null);
  }finally{close();}
});

test('a recent court scan does not make stale or out-of-window slots fresh',()=>{
  const now=Date.parse('2099-01-01T00:00:00Z');
  const health=cleanHealth({perCourt:{shiba:{status:'healthy',lastSuccessAt:new Date(now).toISOString(),consecutiveFailures:0,scanWindow:window}},status:'healthy'},['shiba'],now);
  const current={court_key:'shiba',slot_date:'2099-01-02',reservation_type:'first_come',last_seen_at:'2099-01-01 00:00:00'};
  assert.equal(slotIsFresh(current,health,'healthy',now),true);
  assert.equal(slotIsFresh({...current,slot_date:'2099-02-01'},health,'healthy',now),false);
  assert.equal(slotIsFresh({...current,reservation_type:'lottery'},health,'healthy',now),false);
  assert.equal(slotIsFresh({...current,last_seen_at:'2098-12-31 23:00:00'},health,'healthy',now),false);
  assert.equal(slotIsFresh(current,health,'partial',now),false);
  assert.throws(()=>cleanHealth({perCourt:{shiba:{status:'healthy',consecutiveFailures:0,scanWindow:{...window,endDate:'2099-03-01'}}}},['shiba'],now));
});

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
const {resolveAccount}=await import('../lib/accounts.ts');
const {enqueueEmail,slotEmailStatement,sendQueuedEmails}=await import('../lib/notifications.ts');
const {POST:authPost}=await import('../app/api/auth/route.ts');
const {authContext}=await import('../lib/auth.ts');

function database(){
  const raw=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort())raw.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const prepare=(sql)=>{
    let values=[];
    const query={bind(...next){values=next;return query;},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {results:raw.prepare(sql).all(...values),success:true};},async run(){const result=raw.prepare(sql).run(...values);return {success:true,meta:{changes:result.changes}};}};
    return query;
  };
  const db={prepare,async batch(queries){raw.exec('BEGIN');try{const results=[];for(const query of queries)results.push(await query.run());raw.exec('COMMIT');return results;}catch(error){raw.exec('ROLLBACK');throw error;}}};
  return {raw,db};
}
const identity=(id,email='a@example.test',provider='supabase')=>({id,email,phone:null,emailVerified:true,provider});
const config={RESEND_API_KEY:'test-only',RESEND_FROM_EMAIL:'test@example.test'};
const newSlot={courtKey:'shiba',slotDate:'2026-10-04',startTime:'09:00',endTime:'11:00',reservationType:'first_come'};

test('availability emails link to the configured deployment origin',async()=>{
  const {raw,db}=database();
  const previous=env.SITE_ORIGIN;
  env.SITE_ORIGIN='https://my-courts.example.test';
  try {
    const account=await resolveAccount(db,identity('origin-test'));
    await (await slotEmailStatement(db,account.id,[newSlot])).run();
    const notice=raw.prepare('SELECT body FROM email_notifications WHERE user_id=?').get(account.id);
    assert.match(notice.body,/https:\/\/my-courts\.example\.test/);
    assert.doesNotMatch(notice.body,/minato-court\.example/);
  } finally {
    if(previous===undefined)delete env.SITE_ORIGIN;else env.SITE_ORIGIN=previous;
    raw.close();
  }
});

test('owner data can only be claimed by the configured verified platform identity',async()=>{
  const {raw,db}=database();
  const external=await resolveAccount(db,identity('external','owner@example.test'),'owner@example.test');
  assert.notEqual(external.id,'owner');
  const owner=await resolveAccount(db,identity('platform-owner','owner@example.test','chatgpt'),'owner@example.test');
  assert.equal(owner.id,'owner');assert.equal(owner.notification_channel,'push');
  await assert.rejects(resolveAccount(db,identity('different-platform-user','owner@example.test','chatgpt'),'owner@example.test'));
  const same=await resolveAccount(db,identity('platform-owner','new@example.test','chatgpt'),'owner@example.test');
  assert.equal(same.id,'owner');
  raw.close();
});

test('email delivery is tenant-specific, opt-out aware, and deduplicated under concurrent dispatch',async()=>{
  const {raw,db}=database();
  const a=await resolveAccount(db,identity('a'));
  const b=await resolveAccount(db,identity('b','b@example.test'));
  const owner=await resolveAccount(db,identity('owner-platform','owner@example.test','chatgpt'),'owner@example.test');
  assert.equal(await slotEmailStatement(db,owner.id,[newSlot]),null);
  for(const account of [a,b]){const item=await slotEmailStatement(db,account.id,[newSlot]);await item.run();await (await slotEmailStatement(db,account.id,[newSlot])).run();}
  assert.equal(raw.prepare('SELECT count(*) AS n FROM email_notifications').get().n,2);
  const requests=[];
  const transport=async(url,options)=>{requests.push({url,body:JSON.parse(options.body),key:options.headers['idempotency-key']});return Response.json({id:'mock-email-receipt'});};
  await Promise.all([sendQueuedEmails(db,a.id,config,transport),sendQueuedEmails(db,a.id,config,transport)]);
  assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['a@example.test']);
  assert.equal(raw.prepare('SELECT status FROM email_notifications WHERE user_id=?').get(b.id).status,'pending');
  raw.prepare("UPDATE app_users SET notification_channel='none' WHERE id=?").run(b.id);
  await sendQueuedEmails(db,b.id,config,transport);
  assert.equal(requests.length,1);assert.equal(raw.prepare('SELECT status FROM email_notifications WHERE user_id=?').get(b.id).status,'cancelled');
  raw.close();
});

test('failed email sends preserve the same idempotency key and never report success',async()=>{
  const {raw,db}=database();const a=await resolveAccount(db,identity('a'));
  await enqueueEmail(db,a,'test:retry','Test','Test body');
  const keys=[];
  const unavailable=async(url,options)=>{keys.push(options.headers['idempotency-key']);return new Response('',{status:429});};
  assert.equal((await sendQueuedEmails(db,a.id,config,unavailable)).sent,0);
  assert.equal(raw.prepare('SELECT status FROM email_notifications').get().status,'retry');
  raw.exec('UPDATE email_notifications SET available_at=0');
  const accepted=async(url,options)=>{keys.push(options.headers['idempotency-key']);return Response.json({id:'mock-receipt'});};
  assert.equal((await sendQueuedEmails(db,a.id,config,accepted)).sent,1);assert.equal(keys[0],keys[1]);
  await enqueueEmail(db,a,'test:old-recipient','Test','Test body');
  raw.prepare("UPDATE app_users SET email='new@example.test' WHERE id=?").run(a.id);
  await sendQueuedEmails(db,a.id,config,accepted);
  assert.equal(keys.length,2);
  raw.close();
});

test('OTP verification uses the provider, sets HttpOnly cookies and rejects an invalid session without owner fallback',async()=>{
  const {raw,db}=database();
  Object.assign(env,{DB:db,SUPABASE_URL:'https://auth.example.test',SUPABASE_ANON_KEY:'test-only',PHONE_LOGIN_ENABLED:'true',OWNER_BOOTSTRAP_EMAIL:'owner@example.test'});
  const savedFetch=globalThis.fetch;
  const verified={id:'verified-a',email:'a@example.test',email_confirmed_at:'2026-09-22T00:00:00Z'};
  globalThis.fetch=async(url,options)=>{
    assert.ok(String(url).startsWith('https://auth.example.test/auth/v1/'));
    const body=options.body?JSON.parse(options.body):{};
    if(String(url).endsWith('/otp'))return Response.json({});
    if(String(url).endsWith('/verify'))return body.token==='123456'?Response.json({access_token:'access-a',refresh_token:'refresh-a',expires_in:3600,user:verified}):new Response('',{status:403});
    if(String(url).endsWith('/user'))return options.headers.authorization==='Bearer access-a'?Response.json(verified):new Response('',{status:401});
    return new Response('',{status:401});
  };
  const post=(body,origin='https://minato-court.example')=>authPost(new Request('https://minato-court.example/api/auth',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)}));
  try{
    assert.equal((await post({action:'send_code',kind:'email',identifier:'a@example.test'})).status,200);
    assert.equal((await post({action:'verify_code',kind:'email',identifier:'a@example.test',code:'000000'})).status,400);
    const response=await post({action:'verify_code',kind:'email',identifier:'a@example.test',code:'123456'});
    assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.account.id,'supabase:verified-a');assert.equal(result.access_token,undefined);
    const cookies=response.headers.getSetCookie();assert.equal(cookies.length,2);for(const value of cookies){assert.match(value,/HttpOnly/);assert.match(value,/Secure/);assert.match(value,/SameSite=Lax/);}
    const context=await authContext(new Request('https://minato-court.example/api/dashboard',{headers:{cookie:'mc_access=access-a'}}));
    assert.equal(context.account.id,result.account.id);
    await assert.rejects(authContext(new Request('https://minato-court.example/api/dashboard',{headers:{cookie:'mc_access=invalid; mc_refresh=invalid','oai-authenticated-user-id':'owner-platform','oai-authenticated-user-email':'owner@example.test'}})));
    assert.equal((await post({action:'send_code',kind:'email',identifier:'a@example.test'},'https://evil.example')).status,403);
  } finally {globalThis.fetch=savedFetch;for(const key of Object.keys(env))delete env[key];raw.close();}
});

test('notification receipts expose only current verified recipient metadata for the requested account',async()=>{
  const {readNotificationStatus}=await import('../lib/notification-status.ts');
  const {raw,db}=database();
  try {
    const a=await resolveAccount(db,identity('receipt-a'));
    const b=await resolveAccount(db,identity('receipt-b','b@example.test'));
    await enqueueEmail(db,a,'test:a','private subject a','private body a');
    await enqueueEmail(db,b,'test:b','private subject b','private body b');
    const own=await readNotificationStatus(db,a.id);
    assert.deepEqual(own.recent.map(row=>row.kind),['test']);
    assert.equal(own.recent[0].status,'pending');
    assert.deepEqual(Object.keys(own.recent[0]).sort(),['acceptedAt','createdAt','kind','status']);
    assert.doesNotMatch(JSON.stringify(own),/example.test|private|test:a|receipt-b/);
    raw.prepare("UPDATE app_users SET email='new@example.test' WHERE id=?").run(a.id);
    assert.deepEqual((await readNotificationStatus(db,a.id)).recent,[]);
    raw.prepare('UPDATE app_users SET email_verified=0 WHERE id=?').run(b.id);
    assert.deepEqual((await readNotificationStatus(db,b.id)).recent,[]);
  } finally {raw.close();}
});

test('account API blocks unconfigured email selection and preserves the current channel',async()=>{
  const {POST:accountPost}=await import('../app/api/account/route.ts');
  const {raw,db}=database();
  Object.assign(env,{DB:db,OWNER_BOOTSTRAP_EMAIL:'owner@example.test'});
  const post=body=>accountPost(new Request('http://localhost:3000/api/account',{method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3000','oai-authenticated-user-id':'platform-owner','oai-authenticated-user-email':'owner@example.test'},body:JSON.stringify(body)}));
  try {
    assert.equal((await post({action:'preferences',channel:'email'})).status,503);
    assert.equal(raw.prepare("SELECT notification_channel FROM app_users WHERE id='owner'").get().notification_channel,'push');
    assert.equal((await post({action:'test_email'})).status,503);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM email_notifications').get().n,0);
    assert.equal((await post({action:'preferences',channel:'none'})).status,200);
  } finally {for(const key of Object.keys(env))delete env[key];raw.close();}
});

test('dashboard settings, pause state, and email history stay scoped to the signed-in user',async()=>{
  const {GET:dashboardGet,POST:dashboardPost}=await import('../app/api/dashboard/route.ts');
  const {raw,db}=database();Object.assign(env,{DB:db});
  const request=(id,body)=>new Request('http://localhost:3000/api/dashboard'+(!body?'?userId=owner':''),{method:body?'POST':'GET',headers:{'content-type':'application/json',origin:'http://localhost:3000',...(id?{'oai-authenticated-user-id':id,'oai-authenticated-user-email':id+'@example.test'}:{})},body:body?JSON.stringify(body):undefined});
  try {
    assert.equal((await dashboardGet(request(null))).status,401);
    for(const id of ['tenant-a','tenant-b'])assert.equal((await dashboardGet(request(id))).status,200);
    const selected=await dashboardPost(request('tenant-a',{action:'save_courts',courtKeys:['hibiya'],userId:'chatgpt:tenant-b'}));
    assert.equal(selected.status,200);assert.equal((await selected.json()).settings.active,1);
    const other=await (await dashboardGet(request('tenant-b'))).json();
    assert.equal(other.settings.active,0);assert.equal(other.settings.selected_court_keys,'[]');
    await dashboardPost(request('tenant-b',{action:'save_courts',courtKeys:['shiba']}));
    await dashboardPost(request('tenant-a',{action:'save_settings',active:false,userId:'chatgpt:tenant-b'}));
    assert.equal(raw.prepare('SELECT active FROM watch_settings WHERE user_id=?').get('chatgpt:tenant-a').active,0);
    assert.equal(raw.prepare('SELECT active FROM watch_settings WHERE user_id=?').get('chatgpt:tenant-b').active,1);
    const b=raw.prepare('SELECT * FROM app_users WHERE id=?').get('chatgpt:tenant-b');
    await enqueueEmail(db,b,'test:private-b','private subject','private body');
    assert.equal((await (await dashboardGet(request('tenant-a'))).json()).notifications.recent.length,0);
    assert.equal((await (await dashboardGet(request('tenant-b'))).json()).notifications.recent.length,1);
  } finally {for(const key of Object.keys(env))delete env[key];raw.close();}
});

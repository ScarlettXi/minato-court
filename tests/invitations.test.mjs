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
const {createInvitation,admitAccount,canAccessAccount,canRequestEmailCode,revokeInvitation,listInvitations}=await import('../lib/invitations.ts');
const {GET:invitationGet,POST:invitationPost}=await import('../app/api/invitations/route.ts');
const {GET:dashboardGet,POST:dashboardPost}=await import('../app/api/dashboard/route.ts');
const {GET:monitorGet}=await import('../app/api/monitor-ingest/route.ts');

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

const identity=(id,email=id+'@example.test')=>({id,email,phone:null,emailVerified:true,provider:'supabase'});
const origin='http://localhost:3000';
const request=(path,body,headers={})=>new Request(origin+path,{method:body?'POST':'GET',headers:{origin,'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
const clean=()=>{for(const key of Object.keys(env))delete env[key];};

test('invitation codes are hashed, expire, require verified email, and are single-use under competing claims',async()=>{
 const {raw,db}=database();env.INVITE_ONLY='true';
 try {
  const a=await resolveAccount(db,identity('a'));
  const b=await resolveAccount(db,identity('b'));
  const invite=await createInvitation(db);
  const stored=raw.prepare('SELECT * FROM site_invitations').get();
  assert.notEqual(stored.token_hash,invite.code);assert.equal(stored.token_hash.length,64);
  assert.ok(invite.expiresAt> Date.now()/1000+6*86400);
  assert.equal(await admitAccount(db,{...a,email_verified:0},invite.code),false);
  assert.equal(await canRequestEmailCode(db,a.email,invite.code),true);
  const results=await Promise.all([admitAccount(db,a,invite.code),admitAccount(db,b,invite.code)]);
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(await canAccessAccount(db,'owner'),true);
  const winner=results[0]?a:b,loser=results[0]?b:a;
  assert.equal(await admitAccount(db,loser,invite.code),false);
  assert.equal(await canRequestEmailCode(db,winner.email,''),true);
  assert.equal(await canRequestEmailCode(db,loser.email,''),false);
  const expired=await createInvitation(db);raw.prepare('UPDATE site_invitations SET expires_at=0 WHERE id=?').run(expired.id);
  assert.equal(await admitAccount(db,loser,expired.code),false);
  const list=JSON.stringify(await listInvitations(db));assert.doesNotMatch(list,/token_hash|MC-|example.test|used_by/);
 } finally {clean();raw.close();}
});

test('OTP checks invitations before sending, grants access after email verification, and revocation blocks existing sessions and scans',async()=>{
 const {raw,db}=database();Object.assign(env,{DB:db,INVITE_ONLY:'true',SUPABASE_URL:'https://auth.example.test',SUPABASE_ANON_KEY:'test',MONITOR_INGEST_KEY:'monitor-test'});
 const invite=await createInvitation(db),savedFetch=globalThis.fetch;let sent=0;
 const user={id:'friend',email:'friend@example.test',email_confirmed_at:'2026-10-05T00:00:00Z'};
 globalThis.fetch=async(url,options)=>{
  if(String(url).endsWith('/otp')){sent++;return Response.json({});}
  if(String(url).endsWith('/verify'))return Response.json({access_token:'friend-token',refresh_token:'friend-refresh',expires_in:3600});
  if(String(url).endsWith('/user'))return Response.json(user);
  throw new Error('Unexpected provider request');
 };
 try {
  const noInvite=await authPost(request('/api/auth',{action:'send_code',kind:'email',identifier:'unknown@example.test'}));
  assert.equal(noInvite.status,403);assert.equal(sent,0);
  assert.equal((await authPost(request('/api/auth',{action:'send_code',kind:'email',identifier:user.email,invitationCode:invite.code}))).status,200);
  assert.equal(sent,1);
  const verified=await authPost(request('/api/auth',{action:'verify_code',kind:'email',identifier:user.email,code:'123456',invitationCode:invite.code}));
  assert.equal(verified.status,200);assert.equal(verified.headers.getSetCookie().length,2);
  const headers={cookie:'mc_access=friend-token'};
  assert.equal((await dashboardPost(request('/api/dashboard',{action:'save_courts',courtKeys:['hibiya']},headers))).status,200);
  assert.equal((await invitationGet(request('/api/invitations',undefined,headers))).status,403);
  assert.equal((await invitationPost(request('/api/invitations',{action:'create'},headers))).status,403);
  const listed=await (await monitorGet(request('/api/monitor-ingest?listUsers=1',undefined,{'x-monitor-key':'monitor-test'}))).json();
  assert.ok(listed.users.includes('supabase:friend'));
  const member=raw.prepare('SELECT * FROM app_users WHERE id=?').get('supabase:friend');
  await enqueueEmail(db,member,'test:queued','Private test','Private body');
  await revokeInvitation(db,invite.id);
  assert.equal(raw.prepare('SELECT active FROM watch_settings WHERE user_id=?').get(member.id).active,0);
  assert.equal((await dashboardGet(request('/api/dashboard',undefined,headers))).status,403);
  assert.equal((await dashboardPost(request('/api/dashboard',{action:'save_courts',courtKeys:['shiba']},headers))).status,403);
  assert.equal((await monitorGet(request('/api/monitor-ingest?userId=supabase%3Afriend',undefined,{'x-monitor-key':'monitor-test'}))).status,404);
  let delivered=0;
  await sendQueuedEmails(db,member.id,{RESEND_API_KEY:'test',RESEND_FROM_EMAIL:'test@example.test'},async()=>{delivered++;return Response.json({id:'unexpected'});});
  assert.equal(delivered,0);assert.equal(raw.prepare('SELECT status FROM email_notifications').get().status,'cancelled');
  const rejected=await authPost(request('/api/auth',{action:'verify_code',kind:'email',identifier:user.email,code:'123456',invitationCode:invite.code}));
  assert.equal(rejected.status,403);assert.equal(rejected.headers.getSetCookie().length,0);
 } finally {globalThis.fetch=savedFetch;clean();raw.close();}
});

test('the owner manages codes without exposing stored tokens and unconfigured login cannot issue invitations',async()=>{
 const {raw,db}=database();Object.assign(env,{DB:db,INVITE_ONLY:'true',OWNER_BOOTSTRAP_EMAIL:'owner@example.test'});
 const headers={'oai-authenticated-user-id':'owner-platform','oai-authenticated-user-email':'owner@example.test'};
 try {
  assert.equal((await invitationGet(request('/api/invitations'))).status,401);
  assert.equal((await invitationPost(request('/api/invitations',{action:'create'},headers))).status,503);
  assert.equal(raw.prepare('SELECT count(*) AS n FROM site_invitations').get().n,0);
  Object.assign(env,{SUPABASE_URL:'https://auth.example.test',SUPABASE_ANON_KEY:'test'});
  const created=await invitationPost(request('/api/invitations',{action:'create'},headers));
  assert.equal(created.status,200);assert.match(created.headers.get('cache-control'),/no-store/);
  const result=await created.json();assert.match(result.invitation.code,/^MC-[A-F0-9]{32}$/);
  const list=await (await invitationGet(request('/api/invitations',undefined,headers))).json();
  assert.equal(list.invitations.length,1);assert.equal(list.invitations[0].status,'available');
  assert.doesNotMatch(JSON.stringify(list),/token_hash|MC-|owner-platform/);
  assert.equal((await invitationPost(request('/api/invitations',{action:'revoke',id:result.invitation.id},headers))).status,200);
  assert.equal((await listInvitations(db))[0].status,'revoked');
  assert.equal((await invitationPost(new Request(origin+'/api/invitations',{method:'POST',headers:{...headers,origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({action:'create'})}))).status,403);
 } finally {clean();raw.close();}
});

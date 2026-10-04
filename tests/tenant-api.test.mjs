import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

// Explicit opt-in: these checks use only a running local preview and restore its DB.
if (process.env.RUN_LOCAL_TENANT_TESTS !== '1') throw new Error('Set RUN_LOCAL_TENANT_TESTS=1 for the local preview only.');
const base='http://localhost:3000';
const db=new DatabaseSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite');
const tables=['app_users','watch_settings','availability_slots','booking_requests','monitor_runs','email_notifications','auth_rate_limits'];
const original=Object.fromEntries(tables.map(table=>[table,db.prepare(`SELECT * FROM ${table}`).all()]));
const identities={owner:{id:'test-owner',email:'owner@example.test'},a:{id:'test-user-a',email:'a@example.test'},b:{id:'test-user-b',email:'b@example.test'}};
async function api(path,{user,body,status=200,monitor=false,origin=base}={}) {
  const headers={};
  if(user){headers['oai-authenticated-user-id']=identities[user].id;headers['oai-authenticated-user-email']=identities[user].email;}
  if(monitor)headers['x-monitor-key']='local-monitor-test';
  if(body){headers['content-type']='application/json';headers.origin=origin;}
  const response=await fetch(base+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});
  const raw=await response.text();
  const result=response.headers.get('content-type')?.includes('application/json')?JSON.parse(raw):{error:raw};
  assert.equal(response.status,status,JSON.stringify(result));
  if(path==='/api/dashboard'&&status===200)assert.match(response.headers.get('cache-control'),/no-store/);
  return result;
}
const save=(user,body)=>api('/api/dashboard',{user,body});
const futureDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+200*86400000));
const slot=(startTime,endTime)=>({courtKey:'shiba',slotDate:futureDate,startTime,endTime,reservationType:'first_come',sourceUrl:'https://kouen.sports.metro.tokyo.lg.jp/web/'});
try {
  await api('/api/dashboard',{status:401});
  await api('/api/monitor-ingest',{status:401});
  await api('/api/dashboard',{user:'owner',body:{action:'save_courts',courtKeys:['shiba']},origin:'https://evil.example',status:403});
  const owner=await api('/api/dashboard',{user:'owner'});
  assert.equal(owner.account.id,'owner');assert.equal(owner.account.notificationChannel,'push');
  const a=await api('/api/dashboard',{user:'a'});const b=await api('/api/dashboard',{user:'b'});
  assert.notEqual(a.account.id,b.account.id);assert.equal(a.account.isOwner,false);assert.deepEqual(a.slots,[]);assert.deepEqual(a.requests,[]);
  assert.deepEqual(JSON.parse(a.settings.selected_court_keys),[]);assert.equal(a.settings.active,0);
  for(const user of ['a','b']) {
    const saved = await save(user,{action:'save_courts',courtKeys:['shiba']});
    assert.equal(saved.settings.active,1);
    assert.equal(saved.settings.end_date,null);
    assert.equal(saved.settings.monitoring_mode,'continuous');
  }
  db.prepare("UPDATE watch_settings SET start_date='2020-01-01',end_date='2020-01-02' WHERE user_id=?").run(a.account.id);
  const resumed = await save('a',{action:'save_settings',active:true});
  assert.equal(resumed.settings.active,1);assert.equal(resumed.settings.end_date,null);
  const target = await api('/api/monitor-ingest?userId='+encodeURIComponent(a.account.id),{monitor:true});
  assert.equal(target.settings.monitoring_mode,'continuous');assert.equal(target.settings.end_date,null);
  assert.notEqual(target.settings.start_date,'2020-01-01');
  await save('a',{action:'save_court_time',courtKey:'shiba',start:'09:00',end:'12:00',userId:b.account.id});
  await save('b',{action:'save_court_time',courtKey:'shiba',start:'18:00',end:'21:00'});
  const scan=(userId,runMessage)=>api('/api/monitor-ingest',{monitor:true,body:{userId,checkedCourts:['shiba'],slots:[slot('09:00','11:00'),slot('18:00','20:00')],runMessage}});
  await scan(a.account.id,'A-only');await scan(b.account.id,'B-only');
  const afterA=await api('/api/dashboard',{user:'a'});const afterB=await api('/api/dashboard',{user:'b'});
  assert.equal(afterA.slots.length,1);assert.equal(afterA.slots[0].start_time,'09:00');
  assert.equal(afterB.slots.length,1);assert.equal(afterB.slots[0].start_time,'18:00');
  assert.notEqual(afterA.slots[0].id,afterB.slots[0].id);
  assert.equal(afterA.runs[0].message,'A-only');assert.equal(afterB.runs[0].message,'B-only');
  let notices=db.prepare('SELECT * FROM email_notifications WHERE user_id=?').all(a.account.id);
  assert.equal(notices.length,1);assert.equal(notices[0].recipient,'a@example.test');assert.match(notices[0].body,/09:00/);assert.doesNotMatch(notices[0].body,/18:00/);
  await scan(a.account.id,'A-only');
  assert.equal(db.prepare('SELECT count(*) AS n FROM email_notifications WHERE user_id=?').get(a.account.id).n,1);
  await save('a',{action:'save_court_time',courtKey:'shiba',start:'10:00',end:'12:00'});
  assert.equal((await api('/api/dashboard',{user:'b'})).runs[0].message,'B-only');
  db.prepare("INSERT INTO booking_requests(id,user_id,slot_id,status) VALUES(?,?,?,'pending')").run('b-request',b.account.id,afterB.slots[0].id);
  const attack=await save('a',{action:'cancel_request',requestId:'b-request',userId:b.account.id});
  assert.equal(attack.requests.length,0);
  assert.equal(db.prepare('SELECT status FROM booking_requests WHERE id=?').get('b-request').status,'pending');
  await api('/api/dashboard',{user:'a',body:{action:'confirm_booking',slotId:afterB.slots[0].id},status:403});
  await api('/api/monitor-ingest',{monitor:true,body:{userId:a.account.id,bookingUpdates:[{requestId:'b-request',status:'booked'}]},status:403});
  await api('/api/account',{user:'a',body:{action:'preferences',channel:'push'},status:400});
  await api('/api/account',{user:'a',body:{action:'preferences',channel:'none'}});
  await api('/api/monitor-ingest',{monitor:true,body:{userId:a.account.id,checkedCourts:['shiba'],slots:[slot('10:00','12:00')]}});
  assert.equal(db.prepare('SELECT count(*) AS n FROM email_notifications WHERE user_id=?').get(a.account.id).n,1);
  await api('/api/auth',{body:{action:'send_code',kind:'email',identifier:'a@example.test'},status:503});
  const finalOwner=await api('/api/dashboard',{user:'owner'});
  assert.deepEqual(finalOwner.settings,owner.settings);assert.deepEqual(finalOwner.requests,owner.requests);
  console.log('PASS: anonymous and cross-origin access blocked; two-user read/write, scan, time and mail isolation; owner settings/history/push preserved; duplicate email suppression; public booking cannot use owner credentials.');
} finally {
  db.exec('BEGIN');
  try {
    for(const table of [...tables].reverse())db.exec(`DELETE FROM ${table}`);
    for(const table of tables)for(const row of original[table]){const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));}
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');console.error('Local data restore failed:',error);process.exitCode=1;}
  db.close();console.log('Original local data restored.');
}

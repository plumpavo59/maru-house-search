import test from 'node:test';
import assert from 'node:assert/strict';
import {Auth,seal,unseal,same} from '../src/auth.js';
import {createServer} from '../src/server.js';
const secret='x'.repeat(40),env={APP_URL:'https://house.example',SESSION_SECRET:secret,GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_SHEET_ID:'sheet',RU_EMAIL:'ru@example.test',MARA_EMAIL:'mara@example.test'};
test('sealed cookies detect tampering; missing config denies access',()=>{
 const token=seal({name:'Ru'},secret);assert.deepEqual(unseal(token,secret),{name:'Ru'});assert.equal(unseal(token.slice(0,-3)+'bad',secret),null);assert.equal(new Auth({}).configured,false);assert.equal(new Auth({}).session({headers:{}}),null);assert.equal(same('a','ab'),false);
});
test('verified role is enforced on every session and writes require same origin + CSRF',()=>{
 const a=new Auth(env),s={name:'Ru',email:'ru@example.test',expiresAt:Date.now()+10000,csrf:'abc'};const req={headers:{cookie:'maru_session='+seal(s,secret)}};assert.equal(a.session(req).name,'Ru');assert.equal(a.verifyWrite({headers:{origin:'https://evil.test','x-csrf-token':'abc'}},s),false);assert.equal(a.verifyWrite({headers:{origin:'https://house.example','x-csrf-token':'abc'}},s),true);s.name='Mara';assert.equal(a.session({headers:{cookie:'maru_session='+seal(s,secret)}}),null);
});
test('server starts locked, never serves private seed data, and rejects unauthenticated writes',async t=>{
 const server=createServer({env:{APP_URL:'http://localhost:3000'}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;let r=await fetch(base+'/api/me');assert.equal((await r.json()).authenticated,false);r=await fetch(base+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'getData',args:[]})});assert.equal(r.status,401);r=await fetch(base+'/private-data/tracker.json');assert.equal(r.status,404);r=await fetch(base+'/');assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.doesNotMatch(await r.text(),/rulemer@gmail|mara.djeri@gmail/);
});

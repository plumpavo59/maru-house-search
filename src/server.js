import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Auth} from './auth.js';
import {SheetsStore} from './store.js';
import {Service} from './service.js';
const ROOT=fileURLToPath(new URL('../public/',import.meta.url));
const METHODS=new Set(['getData','saveProperty','saveSettings','saveSearch','addHistory','importObservations','getMetadata']);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>1500000)throw Object.assign(new Error('Request too large.'),{status:413});parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw Object.assign(new Error('Invalid JSON.'),{status:400});}}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
export function createServer({env=process.env,demoStore=null}={}){
 if(demoStore&&env.NODE_ENV==='production')throw new Error('Local preview is disabled in production.');
 const auth=new Auth(env);let tail=Promise.resolve();
 const queued=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  const url=new URL(req.url,'http://localhost');
  try{
   if(url.pathname==='/health'){json(res,200,{ok:true,configured:auth.configured,preview:!!demoStore});return;}
   let session=demoStore?{name:(req.headers.cookie||'').includes('maru_demo_role=Mara')?'Mara':'Ru',email:(req.headers.cookie||'').includes('maru_demo_role=Mara')?'mara@preview.local':'ru@preview.local',csrf:'local-preview'}:auth.session(req);
   if(url.pathname==='/api/me'){json(res,200,{configured:auth.configured||!!demoStore,authenticated:!!session,user:session?{name:session.name,email:session.email}:null,csrf:session?.csrf,preview:!!demoStore});return;}
   if(url.pathname==='/auth/login'&&req.method==='GET'){const location=await auth.login(res);res.writeHead(302,{Location:location});res.end();return;}
   if(url.pathname==='/auth/callback'&&req.method==='GET'){session=await auth.callbackSession(req,url);auth.save(res,session);auth.setCookie(res,'maru_oauth','',0,'/auth');res.writeHead(302,{Location:'/'});res.end();return;}
   if(url.pathname==='/auth/logout'&&req.method==='POST'){if(!session||(!demoStore&&!auth.verifyWrite(req,session)))throw Object.assign(new Error('Not authorised.'),{status:403});auth.setCookie(res,'maru_session','',0);json(res,200,{ok:true});return;}
   if(url.pathname==='/api/rpc'&&req.method==='POST'){
    if(!session)throw Object.assign(new Error('Sign in with Google to continue.'),{status:401});
    if(!demoStore&&!auth.verifyWrite(req,session))throw Object.assign(new Error('Refresh the page and try again.'),{status:403});
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Object.assign(new Error('JSON required.'),{status:415});
    const payload=await body(req);if(!METHODS.has(payload.name)||!Array.isArray(payload.args))throw Object.assign(new Error('Unknown action.'),{status:400});
    const result=await queued(async()=>{const store=demoStore||new SheetsStore(auth.authorizedClient(session),auth.sheetId);const service=await new Service(store,{name:session.name,email:session.email},demoStore?'':`https://docs.google.com/spreadsheets/d/${encodeURIComponent(auth.sheetId)}/edit`).ready();if(demoStore&&payload.name==='getMetadata')return payload.args[0].map(id=>{const p=store.rows('Properties').find(p=>p.id===id),m=store.rows('Metadata').find(m=>m.property_id===id);return {...m,property_id:id,image_url:m?.image_url||'',status:m?.status||'No image'};});const out=await service[payload.name](...payload.args);if(demoStore){if(out.data)out.data.preview=true;else if(!Array.isArray(out))out.preview=true;}return out;});
    if(!demoStore)auth.save(res,session);json(res,200,result);return;
   }
   if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'Method not allowed.'});return;}
   const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,'');
   if(!['index.html','app.js','styles.css','model.js','scoring.js'].includes(file)){json(res,404,{error:'Not found.'});return;}
   const bytes=await fs.readFile(path.join(ROOT,file));res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){const status=Number(e.status)||Number(e.response?.status)||400;const safeStatus=status>=400&&status<600?status:500;const message=safeStatus===401?'Sign in with Google to continue.':safeStatus===403?(e.status===403?e.message:'This account cannot access the shared spreadsheet. Check its sharing permissions.'):safeStatus>=500?'Google Sheets could not be reached. Your changes have not been confirmed; please retry.':e.message||'Request failed.';json(res,safeStatus,{error:message});}
 });
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){const server=createServer();const port=Number(process.env.PORT||3000);server.listen(port,'0.0.0.0',()=>console.log('Maru House Search listening on port '+port));}

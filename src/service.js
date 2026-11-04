import crypto from 'node:crypto';
import {HEADERS,CALCULATED,WEIGHTS,ENUMS,DEFAULT_SETTINGS,SEARCH_HEADERS,EDITABLE} from '../public/model.js';
import {calculate,normalize,missing,validatePatch,validateUrl,canonical,numeric} from '../public/scoring.js';
export const fingerprint=(p,keys=HEADERS.filter(k=>!CALCULATED.includes(k)))=>crypto.createHash('sha256').update(JSON.stringify(keys.map(k=>p[k]??''))).digest('base64url');
const now=()=>new Date().toISOString();
const error=(message,status=400)=>Object.assign(new Error(message),{status});
export class Service{
 constructor(store,user,sheetUrl=''){this.store=store;this.user=user;this.sheetUrl=sheetUrl;}
 async ready(){await this.store.read();await this.store.ensureSchema();return this;}
 settings(){return {...DEFAULT_SETTINGS,...Object.fromEntries(this.store.rows('Settings').map(r=>[r.key,r.value]))};}
 data(){const settings=this.settings(),rates=this.store.rows('CouncilTax'),metadata=new Map(this.store.rows('Metadata').map(r=>[r.property_id,r]));return {user:this.user,properties:this.store.rows('Properties').filter(p=>p.id).map(p=>{const out=calculate(p,settings,rates),m=metadata.get(p.id);return {...out,version:fingerprint(p),image_url:m?.url===p.url?m.image_url:'',metadata_status:m?.status||'Not checked',missing:missing(out)};}),history:this.store.rows('History'),searches:this.store.rows('Searches').filter(r=>r.id).map(r=>({...r,version:fingerprint(r,SEARCH_HEADERS)})),settings,weights:WEIGHTS,enums:ENUMS,sheetUrl:this.sheetUrl};}
 event(input,values){return {event_id:this.eventId(input),observed_at:now(),actor:this.user.name,...values};}
 eventId(input){return input?.mutation_id?'mutation-'+crypto.createHash('sha256').update(this.user.email+'|'+input.mutation_id).digest('hex'):crypto.randomUUID();}
 already(input){return !!input?.mutation_id&&this.store.rows('History').some(e=>e.event_id===this.eventId(input));}
 async getData(){return this.data();}
 async saveProperty(input){
  if(this.already(input))return this.data();
  const all=this.store.rows('Properties'),old=all.find(p=>p.id===input.id);
  if(input.id&&!old)throw error('Listing no longer exists. Refresh.',409);
  if(old&&input.version!==fingerprint(old))throw error('Listing changed in the spreadsheet or another browser. Refresh or review your changes.',409);
  const patch=validatePatch(input),other=this.user.name==='Ru'?'mara_overall':'ru_overall';
  if(Object.hasOwn(patch,other)&&String(patch[other])!==String(old?.[other]??''))throw error('Only '+(this.user.name==='Ru'?'Mara':'Ru')+' can change their personal score.',403);
  let p={id:crypto.randomUUID(),added_at:now(),area_unit:'ft²',added_by:this.user.name,bucket:'Inbox',status:'Considering',availability:'Unknown',processing:'Pending',tax_year:'2026/27',...old,...patch,updated_at:now()};
  if(!p.url)throw error('Listing link required.');
  if(all.some(r=>r.id!==p.id&&canonical(r.url)===canonical(p.url)))throw error('That listing is already saved.',409);
  if(!p.title)p.title=new URL(p.url).hostname;
  const changed=Object.keys(patch).filter(k=>String(old?.[k]??'')!==String(patch[k]));
  if(!changed.length&&old)return this.data();
  p=calculate(p,this.settings(),this.store.rows('CouncilTax'));
  const event=this.event(input,{property_id:p.id,kind:!old?'Saved':changed.includes('rent_pcm')?'Price':changed.includes('status')?'Status':'Change',rent_pcm:p.rent_pcm??'',availability:p.availability,source:p.url,note:!old?'Added listing':changed.map(k=>k+': '+String(old?.[k]??'Unknown')+' → '+String(p[k]??'Unknown')).join('; ').slice(0,12000)});
  const appends=[{table:'History',values:event}],patches=[];
  if(old)patches.push({table:'Properties',id:p.id,values:Object.fromEntries([...changed,...CALCULATED,'updated_at'].map(k=>[k,p[k]??'']))});
  else appends.push({table:'Properties',values:Object.fromEntries(HEADERS.map(k=>[k,p[k]??'']))});
  await this.store.commit({patches,appends});return this.data();
 }
 async saveSettings(input){
  if(this.already(input))return this.data();
  const old=this.settings();if(input.version!==JSON.stringify(old))throw error('Preferences changed elsewhere. Refresh.',409);
  const next={...old};for(const k of Object.keys(old))if(Object.hasOwn(input.values,k)){const v=input.values[k],n=numeric(v);if(v===''&&k==='total_budget')next[k]='';else if(n===null||n<0)throw error('Invalid value: '+k);else next[k]=n;}
  if(next.maximum_rent<=next.preferred_rent)throw error('Maximum rent must exceed preferred rent.');
  if(WEIGHTS.reduce((s,w)=>s+Number(next['weight_'+w[0]]),0)<=0)throw error('At least one score weight must be positive.');
  const rows=this.store.rows('Settings'),patches=[],appends=[];
  for(const [key,value]of Object.entries(next))if(rows.some(r=>r.key===key))patches.push({table:'Settings',id:key,key:'key',values:{value}});else appends.push({table:'Settings',values:{key,value,description:key}});
  for(const p of this.store.rows('Properties').filter(p=>p.id)){const out=calculate(p,next,this.store.rows('CouncilTax'));patches.push({table:'Properties',id:p.id,values:Object.fromEntries(CALCULATED.map(k=>[k,out[k]]))});}
  appends.push({table:'History',values:this.event(input,{kind:'Preferences',note:'Updated scoring weights or budget'})});
  await this.store.commit({patches,appends});return this.data();
 }
 async addHistory(input){
  if(this.already(input))return this.data();
  const p=this.store.rows('Properties').find(p=>p.id===input.property_id);if(!p)throw error('Listing not found.');
  const note=String(input.note||'').trim();if(!note||note.length>12000)throw error('Enter a note up to 12,000 characters.');
  if(!input.observed_at||Number.isNaN(Date.parse(input.observed_at)))throw error('Invalid date.');
  const rent=input.rent_pcm===''||input.rent_pcm===undefined?'':numeric(input.rent_pcm);if(rent===null||rent<0)throw error('Invalid price.');
  const kind=['Note','Contact','Viewing','Decision','Price observation'].includes(input.kind)?input.kind:'Note';
  await this.store.commit({appends:[{table:'History',values:this.event(input,{property_id:p.id,kind,note,rent_pcm:kind==='Price observation'?rent:'',source:p.url,observed_at:new Date(input.observed_at).toISOString()})}]});return this.data();
 }
 async saveSearch(input){
  if(this.already(input))return this.data();
  const old=this.store.rows('Searches').find(r=>r.id===input.id);
  if(input.id&&!old)throw error('Search no longer exists.',409);
  if(old&&input.version!==fingerprint(old,SEARCH_HEADERS))throw error('Search changed elsewhere. Refresh.',409);
  const r={id:old?.id||crypto.randomUUID(),site:String(input.site||'Other').trim().slice(0,80),title:String(input.title||'').trim().slice(0,160),url:String(input.url||'').trim(),updated_at:now()};
  if(!input.remove){if(!r.title||!r.url)throw error('Title and URL required.');validateUrl(r.url);}
  const changes={patches:old&&!input.remove?[{table:'Searches',id:old.id,values:r}]:[],deletes:input.remove?[{table:'Searches',id:old.id}]:[],appends:[]};
  if(!old&&!input.remove)changes.appends.push({table:'Searches',values:r});
  changes.appends.push({table:'History',values:this.event(input,{kind:'Search',note:(input.remove?'Removed ':old?'Edited ':'Added ')+(old?.title||r.title)})});
  await this.store.commit(changes);return this.data();
 }
 async importObservations(payload){
  if(!Array.isArray(payload)||payload.length>100)throw error('Supply an array of at most 100 observations.');
  const ids=new Set(this.store.rows('History').map(r=>r.event_id)),props=this.store.rows('Properties');
  const events=payload.map(e=>{if(!e||typeof e.event_id!=='string'||!e.event_id||e.event_id.length>200||!props.some(p=>p.id===e.property_id))throw error('Each entry needs an event ID and known property ID.');if(!e.observed_at||Number.isNaN(Date.parse(e.observed_at)))throw error('Invalid observation date.');validateUrl(e.source);if(e.availability&&!ENUMS.availability.includes(e.availability))throw error('Invalid availability.');const rent=e.rent_pcm===undefined||e.rent_pcm===''?'':numeric(e.rent_pcm);if(rent===null||rent<0)throw error('Invalid observed rent.');return {event_id:e.event_id,property_id:e.property_id,observed_at:new Date(e.observed_at).toISOString(),kind:'Task observation',rent_pcm:rent,availability:e.availability||'Unknown',source:e.source,actor:'Task import ('+this.user.name+')',note:String(e.note||'').slice(0,12000)};});
  const appends=[];for(const e of events)if(!ids.has(e.event_id)){ids.add(e.event_id);appends.push({table:'History',values:e});}
  await this.store.commit({appends});return {count:appends.length,data:this.data()};
 }
 async getMetadata(ids,force=false){
  if(!Array.isArray(ids)||ids.length>4)throw error('Maximum four images per request.');
  const results=[],patches=[],appends=[];
  for(const id of ids){const p=this.store.rows('Properties').find(p=>p.id===id);if(!p)throw error('Unknown listing.');const old=this.store.rows('Metadata').find(m=>m.property_id===id),ttl=old?.status==='OK'?86400000:3600000;
   if(!force&&old?.url===p.url&&Date.now()-Date.parse(old.fetched_at)<ttl){results.push(old);continue;}
   const m={property_id:id,url:p.url,image_url:old?.url===p.url?old.image_url:'',page_title:'',description:'',fetched_at:now(),status:'No image'};
   try{Object.assign(m,await extractMetadata(p.url));}catch(e){m.status='Metadata unavailable';}
   results.push(m);if(old)patches.push({table:'Metadata',id,key:'property_id',values:m});else appends.push({table:'Metadata',values:m});
  }
  await this.store.commit({patches,appends});return results;
 }
}
export function allowedMetadataURL(input){const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password||u.port||!/(^|\.)(onthemarket\.com|rightmove\.co\.uk|zoopla\.co\.uk|openrent\.co\.uk|your-move\.co\.uk|gumtree\.com|spareroom\.co\.uk)$/.test(u.hostname))throw error('Unsupported metadata host.');return u;}
export function parseMetadata(html,base){const meta={};for(const match of html.matchAll(/<meta\b[^>]*>/gi)){const a={};for(const m of match[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g))a[m[1].toLowerCase()]=m[3];const key=a.property||a.name;if(key)meta[key.toLowerCase()]=decode(a.content||'');}let image=meta['og:image']||meta['twitter:image']||meta['og:image:url']||'';try{image=image?new URL(image,base).href:'';if(image&&!image.startsWith('https://'))image='';}catch{image='';}return {image_url:image,page_title:meta['og:title']||'',description:meta['og:description']||meta.description||'',status:image?'OK':'No image'};}
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
export async function extractMetadata(input){const u=allowedMetadataURL(input),r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'MaruHouseSearch/2.0 (listing metadata)'}});if(!r.ok)throw error('Metadata unavailable.');let size=0,chunks=[];for await(const chunk of r.body){size+=chunk.length;if(size>3000000){await r.body.cancel().catch(()=>{});throw error('Metadata response too large.');}chunks.push(chunk);}return parseMetadata(Buffer.concat(chunks).toString('utf8'),u.href);}

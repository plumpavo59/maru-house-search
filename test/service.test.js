import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryStore} from '../src/store.js';
import {Service,parseMetadata,allowedMetadataURL} from '../src/service.js';
import {DEFAULT_SETTINGS} from '../public/model.js';
const ru={name:'Ru',email:'ru@example.test'},mara={name:'Mara',email:'mara@example.test'};
function fixture(){return new MemoryStore({Properties:[{id:'one',title:'Test home',url:'https://www.onthemarket.com/details/1/',rent_pcm:1900,area_value:887,area_unit:'ft²',bucket:'Inbox'}],Settings:Object.entries(DEFAULT_SETTINGS).map(([key,value])=>({key,value})),Searches:[],History:[],Metadata:[],CouncilTax:[]});}
test('shared edits are audited and stale writes rejected',async()=>{
 const store=fixture(),s=new Service(store,ru);const p=s.data().properties[0];await s.saveProperty({id:p.id,version:p.version,studio:'Maybe',actor:'Mara'});assert.equal(store.rows('History')[0].actor,'Ru');await assert.rejects(()=>s.saveProperty({id:p.id,version:p.version,studio:'Yes'}),/changed/);
});
test('personal scores are tied to verified user, not a name in the request',async()=>{
 const store=fixture(),s=new Service(store,ru);let p=s.data().properties[0];await assert.rejects(()=>s.saveProperty({id:p.id,version:p.version,mara_overall:10,actor:'Mara'}),/Only Mara/);await s.saveProperty({id:p.id,version:p.version,ru_overall:8});const sm=new Service(store,mara);p=sm.data().properties[0];await sm.saveProperty({id:p.id,version:p.version,mara_overall:6});assert.equal(sm.data().properties[0].mara_overall,6);assert.equal(store.rows('History').at(-1).actor,'Mara');
});
test('transport retries are idempotent even after the row version changes',async()=>{
 const store=fixture(),s=new Service(store,ru),p=s.data().properties[0];const mutation={id:p.id,version:p.version,ru_overall:8,mutation_id:'test-retry'};await s.saveProperty(mutation);await s.saveProperty(mutation);assert.equal(store.rows('History').length,1);assert.equal(store.rows('Properties')[0].ru_overall,8);
});
test('task imports validate the complete batch and preserve personal scores',async()=>{
 const store=fixture(),s=new Service(store,ru);const good={event_id:'e',property_id:'one',observed_at:'2026-11-04T12:00:00Z',rent_pcm:1800,source:'https://www.onthemarket.com/details/1/'};await assert.rejects(()=>s.importObservations([good,{...good,event_id:'bad',rent_pcm:-1}]),/Invalid/);assert.equal(store.rows('History').length,0);assert.equal((await s.importObservations([good])).count,1);assert.equal((await s.importObservations([good])).count,0);assert.equal(store.rows('Properties')[0].rent_pcm,1900);
});
test('search CRUD, arbitrary search query strings and conflict detection',async()=>{
 const s=new Service(fixture(),ru);let d=await s.saveSearch({site:'Zoopla',title:'Saved search',url:'https://www.zoopla.co.uk/to-rent/?price_max=2000'});let q=d.searches[0];assert.match(q.url,/price_max/);d=await s.saveSearch({...q,title:'Changed'});await assert.rejects(()=>s.saveSearch({...q,title:'Stale'}),/changed/);q=d.searches[0];d=await s.saveSearch({...q,remove:true});assert.equal(d.searches.length,0);
});
test('metadata only accepts portal hosts and safely parses protocol-relative images',()=>{
 assert.throws(()=>allowedMetadataURL('https://127.0.0.1/'),/Unsupported/);assert.throws(()=>allowedMetadataURL('https://www.rightmove.co.uk.evil.test/'),/Unsupported/);assert.throws(()=>allowedMetadataURL('https://www.rightmove.co.uk:3000/'),/Unsupported/);assert.equal(parseMetadata('<meta property="og:image" content="//media.onthemarket.com/photo.jpg"><meta property="og:title" content="A &amp; B">','https://www.onthemarket.com/').image_url,'https://media.onthemarket.com/photo.jpg');
});

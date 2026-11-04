import {WEIGHTS,EDITABLE,ENUMS} from './model.js';
export const numeric=v=>v!==''&&v!==null&&v!==undefined&&typeof v!=='boolean'&&Number.isFinite(Number(v))?Number(v):null;
export function normalize(p){
  const out={...p};
  if(!out.neighbours){const a=p.neighbours_above,b=p.neighbours_below;out.neighbours=a==='Yes'&&b==='Yes'?'Above and below':a==='Yes'&&b==='No'?'Above':a==='No'&&b==='Yes'?'Below':a==='No'&&b==='No'?'None':'Unknown';}
  return out;
}
export function calculate(property,settings,rates=[]){
  const p=normalize(property),area=numeric(p.area_value),rent=numeric(p.rent_pcm);
  p.area_m2=area===null?'':area*(p.area_unit==='ft²'?0.09290304:1);
  p.area_ft2=area===null?'':area*(p.area_unit==='m²'?1/0.09290304:1);
  let annual=numeric(p.tax_annual_override);
  if(annual===null){const r=rates.find(r=>String(r.borough).trim().toLowerCase()===String(p.borough).trim().toLowerCase()&&r.band===p.tax_band&&r.year===p.tax_year);annual=r?numeric(r.annual_gbp):null;}
  p.tax_monthly=annual===null?'':annual/12;p.tax_missing=annual===null;
  p.total_monthly=rent===null||annual===null?'':rent+annual/12;
  const values={};
  for(const [k] of WEIGHTS)values[k]=['studio','art_craft'].includes(k)?({Yes:10,Maybe:5,No:0}[p[k]]??null):["ru_overall","mara_overall"].includes(k)?numeric(p[k]):numeric(p['rating_'+k]);
  if(values.affordability===null&&rent!==null){const low=numeric(settings.preferred_rent),high=numeric(settings.maximum_rent);if(low!==null&&high!==null&&high>low)values.affordability=Math.max(0,Math.min(10,10*(high-rent)/(high-low)));}
  let total=0,known=0,sum=0;
  for(const [k] of WEIGHTS){const w=Math.max(0,numeric(settings['weight_'+k])||0);total+=w;if(values[k]!==null&&values[k]>=0&&values[k]<=10){known+=w;sum+=w*values[k];}}
  const fraction=total?known/total:0;
  p.fit_score=known?Math.round(sum/known*100)/10:'';
  p.assessed_pct=Math.round(fraction*1000)/10;
  p.score_ceiling=Math.round((50+50*fraction)*10)/10;
  // Apply the ceiling to the unrounded fit so rounding cannot exceed it.
  p.score=known?Math.floor((sum/known*10)*(0.5+0.5*fraction)*10+1e-8)/10:'';
  p.over_budget=rent!==null&&numeric(settings.maximum_rent)!==null&&rent>Number(settings.maximum_rent);
  p.over_total=p.total_monthly!==''&&numeric(settings.total_budget)!==null&&p.total_monthly>Number(settings.total_budget);
  return p;
}
export const MISSING_FIELDS=['title','rent_pcm','area_value','art_craft','studio','open_plan','outdoor','floor','borough','tax_band','rating_location','rating_layout','rating_noise','rating_interior','rating_kitchen','rating_outdoors'];
export function missing(p){return MISSING_FIELDS.filter(k=>p[k]===''||p[k]===undefined||p[k]===null||p[k]==='Unknown');}
export function canonical(value){const u=new URL(value);u.hash='';for(const key of [...u.searchParams.keys()])if(/^(utm_|search_identifier|r-alert|r-email|r-saved|r-user|fbclid|gclid)/i.test(key))u.searchParams.delete(key);return u.href.replace(/\/$/,'');}
export function validateUrl(value){const u=new URL(String(value));if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Use an http(s) listing URL.');return String(value);}
export function validatePatch(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid listing data.');
  const p={};
  for(const key of EDITABLE)if(Object.hasOwn(input,key)){const v=input[key];if(!['string','number'].includes(typeof v)&&v!==null)throw new Error('Invalid '+key);p[key]=v===null?'':typeof v==='string'?v.trim():v;if(typeof p[key]==='string'&&p[key].length>12000)throw new Error('Field too long: '+key);}
  if(p.url!==undefined)validateUrl(p.url);
  for(const [k,values] of Object.entries(ENUMS))if(p[k]!==undefined&&p[k]!==''&&!values.includes(p[k]))throw new Error('Invalid '+k);
  for(const k of ['rent_pcm','area_value','bedrooms','tax_annual_override','walk_minutes','ru_overall','mara_overall',...EDITABLE.filter(k=>k.startsWith('rating_'))])if(p[k]!==undefined&&p[k]!==''){const n=numeric(p[k]);if(n===null||n<0||((k.startsWith('rating_')||k.endsWith('_overall'))&&n>10))throw new Error('Invalid number: '+k);p[k]=n;}
  return p;
}

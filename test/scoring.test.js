import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate,normalize,validatePatch,canonical} from '../public/scoring.js';
import {DEFAULT_SETTINGS,WEIGHTS,ENUMS} from '../public/model.js';
test('10% assessed can score at most 55; 50% at most 75; complete at most 100',()=>{
 for(const [fraction,expected]of [[10,55],[50,75],[100,100]]){
  const weights=Object.fromEntries(WEIGHTS.map(w=>['weight_'+w[0],0]));weights.weight_location=fraction;weights.weight_layout=100-fraction;
  const p=calculate({rating_location:10},{...DEFAULT_SETTINGS,...weights});assert.equal(p.assessed_pct,fraction);assert.equal(p.score,expected);
 }
});
test('personal ratings contribute both to fit and assessment',()=>{
 const c={...DEFAULT_SETTINGS,...Object.fromEntries(WEIGHTS.map(w=>['weight_'+w[0],0])),weight_ru_overall:10,weight_mara_overall:10};
 const p=calculate({ru_overall:10,mara_overall:0},c);assert.equal(p.fit_score,50);assert.equal(p.score,50);assert.equal(p.assessed_pct,100);
 const one=calculate({ru_overall:10},c);assert.equal(one.score,75);assert.equal(one.assessed_pct,50);
});
test('unknown is not zero; explicit zero is assessed; zero tax override is retained',()=>{
 const empty=calculate({},DEFAULT_SETTINGS);assert.equal(empty.score,'');assert.equal(empty.assessed_pct,0);
 const zero=calculate({rating_noise:0,tax_annual_override:0,rent_pcm:0},DEFAULT_SETTINGS);assert.ok(zero.assessed_pct>0);assert.equal(zero.tax_monthly,0);assert.equal(zero.total_monthly,0);
});
test('space choices, unit conversion and unknown council tax',()=>{
 const p=calculate({area_value:887,area_unit:'ft²',art_craft:'Maybe',studio:'No'},DEFAULT_SETTINGS);assert.ok(Math.abs(p.area_m2-82.40499648)<1e-7);assert.equal(p.fit_score,25);assert.equal(p.tax_monthly,'');
 const m=calculate({area_value:100,area_unit:'m²'},DEFAULT_SETTINGS);assert.ok(Math.abs(m.area_ft2-1076.391)<.01);
});
test('neighbour migration preserves uncertainty',()=>{
 assert.equal(normalize({neighbours_above:'Yes',neighbours_below:'Yes'}).neighbours,'Above and below');assert.equal(normalize({neighbours_above:'Yes',neighbours_below:'Unknown'}).neighbours,'Unknown');assert.equal(normalize({neighbours_above:'No',neighbours_below:'No'}).neighbours,'None');
});
test('all requested boroughs and validation boundaries',()=>{
 assert.equal(ENUMS.borough.length,12);assert.ok(ENUMS.borough.includes('Barking and Dagenham'));assert.ok(ENUMS.borough.includes('Tower Hamlets'));
 assert.throws(()=>validatePatch({ru_overall:11}),/Invalid number/);assert.throws(()=>validatePatch({rating_noise:-1}),/Invalid number/);assert.throws(()=>validatePatch({borough:'Invented'}),/Invalid/);assert.throws(()=>validatePatch({url:'javascript:alert(1)'}),/http/);
 assert.equal(validatePatch({ru_overall:0}).ru_overall,0);assert.equal(validatePatch({rating_noise:''}).rating_noise,'');
 assert.equal(canonical('https://www.onthemarket.com/details/1/?utm_source=x#hi'),canonical('https://www.onthemarket.com/details/1/'));
 assert.notEqual(canonical('https://example.com/listing?id=1'),canonical('https://example.com/listing?id=2'));
});

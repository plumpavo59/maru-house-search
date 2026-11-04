import {SCHEMAS} from '../public/model.js';
const quoted=name=>"'"+name.replaceAll("'","''")+"'";
const cell=v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:typeof v==='boolean'?{boolValue:v}:{stringValue:String(v??'')}});
function column(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
export class SheetsStore{
  constructor(auth,sheetId){this.auth=auth;this.sheetId=sheetId;this.base=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;this.tables={};}
  async request(path,method='GET',body){const r=await this.auth.request({url:this.base+path,method,data:body,retry:false});return r.data;}
  async read(){
    const meta=await this.request('?fields=sheets.properties');
    const found=Object.fromEntries(meta.sheets.map(s=>[s.properties.title,s.properties]));
    const names=Object.keys(SCHEMAS).filter(n=>found[n]);
    if(!found.Properties)throw Object.assign(new Error('Import the supplied tracker into Google Sheets first, then configure its spreadsheet ID.'),{status:409});
    const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'FORMATTED_STRING'});
    for(const n of names)params.append('ranges',quoted(n));
    const response=await this.request('/values:batchGet?'+params);
    this.tables={};
    names.forEach((name,i)=>{const values=response.valueRanges[i].values||[],headers=values[0]||[];if(!headers.length)throw new Error('Missing headers in '+name);if(headers.some((h,i)=>!h||headers.indexOf(h)!==i))throw new Error('Blank or duplicate headers in '+name);this.tables[name]={sheetId:found[name].sheetId,headers,rows:values.slice(1).map((r,index)=>({rowIndex:index+1,values:Object.fromEntries(headers.map((h,j)=>[h,r[j]??'']))}))};});
    return this;
  }
  async ensureSchema(){
    const requests=[];let nextId=Math.max(0,...Object.values(this.tables).map(t=>t.sheetId))+1;
    for(const [name,expected]of Object.entries(SCHEMAS)){
      const t=this.tables[name];
      if(!t){const sheetId=nextId++;requests.push({addSheet:{properties:{sheetId,title:name,hidden:name==='Metadata',gridProperties:{rowCount:1000,columnCount:Math.max(26,expected.length)}}}});requests.push({updateCells:{start:{sheetId,rowIndex:0,columnIndex:0},rows:[{values:expected.map(cell)}],fields:'userEnteredValue'}});continue;}
      if(name==='Properties'&&!['id','title','url'].every(k=>t.headers.includes(k)))throw new Error('This is not a Maru tracker. Use the supplied workbook.');
      const missing=expected.filter(k=>!t.headers.includes(k));
      if(missing.length){requests.push({appendDimension:{sheetId:t.sheetId,dimension:'COLUMNS',length:missing.length}});requests.push({updateCells:{start:{sheetId:t.sheetId,rowIndex:0,columnIndex:t.headers.length},rows:[{values:missing.map(cell)}],fields:'userEnteredValue'}});}
    }
    if(requests.length){await this.request(':batchUpdate','POST',{requests});await this.read();for(const [name,headers]of Object.entries(SCHEMAS))if(this.tables[name]&&this.tables[name].headers.length===0)await this.request('/values/'+encodeURIComponent(quoted(name)+'!A1')+'?valueInputOption=RAW','PUT',{values:[headers]});}
    return this;
  }
  rows(name){return (this.tables[name]?.rows||[]).map(r=>({...r.values}));}
  async commit({patches=[],appends=[],deletes=[]}){
    const requests=[];
    for(const {table,id,key='id',values}of patches){const t=this.tables[table],row=t.rows.find(r=>r.values[key]===id);if(!row)throw new Error('Record was removed. Refresh.');for(const [k,v]of Object.entries(values)){const col=t.headers.indexOf(k);if(col<0)throw new Error('Missing column '+k);requests.push({updateCells:{start:{sheetId:t.sheetId,rowIndex:row.rowIndex,columnIndex:col},rows:[{values:[cell(v)]}],fields:'userEnteredValue'}});}}
    for(const {table,values}of appends){const t=this.tables[table];requests.push({appendCells:{sheetId:t.sheetId,rows:[{values:t.headers.map(k=>cell(values[k]??''))}],fields:'userEnteredValue'}});}
    for(const {table,id}of deletes){const t=this.tables[table],r=t.rows.find(r=>r.values.id===id);if(!r)throw new Error('Record was removed.');requests.push({deleteDimension:{range:{sheetId:t.sheetId,dimension:'ROWS',startIndex:r.rowIndex,endIndex:r.rowIndex+1}}});}
    if(requests.length)await this.request(':batchUpdate','POST',{requests});
    await this.read();
  }
}

// Local preview/tests only; production always uses the Sheets API.
export class MemoryStore{
  constructor(tables){this.tables=structuredClone(tables);}
  async read(){return this;}async ensureSchema(){return this;}
  rows(name){return structuredClone(this.tables[name]||[]);}
  async commit({patches=[],appends=[],deletes=[]}){const next=structuredClone(this.tables);for(const {table,id,key='id',values}of patches){const r=next[table].find(r=>r[key]===id);if(!r)throw new Error('Record removed');Object.assign(r,values);}for(const {table,values}of appends)(next[table]??=[]).push(structuredClone(values));for(const {table,id}of deletes)next[table]=next[table].filter(r=>r.id!==id);this.tables=next;}
}

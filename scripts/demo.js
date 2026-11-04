import fs from 'node:fs/promises';
import {MemoryStore} from '../src/store.js';
import {createServer} from '../src/server.js';
const file=process.env.DEMO_DATA_FILE||'private-data/tracker.json';
let data;try{data=JSON.parse(await fs.readFile(file,'utf8'));}catch{throw new Error('Place the supplied private tracker.json in private-data/, or set DEMO_DATA_FILE.');}
const server=createServer({demoStore:new MemoryStore(data)}),port=Number(process.env.PORT||3000);
server.listen(port,'127.0.0.1',()=>console.log(`Local preview: http://127.0.0.1:${port} (memory only)`));

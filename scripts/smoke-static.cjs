'use strict';
// HTTP-only verification: no browser automation, WebSocket, or model request.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const zlib=require('node:zlib');
const base=process.env.CHATGPT_WEB_URL||'http://127.0.0.1:18765';
function request(path,headers={},method='GET'){
 const url=new URL(path,base);
 return new Promise((resolve,reject)=>{
  const req=require(url.protocol==='https:'?'node:https':'node:http').request(url,{headers,method},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);
  });req.setTimeout(30000,()=>req.destroy(Error('HTTP timeout')));req.on('error',reject);req.end();
 });
}
async function main(){
 const login=await request(fs.readFileSync('.logs/access-url','utf8').trim());
 const cookie=(login.headers['set-cookie']?.[0]||'').split(';')[0];
 const html=await request('/',{cookie});assert.equal(html.status,200);
 const asset=html.body.toString().match(/assets\/app-shared-[\w-]+\.js/);assert(asset,'Expected original App shared module');
 for(const path of ['/'+asset[0],'/bridge/client.js','/bridge/entry.js','/']){
  const raw=await request(path,{cookie,'accept-encoding':'identity'});assert.equal(raw.status,200);
  assert.equal(raw.headers['cache-control'],'private, no-cache');
  for(const format of ['br','gzip']){
   const result=await request(path,{cookie,'accept-encoding':format});
   assert.equal(result.headers['content-encoding'],format);assert.equal(result.headers.vary,'Accept-Encoding');
   assert.deepEqual(format==='br'?zlib.brotliDecompressSync(result.body):zlib.gunzipSync(result.body),raw.body);
   const cached=await request(path,{cookie,'accept-encoding':format,'if-none-match':result.headers.etag});
   assert.equal(cached.status,304);assert.equal(cached.body.length,0);
   const head=await request(path,{cookie,'accept-encoding':format},'HEAD');
   assert.equal(head.body.length,0);assert.equal(Number(head.headers['content-length']),result.body.length);
   if(path.includes('app-shared'))console.log(`${format}: ${raw.body.length} -> ${result.body.length} bytes; revalidation: 304`);
  }
  if(process.env.CHATGPT_WEB_AUTH!=='none'){
   const denied=await request(path,{'if-none-match':raw.headers.etag});assert.equal(denied.status,401);assert.equal(denied.headers['cache-control'],'no-store');
  }
 }
 for(const path of ['/bridge/bootstrap','/bridge/status'])assert.equal((await request(path,{cookie})).headers['cache-control'],'no-store');
 console.log('PASS: compression, exact decompression, authenticated revalidation, HEAD, private cache and dynamic no-store');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

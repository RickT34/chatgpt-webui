'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const zlib=require('node:zlib');
const createSender=require('../bridge/static.cjs');
const source=Buffer.from('const greeting = "你好，world";\n'.repeat(4000));
async function fixture(run){
 let content=source;const send=createSender({maxBytes:1024});
 const server=http.createServer((req,res)=>send(req,res,content,req.url==='/image'?'image/png':'text/javascript').catch(e=>res.destroy(e)));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const request=(headers={},method='GET',path='/')=>new Promise((resolve,reject)=>{
  const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  });req.on('error',reject);req.end();
 });
 try{await run(request,value=>{content=value;});}finally{await new Promise(resolve=>server.close(resolve));}
}
test('negotiates real Brotli/gzip bodies, supports identity and HEAD',()=>fixture(async request=>{
 for(const format of ['br','gzip','identity']){
  const res=await request({'accept-encoding':format});assert.equal(res.status,200);
  assert.deepEqual(format==='br'?zlib.brotliDecompressSync(res.body):format==='gzip'?zlib.gunzipSync(res.body):res.body,source);
  assert.equal(Number(res.headers['content-length']),res.body.length);
  assert.equal(res.headers['content-encoding'],format==='identity'?undefined:format);
  const head=await request({'accept-encoding':format},'HEAD');assert.equal(head.body.length,0);assert.equal(head.headers['content-length'],res.headers['content-length']);
 }
 assert.equal((await request()).headers['content-encoding'],undefined);
}));
test('private cache revalidates across encodings and invalidates changed content',()=>fixture(async(request,change)=>{
 const first=await request({'accept-encoding':'gzip'});
 assert.equal(first.headers['cache-control'],'private, no-cache');assert.equal(first.headers.vary,'Accept-Encoding');
 for(const tag of [first.headers.etag,first.headers.etag.slice(2),`"other", ${first.headers.etag}`,'*']){
  const res=await request({'accept-encoding':'br','if-none-match':tag});assert.equal(res.status,304);assert.equal(res.body.length,0);
 }
 change(Buffer.from('new adapter content'));
 const fresh=await request({'if-none-match':first.headers.etag});assert.equal(fresh.status,200);assert.notEqual(fresh.headers.etag,first.headers.etag);
 assert.equal(fresh.body.toString(),'new adapter content');
}));
test('respects disabled encodings, quality preferences, and uncompressed binary files',()=>fixture(async request=>{
 assert.equal((await request({'accept-encoding':'gzip;q=0.8,br;q=0.2,identity;q=0'})).headers['content-encoding'],'gzip');
 assert.equal((await request({'accept-encoding':'br;q=0,gzip;q=0'})).headers['content-encoding'],undefined);
 assert.equal((await request({'accept-encoding':'*;q=0'})).status,406);
 assert.equal((await request({'accept-encoding':'*;q=0,identity;q=1'})).status,200);
 assert.equal((await request({'accept-encoding':'br,gzip'},'GET','/image')).headers['content-encoding'],undefined);
}));
test('concurrent compression and eviction preserve response bytes',()=>fixture(async(request,change)=>{
 const results=await Promise.all(Array.from({length:8},()=>request({'accept-encoding':'br'})));
 for(const res of results)assert.deepEqual(zlib.brotliDecompressSync(res.body),source);
 for(let i=0;i<12;i++){
  const data=require('node:crypto').randomBytes(512);change(data);
  assert.deepEqual(zlib.gunzipSync((await request({'accept-encoding':'gzip'})).body),data);
 }
 change(source);assert.deepEqual(zlib.brotliDecompressSync((await request({'accept-encoding':'br'})).body),source);
}));

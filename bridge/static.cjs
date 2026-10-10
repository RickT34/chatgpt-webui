'use strict';
const {createHash}=require('node:crypto');
const {promisify}=require('node:util');
const zlib=require('node:zlib');
const gzip=promisify(zlib.gzip),brotli=promisify(zlib.brotliCompress);

function encoding(header,compressible){
 const qualities=new Map();
 for(const item of (header||'').toLowerCase().split(',')){
  const [name,...parameters]=item.trim().split(';');
  if(!name)continue;
  const q=parameters.map(p=>p.trim()).find(p=>p.startsWith('q='));
  const value=q===undefined?1:Number(q.slice(2));
  qualities.set(name,Number.isFinite(value)&&value>=0&&value<=1?value:0);
 }
 const quality=name=>qualities.get(name)??(name==='identity'?(qualities.get('*')===0?0:1):(qualities.get('*')??0));
 return (compressible?['br','gzip','identity']:['identity'])
  .filter(name=>quality(name)>0).sort((a,b)=>quality(b)-quality(a))[0];
}

module.exports=function createStaticSender({maxBytes=64*1024*1024}={}){
 const cache=new Map(),pending=new Map();let bytes=0;
 async function compressed(key,data,format){
  if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   const result=await (format==='br'?brotli(data,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:4}}):gzip(data,{level:6}));
   if(result.length<=maxBytes){
    while(bytes+result.length>maxBytes){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).length;cache.delete(oldest);}
    cache.set(key,result);bytes+=result.length;
   }
   return result;
  })();
  pending.set(key,task);
  try{return await task;}finally{pending.delete(key);}
 }
 return async function send(req,res,data,type){
  const hash=createHash('sha256').update(data).digest('hex');
  // Revalidate every URL: even hashed App JS can be rewritten by adapter updates.
  const etag=`W/"${hash}"`;
  const headers={'content-type':type,'cache-control':'private, no-cache',
   'etag':etag,'vary':'Accept-Encoding','x-content-type-options':'nosniff'};
  const format=encoding(req.headers['accept-encoding'],/^(text\/|application\/(?:javascript|json|wasm)|image\/svg\+xml)/.test(type));
  if(!format){res.writeHead(406,{'cache-control':'no-store','vary':'Accept-Encoding'});res.end();return;}
  if(format!=='identity')headers['content-encoding']=format;
  const matches=(req.headers['if-none-match']||'').split(',').map(v=>v.trim().replace(/^W\//,''));
  if(matches.includes('*')||matches.includes(etag.slice(2))){res.writeHead(304,headers);res.end();return;}
  const body=format==='identity'?data:await compressed(`${hash}:${format}`,data,format);
  headers['content-length']=body.length;
  res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:body);
 };
};

// Prepared bodies live on disk, so conditional requests need neither a file
// read nor hashing/compression, and large responses use stream backpressure.
module.exports.prepared=function preparedSender(directory,manifest){
 const fs=require('node:fs'),path=require('node:path');
 return async function send(req,res,name,{immutable=false}={}){
  const entry=Object.hasOwn(manifest.entries,name)?manifest.entries[name]:null;
  if(!entry){res.writeHead(404,{'cache-control':'no-store'});res.end('Not found');return;}
  const format=encoding(req.headers['accept-encoding'],!!entry.variants.br);
  if(!format){res.writeHead(406,{'cache-control':'no-store','vary':'Accept-Encoding'});res.end();return;}
  const headers={'content-type':entry.type,'cache-control':immutable?'private, max-age=31536000, immutable':'private, no-cache',
   etag:entry.etag,vary:'Accept-Encoding','x-content-type-options':'nosniff'};
  if(format!=='identity')headers['content-encoding']=format;
  const tags=(req.headers['if-none-match']||'').split(',').map(v=>v.trim().replace(/^W\//,''));
  if(tags.includes('*')||tags.includes(entry.etag.slice(2))){res.writeHead(304,headers);res.end();return;}
  const variant=entry.variants[format];headers['content-length']=variant.size;
  if(req.method==='HEAD'){res.writeHead(200,headers);res.end();return;}
  const stream=fs.createReadStream(path.join(directory,'objects',variant.file));
  stream.once('open',()=>{res.writeHead(200,headers);stream.pipe(res);});
  stream.on('error',()=>{if(!res.headersSent){res.writeHead(500,{'cache-control':'no-store'});res.end('Prepared resource is unavailable; run setup again');}else res.destroy();});
  res.on('close',()=>stream.destroy());
 };
};

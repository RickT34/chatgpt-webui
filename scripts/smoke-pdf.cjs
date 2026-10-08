'use strict';
// Verify the original PDF worker over HTTP without driving the browser UI.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const vm=require('node:vm');
async function main(){
 const manifest=JSON.parse(await fs.readFile('prepare-manifest.json','utf8'));
 const archive=await fs.open(manifest.source,'r');
 let header,base;
 try{
  const prefix=Buffer.alloc(16);await archive.read(prefix,0,16,0);
  base=8+prefix.readUInt32LE(4);
  const data=Buffer.alloc(prefix.readUInt32LE(12));await archive.read(data,0,data.length,16);header=JSON.parse(data.toString());
  const assets=header.files.webview.files.assets.files;
  const names=Object.keys(assets).filter(name=>/^pdf\.worker.*\.mjs$/.test(name));
  assert(names.length,'No bundled PDF module worker found; check App version');
  const login=(await fs.readFile('.logs/access-url','utf8')).trim(),baseUrl=new URL(login).origin;
  const auth=await fetch(login,{redirect:'manual'}),cookie=(auth.headers.get('set-cookie')||'').split(';')[0];
  const html=await (await fetch(baseUrl,{headers:{cookie}})).text();
  assert.match(html,/worker-src[^;]*&#39;self&#39;/,'Original same-origin worker CSP missing');
  for(const name of names){
   const response=await fetch(baseUrl+'/assets/'+name,{headers:{cookie}});
   assert.equal(response.status,200);
   assert.match(response.headers.get('content-type'),/^(text|application)\/javascript(?:;|$)/,'Module worker must be served as JavaScript');
   assert.equal(response.headers.get('x-content-type-options'),'nosniff');
   const data=Buffer.from(await response.arrayBuffer());
   const original=Buffer.alloc(assets[name].size);await archive.read(original,0,original.length,base+Number(assets[name].offset));
   assert.equal(crypto.createHash('sha256').update(data).digest('hex'),crypto.createHash('sha256').update(original).digest('hex'));
   new vm.SourceTextModule(data.toString(),{identifier:name});
   console.log('PASS: PDF worker has JavaScript MIME, original bytes, valid module syntax and compatible CSP');
  }
 }finally{await archive.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

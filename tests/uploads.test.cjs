const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Readable}=require('node:stream');
const createUploads=require('../bridge/uploads.cjs');
function request(name,bytes,extra={}){const r=Readable.from([bytes]);r.headers={'x-upload-name':encodeURIComponent(name),'x-upload-group':'test-group',...extra};return r;}
test('binary upload, safe names, ownership, retain and cleanup',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'web-uploads-'));const owner={},other={};const uploads=createUploads(root,{limit:16});
 try{
  const bytes=Buffer.from([0,255,1,128]);const result=await uploads.receive(request('测试.bin',bytes),owner,()=>true);
  assert.deepEqual(await fs.readFile(result.path),bytes);assert.equal(result.name,'测试.bin');
  assert.throws(()=>uploads.paths([result.id],other),/失效/);
  uploads.retain([result.id],owner);await uploads.cancel(owner);assert.deepEqual(await fs.readFile(result.path),bytes);
  const removed=await uploads.receive(request('cancel.txt',Buffer.from('test')),owner,()=>true);
  await uploads.discardGroup('test-group',owner);await assert.rejects(fs.stat(removed.path),{code:'ENOENT'});
  await assert.rejects(uploads.receive(request('late.txt',bytes),owner,()=>true),e=>e.status===409);
  for(const name of ['../escape','a/b','a\\b','..'])await assert.rejects(uploads.receive(request(name,bytes),other,()=>true),/文件名/);
  await assert.rejects(uploads.receive(request('too-big',Buffer.alloc(17)),other,()=>true),e=>e.status===413);
  await assert.rejects(uploads.receive(request('too-big',bytes,{'content-length':'17'}),other,()=>true),e=>e.status===413);
  await assert.rejects(uploads.receive(request('disconnected',bytes),other,()=>false),e=>e.status===409);
  assert.equal((await fs.readdir(root)).length,1,'Only retained file remains');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('cancel an upload while its stream is still arriving',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'web-uploads-'));const owner={},uploads=createUploads(root);
 try{
  const stream=Readable.from((async function*(){yield Buffer.from('first');await uploads.discardGroup('inflight',owner);yield Buffer.from('second');})());
  stream.headers={'x-upload-name':'test.txt','x-upload-group':'inflight'};
  await assert.rejects(uploads.receive(stream,owner,()=>true),e=>e.status===409);
  assert.deepEqual(await fs.readdir(root),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const createDownloads=require('../bridge/downloads.cjs');
test('save dialogs create isolated files and publish only completed writes',async()=>{
 const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),'web-downloads-'));const events=[];
 const downloads=createDownloads(root,{send:m=>events.push(m)});const restore=downloads.install();
 try{
  const save=downloads.open({defaultPath:'copy.txt'}),id=events[0].value.id;
  await assert.rejects(downloads.choose(id,'../outside'),/文件名/);
  await downloads.choose(id,'copy.txt');const result=await save;
  assert.equal(result.canceled,false);assert.equal(downloads.get(id),null);
  await fs.promises.writeFile(result.filePath,'original bytes');
  assert.equal(events.filter(e=>e.kind==='download-ready').length,1);
  assert.equal(await fs.promises.readFile(downloads.get(id).path,'utf8'),'original bytes');
  const next=downloads.open({defaultPath:'atomic.pdf'}),nextId=events.at(-1).value.id;
  await downloads.choose(nextId,'atomic.pdf');const destination=(await next).filePath;
  await fs.promises.writeFile(destination+'.part','pdf bytes');assert.equal(downloads.get(nextId),null);
  await fs.promises.rename(destination+'.part',destination);assert(downloads.get(nextId));
  const filtered=downloads.open({defaultPath:'logs',filters:[{extensions:['txt']}]});const filteredId=events.at(-1).value.id;
  await downloads.choose(filteredId,'logs');assert.equal(path.extname((await filtered).filePath),'.txt');
  const canceled=downloads.open();downloads.cancel();assert.equal((await canceled).canceled,true);
 }finally{restore();await fs.promises.rm(root,{recursive:true,force:true});}
});

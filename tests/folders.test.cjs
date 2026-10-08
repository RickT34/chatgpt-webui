const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const createPicker=require('../bridge/folders.cjs');
test('host directory listing, validation and native-compatible selection',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'web-folders-'));
 try{
  await fs.mkdir(path.join(root,'visible'));await fs.mkdir(path.join(root,'.hidden'));
  await fs.writeFile(path.join(root,'file.txt'),'test');await fs.symlink(path.join(root,'visible'),path.join(root,'link'));
  let request;const picker=createPicker({send:m=>request=m.value});const selection=picker.open({defaultPath:root});
  const list=await picker.call('folder.list',[request.id,root,false]);
  assert.deepEqual(list.directories.map(x=>x.name),['link','visible']);
  assert.equal((await picker.call('folder.list',[request.id,root,true])).directories.length,3);
  await assert.rejects(picker.call('folder.select',[request.id,path.join(root,'file.txt')]),/不是文件夹/);
  await assert.rejects(picker.call('folder.list',['wrong',root]),/失效/);
  await picker.call('folder.select',[request.id,path.join(root,'link')]);
  assert.deepEqual(await selection,{canceled:false,filePaths:[path.join(root,'visible')]});
  const canceled=picker.open();picker.cancel();assert.deepEqual(await canceled,{canceled:true,filePaths:[]});
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('host file selection respects filters, multi-select and cancellation',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'web-host-files-'));let request;
 const picker=createPicker({send:m=>request=m});
 try{
  await fs.writeFile(path.join(root,'a.txt'),'one');await fs.writeFile(path.join(root,'b.txt'),'two');await fs.writeFile(path.join(root,'image.png'),'three');
  const result=picker.open({properties:['openFile','multiSelections'],filters:[{extensions:['txt']}]});
  assert.equal(request.kind,'file-open');const id=request.value.id;
  const listing=await picker.call('folder.list',[id,root]);assert.deepEqual(listing.files.map(v=>v.name),['a.txt','b.txt']);
  await assert.rejects(picker.call('folder.select',[id,[path.join(root,'image.png')]]),/类型/);
  await picker.call('folder.select',[id,[path.join(root,'a.txt'),path.join(root,'b.txt')]]);
  assert.deepEqual((await result).filePaths,[path.join(root,'a.txt'),path.join(root,'b.txt')]);
  const canceled=picker.open({properties:['openFile']});
  await assert.rejects(picker.call('folder.select',[request.value.id,[path.join(root,'a.txt'),path.join(root,'b.txt')]]),/数量/);
  picker.cancel();assert.equal((await canceled).canceled,true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

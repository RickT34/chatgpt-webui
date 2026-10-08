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

'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
function failure(message,status=400){return Object.assign(new Error(message),{status});}
module.exports=function createUploads(root,{limit=32*1024*1024}={}){
 const pending=new Map(),canceledGroups=new WeakMap();let active=0;
 function records(ids,owner){
  if(!Array.isArray(ids)||!ids.length||ids.length>100)throw failure('请选择文件');
  return ids.map(id=>{const value=pending.get(id);if(!value||value.owner!==owner)throw failure('上传记录已失效，请重新选择文件');return value;});
 }
 return {
  async receive(request,owner,alive){
   if(active>=4)throw failure('同时上传的文件过多，请稍后重试',429);
   let name;
   try{name=decodeURIComponent(request.headers['x-upload-name']||'');}catch{throw failure('文件名编码无效');}
   if(!name||name==='.'||name==='..'||/[\/\\\x00-\x1f]/.test(name)||Buffer.byteLength(name)>240)throw failure('文件名无效');
   const declared=request.headers['content-length'];
   if(declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw failure('单个文件不能超过 32 MiB',413);
   const group=request.headers['x-upload-group'];
   if(typeof group!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(group))throw failure('上传批次无效');
   const available=()=>alive()&&!canceledGroups.get(owner)?.has(group);
   if(!available())throw failure('上传已取消',409);
   const id=crypto.randomUUID(),directory=path.join(root,id),filename=path.join(directory,name);
   active++;let file;
   try{
    await fs.mkdir(directory,{recursive:true,mode:0o700});file=await fs.open(filename,'wx',0o600);
    let size=0;
    for await(const chunk of request){
     if(!available())throw failure('浏览器连接已断开',409);
     size+=chunk.length;if(size>limit)throw failure('单个文件不能超过 32 MiB',413);
     // FileHandle.write may write less than the supplied buffer.
     let offset=0;while(offset<chunk.length){const {bytesWritten}=await file.write(chunk,offset,chunk.length-offset);offset+=bytesWritten;}
    }
    if(!available())throw failure('浏览器连接已断开',409);
    await file.close();file=null;
    pending.set(id,{owner,group,path:filename,directory});
    return {id,path:filename,name,size};
   }catch(error){if(file)await file.close().catch(()=>{});await fs.rm(directory,{recursive:true,force:true});throw error;}
   finally{active--;}
  },
  paths(ids,owner){return records(ids,owner).map(value=>value.path);},
  retain(ids,owner){records(ids,owner);for(const id of ids)pending.delete(id);},
  async discard(ids,owner){
   for(const id of ids||[]){const value=pending.get(id);if(value?.owner===owner){pending.delete(id);await fs.rm(value.directory,{recursive:true,force:true});}}
  },
  async discardGroup(group,owner){
   let groups=canceledGroups.get(owner);if(!groups){groups=new Set();canceledGroups.set(owner,groups);}groups.add(group);
   await this.discard([...pending].filter(([,v])=>v.owner===owner&&v.group===group).map(([id])=>id),owner);
  },
  async cancel(owner){await this.discard([...pending].filter(([,v])=>v.owner===owner).map(([id])=>id),owner);},
 };
};

'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
module.exports=function createFolderPicker({send}){
 let pending=null;
 async function directory(input){
  if(typeof input!=='string'||!path.isAbsolute(input))throw Error('请输入宿主机上的绝对路径');
  const resolved=await fs.realpath(input);
  if(!(await fs.stat(resolved)).isDirectory())throw Error('该路径不是文件夹');
  return resolved;
 }
 return {
  open(options={}){
   if(pending)return Promise.resolve({canceled:true,filePaths:[]});
   return new Promise(resolve=>{
    const id=crypto.randomUUID();pending={id,resolve};
    send({kind:'folder-open',value:{id,initialPath:options.defaultPath||os.homedir(),home:os.homedir()}});
   });
  },
  cancel(){if(pending){const {resolve}=pending;pending=null;resolve({canceled:true,filePaths:[]});}},
  async call(method,args){
   const [id,input,hidden]=args;
   if(!pending||pending.id!==id)throw Error('文件夹选择窗口已失效，请重新打开');
   const active=pending;
   if(method==='folder.cancel'){this.cancel();return;}
   if(method==='folder.select'){
    const selected=await directory(input);
    if(pending!==active)throw Error('文件夹选择窗口已关闭');
    pending=null;active.resolve({canceled:false,filePaths:[selected]});return selected;
   }
   if(method!=='folder.list')throw Error('不支持的文件夹操作');
   const current=await directory(input);
   const entries=await fs.readdir(current,{withFileTypes:true});
   const directories=[];
   // Bound simultaneous stats while following links to directories.
   for(let offset=0;offset<entries.length;offset+=32){
    const batch=await Promise.all(entries.slice(offset,offset+32).map(async entry=>{
     if(!hidden&&entry.name.startsWith('.'))return null;
     let isDirectory=entry.isDirectory();
     if(entry.isSymbolicLink())try{isDirectory=(await fs.stat(path.join(current,entry.name))).isDirectory();}catch{return null;}
     return isDirectory?{name:entry.name,path:path.join(current,entry.name)}:null;
    }));directories.push(...batch.filter(Boolean));
   }
   directories.sort((a,b)=>a.name.localeCompare(b.name));
   return {path:current,parent:path.dirname(current),directories};
  }
 };
};

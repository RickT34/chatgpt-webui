'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
function accepted(name,extensions){return !extensions.length||extensions.includes('*')||extensions.includes(path.extname(name).slice(1).toLowerCase());}
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
    const id=crypto.randomUUID(),files=options.properties?.includes('openFile')===true;
    const extensions=(options.filters||[]).flatMap(f=>f.extensions||[]).map(x=>x.toLowerCase());
    pending={id,resolve,files,multiple:options.properties?.includes('multiSelections')===true,extensions};
    send({kind:files?'file-open':'folder-open',value:{id,initialPath:options.defaultPath||os.homedir(),home:os.homedir(),multiple:pending.multiple,extensions}});
   });
  },
  cancel(){if(pending){const {resolve}=pending;pending=null;resolve({canceled:true,filePaths:[]});}},
  async call(method,args){
   const [id,input,hidden]=args;
   if(!pending||pending.id!==id)throw Error('文件夹选择窗口已失效，请重新打开');
   const active=pending;
   if(method==='folder.cancel'){this.cancel();return;}
   if(method==='folder.select'){
    let selected;
    if(active.files){
     if(!Array.isArray(input)||input.length===0||input.length>100||(!active.multiple&&input.length>1))throw Error('文件数量无效');
     selected=await Promise.all(input.map(async value=>{
      if(typeof value!=='string'||!path.isAbsolute(value))throw Error('文件路径必须是绝对路径');
      if(!accepted(value,active.extensions))throw Error('文件类型不符合附件要求');
      const real=await fs.realpath(value);
      if(!(await fs.stat(real)).isFile())throw Error('请选择普通文件');
      await fs.access(real,4);return path.resolve(value);
     }));
    }else selected=[await directory(input)];
    if(pending!==active)throw Error('文件夹选择窗口已关闭');
    pending=null;active.resolve({canceled:false,filePaths:selected});return active.files?selected:selected[0];
   }
   if(method!=='folder.list')throw Error('不支持的文件夹操作');
   const current=await directory(input);
   const entries=await fs.readdir(current,{withFileTypes:true});
   const directories=[],files=[];
   // Bound simultaneous stats while following links to directories.
   for(let offset=0;offset<entries.length;offset+=32){
    const batch=await Promise.all(entries.slice(offset,offset+32).map(async entry=>{
     if(!hidden&&entry.name.startsWith('.'))return null;
     let stat=entry;
     if(entry.isSymbolicLink())try{stat=await fs.stat(path.join(current,entry.name));}catch{return null;}
     const value={name:entry.name,path:path.join(current,entry.name)};
     if(stat.isDirectory())return value;
     if(active.files&&stat.isFile()&&accepted(entry.name,active.extensions))files.push(value);
     return null;
    }));directories.push(...batch.filter(Boolean));
   }
   directories.sort((a,b)=>a.name.localeCompare(b.name));
   files.sort((a,b)=>a.name.localeCompare(b.name));
   return {path:current,parent:path.dirname(current),directories,files};
  }
 };
};

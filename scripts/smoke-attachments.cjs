'use strict';
// Protocol-only test: no browser automation and no model requests.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {once}=require('node:events');
const {WebSocket}=require('ws');
const codec=require('../bridge/codec.js');
async function main(){
 const login=(await fs.readFile('.logs/access-url','utf8')).trim(),base=new URL(login).origin;
 const auth=await fetch(login,{redirect:'manual'}),cookie=(auth.headers.get('set-cookie')||'').split(';')[0];
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/bridge/socket',{headers:{cookie,origin:base}});
 const messages=[];ws.on('message',data=>messages.push(codec.unpack(data.toString())));await once(ws,'open');let next=1;
 async function receive(predicate){for(let i=0;i<300;i++){const index=messages.findIndex(predicate);if(index>=0)return messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,50));}throw Error('Attachment protocol response timed out');}
 async function rpc(method,...args){const id=next++;ws.send(codec.pack({kind:'call',method,args,id}));const result=await receive(m=>m.kind==='result'&&m.id===id);if(result.error)throw Error(result.error);return result.value;}
 async function pick(){
  const requestId='attachment-test-'+next;
  const completion=rpc('sendMessageFromView',{type:'fetch',requestId,method:'POST',url:'vscode://codex/pick-files',body:JSON.stringify({allowMultiple:true,acceptedFileExtensions:['txt'],pickerTitle:'Attachment protocol test'})});
  // Observe rejections immediately while awaiting the native dialog notification.
  completion.catch(()=>{});
  const opened=await receive(m=>m.kind==='file-open');
  return {id:opened.value.id,async finish(){await completion;const result=await receive(m=>m.kind==='event'&&m.value?.type==='fetch-response'&&m.value.requestId===requestId);assert.equal(result.value.responseType,'success');return result.value.body||JSON.parse(result.value.bodyJsonString);}};
 }
 const fixtures=await fs.mkdtemp(path.resolve('.logs/attachment-test-'));let retained;
 try{
  const hostFile=path.join(fixtures,'host.txt');await fs.writeFile(hostFile,'host attachment test');
  let dialog=await pick();const listing=await rpc('folder.list',dialog.id,fixtures,false);assert(listing.files.some(f=>f.path===hostFile));
  await rpc('folder.select',dialog.id,[hostFile]);assert.equal((await dialog.finish()).files[0].fsPath,hostFile);
  console.log('PASS: original pick-files returns the selected host file');
  dialog=await pick();
  const headers={cookie,origin:base,'x-chatgpt-web-upload':'1','x-upload-name':encodeURIComponent('客户端.txt'),'x-upload-group':dialog.id};
  const denied=await fetch(base+'/bridge/upload',{method:'POST',headers:{...headers,origin:'https://other.example'},body:'test'});assert.equal(denied.status,403);
  const data=Buffer.from('client upload test\n中文\0binary');
  const response=await fetch(base+'/bridge/upload',{method:'POST',headers,body:data});assert.equal(response.status,201);
  const uploaded=await response.json();retained=path.dirname(uploaded.path);assert.deepEqual(await fs.readFile(uploaded.path),data);
  await rpc('folder.selectUploads',dialog.id,[uploaded.id]);assert.equal((await dialog.finish()).files[0].fsPath,uploaded.path);
  console.log('PASS: client bytes stored intact and original pick-files returns the staged file');
  dialog=await pick();await rpc('folder.cancel',dialog.id);assert.deepEqual((await dialog.finish()).files,[]);
  console.log('PASS: cancellation returns no attachments');
 }finally{ws.close();await fs.rm(fixtures,{recursive:true,force:true});if(retained)await fs.rm(retained,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{once}=require('node:events');
const {WebSocket}=require('ws'),codec=require('../bridge/codec.js');
async function main(){
 const login=(await fs.readFile('.logs/access-url','utf8')).trim(),base=new URL(login).origin;
 const auth=await fetch(login,{redirect:'manual'}),cookie=(auth.headers.get('set-cookie')||'').split(';')[0];
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/bridge/socket',{headers:{cookie,origin:base}}),messages=[];
 ws.on('message',data=>messages.push(codec.unpack(data.toString())));await once(ws,'open');let id=1;
 async function receive(predicate){for(let n=0;n<400;n++){const i=messages.findIndex(predicate);if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,50));}throw Error('Native adapter response timed out');}
 async function call(method,...args){const requestId=id++;ws.send(codec.pack({kind:'call',id:requestId,method,args}));const result=await receive(m=>m.kind==='result'&&m.id===requestId);if(result.error)throw Error(result.error);return result.value;}
 const moduleUrl=pathToFileURL(path.join(path.dirname(require.resolve('capnweb')),'index.js')).href;
 const {newMessagePortRpcSession}=await import(moduleUrl);
 const source=(await fs.readFile('bridge/rpc-client.mjs','utf8')).replace("'./capnweb.js'",JSON.stringify(moduleUrl));
 const {adaptAppHost}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const channel=new MessageChannel();let copied='';const ui=newMessagePortRpcSession(channel.port1,{services:{downloads:{stateChanged:()=>{}},appUpdates:{stateChanged:()=>{}},clientCoordination:{}}});
 const adapter=adaptAppHost(channel.port2,{writeText:async text=>{copied=text;},readText:async()=>copied});
 const portId=900;adapter.port.onmessage=e=>ws.send(codec.pack({kind:'port',id:portId,value:e.data}));
 ws.on('message',data=>{const m=codec.unpack(data.toString());if(m.kind==='port'&&m.id===portId)adapter.port.postMessage(m.value);});
 ws.send(codec.pack({kind:'port-open',id:portId}));
 const cleanup=[];
 try{
  const services=await ui.services;await services.clipboard.writeText('client clipboard test');assert.equal(copied,'client clipboard test');assert.equal(typeof (await services.appInfo.get()).version,'string');
  console.log('PASS: original App services cross the adapter; clipboard writes reach the client implementation');
  async function completeSave(operation,name,bytes){
   operation.catch(()=>{});const opened=await receive(m=>m.kind==='save-open');await call('download.choose',opened.value.id,name);
   const result=await operation;const notification=await receive(m=>m.kind==='download-ready');
   const response=await fetch(base+notification.value.url,{headers:{cookie}});assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment/);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
   const filePath=result.path;assert(filePath.startsWith(path.resolve('.downloads')+path.sep));cleanup.push(path.dirname(filePath));
   const resource=base+'/@fs'+filePath.split('/').map(encodeURIComponent).join('/');
   const ranged=await fetch(resource,{headers:{cookie,range:'bytes=1-3'}});assert.equal(ranged.status,206);assert.deepEqual(Buffer.from(await ranged.arrayBuffer()),bytes.subarray(1,4));
   assert.match(ranged.headers.get('content-security-policy'),/sandbox/);
   if(new URL(login).pathname==='/login')assert.equal((await fetch(resource)).status,401);
  }
  const data=Buffer.from('browser download bytes');
  await completeSave(Promise.resolve(services.workspaceFiles.saveCopy({bytes:new Uint8Array(data),fileName:'copy.txt',hostId:'local'})),'copy.txt',data);
  console.log('PASS: workspaceFiles.saveCopy creates an authenticated client download with intact bytes');
  const requestId='native-save-'+id;
  const operation=call('sendMessageFromView',{type:'fetch',requestId,method:'POST',url:'vscode://codex/save-file',body:JSON.stringify({kind:'contents',suggestedFilename:'legacy.txt',contentsBase64:data.toString('base64')})}).then(async()=>{
   const event=await receive(m=>m.kind==='event'&&m.value?.type==='fetch-response'&&m.value.requestId===requestId);assert.equal(event.value.responseType,'success');return event.value.body||JSON.parse(event.value.bodyJsonString);
  });
  await completeSave(operation,'legacy.txt',data);
  console.log('PASS: legacy save-file downloads; local resources enforce auth, byte ranges and inert CSP');
 }finally{ui[Symbol.dispose]();adapter.close();channel.port1.close();ws.close();for(const directory of cleanup)await fs.rm(directory,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

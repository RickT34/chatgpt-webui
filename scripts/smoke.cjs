'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {WebSocket}=require('ws');
const codec=require('../bridge/codec.js');
const base=process.env.CHATGPT_WEB_URL || 'http://127.0.0.1:18765';
async function main(){
 const login=fs.readFileSync('.logs/access-url','utf8').trim();
 const auth=await fetch(login,{redirect:'manual'});
 const cookie=(auth.headers.get('set-cookie')||'').split(';')[0];
 assert.equal((await fetch(base)).status,process.env.CHATGPT_WEB_AUTH==='none'?200:401);
 const html=await (await fetch(base,{headers:{cookie}})).text();
 assert.match(html,/bridge\/entry.js/);
 assert.match(html,/Content-Security-Policy/);
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/bridge/socket',{headers:{cookie,origin:base}});
 const messages=[];let notify;
 ws.on('message',data=>{messages.push(codec.unpack(data.toString()));notify?.();});
 await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
 const send=m=>ws.send(codec.pack(m));
 async function receive(predicate){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){let i=messages.findIndex(predicate);if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>{notify=r;setTimeout(r,100);});}
  throw Error('Timed out waiting for response; received kinds: '+messages.map(x=>x.kind));
 }
 try{
  send({kind:'call',method:'getSharedObjectSnapshotValue',args:['nonexistent-web-smoke-key'],id:1});
  const rpc=await receive(m=>m.kind==='result'&&m.id===1);assert.equal(rpc.error,undefined);
  const key='chatgpt-web-smoke-readonly-key';
  send({kind:'call',method:'sendMessageFromView',args:[{type:'shared-object-subscribe',key}],id:4});
  const event=await receive(m=>m.kind==='event'&&m.value?.type==='shared-object-updated'&&m.value.key===key);
  assert.equal(event.value.key,key);
  send({kind:'call',method:'sendMessageFromView',args:[{type:'shared-object-unsubscribe',key}],id:5});
  console.log('PASS: native preload response event reached WebSocket client');
  send({kind:'call',method:'unsupportedMethod',args:[],id:2});
  assert.match((await receive(m=>m.kind==='result'&&m.id===2)).error,/Unsupported/);
  const {newMessagePortRpcSession}=await import('capnweb');
  const {port1,port2}=new MessageChannel();
  const root=newMessagePortRpcSession(port1,{services:{downloads:{stateChanged:()=>{}},appUpdates:{stateChanged:()=>{}},clientCoordination:{}}});
  send({kind:'port-open',id:3});
  port2.onmessage=e=>send({kind:'port',id:3,value:e.data});
  const relay=data=>{const m=codec.unpack(data.toString());if(m.kind==='port'&&m.id===3)port2.postMessage(m.value);};
  ws.on('message',relay);
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error('App-host services handshake timeout')),15000).unref());
  const services=await Promise.race([root.services,timeout]);
  const keys=Object.keys(services);
  assert(keys.length>0,'Expected real App-host services');
  await Promise.race([services.startup.whenReady(),timeout]);
  const info=await services.appInfo.get();
  assert.equal(typeof info.version,'string');
  console.log('App-host services:',keys.length,'App version:',info.version);
  root[Symbol.dispose]();port1.close();port2.close();
  console.log('PASS: auth, original HTML, preload method round-trip, rejected unknown method, App-host MessagePort response');
 }finally{ws.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
test('clipboard is local, failures propagate, other services and callbacks cross both sessions',async()=>{
 const moduleUrl=pathToFileURL(path.join(path.dirname(require.resolve('capnweb')),'index.js')).href;
 const {RpcTarget,newMessagePortRpcSession}=await import(moduleUrl);
 const source=fs.readFileSync('bridge/rpc-client.mjs','utf8').replace("'./capnweb.js'",JSON.stringify(moduleUrl));
 const {adaptAppHost}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const a=new MessageChannel(),b=new MessageChannel();let localText='',hostWrites=0,callback='';
 class LocalCallback extends RpcTarget{notify(value){callback=value;}}
 class OriginalView extends RpcTarget{get services(){return {callback:new LocalCallback()};}}
 class HostClipboard extends RpcTarget{writeText(){hostWrites++;}}
 class Info extends RpcTarget{get(){return 'original app';}}
 class OriginalHost extends RpcTarget{get services(){return {clipboard:new HostClipboard(),appInfo:new Info()};}}
 const view=newMessagePortRpcSession(a.port1,new OriginalView());
 const adapter=adaptAppHost(a.port2,{writeText:async value=>{if(value==='denied')throw Error('denied by browser');localText=value;},readText:async()=>localText});
 const host=newMessagePortRpcSession(b.port1,new OriginalHost());
 adapter.port.onmessage=e=>b.port2.postMessage(e.data);b.port2.onmessage=e=>adapter.port.postMessage(e.data);
 try{
  const services=await view.services;
  await services.clipboard.writeText('client text');assert.equal(localText,'client text');assert.equal(hostWrites,0);
  assert.equal(await services.clipboard.readText(),'client text');
  await assert.rejects(Promise.resolve(services.clipboard.writeText('denied')),/denied by browser/);
  assert.equal(await services.appInfo.get(),'original app');
  const callbacks=await host.services;await callbacks.callback.notify('round trip');assert.equal(callback,'round trip');
 }finally{view[Symbol.dispose]();host[Symbol.dispose]();adapter.close();a.port1.close();b.port1.close();b.port2.close();}
});

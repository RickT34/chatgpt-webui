import {newMessagePortRpcSession,RpcTarget,RpcStub} from './capnweb.js';
// Two RPC sessions preserve callbacks and service references while replacing only
// the desktop clipboard service. No dependency on private export-table IDs.
export function adaptAppHost(uiPort,clipboard){
 const network=new MessageChannel();let ui;
 class Clipboard extends RpcTarget {
  writeText(text){return clipboard.writeText(text);}
  readText(){return clipboard.readText();}
  get bookmark(){return undefined;}
 }
 class View extends RpcTarget {get services(){return ui.services;}}
 const host=newMessagePortRpcSession(network.port1,new View());
 let services,resolveReady,rejectReady;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 // Observe the UI's existing request. Do not initiate another services request or
 // call startup.whenReady(), which belongs to the original frontend lifecycle.
 ready.catch(()=>{});
 class Host extends RpcTarget {
  get services(){return services??=new RpcStub(async()=>{
   try{const value=await host.services;resolveReady();return {...value,clipboard:new Clipboard()};}
   catch(error){rejectReady(error);throw error;}
  })();}
 }
 ui=newMessagePortRpcSession(uiPort,new Host());
 return {port:network.port2,ready(){return ready;},close(){rejectReady(Error('App service connection closed'));ui[Symbol.dispose]();host[Symbol.dispose]();network.port1.close();network.port2.close();uiPort.close();}};
}

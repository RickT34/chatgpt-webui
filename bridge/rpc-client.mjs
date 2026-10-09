import {newMessagePortRpcSession,RpcTarget,RpcStub} from './capnweb.js';
// Two RPC sessions preserve callbacks and service references while adapting
// desktop clipboard and window startup services. No dependency on private export-table IDs.
export function adaptAppHost(uiPort,clipboard,{onPhase=()=>{}}={}){
 const network=new MessageChannel();let ui;
 class Clipboard extends RpcTarget {
  writeText(text){return clipboard.writeText(text);}
  readText(){return clipboard.readText();}
  get bookmark(){return undefined;}
 }
 // The browser has its own window lifecycle. Native whenReady() is gated by
 // the hidden desktop window's startup critical path, not this RPC connection.
 class Startup extends RpcTarget {
  constructor(native){super();this.native=native.dup();}
  async whenReady(){return undefined;}
  async isSentryEnabled(){return this.native.isSentryEnabled();}
  async reach(phase){onPhase(phase);return this.native.reach(phase);}
  [Symbol.dispose](){this.native[Symbol.dispose]();}
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
   try{const value=await host.services;resolveReady();return {...value,clipboard:new Clipboard(),...(value.startup?{startup:new Startup(value.startup)}:{})};}
   catch(error){rejectReady(error);throw error;}
  })();}
 }
 ui=newMessagePortRpcSession(uiPort,new Host());
 return {port:network.port2,ready(){return ready;},close(){rejectReady(Error('App service connection closed'));ui[Symbol.dispose]();host[Symbol.dispose]();network.port1.close();network.port2.close();uiPort.close();}};
}

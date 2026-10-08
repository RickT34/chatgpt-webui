function connectRelay() {
  if (!window.electronBridge || window.__chatgptWebRelay) return;
  window.__chatgptWebRelay = true;
  const bridge = window.electronBridge;
  const ws = {readyState:1,send:data=>window.chatgptWebTransport.send(data)};
  window.chatgptWebTransport.subscribe(data=>ws.onmessage?.({data}));
  const ports = new Map();
  const workers = new Map();
  const send = value => {if(ws.readyState===1)ws.send(window.chatgptWebCodec.pack(value));};
  const snapshot = {};
  for(const name of ['getSystemThemeVariant','getSentryInitOptions','getDesktopUserAgent','getAppSessionId','getBuildFlavor','getInitialSidebarBootstrap','isDeviceCheckSupported','isIntelMacBuild']) {
    try {snapshot[name]=bridge[name]?.();}catch(e){console.warn('[chatgpt-web]',name,e.message);}
  }
  snapshot.shared = window.chatgptWebTransport.getSnapshot() || {};
  send({kind:'snapshot',value:snapshot});
  window.addEventListener('message',event=>{
    // The original preload dispatches synthetic MessageEvents with source === null.
    if((event.source!==null && event.source!==window) || event.data?.type==='connect-app-host')return;
    try{send({kind:'event',value:event.data});}catch{}
  });
  bridge.subscribeToSystemThemeVariant(()=>send({kind:'theme',value:bridge.getSystemThemeVariant()}));
  ws.onmessage=async event=>{
    const m=window.chatgptWebCodec.unpack(event.data);
    try{
      if(m.kind==='disconnect') {for(const p of ports.values())p.close();ports.clear();for(const stop of workers.values())stop();workers.clear();return;}
      if(m.kind==='port-open'){
        const {port1,port2}=new MessageChannel();ports.set(m.id,port1);
        port1.onmessage=e=>send({kind:'port',id:m.id,value:e.data});
        window.postMessage({type:'connect-app-host',port:port2},window.location.origin,[port2]);return;
      }
      if(m.kind==='port'){ports.get(m.id)?.postMessage(m.value);return;}
      if(m.kind==='worker-subscribe'){
        if(!workers.has(m.id))workers.set(m.id,bridge.subscribeToWorkerMessages(m.id,value=>send({kind:'worker',id:m.id,value})));return;
      }
      if(m.kind==='call'){
        const allowed=['sendMessageFromView','sendWorkerMessageFromView','acknowledgeChunkedMessage','getFastModeRolloutMetrics','showContextMenu','getSharedObjectSnapshotValue'];
        if(!allowed.includes(m.method))throw Error(`Unsupported bridge method: ${m.method}`);
        const value=await bridge[m.method](...m.args);send({kind:'result',id:m.id,value});
      }
    }catch(e){send({kind:'result',id:m.id,error:e.message});}
  };
}

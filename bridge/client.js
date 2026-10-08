'use strict';
window.chatgptWebReady=(async()=>{
  let bootstrap;
  for(let attempt=0;attempt<60;attempt++){
    const response=await fetch('/bridge/bootstrap');
    if(response.ok){bootstrap=window.chatgptWebCodec.decode(await response.json());break;}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!bootstrap)throw Error('App renderer did not become ready within 60 seconds');
  const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/bridge/socket`);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let nextId=1;
  const pending=new Map(), ports=new Map(), workers=new Map(), themeSubscribers=new Set();
  const shared=bootstrap.shared || {};
  const send=value=>ws.send(window.chatgptWebCodec.pack(value));
  const call=(method,...args)=>new Promise((resolve,reject)=>{
    const id=nextId++;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error(`Bridge timeout: ${method}`));},60000);
    pending.set(id,{resolve,reject,timer});send({kind:'call',method,args,id});
  });
  const folderPicker=window.chatgptWebFolderPicker(call);
  window.codexWindowType='electron';
  window.electronBridge={
    windowType:'electron',getPreloadStartedAtMs:()=>performance.timeOrigin,
    ...Object.fromEntries(Object.entries(bootstrap).filter(([k])=>k!=='shared').map(([k,v])=>[k,()=>v])),
    sendMessageFromView:message=>{if(message.type==='shared-object-set')shared[message.key]=message.value;return call('sendMessageFromView',message);},
    acknowledgeChunkedMessage:(...args)=>{void call('acknowledgeChunkedMessage',...args);},
    sendWorkerMessageFromView:(...args)=>call('sendWorkerMessageFromView',...args),
    subscribeToWorkerMessages:(id,callback)=>{
      if(!workers.has(id)){workers.set(id,new Set());send({kind:'worker-subscribe',id});}
      workers.get(id).add(callback);return()=>workers.get(id)?.delete(callback);
    },
    getSharedObjectSnapshotValue:key=>shared[key],
    getSystemThemeVariant:()=>bootstrap.getSystemThemeVariant,
    subscribeToSystemThemeVariant:cb=>{themeSubscribers.add(cb);return()=>themeSubscribers.delete(cb);},
    getPathForFile:()=>null,startFileDrag:()=>false,startLinkDrag:()=>{},
    showContextMenu:(...args)=>call('showContextMenu',...args),
    getFastModeRolloutMetrics:(...args)=>call('getFastModeRolloutMetrics',...args),
    triggerSentryTestError:async()=>{},
  };
  document.documentElement.dataset.theme=bootstrap.getSystemThemeVariant;
  window.addEventListener('message',event=>{
    if(event.source!==window || event.data?.type!=='connect-app-host')return;
    const id=nextId++, port=event.data.port || event.ports[0];
    ports.set(id,port);port.onmessage=e=>send({kind:'port',id,value:e.data});
    send({kind:'port-open',id});
  });
  ws.onmessage=event=>{
    const m=window.chatgptWebCodec.unpack(event.data);
    if(m.kind==='folder-open'){folderPicker.open(m.value);return;}
    if(m.kind==='result'){
      const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
      m.error?p.reject(Error(m.error)):p.resolve(m.value);
    }else if(m.kind==='port')ports.get(m.id)?.postMessage(m.value);
    else if(m.kind==='worker')workers.get(m.id)?.forEach(cb=>cb(m.value));
    else if(m.kind==='theme'){bootstrap.getSystemThemeVariant=m.value;themeSubscribers.forEach(cb=>cb());}
    else if(m.kind==='event'){
      if(m.value?.type==='shared-object-updated')shared[m.value.key]=m.value.value;
      window.dispatchEvent(new MessageEvent('message',{data:m.value}));
    }
  };
  ws.onclose=()=>{
    folderPicker.close();
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('App bridge disconnected'));}pending.clear();
    const banner=document.createElement('div');banner.textContent='App 连接已断开，请刷新页面重新连接。';
    banner.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px;background:#822;color:white;text-align:center';document.body.append(banner);
  };
})();
window.chatgptWebReady.catch(error=>{
  const show=()=>{
    const box=document.createElement('pre');
    box.textContent='App Web 桥接启动失败：'+(error?.message || String(error))+'\n请确认 App 副本仍在运行，并关闭其他已连接的浏览器标签页后刷新。';
    box.style.cssText='white-space:pre-wrap;padding:24px;color:#c33;font:16px sans-serif';document.body.append(box);
  };
  if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});
});

'use strict';
exports.heartbeat=function heartbeat(ws,{interval=15000,timeout=45000,now=Date.now,onTick=()=>{}}={}){
 let lastPong=now();
 const pong=()=>{lastPong=now();};
 const tick=()=>{if(now()-lastPong>=timeout){ws.terminate();return;}if(ws.readyState===1){ws.ping();onTick();}};
 const timer=setInterval(tick,interval);timer.unref?.();
 ws.on('pong',pong);
 ws.once('close',()=>{clearInterval(timer);ws.off('pong',pong);});
 ws.on('error',()=>ws.terminate());
 return tick;
};
exports.watchRenderer=function watchRenderer(wc,invalidate){
 wc.on('did-start-navigation',(_event,_url,inPlace,mainFrame)=>{if(mainFrame&&!inPlace)invalidate('App renderer navigating',false);});
 wc.on('did-fail-load',(_event,code,_description,_url,mainFrame)=>{if(mainFrame&&code!==-3)invalidate('App renderer failed to load',false);});
 wc.on('render-process-gone',()=>invalidate('App renderer process gone',false));
 wc.once('destroyed',()=>invalidate('App renderer destroyed',true));
};

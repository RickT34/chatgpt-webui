'use strict';
// Runs inside the original Electron main process, before its original entrypoint.
const {app, ipcMain, dialog} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {WebSocketServer} = require(path.join(process.env.CHATGPT_WEB_ROOT, 'node_modules/ws'));
const access=require('./web-access.cjs')();
const {port,origin}=access;
const webroot = path.join(app.getAppPath(), 'webview');
const originalHtml = fs.readFileSync(path.join(webroot,'index.html'),'utf8');
const entryMatch=originalHtml.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
if(!entryMatch)throw Error('Unsupported App: cannot locate renderer module entry');
const rendererEntry=entryMatch[1].replace(/^\.\//,'/');
const codec=require('./web-codec.js');
let peer = null;
let relayContentsId = null;
let snapshot = null;
let client = null;
const folderPicker=require('./web-folders.cjs')({send:message=>client?.send(codec.pack(message))});
const nativeOpenDialog=dialog.showOpenDialog.bind(dialog);
dialog.showOpenDialog=(...args)=>{
  const options=args.length>1?args[1]:args[0];
  const owner=args.length>1?args[0]:null;
  if(client?.readyState===1 && options?.properties?.includes('openDirectory') &&
     !options.properties.includes('openFile') && (!owner || owner.webContents?.id===relayContentsId)){
    return folderPicker.open(options);
  }
  return nativeOpenDialog(...args);
};
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.woff2':'font/woff2', '.json':'application/json', '.wasm':'application/wasm'};
const authorized=access.authorized;
function json(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
const server = http.createServer((req,res)=>{
  res.setHeader('Referrer-Policy','no-referrer');
  const u = new URL(req.url, origin);
  if (u.pathname === '/login' && access.acceptsToken(u.searchParams.get('token'))) {
    res.writeHead(303,{'set-cookie':access.cookie,location:'/'});return res.end();
  }
  if (!authorized(req)) {res.writeHead(401);return res.end('Open the login URL printed by scripts/start.sh.');}
  if(u.pathname==='/bridge/bootstrap') return json(res,snapshot?200:503,snapshot || {error:'App renderer is not ready'});
  if(u.pathname==='/bridge/status') return json(res,200,{peer:!!peer,snapshot:!!snapshot,browser:!!client});
  if(u.pathname==='/bridge/entry.js') {
    res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});
    return res.end(`await window.chatgptWebReady; await import(${JSON.stringify(rendererEntry)});`);
  }
  if(req.method!=='GET') {res.writeHead(405);return res.end();}
  try {
    let file;
    if(u.pathname==='/bridge/client.js') file=path.join(__dirname,'web-client.js');
    else if(u.pathname==='/bridge/codec.js') file=path.join(__dirname,'web-codec.js');
    else if(u.pathname==='/bridge/folder-picker.js') file=path.join(__dirname,'web-folder-picker.js');
    else if(u.pathname==='/bridge/folder-picker.css') file=path.join(__dirname,'web-folder-picker.css');
    else {
      const relative=decodeURIComponent(u.pathname).replace(/^\/+/, '');
      file=path.resolve(webroot,relative || 'index.html');
      if(!file.startsWith(webroot+path.sep)) {res.writeHead(403);return res.end();}
      if(!fs.existsSync(file) && !path.extname(relative)) file=path.join(webroot,'index.html');
    }
    let data=fs.readFileSync(file);
    if(path.basename(file)==='index.html') {
      let html=data.toString().replace('<head>','<head><base href="/">');
      html=html.replace(/<meta name="referrer" content="[^"]+"/,'<meta name="referrer" content="no-referrer"');
      html=html.replace('connect-src ',`connect-src ${access.websocketOrigin} `);
      html=html.replace(entryMatch[0],'<script src="/bridge/codec.js"></script><link rel="stylesheet" href="/bridge/folder-picker.css"><script src="/bridge/folder-picker.js"></script><script src="/bridge/client.js"></script><script type="module" src="/bridge/entry.js"></script>');
      data=Buffer.from(html);
    }
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(data);
  }catch(e){res.writeHead(404);res.end('Not found');}
});
const wss = new WebSocketServer({noServer:true,maxPayload:32*1024*1024});
server.on('upgrade',(req,socket,head)=>{
  const u=new URL(req.url,origin);
  if(u.pathname!=='/bridge/socket' || !authorized(req) || !access.allowsWebSocket(req)) {socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  if(client) {socket.end('HTTP/1.1 409 Conflict\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>{
    client=ws;
    ws.on('message',async data=>{
      let message;try{message=codec.unpack(data.toString());}catch{ws.close(1007,'Invalid message');return;}
      if(message.kind==='call' && typeof message.method==='string' && message.method.startsWith('folder.')){
        try{const value=await folderPicker.call(message.method,message.args);if(ws.readyState===1)ws.send(codec.pack({kind:'result',id:message.id,value}));}
        catch(error){if(ws.readyState===1)ws.send(codec.pack({kind:'result',id:message.id,error:error.message}));}
        return;
      }
      if(peer?.readyState===1)peer.send(data.toString());
      else ws.close(1013,'App renderer unavailable');
    });
    ws.on('close',()=>{folderPicker.cancel();client=null;peer?.send(JSON.stringify({kind:'disconnect'}));});
  });
});
const relayTargets = new Set();
ipcMain.on('chatgpt-web:from-relay',(event,data)=>{
  if(event.sender.id!==relayContentsId || !relayTargets.has(event.sender.id))return;
  let message;try{message=JSON.parse(data);}catch{return;}
  if(message.kind==='snapshot'){
    const wc=event.sender;
    peer={readyState:1,send:data=>{if(!wc.isDestroyed())wc.send('chatgpt-web:to-relay',data);},close:()=>{}};
    snapshot=message.value;console.log('[chatgpt-web] renderer bridge ready');return;
  }
  if(message.kind==='event' && snapshot){
    const eventValue=codec.decode(message.value);
    if(eventValue?.type==='shared-object-updated'){
      const current=codec.decode(snapshot);current.shared[eventValue.key]=eventValue.value;snapshot=codec.encode(current);
    }
  }
  if(client?.readyState===1)client.send(data);
});
server.on('error',err=>{console.error('[chatgpt-web]',err.message);app.quit();});
server.listen(port,'127.0.0.1',()=>{
  const dir=path.join(process.env.CHATGPT_WEB_ROOT,'.logs');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(dir,'access-url'),`${access.accessUrl}\n`,{mode:0o600});
  if(access.mode==='none')console.log('[chatgpt-webui] Access-token authentication is disabled.');
  console.log(`[chatgpt-webui] Open ${access.accessUrl}`);
});
app.on('web-contents-created',(_event,wc)=>{
  wc.once('destroyed',()=>{
    relayTargets.delete(wc.id);
    if(relayContentsId===wc.id){relayContentsId=null;peer=null;snapshot=null;client?.close(1012,'App renderer closed');}
  });
  wc.on('did-finish-load',()=>{
    const url=wc.getURL();
    if(!url.startsWith('app://') && !url.startsWith('codex://') && !url.startsWith('file://'))return;
    // Auxiliary renderers (e.g. avatar overlay) also have electronBridge.
    // Keep the first primary renderer as the single owner of the browser relay.
    if(relayContentsId!==null && relayContentsId!==wc.id)return;
    relayContentsId=wc.id;
    relayTargets.add(wc.id);
    const source=fs.readFileSync(path.join(__dirname,'web-relay.js'),'utf8');
    const codec=fs.readFileSync(path.join(__dirname,'web-codec.js'),'utf8');
    wc.executeJavaScript(`${codec};(${source})()`).catch(e=>console.error('[chatgpt-web] injection failed',e.message));
  });
});
app.on('before-quit',()=>{client?.close();peer?.close();server.close();});

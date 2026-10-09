'use strict';
const fs=require('node:fs');
const path=require('node:path');
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.avif':'image/avif','.pdf':'application/pdf','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.json':'text/plain; charset=utf-8','.js':'text/plain; charset=utf-8','.html':'text/plain; charset=utf-8'};
function resourcePath(url){
 if(!url.pathname.startsWith('/@fs/'))return null;
 const file=decodeURIComponent(url.pathname.slice(4));
 if(!path.isAbsolute(file)||file.includes('\0'))throw Error('Invalid resource path');
 return file;
}
async function serveFile(req,res,file,{downloadName}={}){
 let handle;
 try{
  handle=await fs.promises.open(file,'r');const stat=await handle.stat();
  if(!stat.isFile()){await handle.close();res.writeHead(404);res.end();return;}
  const type=mime[path.extname(file).toLowerCase()]||'application/octet-stream';
  const headers={'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','accept-ranges':'bytes',
   'content-security-policy':"sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",'referrer-policy':'no-referrer'};
  const name=downloadName||(type==='application/octet-stream'?path.basename(file):null);
  if(name)headers['content-disposition']=`attachment; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`;
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){
   const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(m&&(m[1]||m[2])){
    start=m[1]?Number(m[1]):Math.max(0,stat.size-Number(m[2]));
    end=m[1]?(m[2]?Math.min(Number(m[2]),end):end):end;
   }else start=stat.size;
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){await handle.close();res.writeHead(416,{'content-range':`bytes */${stat.size}`});res.end();return;}
   status=206;headers['content-range']=`bytes ${start}-${end}/${stat.size}`;
  }
  headers['content-length']=Math.max(0,end-start+1);res.writeHead(status,headers);
  if(req.method==='HEAD'||stat.size===0){await handle.close();res.end();return;}
  const stream=handle.createReadStream({start,end,autoClose:true});handle=null;
  stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch(error){if(handle)await handle.close().catch(()=>{});if(!res.headersSent){res.writeHead(error.code==='EACCES'?403:404);res.end();}else res.destroy();}
}
module.exports={resourcePath,serveFile};

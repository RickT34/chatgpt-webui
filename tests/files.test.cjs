const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Writable}=require('node:stream');
const {once}=require('node:events');
const {resourcePath,serveFile}=require('../bridge/files.cjs');
class Response extends Writable{
 constructor(){super();this.parts=[];this.headersSent=false;}
 _write(chunk,_encoding,done){this.parts.push(chunk);done();}
 writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;return this;}
}
test('local resources decode safely and stream ranges with inert document policy',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'web-files-'));const file=path.join(root,'image.svg');await fs.writeFile(file,'0123456789');
 try{
  assert.equal(resourcePath(new URL('http://local/@fs'+encodeURI(file))),file);
  assert.throws(()=>resourcePath(new URL('http://local/@fs/%00')),/Invalid/);
  for(const [range,status,body] of [[undefined,200,'0123456789'],['bytes=2-5',206,'2345'],['bytes=-3',206,'789'],['bytes=99-',416,'']]){
   const response=new Response(),done=once(response,'finish');await serveFile({method:'GET',headers:{range}},response,file);await done;
   assert.equal(response.status,status);assert.equal(Buffer.concat(response.parts).toString(),body);
   if(status!==416){assert.match(response.headers['content-security-policy'],/sandbox/);assert.equal(response.headers['x-content-type-options'],'nosniff');}
  }
  const response=new Response(),done=once(response,'finish');await serveFile({method:'HEAD',headers:{}},response,file,{downloadName:'报告.svg'});await done;
  assert.equal(response.parts.length,0);assert.match(response.headers['content-disposition'],/attachment; filename\*=UTF-8''/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

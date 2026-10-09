const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('rewrite only local resource URLs and preserve binary data and ordinary text',()=>{
 const window={};new Function('window','location',fs.readFileSync('bridge/resources.js','utf8'))(window,{origin:'https://web.example'});
 const bytes=new Uint8Array([0,255]);const data={image:'app://fs/@fs/tmp/a%20b.png',icon:'app://fs/tmp/c.svg',text:'Example: app://fs/example',bytes,bodyJsonString:JSON.stringify({url:'app://fs/@fs/tmp/d.pdf'})};
 const result=window.chatgptWebResources.rewrite(data);
 assert.equal(result.image,'https://web.example/@fs/tmp/a%20b.png');assert.equal(result.icon,'https://web.example/@fs/tmp/c.svg');
 assert.equal(result.text,data.text);assert.equal(result.bytes,bytes);assert.equal(JSON.parse(result.bodyJsonString).url,'https://web.example/@fs/tmp/d.pdf');
});

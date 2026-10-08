const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const codec=require('../bridge/codec.js');
test('forward synthetic preload responses with null source; reject other windows',()=>{
 const listeners=new Map(),sent=[];
 const window={electronBridge:{subscribeToSystemThemeVariant:()=>{}},chatgptWebCodec:codec,
  chatgptWebTransport:{send:data=>sent.push(codec.unpack(data)),subscribe:()=>{},getSnapshot:()=>({})},
  addEventListener:(name,callback)=>listeners.set(name,callback)};
 new Function('window','('+fs.readFileSync('bridge/relay.js','utf8')+')()')(window);
 sent.length=0;
 const data={type:'shared-object-updated',key:'loading-state',value:'ready'};
 listeners.get('message')({source:null,data});
 assert.deepEqual(sent,[{kind:'event',value:data}]);
 listeners.get('message')({source:{},data});
 assert.equal(sent.length,1);
 listeners.get('message')({source:window,data:{type:'connect-app-host'}});
 assert.equal(sent.length,1);
});

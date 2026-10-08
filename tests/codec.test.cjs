const {test}=require('node:test');
const assert=require('node:assert/strict');
const codec=require('../bridge/codec.js');
test('MessagePort values survive websocket JSON transport',()=>{
 const payload={missing:undefined,bytes:new Uint16Array([0,256,65535]),dataView:new DataView(new Uint8Array([1,2]).buffer),
  binary:new Uint8Array([0,255]).buffer,big:1234567890123456789n,nan:NaN,inf:Infinity,date:new Date('2026-01-01'),
  map:new Map([['key',new Set([1,2])]]),array:[undefined,null,{'__proto__':'ordinary input'}]};
 assert.deepEqual(codec.unpack(codec.pack({kind:'port',value:payload})).value,payload);
});
test('object keys cannot set decoded object prototypes',()=>{
 const input=JSON.parse('{"__proto__":{"polluted":true}}');
 const result=codec.decode(codec.encode(input));
 assert.equal(Object.getPrototypeOf(result),Object.prototype);
 assert.equal({}.polluted,undefined);
 assert.deepEqual(Object.getOwnPropertyDescriptor(result,'__proto__').value,{polluted:true});
});
test('reject unsupported values explicitly',()=>{
 assert.throws(()=>codec.encode(new WeakMap()),/Unsupported bridge value/);
 assert.throws(()=>codec.decode(['typed','Function',[]]),/Invalid typed array/);
});

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {bootstrap,connect,wait}=require('../bridge/startup.js');
const {heartbeat,watchRenderer}=require('../bridge/lifecycle.cjs');
test('bootstrap has a deadline even if fetch ignores abort, and does not retry expired authentication',async()=>{
 let signal;
 await assert.rejects(bootstrap((_url,options)=>{signal=options.signal;return new Promise(()=>{});},{timeout:30,requestTimeout:10}),/超时/);
 assert(signal.aborted);
 let calls=0;
 await assert.rejects(bootstrap(async()=>{calls++;return {status:401};}),/登录已过期/);assert.equal(calls,1);
 await assert.rejects(bootstrap(async()=>({status:503}),{timeout:20,retry:2}),/未就绪/);
 await assert.rejects(bootstrap(async()=>({ok:true,json:()=>new Promise(()=>{})}),{timeout:10}),/超时/);
});
test('bootstrap retries only not-ready responses and returns a completed snapshot',async()=>{
 let calls=0;
 const value=await bootstrap(async()=>++calls===1?{status:503}:{ok:true,json:async()=>({shared:{}})},{retry:1});
 assert.deepEqual(value,{shared:{}});assert.equal(calls,2);
 await assert.rejects(bootstrap(async()=>({status:500})),/500/);
});
class Socket extends EventTarget{close(){this.closed=true;this.dispatchEvent(new Event('close'));}}
test('WebSocket opening timeout and early close reject; listeners are removed on success',async()=>{
 const stalled=new Socket();await assert.rejects(connect(stalled,10),/超时/);assert(stalled.closed);
 const closing=new Socket(),closed=connect(closing);closing.close();await assert.rejects(closed,/连接失败/);
 const socket=new Socket(),ready=connect(socket);socket.dispatchEvent(new Event('open'));assert.equal(await ready,socket);socket.close();
 await assert.rejects(wait(new Promise(()=>{}),10,'App handshake timeout'),/handshake timeout/);
});
test('heartbeat clears stalled connections and accepts pongs; close stops further checks',()=>{
 let now=0;const ws=new EventEmitter();ws.readyState=1;ws.ping=()=>{ws.pings=(ws.pings||0)+1;};ws.terminate=()=>{ws.dead=true;ws.emit('close');};
 const tick=heartbeat(ws,{interval:100000,timeout:45,now:()=>now});
 now=30;tick();assert.equal(ws.pings,1);ws.emit('pong');now=60;tick();assert(!ws.dead);now=75;tick();assert(ws.dead);assert.equal(ws.listenerCount('pong'),0);
});
test('only main-frame navigation/failure and renderer loss invalidate readiness',()=>{
 const wc=new EventEmitter(),events=[];watchRenderer(wc,(...args)=>events.push(args));
 wc.emit('did-start-navigation',{},'url',false,false);wc.emit('did-start-navigation',{},'url',true,true);
 wc.emit('did-fail-load',{},-3,'canceled','url',true);assert.equal(events.length,0);
 wc.emit('did-start-navigation',{},'url',false,true);wc.emit('did-fail-load',{},-2,'failed','url',true);
 wc.emit('render-process-gone');wc.emit('destroyed');assert.equal(events.length,4);assert.equal(events.at(-1)[1],true);
});

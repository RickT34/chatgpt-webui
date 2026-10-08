const {test}=require('node:test');
const assert=require('node:assert/strict');
const createAccess=require('../bridge/access.cjs');
test('random authentication rejects absent and invalid credentials',()=>{
 const a=createAccess({}), b=createAccess({});const token=new URL(a.accessUrl).searchParams.get('token');
 assert.notEqual(a.accessUrl,b.accessUrl);assert(a.acceptsToken(token));assert(!a.acceptsToken('bad'));
 assert(!a.authorized({headers:{}}));assert(a.authorized({headers:{cookie:a.cookie.split(';')[0]}}));
 assert(!a.authorized({headers:{cookie:`chatgpt_web=${token}`}}));
 assert(!a.authorized({headers:{cookie:b.cookie.split(';')[0]}}));
});
test('custom tokens are URL encoded and HTTPS uses secure cookies and WSS',()=>{
 const token='custom test/+& token with spaces';const a=createAccess({CHATGPT_WEB_ACCESS_TOKEN:token,CHATGPT_WEB_ORIGIN:'https://chatgpt.example.com'});
 assert.equal(new URL(a.accessUrl).searchParams.get('token'),token);assert(a.acceptsToken(token));
 assert.match(a.cookie,/; Secure$/);assert.equal(a.websocketOrigin,'wss://chatgpt.example.com');
 assert(a.allowsWebSocket({headers:{origin:'https://chatgpt.example.com'}}));
 assert(!a.allowsWebSocket({headers:{origin:'https://other.example.com'}}));
});
test('no-token mode remains origin-restricted',()=>{
 const a=createAccess({CHATGPT_WEB_AUTH:'none'});
 assert.equal(a.accessUrl,'http://127.0.0.1:18765/');assert(a.authorized({headers:{}}));assert(!a.acceptsToken('anything'));
 assert(!a.allowsWebSocket({headers:{origin:'https://other.example.com'}}));
});
test('reject invalid configuration rather than silently disabling protection',()=>{
 for(const env of [{CHATGPT_WEB_AUTH:'off'},{CHATGPT_WEB_ACCESS_TOKEN:''},{CHATGPT_WEB_PORT:'0'},
  {CHATGPT_WEB_ORIGIN:'https://example.com/path'},{CHATGPT_WEB_ORIGIN:'https://user:pass@example.com'},
  {CHATGPT_WEB_AUTH:'none',CHATGPT_WEB_ACCESS_TOKEN:'1234567890123456'}])assert.throws(()=>createAccess(env));
});

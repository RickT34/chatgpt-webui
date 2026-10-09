'use strict';
const crypto=require('node:crypto');
module.exports=function createAccess(env=process.env){
 const port=Number(env.CHATGPT_WEB_PORT || 18765);
 const host=env.CHATGPT_WEB_HOST || '127.0.0.1';
 if(!require('node:net').isIP(host))throw Error('CHATGPT_WEB_HOST must be an IP address');
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('CHATGPT_WEB_PORT must be between 1 and 65535');
 const mode=env.CHATGPT_WEB_AUTH || 'token';
 if(!['token','none'].includes(mode))throw Error('CHATGPT_WEB_AUTH must be token or none');
 const external=new URL(env.CHATGPT_WEB_ORIGIN || `http://127.0.0.1:${port}`);
 if(!['http:','https:'].includes(external.protocol)||external.username||external.password||external.pathname!=='/'||external.search||external.hash)throw Error('CHATGPT_WEB_ORIGIN must be an http(s) origin without a path, credentials, query or fragment');
 const origin=external.origin;
 if(mode==='none'&&env.CHATGPT_WEB_ACCESS_TOKEN!==undefined)throw Error('Do not combine CHATGPT_WEB_AUTH=none with CHATGPT_WEB_ACCESS_TOKEN');
 const token=mode==='none'?null:(env.CHATGPT_WEB_ACCESS_TOKEN??crypto.randomBytes(24).toString('hex'));
 if(token!==null&&(token.length<16||/[\r\n\0]/.test(token)))throw Error('CHATGPT_WEB_ACCESS_TOKEN must have at least 16 characters and no line breaks');
 const session=crypto.randomBytes(32).toString('hex');
 const cookieName='chatgpt_web';
 function equal(a,b){return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
 return {
  port,host,origin,mode,websocketOrigin:origin.replace(/^http/,'ws'),
  accessUrl:mode==='none'?origin+'/':origin+'/login?token='+encodeURIComponent(token),
  acceptsToken:value=>token!==null&&equal(value,token),
  authorized:req=>mode==='none'||(req.headers.cookie||'').split(';').some(v=>equal(v.trim(),`${cookieName}=${session}`)),
  cookie:`${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/${external.protocol==='https:'?'; Secure':''}`,
  allowsWebSocket:req=>req.headers.origin===origin,
 };
};

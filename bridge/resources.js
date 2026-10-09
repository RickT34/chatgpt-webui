'use strict';
window.chatgptWebResources={
 rewrite(value){
  if(typeof value==='string'&&value.startsWith('app://fs/')){
   const suffix=value.slice('app://fs'.length);
   return location.origin+(suffix.startsWith('/@fs/')?suffix:'/@fs'+suffix);
  }
  if(!value||typeof value!=='object'||ArrayBuffer.isView(value)||value instanceof ArrayBuffer)return value;
  if(Array.isArray(value))return value.map(item=>this.rewrite(item));
  if(Object.getPrototypeOf(value)!==Object.prototype)return value;
  return Object.fromEntries(Object.entries(value).map(([key,item])=>{
   if(key==='bodyJsonString'&&typeof item==='string')try{return [key,JSON.stringify(this.rewrite(JSON.parse(item)))];}catch{}
   return [key,this.rewrite(item)];
  }));
 }
};

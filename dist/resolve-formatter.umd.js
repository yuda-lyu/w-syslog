/*!
 * resolve-formatter v1.0.33
 * (c) 2018-2021 yuda-lyu(semisphere)
 * Released under the MIT License.
 */
!function(e,r){"object"==typeof exports&&"undefined"!=typeof module?module.exports=r(require("fs"),require("path"),require("module")):"function"==typeof define&&define.amd?define(["fs","path","module"],r):(e="undefined"!=typeof globalThis?globalThis:e||self)["resolve-formatter"]=r(e.fs,e.path,e.module)}(this,function(e,r,t){"use strict";let o="w-syslog/src/formatter.mjs";return function(n={}){let s=n.fpSelf,i=n.cwd,l=[],f=r.dirname(r.dirname(s)),a=r.join(f,"src","formatter.mjs");if((t=>{try{return"w-syslog"===JSON.parse(e.readFileSync(r.join(t,"package.json"),"utf8")).name}catch(e){return!1}})(f)&&e.existsSync(a))return{fp:a,by:"pkgRoot"};l.push(`package root of ${s}`);try{return{fp:t.createRequire(s).resolve(o),by:"resolveFromSelf"}}catch(e){l.push(`resolve from ${s}`)}try{return{fp:t.createRequire(r.join(i,"index.js")).resolve(o),by:"resolveFromCwd"}}catch(e){l.push(`resolve from ${i}`)}throw new Error(`w-syslog: can not resolve transport target ${o}, tried: ${l.join("; ")}. When bundling, keep w-syslog installed and list "pino" in external`)}});
//# sourceMappingURL=resolve-formatter.umd.js.map

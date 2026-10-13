# w-syslog
A logger based on pino for nodejs, saving log files by day or hour.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-syslog.svg?style=flat)](https://npmjs.org/package/w-syslog) 
[![license](https://img.shields.io/npm/l/w-syslog.svg?style=flat)](https://npmjs.org/package/w-syslog) 
[![npm download](https://img.shields.io/npm/dt/w-syslog.svg)](https://npmjs.org/package/w-syslog) 
[![npm download](https://img.shields.io/npm/dm/w-syslog.svg)](https://npmjs.org/package/w-syslog) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-syslog.svg)](https://www.jsdelivr.com/package/npm/w-syslog)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-syslog/WSyslog.html).

## Installation

### Using npm(ES6 module):
```alias
npm i w-syslog
```

#### Example
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-syslog/blob/master/g.mjs)]
```alias
import fs from 'fs'
import _ from 'lodash-es'
import w from 'wsemi'
import WSyslog from './src/WSyslog.mjs'

w.fsCleanFolder('./_logs')

let log = WSyslog()
log.info({ event: 'runner', msg: 'start' })
log.warn({ event: 'monitor-memory', msg: 'usage-high', ratio: 85.4 })
log.error({ event: 'crash', msg: 'db connection', code: 500 })

await log.clear() //顯式關閉, flush殘餘log並終止transport worker, 之後不可再呼叫log方法

let vpfs = w.fsTreeFolder('./_logs')
// console.log('vpfs', vpfs)

let fp = _.get(vpfs, `0.path`, '')

let jj = fs.readFileSync(fp, 'utf8')
console.log(jj)
// {"level":30,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"runner","msg":"start"}
// {"level":40,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"monitor-memory","msg":"usage-high"}
// {"level":50,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"crash","msg":"db connection","code":500}
```

## Usage
- ES module: `import WSyslog from 'w-syslog'` or `import WSyslog from 'w-syslog/src/WSyslog.mjs'`.
- CommonJS: `const WSyslog = require('w-syslog')` (`main` is `dist/w-syslog.umd.js`).
- Call `await log.clear()` before the process exits to make sure all logs are written. Without `clear()`, pino's exit hook writes the remaining logs on a normal exit or `process.exit()`, but not when the process is killed by a signal or terminated forcibly, so long-running services should `await log.clear()` in their `SIGINT`/`SIGTERM` handlers.
- Do not call any log method after calling `clear()`: a call made while `clear()` is still pending is not written and emits `writeError`, and a call made after `clear()` has resolved makes the host process throw.
- Every logger instance should be cleared; an instance discarded without `clear()` keeps its worker.

## Errors
- `WSyslog()` throws synchronously when `fdLog` can not be created, `timeZone` is not a valid IANA time zone, the transport target `w-syslog/src/formatter.mjs` can not be resolved, or pino has been bundled as its browser build.
- Write failures (for example the log file can not be opened) and transport errors do not terminate the host process. They are written to stderr and emitted as a `writeError` event whose payload is an `Error` object. Listening is optional.
- The `'error'` event, like the other level events (`fatal`, `warn`, `info`, `debug`, `trace`), is only fired by calling the method of the same name, and its payload is `{ args }`; it never carries write failures.
```alias
log.on('writeError', (err) => {
    //write failure or transport error, err is an Error object
})
```
- If `clear()` times out (`timeLimit`, default 60000 ms), the worker is terminated, logs not yet written may be lost, and a notice is written to stderr.

## Bundling
- Bundling w-syslog into a downstream bundle with w-package-tools `rollupFile` is supported. List `pino` as external (bundling pino itself is not supported, see pino `docs/bundling.md`), and listing `module` and `worker_threads` as external is recommended.
- w-syslog must stay installed, so that `w-syslog/src/formatter.mjs` (the transport worker target) can be resolved from the bundle location or the working directory.
- Other bundlers and pnpm/Yarn PnP layouts are not verified.

## Notes
- Use a dedicated `fdLog` for each logger instance: `cleanLogs` deletes the files matching the date pattern in that folder, and concurrent writers to the same folder may interleave lines.
- Old log files beyond `numKeep` are deleted, each with a `'delete'` event (payload `{ fp, fn }`), first on the next event loop turn after `WSyslog()` returns and then every hour, so a listener attached right after creation also receives the first deletions. Calling `clear()` stops the automatic cleanup; if it is called before the first cleanup has run, that cleanup is skipped. Calling `log.cleanLogs()` runs a cleanup at any time.
- `fdLog` is resolved to an absolute path when the logger is created, so a later `process.chdir()` does not affect it.
- If `fdLog` is a symlink or junction, `cleanLogs` follows it and deletes old files according to `numKeep`.
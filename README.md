# w-syslog
A system monitor in nodejs.

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

await w.delay(2000) //等待2秒讓pino能flush數據

let vpfs = w.fsTreeFolder('./_logs')
// console.log('vpfs', vpfs)

let fp = _.get(vpfs, `0.path`, '')

let jj = fs.readFileSync(fp, 'utf8')
console.log(jj)
// {"level":30,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"runner","msg":"start"}
// {"level":40,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"monitor-memory","msg":"usage-high"}
// {"level":50,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"crash","msg":"db connection","code":500}
```
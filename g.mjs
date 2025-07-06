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

//node g.mjs

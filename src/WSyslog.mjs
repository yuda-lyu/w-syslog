import path from 'path'
import { fileURLToPath } from 'url'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import pino from 'pino'


//__dirname
let __filename = fileURLToPath(import.meta.url)
let __dirname = path.dirname(__filename)


/**
 * 輸出log
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.fdLog='./_logs'] 輸入儲存log資料夾字串，預設'./_logs'
 * @param {String} [opt.interval='day'] 輸入儲存log時分檔模式字串，可選'day'、'hr'，分別代表每日或每時分檔，預設'day'
 * @returns {Object} 回傳log物件，提供info、warn、error紀錄函數
 * @example
 * import fs from 'fs'
 * import _ from 'lodash-es'
 * import w from 'wsemi'
 * import WSyslog from './src/WSyslog.mjs'
 *
 * w.fsCleanFolder('./_logs')
 *
 * let log = WSyslog()
 * log.info({ event: 'runner', msg: 'start' })
 * log.warn({ event: 'monitor-memory', msg: 'usage-high', ratio: 85.4 })
 * log.error({ event: 'crash', msg: 'db connection', code: 500 })
 *
 * await w.delay(2000) //等待2秒讓pino能flush數據
 *
 * let vpfs = w.fsTreeFolder('./_logs')
 * // console.log('vpfs', vpfs)
 *
 * let fp = _.get(vpfs, `0.path`, '')
 *
 * let jj = fs.readFileSync(fp, 'utf8')
 * console.log(jj)
 * // {"level":30,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"runner","msg":"start"}
 * // {"level":40,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"monitor-memory","msg":"usage-high"}
 * // {"level":50,"time":1751780174415,"pid":24144,"hostname":"DESKTOP-6R7USAO","event":"crash","msg":"db connection","code":500}
 *
 */
function WSyslog(opt = {}) {

    //fdLog
    let fdLog = get(opt, 'fdLog')
    if (!isestr(fdLog)) {
        fdLog = './_logs'
    }

    //interval
    let interval = get(opt, 'interval')
    if (interval !== 'day' && interval !== 'hr') {
        interval = 'day'
    }

    // 建立 logger，使用自訂 transport
    let transport = pino.transport({
        targets: [
            {

                // fatal: 60
                // error: 50
                // warn: 40
                // info: 30
                // debug: 20
                // trace: 10
                level: 'info', //僅紀錄info(30)以上

                target: path.resolve(__dirname, './formatter.mjs'),

                options: {
                    interval,
                    logDir: fdLog,
                },

            },
        ]
    })

    //log
    let log = pino(transport)
    // console.log('log', log)

    return log
}


export default WSyslog

import fs from 'fs'
import path from 'path'
import { Writable } from 'stream'
import { isMainThread, parentPort, workerData } from 'worker_threads'
import ot from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import fsCreateFolder from 'wsemi/src/fsCreateFolder.mjs'


ot.extend(utc)
ot.extend(timezone)


//EVENT_FORMATTER_ERROR, 經thread-stream之EVENT協定(其README〈Emit events〉)回報主緒之事件名, 須與src/WSyslog.mjs一致(規則帳本R6、R8)
let EVENT_FORMATTER_ERROR = 'wsyslogFormatterError'


//inThreadStream, 是否於thread-stream之worker內(其workerData帶$context.threadStreamVersion), 僅此時才經parentPort回報
let inThreadStream = !isMainThread && parentPort !== null && !!get(workerData, 'workerData.$context.threadStreamVersion')


//report, 寫檔錯誤只記錄並回報, 不拋(規則帳本R8): 記於stderr, 於thread-stream之worker內再回報主緒, 由WSyslog轉發為'writeError'事件
let report = (err) => {
    console.error('w-syslog formatter error:', err)
    if (!inThreadStream) {
        return
    }
    try {
        parentPort.postMessage({
            code: 'EVENT',
            name: EVENT_FORMATTER_ERROR,
            args: [{
                message: String(get(err, 'message', err)),
                code: get(err, 'code', null),
                syscall: get(err, 'syscall', null),
                path: get(err, 'path', null),
            }],
        })
    }
    catch (e) {}
}


async function formatter(opt) {
    //opt為各targets的options

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

    //timeZone, IANA時區字串如'Asia/Taipei', 為null時使用系統時區
    let timeZone = get(opt, 'timeZone', null)

    //建立logs資料夾, 已存在則視為成功, 不存在則自動建立
    fsCreateFolder(fdLog)

    let streamCurr = null
    let keyCurr = ''

    let getTimeKey = () => {
        //依timeZone決定時區基準, 確保跨機器切檔邊界與檔名一致
        let d = isestr(timeZone) ? ot().tz(timeZone) : ot()
        let t = d.format('YYYY-MM-DDTHH:mm:ss.SSSZ')
        if (interval === 'hr') {
            // return d.toISOString().slice(0, 13).replace(/:/g, '-') //例如2025-07-06T14
            t = strleft(t, 13)
            return t
        }
        // return d.toISOString().slice(0, 10) //例如2025-07-06
        t = strleft(t, 10)
        return t
    }

    let getFilePath = (timeKey) => {
        let fn = `${timeKey}.log`
        return path.join(fdLog, fn)
    }

    let switchFileIfNeeded = () => {
        let keyNew = getTimeKey()
        if (keyNew !== keyCurr) {
            keyCurr = keyNew
            let filePath = getFilePath(keyNew)
            if (streamCurr && !streamCurr.destroyed) streamCurr.end()
            //切檔時確保資料夾存在, 執行中被刪後可自動重建(規則帳本R8)
            fsCreateFolder(fdLog)
            let s = fs.createWriteStream(filePath, { flags: 'a' })
            //內層串流錯誤只記錄並回報, 不拋, 並令下次寫入重開檔(R8)
            s.on('error', (err) => {
                report(err)
                if (streamCurr === s) {
                    keyCurr = ''
                }
            })
            streamCurr = s
        }
    }

    // 初始建立檔案
    switchFileIfNeeded()

    let stream = new Writable({
        write(chunk, encoding, callback) {
            try {

                //switchFileIfNeeded
                switchFileIfNeeded()

                //str, 須偵測Buffer轉字串
                let str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)

                //write, 內層錯誤已由其error監聽回報(R8), 不回傳給外層, 以免外層串流被destroy而worker隨之結束
                streamCurr.write(str, () => {
                    callback()
                })

            }
            catch (err) {
                callback(err)
            }
        },
        final(callback) {
            //顯式關閉時將當前fs write stream flush並關閉, 確保worker退出前資料落盤且fd釋放
            //內層已destroyed/errored時不可再end, 否則ERR_STREAM_DESTROYED經thread-stream升級為主緒錯誤(R15)
            if (streamCurr && !streamCurr.destroyed && !streamCurr.errored) {
                streamCurr.end(callback)
            }
            else {
                callback()
            }
        }
    })

    //error
    stream.on('error', (err) => {
        console.error('formatter error', err)
    })

    return stream
}


export default formatter

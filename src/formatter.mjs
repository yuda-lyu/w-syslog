import fs from 'fs'
import path from 'path'
import { Writable } from 'stream'
import ot from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'
import strleft from 'wsemi/src/strleft.mjs'
import fsCreateFolder from 'wsemi/src/fsCreateFolder.mjs'


ot.extend(utc)
ot.extend(timezone)


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
            if (streamCurr) streamCurr.end()
            streamCurr = fs.createWriteStream(filePath, { flags: 'a' })
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

                //write
                streamCurr.write(str, callback)

            }
            catch (err) {
                callback(err)
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

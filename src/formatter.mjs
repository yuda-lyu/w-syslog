import fs from 'fs'
import path from 'path'
import { Writable } from 'stream'
import get from 'lodash-es/get.js'
import isestr from 'wsemi/src/isestr.mjs'


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

    // 建立 logs 資料夾
    if (!fs.existsSync(fdLog)) {
        fs.mkdirSync(fdLog, { recursive: true })
    }

    let streamCurr = null
    let keyCurr = ''

    let getTimeKey = () => {
        let d = new Date()
        if (interval === 'hr') {
            return d.toISOString().slice(0, 13).replace(/:/g, '-') //例如2025-07-06T14
        }
        return d.toISOString().slice(0, 10) //例如2025-07-06
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

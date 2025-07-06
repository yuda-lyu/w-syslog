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
        fdLog = './logs'
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

    let currentFileStream = null
    let currentTimeKey = ''

    let getTimeKey = () => {
        let d = new Date()
        if (interval === 'hr') {
            return d.toISOString().slice(0, 13).replace(/:/g, '-') // e.g., 2025-07-06T14
        }
        return d.toISOString().slice(0, 10) // e.g., 2025-07-06
    }

    let getFilePath = (timeKey) => {
        let fn = `${timeKey}.log`
        return path.join(fdLog, fn)
    }

    let switchFileIfNeeded = () => {
        let newKey = getTimeKey()
        if (newKey !== currentTimeKey) {
            currentTimeKey = newKey
            let filePath = getFilePath(newKey)
            if (currentFileStream) currentFileStream.end()
            currentFileStream = fs.createWriteStream(filePath, { flags: 'a' })
        }
    }

    // 初始建立檔案
    switchFileIfNeeded()

    let stream = new Writable({
        write(chunk, encoding, callback) {
            try {
                switchFileIfNeeded()

                // 將 Buffer 轉為字串，確保正確處理換行
                const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)

                currentFileStream.write(str + '\n', callback)
            }
            catch (err) {
                callback(err)
            }
        }
    })

    return stream
}


export default formatter

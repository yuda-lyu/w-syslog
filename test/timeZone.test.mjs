import fs from 'fs'
import assert from 'assert'
import w from 'wsemi'
import WSyslog from '../src/WSyslog.mjs'


//每個test各自獨立資料夾, 避免parallel/重跑干擾
let fdLogUtc = './_logs_tz_utc'
let fdLogTpe = './_logs_tz_tpe'


function readHrKey(folder) {
    if (!w.fsIsFolder(folder)) {
        return null
    }
    let files = fs.readdirSync(folder).filter((fn) => /^\d{4}-\d{2}-\d{2}T\d{2}\.log$/.test(fn))
    if (files.length !== 1) {
        return null
    }
    return files[0].replace('.log', '') //例如'2025-12-08T15'
}


describe('WSyslog timeZone', function() {

    beforeEach(function() {
        w.fsDeleteFolder(fdLogUtc)
        w.fsDeleteFolder(fdLogTpe)
    })

    afterEach(async function() {
        //稍候pino worker flush, 避免Windows上EBUSY
        await w.delay(200)
        w.fsDeleteFolder(fdLogUtc)
        w.fsDeleteFolder(fdLogTpe)
    })

    it('timeZone="UTC" 寫log應使用UTC時區的小時作檔名 (模擬GitHub Actions UTC+0)', async function() {

        let log = WSyslog({ fdLog: fdLogUtc, interval: 'hr', timeZone: 'UTC' })
        log.info({ event: 'tz-utc', msg: 'check' })

        await w.delay(2000) //等pino flush

        let actualKey = readHrKey(fdLogUtc)
        assert.ok(actualKey !== null, `應有1個hr log檔, 取得actualKey=${actualKey}`)

        //內建Date.toISOString()永遠輸出UTC時區之ISO字串, 取前13碼即'YYYY-MM-DDTHH'
        let utcKey = new Date().toISOString().slice(0, 13)
        let utcKeyPrev = new Date(Date.now() - 60 * 60 * 1000).toISOString().slice(0, 13)

        //容忍跨小時boundary: 寫入與assert之間若橫跨整點, 接受前一小時
        assert.ok(
            actualKey === utcKey || actualKey === utcKeyPrev,
            `actualKey="${actualKey}" 應為UTC當前小時"${utcKey}"或前一小時"${utcKeyPrev}"`
        )

        log.clear()
    })

    it('timeZone="UTC" 與 "Asia/Taipei" (UTC+8) 寫log應產生不同小時檔名', async function() {

        let logUtc = WSyslog({ fdLog: fdLogUtc, interval: 'hr', timeZone: 'UTC' })
        let logTpe = WSyslog({ fdLog: fdLogTpe, interval: 'hr', timeZone: 'Asia/Taipei' })

        //同步呼叫兩者, 縮短時間差以避免跨小時boundary影響
        logUtc.info({ msg: 'x' })
        logTpe.info({ msg: 'x' })

        await w.delay(2000)

        let keyUtc = readHrKey(fdLogUtc)
        let keyTpe = readHrKey(fdLogTpe)

        assert.ok(keyUtc !== null, `UTC側應有1個hr log檔, 取得keyUtc=${keyUtc}`)
        assert.ok(keyTpe !== null, `Taipei側應有1個hr log檔, 取得keyTpe=${keyTpe}`)

        //UTC+0與UTC+8必差8小時, 兩個小時檔名永不相等(此assert不論系統時區為UTC+8或UTC+0皆成立)
        assert.notStrictEqual(
            keyUtc,
            keyTpe,
            `UTC與Asia/Taipei檔名應不同: keyUtc="${keyUtc}", keyTpe="${keyTpe}"`
        )

        logUtc.clear()
        logTpe.clear()
    })

})

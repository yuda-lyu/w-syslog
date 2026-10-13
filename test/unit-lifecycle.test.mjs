import fs from 'fs'
import path from 'path'
import assert from 'assert'
import kit from './tools/kit.mjs'
import WSyslog from '../src/WSyslog.mjs'


//生命週期: READY前大量寫入之收尾、自然結束、clear逾時分支、同步驗證timeZone(規則帳本R9~R12)
//thread-stream 4.2.0於worker READY前同步寫入大量資料(>~4MB, 門檻非單調)時ready可能永不成立;
//clear不得依賴flush(cb)/ready(R9), 建立後須即unref(R10), terminate前須已接error(R11)


let fdRoot = kit.fdTmp('unit-lifecycle')
let fpChild = path.join(fdRoot, 'child.mjs')


//child.mjs之argv: fdLog n padLen mode(clear|natural) timeLimit(0為預設) waitMs(寫入前等待毫秒)
let child = `let { default: WSyslog } = await import(${JSON.stringify(kit.urlSrcWSyslog)})
let [fdLog, n, padLen, mode, timeLimit, waitMs] = process.argv.slice(2)
n = parseInt(n, 10)
padLen = parseInt(padLen, 10)
timeLimit = parseInt(timeLimit, 10)
waitMs = parseInt(waitMs, 10)
let log = WSyslog({ fdLog, interval: 'day' })
if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs))
}
let pad = 'x'.repeat(padLen)
for (let k = 0; k < n; k++) {
    log.info({ event: 'lc', msg: 'm' + k, pad })
}
if (mode === 'clear') {
    let t = Date.now()
    await log.clear(timeLimit > 0 ? { timeLimit } : {})
    console.log('CLEAR-MS ' + (Date.now() - t))
}
`


function countLc(fdLog) {
    return kit.readLog(fdLog).rows.filter((r) => r.event === 'lc').length
}


describe('WSyslog lifecycle', function() {

    before(function() {
        kit.rmrf(fdRoot)
        fs.mkdirSync(fdRoot, { recursive: true })
        fs.writeFileSync(fpChild, child)
    })

    after(function() {
        kit.rmrf(fdRoot)
    })

    for (let [n, padLen, label] of [[14000, 200, '約4.1MB'], [20000, 200, '約5.9MB']]) {
        it(`R9: READY前同步寫入${label}後clear, 數秒內完成且筆數完整, 宿主存活`, async function() {
            let fdLog = path.join(fdRoot, `clear-${n}`)
            let r = await kit.runNode([fpChild, fdLog, String(n), String(padLen), 'clear', '0', '0'], { timeout: 60000 })
            assert.strict.equal(r.code, 0, r.stderr)
            let m = r.stdout.match(/CLEAR-MS (\d+)/)
            assert.ok(m, r.stdout)
            assert.ok(parseInt(m[1], 10) < 10000, `clear須於10秒內完成, 實測${m[1]}ms`)
            assert.strict.equal(countLc(fdLog), n)
        })
    }

    it('R10: READY前同步寫入約5.9MB後不呼叫clear, 行程自然退出且筆數完整', async function() {
        let fdLog = path.join(fdRoot, 'natural-20000')
        let r = await kit.runNode([fpChild, fdLog, '20000', '200', 'natural', '0', '0'], { timeout: 30000 })
        assert.strict.equal(r.killed, false, `行程須自然退出(未於30秒內退出), stderr: ${r.stderr}`)
        assert.strict.equal(r.code, 0, r.stderr)
        assert.strict.equal(countLc(fdLog), 20000)
    })

    //timeLimit過小時逾時分支終止worker, 依規格可能遺失(以stderr註記), 故只斷言宿主存活與註記, 不斷言筆數
    it('R11: clear逾時(timeLimit=1)於worker READY前觸發, 宿主存活且stderr有逾時註記', async function() {
        let fdLog = path.join(fdRoot, 'timeout-before')
        let r = await kit.runNode([fpChild, fdLog, '10', '10', 'clear', '1', '0'], { timeout: 60000 })
        assert.strict.equal(r.code, 0, `宿主不可被殺: ${r.stderr}`)
        assert.ok(r.stdout.includes('CLEAR-MS'), r.stdout)
        assert.ok(r.stderr.includes('w-syslog clear: timeout'), r.stderr)
    })

    it('R11: clear逾時(timeLimit=1)於worker READY後觸發, 宿主存活且stderr有逾時註記', async function() {
        let fdLog = path.join(fdRoot, 'timeout-after')
        let r = await kit.runNode([fpChild, fdLog, '10', '10', 'clear', '1', '500'], { timeout: 60000 })
        assert.strict.equal(r.code, 0, `宿主不可被殺: ${r.stderr}`)
        assert.ok(r.stdout.includes('CLEAR-MS'), r.stdout)
        assert.ok(r.stderr.includes('w-syslog clear: timeout'), r.stderr)
    })

    it('R12: timeZone無效時WSyslog()同步拋錯', function() {
        for (let timeZone of ['Asia/Taipe', 'UTC+8']) {
            assert.throws(() => {
                WSyslog({ fdLog: path.join(fdRoot, 'tz'), timeZone })
            }, (err) => {
                assert.ok(err.message.includes(timeZone), err.message)
                return true
            })
        }
    })

})

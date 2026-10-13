import fs from 'fs'
import path from 'path'
import assert from 'assert'
import kit from './tools/kit.mjs'
import WSyslog from '../src/WSyslog.mjs'
import formatter from '../src/formatter.mjs'


//log資料夾與寫檔失敗之政策(規則帳本R8、R12、R14、R15、R17、R19)
//寫檔失敗不殺宿主並轉發為ev之'writeError'事件(D-3 (c)), 'error'事件只代表呼叫log.error()(R19); fdLog於WSyslog()內解析為絕對路徑一次(D-11 (a))


let fdRoot = kit.fdTmp('unit-fdLog')


function utcDay(offsetDay = 0) {
    return new Date(Date.now() + offsetDay * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}


//withShiftedDate, 於fn執行期間把全域Date往後推shiftMs(假時鐘), 結束後還原
async function withShiftedDate(shiftMs, fn) {
    let RealDate = Date
    globalThis.Date = class extends RealDate {
        constructor(...args) {
            if (args.length === 0) {
                super(RealDate.now() + shiftMs)
            }
            else {
                super(...args)
            }
        }

        static now() {
            return RealDate.now() + shiftMs
        }
    }
    try {
        return await fn()
    }
    finally {
        globalThis.Date = RealDate
    }
}


function write(stream, s) {
    return new Promise((resolve) => {
        stream.write(s, (err) => resolve(err))
    })
}


function end(stream) {
    return new Promise((resolve) => {
        stream.end((err) => resolve(err))
    })
}


describe('WSyslog fdLog', function() {

    before(function() {
        kit.rmrf(fdRoot)
        fs.mkdirSync(fdRoot, { recursive: true })
    })

    after(function() {
        kit.rmrf(fdRoot)
    })

    it('R8/R12: fdLog不可建立(位於檔案之下)時WSyslog()同步拋錯', function() {
        let fpFile = path.join(fdRoot, 'a-file')
        fs.writeFileSync(fpFile, '')
        let fdLog = path.join(fpFile, 'sub')
        assert.throws(() => {
            WSyslog({ fdLog })
        }, (err) => {
            assert.ok(err.message.includes('fdLog'), err.message)
            return true
        })
    })

    it('R8: 執行中資料夾被刪後跨切檔邊界, 自動重建資料夾且新筆落地, 無未捕捉例外', async function() {
        let fdLog = path.join(fdRoot, 'gone')
        let stream = await formatter({ fdLog, interval: 'day', timeZone: 'UTC' })
        assert.strict.equal(await write(stream, '{"msg":"day1"}\n'), null)
        await new Promise((resolve) => setTimeout(resolve, 100))
        fs.rmSync(fdLog, { recursive: true, force: true })
        await withShiftedDate(26 * 60 * 60 * 1000, async () => {
            assert.strict.equal(await write(stream, '{"msg":"day2"}\n'), null)
            assert.strict.equal(await end(stream), null)
        })
        assert.ok(fs.existsSync(fdLog), '資料夾須被重建')
        assert.ok(kit.readLog(fdLog).rows.some((r) => r.msg === 'day2'), '新筆須落地')
    })

    it('R8/R15: 資料夾被換成同名檔案後寫入失敗只回報不拋, 結束時無ERR_STREAM_DESTROYED', async function() {
        let fdLog = path.join(fdRoot, 'replaced')
        let stream = await formatter({ fdLog, interval: 'day', timeZone: 'UTC' })
        assert.strict.equal(await write(stream, '{"msg":"x1"}\n'), null)
        await new Promise((resolve) => setTimeout(resolve, 100))
        fs.rmSync(fdLog, { recursive: true, force: true })
        fs.writeFileSync(fdLog, '') //同名檔案, 使切檔時無法建立資料夾與開檔
        let errs = []
        stream.on('error', (err) => errs.push(err))
        await withShiftedDate(26 * 60 * 60 * 1000, async () => {
            await write(stream, '{"msg":"x2"}\n')
            assert.strict.equal(await end(stream), null, '結束不可回報錯誤')
        })
        assert.strict.deepEqual(errs.map((e) => e.code), [], '外層串流不可發出error')
    })

    it('R14: fdLog為連結(Windows junction/其他平台symlink)時可寫出且numKeep生效', async function() {
        let fdReal = path.join(fdRoot, 'link-real')
        let fdLink = path.join(fdRoot, 'link-logs')
        fs.mkdirSync(fdReal, { recursive: true })
        for (let fn of ['2000-01-01.log', '2000-01-02.log', '2000-01-03.log', '2000-01-04.log']) {
            fs.writeFileSync(path.join(fdReal, fn), '')
        }
        fs.symlinkSync(fdReal, fdLink, process.platform === 'win32' ? 'junction' : 'dir')
        let log = WSyslog({ fdLog: fdLink, interval: 'day', numKeep: 2 })
        log.info({ event: 'link', msg: 'via-link' })
        await log.clear()
        assert.ok(kit.hasMsg(fdReal, 'via-link'), 'log須經連結落在實體資料夾')
        //首次清理延後且被同一輪次內之clear取消(規則帳本R20); clear後手動清理: 今日檔1個 + 預置4個, numKeep=2, 刪最舊3個預置檔
        log.cleanLogs()
        let seeds = fs.readdirSync(fdReal).filter((fn) => fn.startsWith('2000-'))
        assert.ok(seeds.length <= 1, `預置之舊檔須依numKeep被清理, 實得: ${JSON.stringify(seeds)}`)
    })

    it('R8(D-3 (c)): 寫檔失敗不殺宿主, 轉發為ev之writeError事件(payload為Error)', async function() {
        let fdLog = path.join(fdRoot, 'err-listen')
        fs.mkdirSync(fdLog, { recursive: true })
        //今日與明日(UTC)之log檔路徑先建成資料夾, 使開檔失敗(EISDIR), 與執行身分無關
        fs.mkdirSync(path.join(fdLog, `${utcDay(0)}.log`))
        fs.mkdirSync(path.join(fdLog, `${utcDay(1)}.log`))
        let fpChild = path.join(fdRoot, 'child-err-listen.mjs')
        fs.writeFileSync(fpChild, `let { default: WSyslog } = await import(${JSON.stringify(kit.urlSrcWSyslog)})
let log = WSyslog({ fdLog: process.argv[2], interval: 'day', timeZone: 'UTC' })
let werrs = []
log.on('writeError', (err) => werrs.push({ isError: err instanceof Error, code: err && err.code }))
log.info({ event: 'e', msg: 'should-fail' })
await new Promise((resolve) => setTimeout(resolve, 1500))
await log.clear()
console.log('WERRS ' + JSON.stringify(werrs))
`)
        let r = await kit.runNode([fpChild, fdLog], { timeout: 30000 })
        assert.strict.equal(r.code, 0, `宿主不可被殺: ${r.stderr}`)
        let m = r.stdout.match(/WERRS (.*)/)
        let werrs = m ? JSON.parse(m[1]) : []
        assert.ok(werrs.length >= 1, `須收到writeError事件: ${r.stdout} ${r.stderr}`)
        assert.ok(werrs.every((e) => e.isError), `writeError之payload須為Error: ${m && m[1]}`)
        assert.ok(werrs.some((e) => e.code === 'EISDIR'), `writeError之code須為EISDIR: ${m && m[1]}`)
        assert.ok(/w-syslog/.test(r.stderr), `stderr須有紀錄: ${r.stderr}`)
    })

    it('R19: 寫檔失敗不觸發error事件之監聽器, 各等級方法只觸發同名事件(log.error()只觸發error)', async function() {
        let fdBad = path.join(fdRoot, 'r19-bad')
        let fdOk = path.join(fdRoot, 'r19-ok')
        fs.mkdirSync(fdBad, { recursive: true })
        fs.mkdirSync(path.join(fdBad, `${utcDay(0)}.log`))
        fs.mkdirSync(path.join(fdBad, `${utcDay(1)}.log`))
        let fpChild = path.join(fdRoot, 'child-r19.mjs')
        fs.writeFileSync(fpChild, `let { default: WSyslog } = await import(${JSON.stringify(kit.urlSrcWSyslog)})
let [fdBad, fdOk] = process.argv.slice(2)
let levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']
let watch = (log) => {
    let got = {}
    for (let k of [...levels, 'delete', 'writeError']) {
        got[k] = []
        log.on(k, (p) => got[k].push(p instanceof Error ? { isError: true, code: p.code } : { isError: false, keys: Object.keys(p), msg: p.args && p.args[0] && p.args[0].msg }))
    }
    return got
}
//寫檔失敗之實例: 只呼叫info
let logBad = WSyslog({ fdLog: fdBad, interval: 'day', timeZone: 'UTC' })
let bad = watch(logBad)
logBad.info({ event: 'r19', msg: 'bad-info' })
//正常之實例: 六個等級各呼叫一次
let logOk = WSyslog({ fdLog: fdOk, interval: 'day', timeZone: 'UTC' })
let ok = watch(logOk)
for (let k of levels) {
    logOk[k]({ event: 'r19', msg: 'ok-' + k })
}
await new Promise((resolve) => setTimeout(resolve, 1500))
await logBad.clear()
await logOk.clear()
console.log('GOT ' + JSON.stringify({ bad, ok }))
`)
        let r = await kit.runNode([fpChild, fdBad, fdOk], { timeout: 30000 })
        assert.strict.equal(r.code, 0, `宿主不可被殺: ${r.stderr}`)
        let m = r.stdout.match(/GOT (.*)/)
        assert.ok(m, `${r.stdout} ${r.stderr}`)
        let { bad, ok } = JSON.parse(m[1])
        let levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace']

        //寫檔失敗: 只觸發writeError, error事件之監聽器不被觸發
        assert.strict.equal(bad.error.length, 0, `寫檔失敗不可觸發error事件: ${JSON.stringify(bad.error)}`)
        assert.ok(bad.writeError.length >= 1 && bad.writeError.every((e) => e.isError), `寫檔失敗須觸發writeError(Error): ${JSON.stringify(bad.writeError)}`)
        for (let k of levels) {
            assert.strict.equal(bad[k].length, k === 'info' ? 1 : 0, `失敗之實例只呼叫info, ${k}事件次數不符`)
        }
        assert.strict.equal(bad.delete.length, 0)

        //各等級方法只觸發同名事件, payload為{ args }; 正常寫出時不觸發writeError
        for (let k of levels) {
            assert.strict.deepEqual(ok[k], [{ isError: false, keys: ['args'], msg: `ok-${k}` }], `${k}()須只觸發一次${k}事件且payload為{ args }`)
        }
        assert.strict.deepEqual(ok.writeError, [], '正常寫出不可觸發writeError')
        assert.strict.deepEqual(ok.delete, [])
        //kit.hasMsg只比對info(30)之列, error等級須直接比對level 50
        assert.ok(kit.readLog(fdOk).rows.some((row) => row.msg === 'ok-error' && row.level === 50), 'log.error()之紀錄須以level 50落地')
    })

    it('R8(D-3 (c)): 寫檔失敗而無人監聽writeError事件時, 宿主仍存活', async function() {
        let fdLog = path.join(fdRoot, 'err-nolisten')
        fs.mkdirSync(fdLog, { recursive: true })
        fs.mkdirSync(path.join(fdLog, `${utcDay(0)}.log`))
        fs.mkdirSync(path.join(fdLog, `${utcDay(1)}.log`))
        let fpChild = path.join(fdRoot, 'child-err-nolisten.mjs')
        fs.writeFileSync(fpChild, `let { default: WSyslog } = await import(${JSON.stringify(kit.urlSrcWSyslog)})
let log = WSyslog({ fdLog: process.argv[2], interval: 'day', timeZone: 'UTC' })
log.info({ event: 'e', msg: 'should-fail' })
await new Promise((resolve) => setTimeout(resolve, 1500))
await log.clear()
console.log('ALIVE')
`)
        let r = await kit.runNode([fpChild, fdLog], { timeout: 30000 })
        assert.strict.equal(r.code, 0, `宿主不可被殺: ${r.stderr}`)
        assert.ok(r.stdout.includes('ALIVE'), r.stdout)
    })

    it('R17(D-11 (a)): 建立後chdir, cleanLogs只清原資料夾, delete事件之fp維持原(相對)格式', async function() {
        let fdA = path.join(fdRoot, 'chdir-A')
        let fdB = path.join(fdRoot, 'chdir-B')
        let rel = path.join('.', '_logs_k')
        for (let fd of [fdA, fdB]) {
            fs.mkdirSync(path.join(fd, '_logs_k'), { recursive: true })
            for (let fn of ['2000-01-01.log', '2000-01-02.log', '2000-01-03.log', '2000-01-04.log']) {
                fs.writeFileSync(path.join(fd, '_logs_k', fn), '')
            }
        }
        let fpChild = path.join(fdRoot, 'child-chdir.mjs')
        fs.writeFileSync(fpChild, `let { default: WSyslog } = await import(${JSON.stringify(kit.urlSrcWSyslog)})
let [rel, fdB] = process.argv.slice(2)
let log = WSyslog({ fdLog: rel, interval: 'day', numKeep: 2 })
let dels = []
log.on('delete', (d) => dels.push(d))
log.info({ event: 'k', msg: 'chdir' })
await log.clear()
process.chdir(fdB)
log.cleanLogs()
console.log('DELS ' + JSON.stringify(dels))
`)
        let r = await kit.runNode([fpChild, rel, fdB], { cwd: fdA, timeout: 30000 })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.strict.equal(fs.readdirSync(path.join(fdB, '_logs_k')).length, 4, '新cwd下之同名資料夾不可被清理')
        let dels = JSON.parse(r.stdout.match(/DELS (.*)/)[1])
        assert.ok(dels.length >= 1, `原資料夾須依numKeep清理: ${r.stdout}`)
        for (let d of dels) {
            assert.strict.equal(d.fp, path.join(rel, d.fn), 'delete事件之fp須為path.join(原fdLog, fn)')
            assert.ok(!fs.existsSync(path.join(fdA, '_logs_k', d.fn)), '被刪者須在原資料夾')
        }
        assert.ok(kit.hasMsg(path.join(fdA, '_logs_k'), 'chdir'), 'log須落在原資料夾')
    })

})

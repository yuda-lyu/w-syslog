import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'
import _ from 'lodash-es'
import w from 'wsemi'
import WSyslog from '../src/WSyslog.mjs'


//獨立測試資料夾, 避免與其他測試檔在parallel模式下競用
let fdLog = './_logs_clear_test'
let fdLogChild = './_logs_clear_child' //子程序fixture用, 實際為`${fdLogChild}_${i}`
let fdLogStress = './_logs_clear_stress'
let fdLogAfter = './_logs_clear_after'


//fixture路徑錨定於本測試檔位置, 不受cwd影響
let fpFxExit = fileURLToPath(new URL('./fixtures/clear-exit.mjs', import.meta.url))
let fpFxAfter = fileURLToPath(new URL('./fixtures/log-after-clear.mjs', import.meta.url))


function runNode(args) {
    //以子程序執行fixture, 回傳{code, stderr, ms}
    return new Promise((resolve) => {
        let ts = Date.now()
        execFile(process.execPath, args, { cwd: process.cwd() }, (err, stdout, stderr) => {
            let code = err ? err.code : 0
            resolve({ code, stderr, ms: Date.now() - ts })
        })
    })
}


function countLogLines(folder) {
    //統計資料夾內所有log檔的非空行數
    if (!w.fsIsFolder(folder)) {
        return 0
    }
    let n = 0
    for (let fn of fs.readdirSync(folder)) {
        let jj = fs.readFileSync(path.join(folder, fn), 'utf8')
        n += w.sep(jj, '\n').length
    }
    return n
}


function cleanAll() {
    w.fsDeleteFolder(fdLog)
    w.fsDeleteFolder(fdLogAfter)
    for (let i = 0; i < 10; i++) {
        w.fsDeleteFolder(`${fdLogChild}_${i}`)
        w.fsDeleteFolder(`${fdLogStress}_${i}`)
    }
}


describe('WSyslog clear', function() {

    before(function() {
        cleanAll()
    })

    after(async function() {
        await w.delay(100)
        cleanAll()
    })

    it('clear後檔案內容立即完整, 不需delay等flush', async function() {

        let log = WSyslog({ fdLog, interval: 'day' })
        log.info({ event: 'runner', msg: 'start' })
        log.warn({ event: 'monitor-memory', msg: 'usage-high', ratio: 85.4 })
        log.error({ event: 'crash', msg: 'db connection', code: 500 })

        await log.clear()

        //clear已保證殘餘log全數寫出, 立即讀檔驗證
        let vpfs = w.fsTreeFolder(fdLog)
        let fp = _.get(vpfs, `0.path`, '')
        let jj = fs.readFileSync(fp, 'utf8')
        let ss = w.sep(jj, '\n')
        let r = _.map(ss, (j) => {
            let v = JSON.parse(j)
            return { event: _.get(v, 'event'), msg: _.get(v, 'msg') }
        })
        assert.strict.deepEqual(r, [
            { event: 'runner', msg: 'start' },
            { event: 'monitor-memory', msg: 'usage-high' },
            { event: 'crash', msg: 'db connection' },
        ])
    })

    it('重複clear回傳同一Promise(冪等)', async function() {

        let log = WSyslog({ fdLog, interval: 'day' })
        log.info({ event: 'idem', msg: 'x' })

        let p1 = log.clear()
        let p2 = log.clear()
        assert.strict.equal(p1, p2)

        await p1

        //clear之後再呼叫依然回傳同一Promise
        let p3 = log.clear()
        assert.strict.equal(p1, p3)
    })

    it('子程序寫300筆log後clear, 行程於數秒內自然退出且無漏筆', async function() {

        let { code, stderr, ms } = await runNode([fpFxExit, fdLogChild, '1', '300'])

        assert.strict.equal(code, 0, `子程序應exit 0, 實得code=${code}, stderr=${stderr}`)
        assert.ok(ms < 20000, `子程序應於數秒內退出, 實測${ms}ms`)
        assert.strict.equal(countLogLines(`${fdLogChild}_0`), 300)
    })

    it('壓測: 10實例各寫300筆後逐一clear, 行程自然退出且無漏筆', async function() {

        let { code, stderr } = await runNode([fpFxExit, fdLogStress, '10', '300'])

        assert.strict.equal(code, 0, `子程序應exit 0, 實得code=${code}, stderr=${stderr}`)
        for (let i = 0; i < 10; i++) {
            assert.strict.equal(countLogLines(`${fdLogStress}_${i}`), 300, `實例${i}應有300筆log`)
        }
    })

    it('clear後再寫log, 非同步丟the worker has exited(子程序exit非0)', async function() {

        let { code, stderr } = await runNode([fpFxAfter, fdLogAfter])

        assert.notStrictEqual(code, 0, 'clear後再寫log的子程序應以非0退出')
        assert.ok(stderr.includes('the worker has exited'), `stderr應含'the worker has exited', 實得: ${stderr}`)
    })

})

import fs from 'fs'
import path from 'path'
import assert from 'assert'
import w from 'wsemi'
import kit from './tools/kit.mjs'
import WSyslog from '../src/WSyslog.mjs'


//獨立測試資料夾, 避免與unit-basic.test.mjs在parallel模式下競用'./_logs'
let fdLog = './_logs_clean_test'
let fdNoExist = './_logs_clean_test_nonexistent'

//子程序案之暫存(規則帳本R20: 建立後立即clear之行程退出)
let fdRoot = kit.fdTmp('unit-cleanLogs')


//nextTurn, 等到下一個事件迴圈輪次: 首次清理以setImmediate排程(R20), 其後排之setImmediate必在其後執行
function nextTurn() {
    return new Promise((resolve) => setImmediate(resolve))
}


function seedFiles(folder, names) {
    //已存在則視為成功, 不存在則自動建立
    w.fsCreateFolder(folder)
    for (let fn of names) {
        fs.writeFileSync(path.join(folder, fn), '')
    }
}


function listSeed(folder, prefix) {
    if (!w.fsIsFolder(folder)) {
        return []
    }
    return fs.readdirSync(folder).filter((fn) => fn.startsWith(prefix)).sort()
}


describe('WSyslog cleanLogs', function() {

    beforeEach(function() {
        //每個test開始前完全移除舊資料夾, 從乾淨狀態開始
        w.fsDeleteFolder(fdLog)
    })

    afterEach(function() {
        //clear已保證worker收攤與fd釋放, 直接移除測試資料夾, 不留空殼
        w.fsDeleteFolder(fdLog)
    })

    after(function() {
        //最終把'資料夾不存在時不崩'測試可能由pino formatter建立的資料夾也清掉
        w.fsDeleteFolder(fdNoExist)
        kit.rmrf(fdRoot)
    })

    it('day模式: 首次清理於WSyslog()回傳後之下一個事件迴圈輪次執行, 保留最新numKeep個檔, 最舊的被刪', async function() {
        seedFiles(fdLog, [
            '2020-01-01.log',
            '2020-01-02.log',
            '2020-01-03.log',
            '2020-01-04.log',
            '2020-01-05.log',
        ])

        //首次清理延後(R20): 回傳當下尚未刪檔
        let log = WSyslog({ fdLog, numKeep: 2, interval: 'day' })
        assert.strict.equal(listSeed(fdLog, '2020-').length, 5, 'WSyslog()回傳當下不可已刪檔')

        //下一輪次: 看到5個2020檔, numKeep=2, 刪3個最舊
        await nextTurn()
        let kept = listSeed(fdLog, '2020-')
        assert.strict.deepEqual(kept, [
            '2020-01-04.log',
            '2020-01-05.log',
        ])

        await log.clear()
    })

    it('當檔數小於等於numKeep時不刪任何檔', async function() {
        seedFiles(fdLog, [
            '2020-01-01.log',
            '2020-01-02.log',
        ])

        let log = WSyslog({ fdLog, numKeep: 5, interval: 'day' })
        log.cleanLogs()

        let kept = listSeed(fdLog, '2020-')
        assert.strict.deepEqual(kept, [
            '2020-01-01.log',
            '2020-01-02.log',
        ])

        await log.clear()
    })

    it('hr模式: 只匹配hr命名, 不誤刪day命名', async function() {
        seedFiles(fdLog, [
            //day命名(不該被hr模式cleanLogs動到)
            '2020-01-01.log',
            '2020-01-02.log',
            //hr命名
            '2020-01-01T01.log',
            '2020-01-01T02.log',
            '2020-01-01T03.log',
            '2020-01-01T04.log',
            '2020-01-01T05.log',
        ])

        //numKeep=2, hr模式應只看hr檔, 5刪3, 留04, 05
        let log = WSyslog({ fdLog, numKeep: 2, interval: 'hr' })
        log.cleanLogs()

        let dayFiles = listSeed(fdLog, '2020-').filter((fn) => /^\d{4}-\d{2}-\d{2}\.log$/.test(fn))
        let hrFiles = listSeed(fdLog, '2020-').filter((fn) => /^\d{4}-\d{2}-\d{2}T\d{2}\.log$/.test(fn))

        assert.strict.deepEqual(dayFiles, [
            '2020-01-01.log',
            '2020-01-02.log',
        ])
        assert.strict.deepEqual(hrFiles, [
            '2020-01-01T04.log',
            '2020-01-01T05.log',
        ])

        await log.clear()
    })

    it('刪除時觸發delete事件, payload含fp與fn', async function() {
        //先啟動空資料夾的logger; 首次清理延後至下一輪次(R20), 本案於同一輪次內即clear而被取消, 只驗手動cleanLogs之事件
        let log = WSyslog({ fdLog, numKeep: 5, interval: 'hr' })

        //listener在init之後掛上, 不會錯過後續手動觸發的事件
        let deleted = []
        log.on('delete', ({ fp, fn }) => {
            deleted.push({ fp, fn })
        })

        //seed 8個未來日期的hr檔, 確保任何今日檔(若pino async建立)都會被視為最舊優先刪除
        //如此過濾'2099-'前綴後, 必然看到T01-T03被刪, 不受今日檔存在與否影響
        seedFiles(fdLog, [
            '2099-01-01T01.log',
            '2099-01-01T02.log',
            '2099-01-01T03.log',
            '2099-01-01T04.log',
            '2099-01-01T05.log',
            '2099-01-01T06.log',
            '2099-01-01T07.log',
            '2099-01-01T08.log',
        ])

        log.cleanLogs()

        //過濾seed檔, 必為被刪的最舊3個
        let names2099 = deleted
            .map((d) => d.fn)
            .filter((fn) => fn.startsWith('2099-'))
            .sort()
        assert.strict.deepEqual(names2099, [
            '2099-01-01T01.log',
            '2099-01-01T02.log',
            '2099-01-01T03.log',
        ])

        //每筆事件的fp必為path.join(fdLog, fn)
        for (let d of deleted) {
            assert.strict.equal(d.fp, path.join(fdLog, d.fn))
        }

        await log.clear()
    })

    it('資料夾不存在時不崩', async function() {
        //確保起始狀態為不存在
        w.fsDeleteFolder(fdNoExist)

        let log = null
        assert.doesNotThrow(() => {
            log = WSyslog({ fdLog: fdNoExist, numKeep: 5, interval: 'day' })
            log.cleanLogs()
        })
        await log.clear()
        //pino formatter可能async建立資料夾, 由describe區塊的after hook統一清理
    })

    it('忽略不符regex命名的檔', async function() {
        seedFiles(fdLog, [
            '2020-01-01.log',
            '2020-01-02.log',
            '2020-01-03.log',
            //不符regex(注意cleanLogs regex僅檢查格式不檢查日期合法性, 故'2020-13-99.log'這類仍會匹配)
            'readme.txt',
            'app.config',
            'log.json',
            '2020-1-1.log', //月份/日期僅1碼, 不符\d{2}
            'YYYY-MM-DD.log', //非數字
        ])

        let log = WSyslog({ fdLog, numKeep: 1, interval: 'day' })
        log.cleanLogs()

        //不符的檔全保留
        let nonMatching = fs.readdirSync(fdLog).filter((fn) =>
            ['readme.txt', 'app.config', 'log.json', '2020-1-1.log', 'YYYY-MM-DD.log'].includes(fn)
        ).sort()
        assert.strict.deepEqual(nonMatching, [
            '2020-1-1.log',
            'YYYY-MM-DD.log',
            'app.config',
            'log.json',
            'readme.txt',
        ])

        //符合regex的: 3個2020檔, numKeep=1, 留03
        let matching = fs.readdirSync(fdLog)
            .filter((fn) => /^\d{4}-\d{2}-\d{2}\.log$/.test(fn))
            .filter((fn) => fn.startsWith('2020-'))
            .sort()
        assert.strict.deepEqual(matching, ['2020-01-03.log'])

        await log.clear()
    })

    it('R20: 首批刪檔事件, 建立後立即(同步)掛上之delete監聽器可收到, payload含fp與fn', async function() {
        seedFiles(fdLog, [
            '2020-01-01.log',
            '2020-01-02.log',
            '2020-01-03.log',
        ])

        let log = WSyslog({ fdLog, numKeep: 1, interval: 'day' })
        let deleted = []
        log.on('delete', ({ fp, fn }) => {
            deleted.push({ fp, fn })
        })

        await nextTurn()
        assert.strict.deepEqual(deleted.map((d) => d.fn).sort(), [
            '2020-01-01.log',
            '2020-01-02.log',
        ], '首次清理之刪檔須逐一觸發delete事件')
        for (let d of deleted) {
            assert.strict.equal(d.fp, path.join(fdLog, d.fn))
        }
        assert.strict.deepEqual(listSeed(fdLog, '2020-'), ['2020-01-03.log'])

        await log.clear()
    })

    it('R20: 首批刪檔事件, 建立後經await(已完成之Promise)才掛上之監聽器亦可收到', async function() {
        seedFiles(fdLog, [
            '2020-01-01.log',
            '2020-01-02.log',
            '2020-01-03.log',
        ])

        let log = WSyslog({ fdLog, numKeep: 1, interval: 'day' })
        await Promise.resolve()
        let deleted = []
        log.on('delete', ({ fn }) => {
            deleted.push(fn)
        })

        await nextTurn()
        assert.strict.deepEqual(deleted.sort(), [
            '2020-01-01.log',
            '2020-01-02.log',
        ], 'microtask之後才掛上之監聽器須仍收到首批事件')

        await log.clear()
    })

    it('R20: 建立後立即clear()時不執行首次清理、不發delete事件, 行程可自然退出', async function() {
        let fdChild = path.join(fdRoot, 'clear-immediately')
        kit.rmrf(fdChild)
        seedFiles(fdChild, [
            '2020-01-01.log',
            '2020-01-02.log',
            '2020-01-03.log',
        ])
        let fpChild = path.join(fdRoot, 'child-clear-immediately.mjs')
        fs.writeFileSync(fpChild, `import fs from 'fs'
let { default: WSyslog } = await import(${JSON.stringify(kit.urlSrcWSyslog)})
let fdLog = process.argv[2]
let log = WSyslog({ fdLog, interval: 'day', numKeep: 1 })
let dels = []
log.on('delete', (d) => dels.push(d.fn))
await log.clear()
await new Promise((resolve) => setTimeout(resolve, 300))
console.log('RESULT ' + JSON.stringify({ dels, left: fs.readdirSync(fdLog).filter((fn) => fn.startsWith('2020-')).sort() }))
`)
        //不呼叫process.exit, 須自然退出; 逾時(懸置之計時器)則被終止而killed為true
        let r = await kit.runNode([fpChild, fdChild], { timeout: 30000 })
        assert.strict.equal(r.killed, false, `行程須自然退出: ${r.stderr}`)
        assert.strict.equal(r.code, 0, r.stderr)
        let m = r.stdout.match(/RESULT (.*)/)
        assert.ok(m, `${r.stdout} ${r.stderr}`)
        let { dels, left } = JSON.parse(m[1])
        assert.strict.deepEqual(dels, [], 'clear後不可再發delete事件')
        assert.strict.deepEqual(left, [
            '2020-01-01.log',
            '2020-01-02.log',
            '2020-01-03.log',
        ], '建立後立即clear者不可執行首次清理')
    })

})

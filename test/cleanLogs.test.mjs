import fs from 'fs'
import path from 'path'
import assert from 'assert'
import w from 'wsemi'
import WSyslog from '../src/WSyslog.mjs'


//獨立測試資料夾, 避免與basic.test.mjs在parallel模式下競用'./_logs'
let fdLog = './_logs_clean_test'
let fdNoExist = './_logs_clean_test_nonexistent'


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
    })

    it('day模式: 保留最新numKeep個檔, 最舊的被刪', async function() {
        seedFiles(fdLog, [
            '2020-01-01.log',
            '2020-01-02.log',
            '2020-01-03.log',
            '2020-01-04.log',
            '2020-01-05.log',
        ])

        //init同步階段會跑一次cleanLogs(), 看到5個2020檔, numKeep=2, 刪3個最舊
        let log = WSyslog({ fdLog, numKeep: 2, interval: 'day' })

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
        //先啟動空資料夾的logger, 此時init的cleanLogs不會刪任何檔
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

})

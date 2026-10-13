import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { createRequire } from 'module'
import kit from './tools/kit.mjs'


//由目前src建出之dist與下游打包之載入與落地(規則帳本R1~R5、R7、R16; 使用方式U2~U9)
//斷言一律含「log檔內有該筆」, 只驗可載入會誤判(只改名之變體可載入但建立logger後約0.1秒崩潰)


let fdRoot = kit.fdTmp('unit-bundle')
let fdPkg = path.join(fdRoot, 'pkg')
let fdApp = path.join(fdRoot, 'app')
let fdOther = path.join(fdRoot, 'other')
let fdLogs = path.join(fdRoot, 'logs')
let fpB1 = ''
let fpB2 = ''
let fpB3 = ''


//srcLines, 取src/*.mjs之非註解行
function srcLines() {
    let fdSrc = path.join(kit.fdRepo, 'src')
    let r = []
    for (let fn of fs.readdirSync(fdSrc).filter((fn) => fn.endsWith('.mjs'))) {
        let ls = fs.readFileSync(path.join(fdSrc, fn), 'utf8').split(/\r?\n/)
        ls.forEach((l, i) => {
            if (/^\s*(\/\/|\*|\/\*)/.test(l)) {
                return
            }
            r.push({ fn, line: i + 1, text: l })
        })
    }
    return r
}


describe('WSyslog bundle', function() {

    before(async function() {
        kit.rmrf(fdRoot)
        await kit.buildPkg(fdPkg)
        kit.makeApp(fdApp, fdPkg)
        fs.mkdirSync(fdOther, { recursive: true })
        fpB1 = await kit.buildDownstream(fdApp, 'B1') //runin預設browser, 即四個w-web-*之設定
        fpB2 = await kit.buildDownstream(fdApp, 'B2', { runin: 'nodejs' })
        fpB3 = await kit.buildDownstream(fdApp, 'B3', { external: kit.externalDownstream.filter((v) => v !== 'pino') }) //pino一併打包(瀏覽器版)
    })

    after(function() {
        kit.rmrf(fdRoot)
    })

    it('靜態(R1): src頂層無__filename/__dirname宣告(含export前綴與逗號宣告)', function() {
        let re = /^\s*(export\s+)?((let|const|var)\s+([^=;]*=[^,;]*,\s*|[A-Za-z0-9_$]+\s*,\s*)*|(function|class)\s+)__(filename|dirname)([^A-Za-z0-9_$]|$)/
        let hits = srcLines().filter((o) => re.test(o.text))
        assert.strict.deepEqual(hits, [])
    })

    it('靜態(R2): src無import.meta之url以外屬性', function() {
        let hits = srcLines().filter((o) => /import\.meta\.(?!url\b)/.test(o.text))
        assert.strict.deepEqual(hits, [])
    })

    it('靜態(R3): import.meta.url只在WSyslog.mjs一處且不在模組頂層', function() {
        let hits = srcLines().filter((o) => /import\.meta\.url/.test(o.text))
        assert.strict.equal(hits.length, 1, JSON.stringify(hits))
        assert.strict.equal(hits[0].fn, 'WSyslog.mjs')
        assert.ok(/^\s+/.test(hits[0].text), `import.meta.url須於函式內(縮排行), 實得: ${hits[0].text}`)
    })

    it('U6: 相對require由目前src建出之dist, 寫一筆並clear後落地', async function() {
        let fdLog = path.join(fdLogs, 'U6')
        let r = await kit.runNode([path.join(fdApp, 'consumer.cjs'), path.join(fdPkg, 'dist', 'w-syslog.umd.js'), fdLog, 'U6', 'clear'], { cwd: fdApp })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(r.stdout.includes('CLEARED'), r.stdout)
        assert.ok(kit.hasMsg(fdLog, 'U6'), 'log檔內須有該筆')
    })

    it('U4: CJS require(\'w-syslog\')(main為dist), 寫一筆並clear後落地', async function() {
        let fdLog = path.join(fdLogs, 'U4')
        let r = await kit.runNode([path.join(fdApp, 'consumer.cjs'), 'w-syslog', fdLog, 'U4', 'clear'], { cwd: fdApp })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(kit.hasMsg(fdLog, 'U4'), 'log檔內須有該筆')
    })

    it('U5: ESM import \'w-syslog\'(main為dist), 寫一筆並clear後落地', async function() {
        let fdLog = path.join(fdLogs, 'U5')
        let r = await kit.runNode([path.join(fdApp, 'consumer.mjs'), 'w-syslog', fdLog, 'U5', 'clear'], { cwd: fdApp })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(kit.hasMsg(fdLog, 'U5'), 'log檔內須有該筆')
    })

    it('U2: ESM import \'w-syslog/src/WSyslog.mjs\', 寫一筆並clear後落地', async function() {
        let fdLog = path.join(fdLogs, 'U2')
        let r = await kit.runNode([path.join(fdApp, 'consumer.mjs'), 'w-syslog/src/WSyslog.mjs', fdLog, 'U2', 'clear'], { cwd: fdApp })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(kit.hasMsg(fdLog, 'U2'), 'log檔內須有該筆')
    })

    it('U3: CJS require(\'w-syslog/src/WSyslog.mjs\')(require(esm)), 寫一筆並clear後落地', async function() {
        if (!process.features.require_module) {
            this.skip() //require(esm)需Node>=20.19/22.12
        }
        let fdLog = path.join(fdLogs, 'U3')
        let r = await kit.runNode([path.join(fdApp, 'consumer.cjs'), 'w-syslog/src/WSyslog.mjs', fdLog, 'U3', 'clear'], { cwd: fdApp })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(kit.hasMsg(fdLog, 'U3'), 'log檔內須有該筆')
    })

    it('U7: 下游rollupFile打包(runin browser、pino external), 自app夾與他夾執行皆落地', async function() {
        for (let [k, cwd] of [['U7app', fdApp], ['U7other', fdOther]]) {
            let fdLog = path.join(fdLogs, k)
            let r = await kit.runNode([path.join(fdApp, 'consumer.cjs'), fpB1, fdLog, k, 'clear'], { cwd })
            assert.strict.equal(r.code, 0, `${k}: ${r.stderr}`)
            assert.ok(kit.hasMsg(fdLog, k), `${k}: log檔內須有該筆`)
        }
    })

    it('U7: 下游打包後不呼叫clear自然結束亦落地', async function() {
        let fdLog = path.join(fdLogs, 'U7natural')
        let r = await kit.runNode([path.join(fdApp, 'consumer.cjs'), fpB1, fdLog, 'U7natural', 'natural'], { cwd: fdApp, timeout: 30000 })
        assert.strict.equal(r.killed, false, '行程須自然退出')
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(kit.hasMsg(fdLog, 'U7natural'), 'log檔內須有該筆')
    })

    it('U8: 下游rollupFile打包(runin nodejs、pino external), 寫一筆並clear後落地', async function() {
        let fdLog = path.join(fdLogs, 'U8')
        let r = await kit.runNode([path.join(fdApp, 'consumer.cjs'), fpB2, fdLog, 'U8', 'clear'], { cwd: fdApp })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(kit.hasMsg(fdLog, 'U8'), 'log檔內須有該筆')
    })

    it('U9(R5): 下游把pino打成瀏覽器版 → WSyslog()同步拋含external之訊息', async function() {
        let fdLog = path.join(fdLogs, 'U9')
        let r = await kit.runNode([path.join(fdApp, 'consumer.cjs'), fpB3, fdLog, 'U9', 'clear'], { cwd: fdApp })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(/CREATE-THROW .*pino.*external/.test(r.stdout), r.stdout)
    })

    it('R4/R16: 下游bundle之formatter由模組解析取得, 落點在素材根之下', function() {
        let fp = createRequire(fpB1).resolve('w-syslog/src/formatter.mjs')
        let rel = path.relative(fdApp, fp)
        assert.ok(!rel.startsWith('..') && !path.isAbsolute(rel), `formatter應解析至app之node_modules內, 實得: ${fp}`)
        assert.strict.equal(path.basename(fp), 'formatter.mjs')
    })

})

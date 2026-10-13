import fs from 'fs'
import path from 'path'
import assert from 'assert'
import kit from './tools/kit.mjs'


//套件所在路徑含URL特殊字元時仍可載入formatter並寫出(規則帳本R13)
//pino對非file://之target以'file://'+字串相接未編碼(pino/lib/transport-stream.js:16), 須傳file URL


let fdRoot = kit.fdTmp('unit-pathchars')
let fpChild = path.join(fdRoot, 'child.mjs')


let child = `import path from 'path'
import { pathToFileURL } from 'url'
let [fdPkg, fdLog, msg] = process.argv.slice(2)
let { default: WSyslog } = await import(pathToFileURL(path.join(fdPkg, 'src', 'WSyslog.mjs')).href)
let log = WSyslog({ fdLog, interval: 'day' })
log.info({ event: 'pc', msg })
await log.clear()
console.log('CLEARED')
`


describe('WSyslog pathchars', function() {

    before(function() {
        kit.rmrf(fdRoot)
        fs.mkdirSync(fdRoot, { recursive: true })
        fs.writeFileSync(fpChild, child)
    })

    after(function() {
        kit.rmrf(fdRoot)
    })

    for (let name of ['hash#x', 'pct%41b', 'pct%zz', 'sp ace']) {
        it(`套件位於「${name}」資料夾下, 寫一筆並clear後落地`, async function() {
            let fdPkg = path.join(fdRoot, name, 'w-syslog')
            kit.copyPkg(fdPkg)
            let fdLog = path.join(fdRoot, 'logs', name.replace(/[^A-Za-z0-9]/g, '_'))
            let r = await kit.runNode([fpChild, fdPkg, fdLog, name], { timeout: 30000 })
            assert.strict.equal(r.code, 0, r.stderr)
            assert.ok(r.stdout.includes('CLEARED'), r.stdout)
            assert.ok(kit.hasMsg(fdLog, name), 'log檔內須有該筆')
        })
    }

})

import fs from 'fs'
import path from 'path'
import assert from 'assert'
import kit from './tools/kit.mjs'
import resolveFormatter from '../src/resolveFormatter.mjs'


//transport目標(formatter)之解析順序與失敗訊息(規則帳本R4、R16)
//以test/_tmp下之假套件佈局驗各分支; test/_tmp位於repo內, 往上之node_modules無w-syslog, 故不會誤中


let fdRoot = kit.fdTmp('unit-resolveFormatter')


function writeFile(fp, c = '') {
    fs.mkdirSync(path.dirname(fp), { recursive: true })
    fs.writeFileSync(fp, c)
}


function writePkg(fd, name) {
    writeFile(path.join(fd, 'package.json'), JSON.stringify({ name, version: '0.0.0' }))
}


describe('WSyslog resolveFormatter', function() {

    before(function() {
        kit.rmrf(fdRoot)
    })

    after(function() {
        kit.rmrf(fdRoot)
    })

    it('(a) 本模組位於w-syslog套件之src: 取套件根之src/formatter.mjs', function() {
        let fd = path.join(fdRoot, 'a-src', 'w-syslog')
        writePkg(fd, 'w-syslog')
        writeFile(path.join(fd, 'src', 'WSyslog.mjs'))
        writeFile(path.join(fd, 'src', 'formatter.mjs'))
        let r = resolveFormatter({ fpSelf: path.join(fd, 'src', 'WSyslog.mjs'), cwd: fdRoot })
        assert.strict.equal(r.fp, path.join(fd, 'src', 'formatter.mjs'))
        assert.strict.equal(r.by, 'pkgRoot')
    })

    it('(a) 本模組位於w-syslog套件之dist: 亦取套件根之src/formatter.mjs', function() {
        let fd = path.join(fdRoot, 'a-dist', 'w-syslog')
        writePkg(fd, 'w-syslog')
        writeFile(path.join(fd, 'dist', 'w-syslog.umd.js'))
        writeFile(path.join(fd, 'src', 'formatter.mjs'))
        let r = resolveFormatter({ fpSelf: path.join(fd, 'dist', 'w-syslog.umd.js'), cwd: fdRoot })
        assert.strict.equal(r.fp, path.join(fd, 'src', 'formatter.mjs'))
        assert.strict.equal(r.by, 'pkgRoot')
    })

    it('(b) 被下游打包: 上一層非w-syslog套件根時不採用同層之同名檔, 改由本模組位置模組解析', function() {
        let fd = path.join(fdRoot, 'b-downstream')
        writePkg(fd, 'other-app')
        writeFile(path.join(fd, 'dist', 'app.umd.js'))
        writeFile(path.join(fd, 'src', 'formatter.mjs')) //誘餌: 下游自身之同名檔不可被採用
        writePkg(path.join(fd, 'node_modules', 'w-syslog'), 'w-syslog')
        writeFile(path.join(fd, 'node_modules', 'w-syslog', 'src', 'formatter.mjs'))
        let r = resolveFormatter({ fpSelf: path.join(fd, 'dist', 'app.umd.js'), cwd: fdRoot })
        assert.strict.equal(r.fp, path.join(fd, 'node_modules', 'w-syslog', 'src', 'formatter.mjs'))
        assert.strict.equal(r.by, 'resolveFromSelf')
    })

    it('(c) bundle不在任何含w-syslog之node_modules樹下: 由cwd模組解析', function() {
        let fdBundle = path.join(fdRoot, 'c-bundle', 'dist')
        writeFile(path.join(fdBundle, 'app.umd.js'))
        let fdCwd = path.join(fdRoot, 'c-cwd')
        writePkg(path.join(fdCwd, 'node_modules', 'w-syslog'), 'w-syslog')
        writeFile(path.join(fdCwd, 'node_modules', 'w-syslog', 'src', 'formatter.mjs'))
        let r = resolveFormatter({ fpSelf: path.join(fdBundle, 'app.umd.js'), cwd: fdCwd })
        assert.strict.equal(r.fp, path.join(fdCwd, 'node_modules', 'w-syslog', 'src', 'formatter.mjs'))
        assert.strict.equal(r.by, 'resolveFromCwd')
    })

    it('(d) 皆解析不到: 拋錯且訊息含已試位置與指引', function() {
        let fdBundle = path.join(fdRoot, 'd-bundle', 'dist')
        writeFile(path.join(fdBundle, 'app.umd.js'))
        let fdCwd = path.join(fdRoot, 'd-cwd')
        fs.mkdirSync(fdCwd, { recursive: true })
        let fpSelf = path.join(fdBundle, 'app.umd.js')
        assert.throws(() => {
            resolveFormatter({ fpSelf, cwd: fdCwd })
        }, (err) => {
            assert.ok(err.message.includes('w-syslog/src/formatter.mjs'), err.message)
            assert.ok(err.message.includes(fpSelf), `訊息須含本模組位置: ${err.message}`)
            assert.ok(err.message.includes(fdCwd), `訊息須含cwd: ${err.message}`)
            assert.ok(err.message.includes('external'), `訊息須含打包指引: ${err.message}`)
            return true
        })
    })

    it('不於模組載入時解析: 解析不到之佈局可載入, 首次WSyslog()才同步拋錯', async function() {
        let fd = path.join(fdRoot, 'noroot') //src無套件根package.json, 亦無node_modules/w-syslog
        fs.cpSync(path.join(kit.fdRepo, 'src'), path.join(fd, 'src'), { recursive: true })
        let fpChild = path.join(fd, 'child.mjs')
        writeFile(fpChild, `import { pathToFileURL } from 'url'
import path from 'path'
let { default: WSyslog } = await import(pathToFileURL(path.join(process.argv[2], 'src', 'WSyslog.mjs')).href)
console.log('LOADED')
try {
    WSyslog({ fdLog: path.join(process.argv[2], 'logs') })
    console.log('CREATED')
}
catch (err) {
    console.log('CREATE-THROW ' + err.message)
}
`)
        let r = await kit.runNode([fpChild, fd], { cwd: fd })
        assert.strict.equal(r.code, 0, r.stderr)
        assert.ok(r.stdout.includes('LOADED'), r.stdout)
        assert.ok(/CREATE-THROW .*w-syslog\/src\/formatter\.mjs/.test(r.stdout), r.stdout)
    })

})

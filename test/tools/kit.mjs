//測試共用工具: 由目前src組套件副本並建dist、模擬下游app與打包、子程序執行、讀log
//測試不被打包, 故本檔以import.meta.url定位repo不受規則帳本R1~R3限制
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { execFile } from 'child_process'
import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'
import rollupFile from 'w-package-tools/src/rollupFile.mjs'
import getFiles from 'w-package-tools/src/getFiles.mjs'
import optRollup from '../../toolg/distRollupOpt.mjs'


//fdRepo, 本repo根目錄
let fdRepo = fileURLToPath(new URL('../../', import.meta.url))


//urlSrcWSyslog, 目前src之WSyslog.mjs之file URL
let urlSrcWSyslog = pathToFileURL(path.join(fdRepo, 'src', 'WSyslog.mjs')).href


//externalDownstream, 與四個w-web-*之toolg/gDistRollup.mjs相同之external(不含module與worker_threads, 由rollup視為無法解析之external)
let externalDownstream = ['@hapi/hapi', '@hapi/inert', 'path', 'fs', 'stream', 'events', 'url', 'pino']


//consumerCjs, 消費端(CJS): argv: spec fdLog msg mode(clear|natural)
let consumerCjs = `'use strict'
let path = require('path')
let [spec, fdLog, msg, mode] = process.argv.slice(2)
let m = require(spec.startsWith('.') ? path.resolve(__dirname, spec) : spec)
let WSyslog = typeof m === 'function' ? m : m.default
let log
try {
    log = WSyslog({ fdLog, interval: 'day' })
}
catch (err) {
    console.log('CREATE-THROW ' + err.message)
    process.exit(0)
}
log.info({ event: 'kit', msg })
if (mode === 'clear') {
    log.clear().then(() => console.log('CLEARED'))
}
`


//consumerMjs, 消費端(ESM): argv: spec fdLog msg mode(clear|natural)
let consumerMjs = `import path from 'path'
import { pathToFileURL } from 'url'
let [spec, fdLog, msg, mode] = process.argv.slice(2)
let m = await import(path.isAbsolute(spec) ? pathToFileURL(spec).href : spec)
let WSyslog = typeof m.default === 'function' ? m.default : m.default.default
let log
try {
    log = WSyslog({ fdLog, interval: 'day' })
}
catch (err) {
    console.log('CREATE-THROW ' + err.message)
    process.exit(0)
}
log.info({ event: 'kit', msg })
if (mode === 'clear') {
    await log.clear()
    console.log('CLEARED')
}
`


function fdTmp(name) {
    return path.join(fdRepo, 'test', '_tmp', name)
}


function rmrf(fd) {
    fs.rmSync(fd, { recursive: true, force: true })
}


//copyPkg, 以目前src組成套件副本(package.json與src)
function copyPkg(fdPkg) {
    fs.mkdirSync(fdPkg, { recursive: true })
    fs.copyFileSync(path.join(fdRepo, 'package.json'), path.join(fdPkg, 'package.json'))
    fs.cpSync(path.join(fdRepo, 'src'), path.join(fdPkg, 'src'), { recursive: true })
}


//buildPkg, 以與toolg/gDistRollup.mjs相同之設定(toolg/distRollupOpt.mjs)把套件副本之src建到其dist
async function buildPkg(fdPkg) {
    copyPkg(fdPkg)
    let fdSrc = path.join(fdPkg, 'src')
    await rollupFiles({
        fns: getFiles(fdSrc),
        fdSrc,
        fdTar: path.join(fdPkg, 'dist'),
        ...optRollup,
        bLog: false,
    })
}


//makeApp, 模擬下游app: node_modules/w-syslog為套件副本, server/srLog.mjs比照四個w-web-*之引用寫法
function makeApp(fdApp, fdPkg) {
    fs.mkdirSync(path.join(fdApp, 'node_modules'), { recursive: true })
    fs.mkdirSync(path.join(fdApp, 'server'), { recursive: true })
    fs.writeFileSync(path.join(fdApp, 'package.json'), JSON.stringify({ name: 'kit-app', version: '0.0.0', private: true }, null, 2))
    fs.cpSync(fdPkg, path.join(fdApp, 'node_modules', 'w-syslog'), { recursive: true })
    fs.writeFileSync(path.join(fdApp, 'server', 'srLog.mjs'), `import WSyslog from 'w-syslog/src/WSyslog.mjs'\n\n\nexport default WSyslog\n`)
    fs.writeFileSync(path.join(fdApp, 'consumer.cjs'), consumerCjs)
    fs.writeFileSync(path.join(fdApp, 'consumer.mjs'), consumerMjs)
}


//buildDownstream, 以w-package-tools之rollupFile打包模擬下游之server/srLog.mjs, 回傳bundle路徑
async function buildDownstream(fdApp, name, opt = {}) {
    let fdTar = path.join(fdApp, `dist-${name}`)
    await rollupFile({
        fn: 'srLog.mjs',
        fdSrc: path.join(fdApp, 'server'),
        fdTar,
        hookNameDist: () => 'app',
        globals: {},
        external: externalDownstream,
        bLog: false,
        ...opt,
    })
    return path.join(fdTar, 'app.umd.js')
}


//runNode, 以子程序執行node, 回傳{ code, killed, stdout, stderr, ms }; code為離開碼, 逾時被殺時killed為true
function runNode(args, opt = {}) {
    return new Promise((resolve) => {
        let ts = Date.now()
        execFile(process.execPath, args, {
            cwd: opt.cwd || fdRepo,
            timeout: opt.timeout || 60000,
            env: { ...process.env, ...(opt.env || {}) },
            maxBuffer: 64 * 1024 * 1024,
        }, (err, stdout, stderr) => {
            resolve({
                code: err ? (err.killed ? null : err.code) : 0,
                killed: !!(err && err.killed),
                stdout: String(stdout),
                stderr: String(stderr),
                ms: Date.now() - ts,
            })
        })
    })
}


//readLog, 讀資料夾內所有檔之行, 回傳{ rows(解析成功之物件), bad(無法解析之行數), files }
function readLog(fdLog) {
    let rows = []
    let bad = 0
    let files = []
    if (!fs.existsSync(fdLog)) {
        return { rows, bad, files }
    }
    for (let fn of fs.readdirSync(fdLog)) {
        let fp = path.join(fdLog, fn)
        if (!fs.statSync(fp).isFile()) {
            continue
        }
        files.push(fn)
        for (let l of fs.readFileSync(fp, 'utf8').split('\n')) {
            if (l.trim() === '') {
                continue
            }
            try {
                rows.push(JSON.parse(l))
            }
            catch (err) {
                bad++
            }
        }
    }
    return { rows, bad, files }
}


//hasMsg, log資料夾內是否有msg為指定值之info(level 30)行
function hasMsg(fdLog, msg) {
    return readLog(fdLog).rows.some((r) => r.msg === msg && r.level === 30)
}


export default {
    fdRepo,
    urlSrcWSyslog,
    externalDownstream,
    fdTmp,
    rmrf,
    copyPkg,
    buildPkg,
    makeApp,
    buildDownstream,
    runNode,
    readLog,
    hasMsg,
}

import WSyslog from '../../src/WSyslog.mjs'


//子程序fixture: 建nInst個實例各寫nLogs筆log後逐一clear, 用於驗證行程能自然退出(不依賴exit hook)
//argv: [fdLogBase, nInst, nLogs], 各實例寫入`${fdLogBase}_${i}`資料夾


let fdLogBase = process.argv[2]
let nInst = parseInt(process.argv[3], 10)
let nLogs = parseInt(process.argv[4], 10)

let logs = []
for (let i = 0; i < nInst; i++) {
    logs.push(WSyslog({ fdLog: `${fdLogBase}_${i}`, interval: 'day' }))
}

for (let log of logs) {
    for (let k = 0; k < nLogs; k++) {
        log.info({ event: 'stress', msg: `m${k}` })
    }
}

for (let log of logs) {
    await log.clear()
}

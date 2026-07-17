import WSyslog from '../../src/WSyslog.mjs'


//子程序fixture: clear後再寫log, 預期非同步丟uncaughtException(the worker has exited)致exit code非0
//argv: [fdLog]


let fdLog = process.argv[2]

let log = WSyslog({ fdLog, interval: 'day' })
log.info({ event: 'probe', msg: 'before-clear' })

await log.clear()

log.info({ event: 'probe', msg: 'after-clear' })

//保持存活讓非同步錯誤有時間浮現; 若未丟錯則計時器到期以exit 0結束, 由測試端斷言非0
setTimeout(() => {}, 3000)

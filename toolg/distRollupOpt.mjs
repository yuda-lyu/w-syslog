//dist之rollup打包設定, 供toolg/gDistRollup.mjs與測試(test/tools/kit.mjs)共用, 避免發布設定與測試設定漂移(規則帳本R7)
//pino必須external(規則帳本R5): 打包pino須另產worker檔, 且瀏覽器版pino無transport
//module(createRequire)與worker_threads(formatter回報事件)為node內建模組, 列external並給globals以免rollup視為無法解析之引用
let optRollup = {
    nameDistType: 'kebabCase',
    globals: {
        'path': 'path',
        'fs': 'fs',
        'stream': 'stream',
        'url': 'url',
        'module': 'module',
        'worker_threads': 'worker_threads',
        'pino': 'pino',
    },
    external: [
        'path',
        'fs',
        'stream',
        'url',
        'module',
        'worker_threads',
        'pino',
    ],
}


export default optRollup

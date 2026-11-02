import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'
import getFiles from 'w-package-tools/src/getFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'


//getFiles(fdSrc)會把src內每檔各自打包, dist/formatter.umd.js、dist/resolve-formatter.umd.js為副產物, 不被執行期使用
//pino必須external: 打包pino須另產worker檔, 且瀏覽器版pino無transport
//module(createRequire)與worker_threads(formatter回報事件)為node內建模組, 列external並給globals以免rollup視為無法解析之引用
rollupFiles({
    fns: getFiles(fdSrc),
    fdSrc,
    fdTar,
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
})


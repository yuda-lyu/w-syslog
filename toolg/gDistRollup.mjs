import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'
import getFiles from 'w-package-tools/src/getFiles.mjs'
import optRollup from './distRollupOpt.mjs'


let fdSrc = './src'
let fdTar = './dist'


//打包設定(nameDistType、globals、external)與測試共用toolg/distRollupOpt.mjs, 避免兩者漂移
//getFiles(fdSrc)會把src內每檔各自打包, dist/formatter.umd.js、dist/resolve-formatter.umd.js為副產物, 不被執行期使用
rollupFiles({
    fns: getFiles(fdSrc),
    fdSrc,
    fdTar,
    ...optRollup,
})


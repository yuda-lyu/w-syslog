# 規則帳本

本檔為套件設計與開發階段之規則帳本,為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.

- 建立:2026-10-14(任務 20261014041244 run02);依據:`C:\opensrcOper\dnow\20261014041244\agent-out\run01-審計回應.md` §10 之提案 R1~R16、主控複審 `review\run01-複審.md` 之裁示(D-2 採 ④'、D-3 (c)、D-11 (a) 等)。
- 修訂:2026-10-14 run03,依主控複審 run02 之裁示,寫檔失敗與 transport 錯誤之事件由 `'error'` 改為 `writeError`(R8 規則三),新增 R19(事件一名一義)。
- 修訂:2026-10-14 run04,依主控複審 run03 之裁示,新增 R20(首次清理延後到 `WSyslog()` 回傳後、`clear()` 呼叫即停止自動清理)與 R21(clear 後呼叫 log 方法之兩個時段須於文件區分)。
- 修訂:2026-11-02 sys267,依 dspec〈自有套件之發布與建置腳本〉:撤除 `toolg/distRollupOpt.mjs`(選項寫回 `toolg/gDistRollup.mjs`),R7 由「共用設定」改為「測試以副本執行發布之建置腳本」;本檔不再立 toolg 寫法之規則,`toolg/` 依該 dspec。
- 盤點指令一律用 `git grep`(本機無 `rg` 執行檔);站點狀態:**已套 / 未套 / 刻意不套**(附理由)。
- 類別:**本套件在每一種使用方式下都能載入並正確寫出 log**(ESM 匯入 src、CJS `require` main、ESM 以套件名匯入、被下游以 w-package-tools rollupFile 打包),含 transport 目標檔解析、log 資料夾、`clear()`、行程結束之寫出、失敗時之表現。

## 一、使用方式之軸(測試須涵蓋)

| 代號 | 使用方式 | 對應測試 |
|---|---|---|
| U1 | ESM 相對匯入 `src/WSyslog.mjs` | 既有 `test/unit-*.test.mjs` |
| U2 | ESM 匯入 `w-syslog/src/WSyslog.mjs`(下游 `server/srLog.mjs` 之寫法) | `test/unit-bundle.test.mjs` |
| U3 | CJS `require('w-syslog/src/WSyslog.mjs')`(require(esm),Node ≥ 20.19/22.12) | `test/unit-bundle.test.mjs` |
| U4 | CJS `require('w-syslog')`(main → dist) | `test/unit-bundle.test.mjs` |
| U5 | ESM `import 'w-syslog'`(main → dist) | `test/unit-bundle.test.mjs` |
| U6 | repo 內相對 `require` 由目前 src 建出之 dist | `test/unit-bundle.test.mjs` |
| U7 | 下游 rollupFile(umd、runin browser、pino external,即四個 w-web-*) | `test/unit-bundle.test.mjs` |
| U8 | 同 U7 但 runin nodejs | `test/unit-bundle.test.mjs` |
| U9 | 下游把 pino 一併打包(browser 版)——不支援,須同步拋可讀錯誤 | `test/unit-bundle.test.mjs` |
| U10 | 下游把 pino 一併打包(node 版)——不支援(pino 官方 `docs/bundling.md:3`),**刻意不測**:失敗為非同步 worker 錯誤,依 R8 轉發 | — |
| U11 | 其他打包器(esbuild/webpack/pkg/ncc)、pnpm/Yarn PnP 佈局——合約外,**刻意不測**,README 註明 | — |

## 二、規則

### R1 會被打包之模組頂層不得宣告 `__filename`、`__dirname`

- 規則:含 `export` 前綴、逗號宣告串列、同名 function/class 皆不可。
- 理由:rollup 對 umd/cjs 以 `require('u'+'rl').pathToFileURL(__filename).href` 取代 `import.meta.url`,避讓名單不含 `__filename`(rollup 3.29.5 `dist/shared/rollup.js:13344-13351`、`:13385-13391`;上游 4.64.6 `MetaProperty.ts:152-159` 相同)。同名頂層宣告(本檔或同一 bundle 內任一模組)使載入即 TDZ;1.0.0~1.0.32 共 33 版 dist 皆因此無法載入。
- 盤點:`git grep -nE "^[[:space:]]*(export[[:space:]]+)?((let|const|var)[[:space:]]+([^=;]*=[^,;]*,[[:space:]]*|[A-Za-z0-9_$]+[[:space:]]*,[[:space:]]*)*|(function|class)[[:space:]]+)__(filename|dirname)([^A-Za-z0-9_$]|$)" -- src`
- 判準:0 筆。正則為輔,最終判準為 R7 之建置產物載入測試。
- 站點全集:`src/WSyslog.mjs`(修前 :15、:16)——狀態見 §三。
- 測試:`test/unit-bundle.test.mjs`「靜態: src 頂層無 __filename/__dirname 宣告」與各載入案。

### R2 不得使用 `import.meta` 之 url 以外屬性

- 理由:rollup 對 umd/cjs/iife 把 `import.meta.dirname/filename/resolve` 換成 `undefined`(3.29.5 `rollup.js:13362-13369`;4.64.6 `MetaProperty.ts:181-190`),`import.meta.resolve(...)` 變 `undefined(...)`。
- 盤點:`git grep -nP "^(?!\s*(//|\*)).*import\.meta\.(?!url\b)" -- src`(排除註解行)
- 判準:0 筆。
- 測試:`test/unit-bundle.test.mjs`「靜態: src 無 import.meta 之 url 以外屬性」。

### R3 由執行期位置推導檔案路徑之站點只有一處(單一擁有者)

- 規則:`import.meta.url` 只在 `src/WSyslog.mjs` 之 formatter 解析快取函式內使用(呼叫時才求值),解析邏輯在 `src/resolveFormatter.mjs`(以參數注入本模組路徑與 cwd,不自行讀 `import.meta`)。
- 盤點:`git grep --untracked -nP "^(?!\s*(//|\*)).*import\.meta\.url" -- src`(排除註解行;`--untracked` 使未提交之新檔亦被盤點)
- 判準:只命中 `src/WSyslog.mjs` 之一處(位於函式內,非頂層)。
- 測試:`test/unit-bundle.test.mjs`「靜態: import.meta.url 只在 WSyslog.mjs 一處」。

### R4 transport 目標(formatter)之解析順序與失敗訊息

- 規則:依序 (a) 本模組上一層為 w-syslog 套件根(讀其 `package.json` 之 `name === 'w-syslog'`)→ `<根>/src/formatter.mjs`;(b) `createRequire(本模組路徑).resolve('w-syslog/src/formatter.mjs')`;(c) 同上以 `path.join(cwd, 'index.js')` 為基準;(d) 皆失敗 → 拋 Error,訊息含已試位置與「打包時 pino 須 external、w-syslog 須已安裝」之指引。
- 規則:首次 `WSyslog()` 時解析並快取;解析失敗不快取;不得於模組載入時解析。
- 理由:以自身套件名解析在本 repo 內必 `MODULE_NOT_FOUND`(無 `exports` 不能自我參照),故 (a) 必須在前;(a) 驗 name 以免下游 dist 旁恰有同名檔時誤用;(b)(c) 涵蓋被下游打包(本模組位置即下游 bundle)。
- 站點:`src/resolveFormatter.mjs`(新)、`src/WSyslog.mjs` 之呼叫與快取。
- 測試:`test/unit-resolveFormatter.test.mjs`(各分支與失敗訊息、載入時不解析)。

### R5 pino 一律不被打包

- 規則:本套件 `toolg/gDistRollup.mjs` 之 external 含 `pino`;README 對下游明訂;`WSyslog()` 遇 `typeof pino.transport !== 'function'`(瀏覽器版 pino)同步拋可讀錯誤。
- 盤點:`git grep -n "'pino'" -- toolg/gDistRollup.mjs`(須在 external 陣列中)
- 測試:`test/unit-bundle.test.mjs`「建置(R5): pino 為 external」(副本執行 `toolg/gDistRollup.mjs` 後驗 `w-syslog.umd.js` 向外 `require("pino")`、dist 只向外引用內建模組與 pino)、「下游把 pino 打成瀏覽器版 → 同步拋」。

### R6 formatter 之 options 為跨版契約,只增不改

- 規則:`interval`、`fdLog`、`timeZone` 之名稱與語意不可改;新增欄位須可被舊 formatter 忽略。新增之 worker → 主緒事件名不可為 `'error'`(舊主緒無監聽時 EventEmitter 會拋)。
- 理由:下游 bundle 內嵌之主緒碼為建置當時之版本,formatter 則於執行期解析已安裝版;實測「新 bundle + 舊 formatter」可寫出(run01 `tmp/skew/app/`)。
- 盤點:`git grep -n "options:" -A 6 -- src/WSyslog.mjs`
- 測試:無專屬測試(由 R7 之 bundle 案間接涵蓋);刻意不另測舊版組合。

### R7 測試須含「由目前 src 建出之 bundle」之載入與落地,不得以 repo 內 `dist/` 代替

- 理由:repo 內 `dist/` 只在發布時重建(`script.txt:7`),直接 `require` 測到的是上一版產物;只驗「可載入」會誤判(只改名之變體可載入但約 0.1 秒後崩潰)。
- 規則:測試以副本(`package.json`、`src`、`toolg`,置於 `test/_tmp/<名>/`)並指定 cwd 為副本根,原樣執行發布之 `toolg/gDistRollup.mjs` 建出 dist,不另抽設定、不改寫 toolg(依 dspec〈自有套件之發布與建置腳本〉規則 4);建置產物之檢查(離開碼 0、無外部模組警告、產出檔名、external)寫在測試內;斷言一律含「log 檔內有該筆」。
- 測試:`test/unit-bundle.test.mjs`(建置(R5、R7)、U2~U9)、`test/unit-lifecycle.test.mjs`。`test/tools/kit.mjs` 之 `buildPkg` 為副本與 spawn 執行。

### R8 log 資料夾與寫檔失敗之政策(D-3 (c))

- 規則一:fdLog 於 `WSyslog()` 同步建立並驗證為資料夾(跟隨連結,R14),不成立即同步拋錯。
- 規則二:formatter 切檔前確保資料夾存在;內層 `fs.WriteStream` 之 `'error'` 必有監聽——寫 stderr,並經 thread-stream 之 `{ code: 'EVENT' }` 協定(`thread-stream/README.md`〈Emit events〉)回報主緒;寫入回呼不把內層錯誤轉給外層 Writable(以免外層被 destroy、worker 隨之結束)。
- 規則三:**寫檔失敗不殺宿主**——主緒 transport 為唯一匯流點(formatter 外層 Writable 之錯誤會被 thread-stream worker 升級為主緒 `'error'`,`thread-stream/lib/worker.js:172-183`);主緒對 transport 之 `'error'` 與 formatter 回報事件皆有監聽,轉發為 `ev` 之 **`writeError`** 事件(payload 為 `Error`;eventemitter3 無人監聽時不拋)並寫 stderr;**不得轉發為 `'error'`**(`'error'` 為呼叫 `log.error()` 之等級事件,見 R19);transport 一旦致命出錯即停止再寫入 pino(避免每筆皆報錯)。(run02 曾轉發為 `'error'`,run03 依主控裁示改名;新行為未發布,非破壞性變更。)
- 規則四:**clear 完成後(transport `'close'` 之後)移除主緒之上述監聽**,使「clear 後再寫」維持殺宿主(屬誤用;`test/unit-clear.test.mjs` 之既有斷言)。
- 站點:`src/WSyslog.mjs`(fdLog 驗證、transport 監聽、wrap、clear)、`src/formatter.mjs`(切檔、內層 error、回報)。
- 測試:`test/unit-fdLog.test.mjs`(不可建立、資料夾被刪後切檔、資料夾被換成檔案後結束、寫檔失敗事件與存活、無人監聽仍存活)、`test/unit-clear.test.mjs`(clear 後再寫殺宿主)。

### R9 `clear()` 不得依賴 `log.flush(cb)` 或 transport 之 `ready`

- 理由:thread-stream 4.2.0 於 READY 前同步寫入 >~4MB(門檻非單調)時 READY 交握之等值等待永不成立(`thread-stream/index.js:175-178`),`flush(cb)` 經 `requestWorkerFlush` 等 ready(`:417-433`)而永不回呼;cur 之 clear 因此等滿 timeLimit 後崩潰。`end()` 不依賴 ready 且內含 flushSync(`:303-310`、`:540-583`)。
- 規則:收尾一律為「已 closed/destroyed 則立即收尾;否則 `once('close')` 後直接 `transport.end()`」;與 pino exit 掛勾同樣不依賴 ready(同語意之收尾路徑行為一致)。
- 盤點:`git grep --untracked -nP "^(?!\s*(//|\*)).*\.flush\(" -- src`(排除註解行;判準 0 筆)
- 測試:`test/unit-lifecycle.test.mjs`「READY 前大量寫入後 clear」。

### R10 建立 transport 後立即 `unref()`

- 理由:pino 只在 `onReady` 內 unref(`pino/lib/transport.js:151-158`),ready 不成立時行程永不自然退出;pino 於 ready 前已掛之 exit 掛勾(`:149`、`:160-172`)仍負責補寫。
- 盤點:`git grep -n "transport.unref()" -- src`(判準 1 筆,緊接 `pino.transport(...)` 之後)
- 測試:`test/unit-lifecycle.test.mjs`「READY 前大量寫入後不 clear 自然結束」。

### R11 任何 `worker.terminate()` 之前,主緒必已掛 `'error'` 監聽

- 理由:READY 後 terminate 令 worker 以 code 1 結束,ThreadStream 發 `'error'`(`thread-stream/index.js:211-221`),無人接即殺宿主。
- 規則:逾時分支於 stderr 註記「可能遺失」;R8 之監聽要到 `'close'` 後才移除,故 terminate 時必已掛著。
- 盤點:`git grep -n "terminate()" -- src`
- 測試:`test/unit-lifecycle.test.mjs`「clear 逾時(timeLimit=1)於 READY 前/後宿主存活」。

### R12 可在主緒同步驗證之輸入一律於 `WSyslog()` 同步驗證

- 成員:timeZone(以 `new Intl.DateTimeFormat('en-US', { timeZone })` 驗證,dayjs tz 外掛同依 Intl)、fdLog 可建立(R8 規則一)、pino 為 node 版(R5)、formatter 可解析(R4)。
- 理由:無效 timeZone 原於 worker 內 RangeError 而殺宿主。
- 測試:`test/unit-lifecycle.test.mjs`「無效 timeZone 同步拋」、`test/unit-fdLog.test.mjs`「fdLog 不可建立同步拋」。

### R13 transport target 一律傳 file URL

- 理由:pino 對非 `file://` 之 target 以 `'file://'+字串` 相接未編碼(`pino/lib/transport-stream.js:16`),路徑含 `%zz` 即 `URIError`。
- 規則:`target: pathToFileURL(fpFormatter).href`。
- 盤點:`git grep -n "target:" -- src/WSyslog.mjs`
- 測試:`test/unit-pathchars.test.mjs`(`#`、`%41`、`%zz`、空白)。

### R14 資料夾存在性判定一律跟隨連結

- 規則:用 `fs.statSync(fd).isDirectory()`(try/catch),主緒(fdLog 驗證、cleanLogs)與 worker 一致;不用 wsemi `fsIsFolder`(以 lstat 判定,junction/symlink 回 false——wsemi 之既定語意,非其缺陷)。
- 盤點:`git grep --untracked -nP "^(?!\s*(//|\*)).*fsIsFolder" -- src`(排除註解行;判準 0 筆)
- 測試:`test/unit-fdLog.test.mjs`「fdLog 為連結:可寫且 numKeep 生效」。

### R15 formatter 之 `final` 不可對已 destroyed/errored 之內層串流呼叫 `end`

- 理由:會得 `ERR_STREAM_DESTROYED`,經 thread-stream 升級為主緒錯誤(run01 複審第 21 項)。
- 盤點:`git grep -n "final(callback)" -A 8 -- src/formatter.mjs`
- 測試:`test/unit-fdLog.test.mjs`「資料夾被換成檔案後結束無 ERR_STREAM_DESTROYED」。

### R16 `w-syslog/src/formatter.mjs` 必須可由套件名深層解析

- 規則:R4 之 (b)(c) 依賴之;日後若於 `package.json` 加 `exports`,須含 `./src/*`(否則依 Node exports 規則 `ERR_PACKAGE_PATH_NOT_EXPORTED`,全部落到 (d))。
- 盤點:`node -e "console.log(require('./package.json').exports)"`(判準:undefined,或含 `./src/*`)
- 測試:`test/unit-bundle.test.mjs` 之下游打包案(以模組解析取得 formatter)。

### R17 fdLog 於 `WSyslog()` 內解析為絕對路徑一次,主緒與 formatter 共用(D-11 (a))

- 理由:原主緒 cleanLogs 每次依當下 cwd 解析相對 fdLog,呼叫端 `process.chdir` 後會清到新 cwd 下同名資料夾(刪到他人之 log;run01 複審 `p-chdir.mjs` 實測)。
- 規則:`fdLogAbs = path.resolve(fdLog)` 供 fsCreateFolder、資料夾判定、cleanLogs 之讀刪與 formatter options;`delete` 事件之 `fp` 維持 `path.join(原fdLog, fn)`(相容既有斷言 `test/unit-cleanLogs.test.mjs`)。
- 測試:`test/unit-fdLog.test.mjs`「建立後 chdir:cleanLogs 只清原資料夾、事件 fp 維持原格式」。

### R18 fdLog 預設值與 interval 驗證於主緒與 formatter 兩處手寫,改其一須同步改另一(D9,設計限制)

- 理由:主緒驗證後才傳入 formatter,formatter 之預設為防禦性重複(run01 D9 判為設計限制,不收斂)。
- 盤點:`git grep -nE "fdLog = './_logs'|interval !== 'day'" -- src`(判準:`src/WSyslog.mjs` 與 `src/formatter.mjs` 各 2 筆,值相同)
- 測試:無專屬測試(既有 `unit-basic`、`unit-cleanLogs` 之 day/hr 案間接涵蓋)。

### R19 對外事件一名一義:每個事件名只有一種觸發來源與一種 payload(run03 裁示)

- 理由:同一事件名承載兩種語意、只能靠 payload 型別區分,屬同名異義之契約陷阱(監聽 `log.error()` 之使用端會突然收到 Error,反之亦然);主控複審 run02 後裁示改用專用事件名。
- 規則:事件全集如下,不得增加第二種來源或第二種 payload;新增對外事件不得與既有事件名(含六個等級名)同名。
  - 等級事件 `fatal`、`error`、`warn`、`info`、`debug`、`trace`:只由對應等級方法觸發(`wrap`),payload `{ args }`。
  - `'delete'`:只由 cleanLogs 刪檔觸發,payload `{ fp, fn }`(`fp` 為 `path.join(原fdLog, fn)`,R17);首次清理之事件亦須可被建立後立即掛上之監聽器收到(R20)。
  - `writeError`:只由寫檔失敗(formatter 回報)與 transport 錯誤觸發,payload `Error`(R8 規則三)。
- 盤點:`git grep -nE "ev\.emit\(" -- src`(判準:恰 3 站點——`wrap` 之 `ev.emit(level, { args })`、cleanLogs 之 `ev.emit('delete', …)`、`emitWriteError` 之 `ev.emit('writeError', err)`);`git grep -nE "emit\('error'" -- src`(判準:0 筆)。
- 文件站點:`src/WSyslog.mjs` 之 JSDoc `@returns`、`README.md`〈Errors〉,須與上列全集一致。
- 測試:`test/unit-fdLog.test.mjs`「寫檔失敗轉發為 writeError」「寫檔失敗不觸發 'error'、各等級方法只觸發同名事件」。

### R20 自動清理之時序:首次清理延後到 `WSyslog()` 回傳後;`clear()` 被呼叫即停止自動清理(run04 裁示)

- 理由:原首次清理於 `WSyslog()` 內同步執行,其 `'delete'` 事件發出時尚無監聽者——承諾發事件、首批卻不可觀察之契約缺口(run03 §0.6 第 2 點;HEAD 即如此)。
- 規則一:首次清理以 **`setImmediate`** 排到下一個事件迴圈輪次。理由:它晚於本輪同步碼與其後全部 microtask(含 `await` 已完成之 Promise),建立後同步或經此類 await 掛上之監聽器皆來得及;`process.nextTick`/`queueMicrotask` 會先於 await 之後續執行而錯過;`setTimeout(0)` 有最小延遲且與 I/O、setImmediate 之先後不定。該 Immediate **不 unref**:建立後即結束之短命腳本仍會清理一次;Immediate 只撐到下一輪,不使行程懸置。
- 規則二:`clear()` 第一次被呼叫時(同步)即停止全部自動清理——取消尚未執行之首次清理(`clearImmediate`)並停止每小時清理(`clearInterval`);之後不再自動刪檔或發 `'delete'` 事件,亦不留懸置之計時器。兩者收斂在單一 `stopAutoClean`,不另寫第二處。手動 `cleanLogs()` 不受限(使用者顯式呼叫;`test/unit-fdLog.test.mjs` chdir 案依賴)。
- 規則三:首次、每小時、手動清理為同一個 `cleanLogs`,其本體全包 try/catch(讀夾失敗記 stderr `WSyslog cleanLogs error:`;單檔刪除失敗或 `'delete'` 監聽器拋錯皆略過並續刪下一檔),延後執行不改變錯誤處置,也不會在 Immediate 內拋出未捕捉例外。
- 盤點:`git grep -nE "setImmediate\(|clearImmediate\(|setInterval\(|clearInterval\(|stopAutoClean|^\s*cleanLogs\(\)" -- src/WSyslog.mjs`(判準:首次清理只經一處 `setImmediate` 排程、src 內無同步之 `cleanLogs()` 首次呼叫;`clearImmediate`、`clearInterval` 只在 `stopAutoClean` 內;`stopAutoClean` 只在 clear 開頭呼叫一次;其餘 `setImmediate(detach)` 屬 R8 規則四)。
- 已知限制:建立後經 I/O 等待才掛上之監聽器可能收不到首批事件(K10);建立後同一輪次內即 `clear()` 或 `process.exit()` 者不執行首次清理(前者為規則二、後者行程已結束)。
- 測試:`test/unit-cleanLogs.test.mjs`「首次清理於下一輪次執行」「首批事件:同步掛上」「首批事件:await 後掛上」「建立後立即 clear」。

### R21 「clear 後呼叫 log 方法」之文件須區分兩個時段(run04 裁示)

- 規則:JSDoc(`src/WSyslog.mjs` 之 `@returns`)與 README〈Usage〉須寫明:clear 進行中(尚未 resolve)呼叫者不寫出並觸發 `writeError`;clear 完成後呼叫者宿主拋錯。行為不變(R8 規則四)。
- 依據:run03 實跑(`tmp/probe/run03-events.mjs` 之 during-clear、after-clear)。
- 例外(讀碼推論,未實測):transport 已自行關閉(worker 以 0 結束且未發 `'error'`)時 clear 立即完成(`src/WSyslog.mjs` clear 之 closed/destroyed 分支),不存在「進行中」時段。
- 盤點:`git grep -n "writeError" -- README.md src/WSyslog.mjs`(判準:README〈Usage〉與 JSDoc 各有一句區分兩時段)。
- 測試:無專屬測試(文件規則);行為由 `test/unit-clear.test.mjs`「clear後再寫log」與 run03 探測涵蓋。

## 三、站點狀態(2026-10-14 run02 實作後,以 §二之盤點指令實跑)

| 規則 | 站點 | 狀態 |
|---|---|---|
| R1 | `src/*.mjs` 頂層 | 已套:盤點 0 筆(修前 `src/WSyslog.mjs:15`、:16) |
| R2 | `src/*.mjs` | 已套:盤點 0 筆(修前即 0 筆) |
| R3 | `src/WSyslog.mjs:21`(`getFpFormatter` 函式內,唯一一處);`src/resolveFormatter.mjs` 不讀 `import.meta` | 已套 |
| R4 | `src/resolveFormatter.mjs`(a)~(d);`src/WSyslog.mjs:18-24`(快取)、:137(首次 `WSyslog()` 時呼叫) | 已套 |
| R5 | `toolg/gDistRollup.mjs` 之 external 與 globals(`'pino'`);`src/WSyslog.mjs:113-115`(瀏覽器版 pino 同步拋) | 已套 |
| R6 | `src/WSyslog.mjs` options(名稱與語意不變,`fdLog` 改傳絕對路徑仍為字串);事件名 `wsyslogFormatterError`(`src/WSyslog.mjs`、`src/formatter.mjs` 各一處) | 已套 |
| R7 | `test/tools/kit.mjs` 之 `buildPkg`(副本 + spawn 執行 `toolg/gDistRollup.mjs`)、`test/unit-bundle.test.mjs` | 已套 |
| R8 | 規則一 `src/WSyslog.mjs:131-134`;規則二 `src/formatter.mjs:97-107`(切檔重建、內層 error 監聽)、:22-45(回報);規則三 `src/WSyslog.mjs:168-194`(監聽與轉發;`emitWriteError` :171-178 為唯一轉發點,事件名 `writeError`)、:342-344(dead 後不寫);規則四 `src/WSyslog.mjs:197-200`、:283-292(close 後隔一個 setImmediate 才移除)(run04 行號) | 已套 |
| R9 | `src/WSyslog.mjs` clear(盤點 `.flush(` 0 筆) | 已套 |
| R10 | `src/WSyslog.mjs:166` | 已套 |
| R11 | `src/WSyslog.mjs:299`(terminate 時 R8 之監聽仍在) | 已套 |
| R12 | `src/WSyslog.mjs:117-124`(timeZone)、:131-134(fdLog) | 已套 |
| R13 | `src/WSyslog.mjs:153` | 已套 |
| R14 | `src/WSyslog.mjs:32-40`(`isFolder`)、:132、:210(盤點 `fsIsFolder` 0 筆) | 已套 |
| R15 | `src/formatter.mjs:137`(另 :96 切檔時不 end 已毀損之串流) | 已套 |
| R16 | `package.json` | 已套(無 `exports`) |
| R17 | `src/WSyslog.mjs:128`(`fdLogAbs`)、:131、:132、:157(formatter options)、:208-239(cleanLogs 讀刪以 fdLogAbs,事件 fp 以原 fdLog) | 已套 |
| R18 | `src/WSyslog.mjs:91`、:96;`src/formatter.mjs:54`、:59 | 刻意不收斂(兩處值相同) |
| R19 | `src/WSyslog.mjs:173`(`writeError`)、:229(`'delete'`)、:337(等級事件,`wrap` 經 :348-353 套六等級);文件站點 `src/WSyslog.mjs:52`(JSDoc)、`README.md:59-65`〈Errors〉;盤點 `emit('error'` 0 筆(2026-10-14 run04 重跑) | 已套 |
| R20 | 首次清理 `src/WSyslog.mjs:245-248`(唯一一處 `setImmediate` 排程,其內 :247 為 src 唯一之 `cleanLogs()` 呼叫);每小時 :251-253;`stopAutoClean` :257-263(`clearImmediate` 與 `clearInterval` 只在此);clear 開頭 :273 呼叫一次;fin 內已無 `clearInterval`;文件站點 `src/WSyslog.mjs:52`、`README.md:75`〈Notes〉 | 已套 |
| R21 | `src/WSyslog.mjs:52`(JSDoc,clear 進行中/完成後)、:266-267(clear 之註解);`README.md:54`〈Usage〉 | 已套 |

## 三之一、測試對照(`npm test`:`mocha --parallel "test/*.test.mjs" --timeout 180000`)

| 測試檔 | 涵蓋規則 | 案數 |
|---|---|---|
| `test/unit-basic.test.mjs`(原 basic) | U1 寫出 | 1 |
| `test/unit-clear.test.mjs`(原 clear) | clear 語意、冪等、子程序退出、壓測、clear 後再寫殺宿主(R8 規則四) | 5 |
| `test/unit-cleanLogs.test.mjs`(原 cleanLogs) | numKeep、delete 事件之 fp 格式(R17 相容)、R20(首次清理於下一輪次、首批事件同步/await 後可收、建立後立即 clear 不清理且可退出) | 9 |
| `test/unit-timeZone.test.mjs`(原 timeZone) | timeZone 檔名 | 2 |
| `test/unit-bundle.test.mjs` | R1、R2、R3(靜態);建置(R5、R7:副本執行 `toolg/gDistRollup.mjs` 之離開碼/警告、產出檔名、external);U2~U9;R4/R16(解析落點) | 16 |
| `test/unit-resolveFormatter.test.mjs` | R4 (a)~(d)、載入時不解析 | 6 |
| `test/unit-fdLog.test.mjs` | R8(不可建立、被刪重建、換成檔案、`writeError` 事件、無人監聽)、R12、R14、R15、R17、R19(失敗不觸發 `'error'`、各等級方法只觸發同名事件) | 8 |
| `test/unit-lifecycle.test.mjs` | R9、R10、R11、R12 | 6 |
| `test/unit-pathchars.test.mjs` | R13 | 4 |

共用工具:`test/tools/kit.mjs`(不帶 `.test.`,不被 mocha 收集);暫存一律 `test/_tmp/<案名>/`,各檔 `after` 清除。

## 四、已知限制(文件化,不修)

| # | 限制 | 依據 |
|---|---|---|
| K1 | pino 被一併打包(U9、U10)不支援 | pino 官方 `docs/bundling.md:3` |
| K2 | 其他打包器、pnpm/Yarn PnP 未驗證 | 合約外 |
| K3 | 同一 fdLog 被多個實例高量併寫會撕裂行(D22/D-13)→ fdLog 須每實例專用 | run01 實測 2 實例 × 20000 行每輪 2 行無法解析 |
| K4 | 資料夾被刪後、切檔前之寫入靜默遺失(Windows 可刪除含開啟中檔案之資料夾)(D18) | run01 複審 `p-folder-gone2.mjs rm` |
| K5 | SIGINT/SIGTERM 之預設處理不發 'exit',pino 補寫不執行(D21)→ README:於信號處理內 `await log.clear()` | Node process.html |
| K6 | 未 clear 即丟棄之實例不會被回收(D23)→ 每個實例皆須 clear | 讀碼 |
| K7 | TerminateProcess/SIGKILL 當下尚未交給 worker 之緩衝救不回(D10) | — |
| K8 | `dist/formatter.umd.js`(與新增之 `dist/resolve-formatter.umd.js`)為 `getFiles(fdSrc)` 之副產物,不被執行期使用(D-8 保留) | `toolg/gDistRollup.mjs` |
| K9 | timeLimit 短於寫出所需時間(如 1ms)且 worker 尚未 READY 時,逾時分支 terminate 後 thread-stream 之 `flushSync` 可阻塞主緒至多 10 秒並報 `_flushSync took too long (10s)`(經 R8 轉發,不殺宿主),該批 log 遺失;README 只載明逾時可能遺失與 stderr 註記(`README.md:66`) | run02 實測(`tmp/accept-impl.log`;`unit-lifecycle` 之 R11 READY 前案只斷言存活與註記) |
| K10 | 建立後經 I/O 等待(如 `await fs.promises.readFile`)才掛上之 `'delete'` 監聽器收不到首批事件(首次清理已於下一輪次執行);同一輪次內(同步或經 `await` 已完成之 Promise)掛上者收得到(R20) | run04 實測(`tmp/probe/run04-firstclean.mjs` 之 io-await:dels 0、舊檔已刪) |

## 五、破壞性/可見行為變更紀錄(供發布說明)

| 日期 | 規則 | 變更 | 影響 |
|---|---|---|---|
| 2026-10-14 | R1~R5、R7、R16 | dist 由「載入即 ReferenceError」變為可用;被下游打包後可寫出 | 修復 |
| 2026-10-14 | R8(D-3 (c))、R19 | 寫檔失敗與 transport 致命錯誤由「殺宿主」改為「觸發 `writeError` 事件(payload Error)+ stderr」;`'error'` 事件維持只表示呼叫 `log.error()`;clear 後再寫仍殺宿主(run03 由 run02 之 `'error'` 改名,未發布過) | 行為變更(使用端可監聽 `log.on('writeError', ...)`) |
| 2026-10-14 | R12 | `WSyslog()` 新增同步拋錯:timeZone 無效、fdLog 不可建立、formatter 解析不到、pino 為瀏覽器版 | 由非同步殺宿主改為可捕捉錯誤 |
| 2026-10-14 | R14(D-14) | fdLog 為 junction/symlink 時 cleanLogs 開始依 numKeep 刪檔(原本永不刪) | 以連結指向 log 資料夾之部署,升級後舊檔會被清到 numKeep |
| 2026-10-14 | R9、R10 | clear 不再經 flush;建立後即 unref | 一般情境不變;READY 前大量寫入由卡死/永不退出變為正常 |
| 2026-10-14 | R17 | cleanLogs 不再隨 chdir 改變目標資料夾 | 修復 |
| 2026-10-14 | R20 | 首次清理由「`WSyslog()` 內同步」改為「回傳後之下一個事件迴圈輪次(setImmediate)」;`clear()` 被呼叫即停止自動清理(原每小時計時器於 clear 完成時才停) | 建立後立即掛上之 `'delete'` 監聽器可收到首批事件;建立後同步檢查檔案者看不到首批刪除;建立後同一輪次內即 `clear()` 或 `process.exit()` 者不執行首次清理 |

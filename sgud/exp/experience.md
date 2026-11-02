# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.

## 一、打包與 dist(2026-10-14 審計 run01)

- **dist 從 1.0.0 起就不能載入**:git 歷史 33 版之 `dist/w-syslog.umd.js` 逐一 `require` 全部 `ReferenceError: Cannot access '…' before initialization`。成因是 rollup 對 umd/cjs 以 `require('url').pathToFileURL(__filename)` 取代 `import.meta.url`,卻不把 `__filename` 列入避讓名單(rollup 3.29.5 `dist/shared/rollup.js:13344-13351`;上游 4.64.6 相同),模組頂層之 `let __filename` 被墊片自我參照。升級 rollup 不能解。
- **同一 bundle 內任一模組頂層宣告 `__filename`,其他模組之墊片都會綁到它**(跨模組 TDZ)。所以「w-syslog 自己改名」救不了「下游自身也有頂層 `__filename`」之 bundle(w-web-sso/perm/api 之 `server/staLogs/staLogsCore.callWorker.mjs:8`)。
- **`import.meta` 只能用 `url`**:`import.meta.dirname`、`filename`、`resolve` 於 umd/cjs 輸出被換成 `undefined`(`resolve(...)` 變 `undefined(...)` → TypeError)。Node 官方現行推薦之 `import.meta.dirname` 寫法在本套件之打包路徑下同樣會壞。
- **「`require(dist)` 可載入」不是驗收**:只改名之變體可載入,但建立 logger 後約 0.1 秒主行程因 ThreadStream `Unhandled 'error' event`(找不到 `dist/formatter.mjs`)崩潰。驗收一律「建 logger → 寫一筆 → clear → 讀檔確認該筆」。
- **以自身套件名解析自己的檔,在本 repo 內必失敗**(package.json 無 `exports` 不能自我參照,`createRequire(...).resolve('w-syslog/src/formatter.mjs')` 於 src、dist、cwd 皆 `MODULE_NOT_FOUND`);必須先以「本模組上一層之 package.json name 為 w-syslog」定位套件根,打包後才退而用模組解析(本模組位置 → cwd)。
- **pino 一律不可被打包**:runin 預設 browser 時會打進 pino 瀏覽器版(無 `transport`,1.0.0~1.0.14 之 dist 即如此);runin nodejs 時 pino 之 `join(__dirname,'worker.js')` 指到 bundle 夾而崩潰。pino 官方 `docs/bundling.md:3` 即言不另產檔不能打包。
- **repo 內 `dist/` 只在發布時重建**(`script.txt:7`),測 dist 要由目前 src 以 rollupFile(同 `toolg/gDistRollup.mjs` 設定)建到暫存夾再載入;以現行 src 重建之產物與 repo dist 除 banner 外逐 byte 相同。單檔建置約 1.9 秒(本機)。(2026-11-02 依 dspec〈自有套件之發布與建置腳本〉撤「同設定另以 rollupFile 重建」之作法,改回標準寫法:測試以副本並指定 cwd 執行 `toolg/gDistRollup.mjs`,不另抽設定)
- `dist/formatter.umd.js` 只是 `getFiles(fdSrc)` 之副產物,無人引用;直接當 pino target 其實可用(CJS、相依內嵌)。
- 新增 `import { createRequire } from 'module'` 時,`toolg/gDistRollup.mjs` 之 globals/external 要加 `module`(前例 w-fetch-web),否則 rollup 印「could not be resolved – treating it as an external dependency」。

## 二、log 寫出與資料夾

- pino 之 exit 掛勾(`lib/transport.js:12-20,149-172`)使「不呼叫 clear」「`process.exit(0)`」「未捕捉例外」三種結束方式皆完整落地(實測 3000/3000);TerminateProcess 當下之緩衝救不回。
- **fdLog 不可建立時 `clear()` 照樣 resolve(假成功),隨後宿主崩潰**;**執行中 log 資料夾被刪,下一次切檔(下游預設每小時)宿主崩潰**——成因皆為 `src/formatter.mjs` 內層 `fs.WriteStream` 無 error 監聽、切檔不重建資料夾、`fsCreateFolder` 回傳值未檢查。Windows 上刪除開啟中之檔案所在資料夾會成功,其後寫入靜默遺失直到下次切檔。
- 相對 fdLog 一律依 `process.cwd()` 解析,主緒 cleanLogs 與 worker 一致;打包後亦同。

## 二之一、獨立複審後之教訓(2026-10-14)

- **自審之表一定有洞**:自認全盤(332 格)後交 opus 複審,仍被找出 29 項、2 項高嚴重度。漏洞集中在「量級」(只測到 3000 筆 ≈0.3MB)與「生命週期分支」(clear 之逾時、READY 前後)兩軸——下次建表必列「資料量相對於內部緩衝(thread-stream 4MB)」與「worker READY 前/後」。
- **上游 thread-stream 4.2.0 缺陷**:建立 transport 後 READY 前同步寫入 >~4MB(非單調;3.8MB、21MB 正常,4.1~11.8MB 卡)時,READY 交握之等值等待永不成立 → `ready` 永不為 true(`thread-stream/index.js:175-178`);`flush(cb)` 等 ready(`:417-433`)故永不回呼;pino 之 `onReady`(內含 unref)不執行 → 行程永不自然退出。繞道:收尾直接 `transport.end()` 等 `'close'`(end 不依賴 ready)、建立後即 `transport.unref()`;兩者皆實測有效(`tmp/probe/end-direct.mjs`、`natural-hang.mjs`)。
- `transport.worker.terminate()` 於 READY 前 → worker exit 0、無 error(未寫者丟失);READY 後 → exit 1、ThreadStream 發 `'error'`,無人接即殺宿主。terminate 前一律先掛 `'error'`。
- formatter 外層 Writable 之 `'error'` 監聽擋不住崩潰:thread-stream worker 另監聽 destination 之 error 並升級為主緒 `'error'`(`thread-stream/lib/worker.js:172-183`)。唯一匯流點是主緒 transport 之 `'error'`。
- 無效 timeZone(`Asia/Taipe`、`UTC+8`)在 worker 內才 RangeError → 殺宿主;要在 `WSyslog()` 以 `Intl.DateTimeFormat` 同步驗證。
- pino 對非 `file://` 之 target 以 `'file://'+字串` 相接未編碼(`pino/lib/transport-stream.js:16`),路徑含 `%zz` 即 URIError;target 一律傳 `pathToFileURL(fp).href`。
- wsemi `fsIsFolder` 以 lstat 判定,junction/symlink 回 false → cleanLogs 永遠略過(numKeep 失效);資料夾判定改 `fs.statSync().isDirectory()`。
- 同一 fdLog 被 2 個實例各寫 20000 行(~300B/行)會撕裂 2 行;3000 行不會。fdLog 要每實例專用。
- 繞道或修法之「無效」結論要看實驗前提:複審曾以「等 ready 後再 flushSync+end」判定繞道無效,但 bug 正是 ready 不來,實驗不成立。

## 二之二、實作(run02,2026-10-14)之教訓

- **工作樹行尾不一致**:`src/`、`toolg/`、`README.md`、`g.mjs` 為 CRLF;`test/`、`package.json` 為 LF(索引一律 LF,`core.autocrlf=true`)。Edit 工具會保留原檔行尾;新檔依同資料夾慣例(src/toolg 轉 CRLF、test 用 LF)。檢查行尾用 node 以正則數 `\r\n` 與裸 `\n`;Git Bash 之 `grep -q $'\r'` 會誤判。
- **`'error'` 事件名與等級事件撞名**:`ev.error = wrap('error')` 原本就以 `'error'` 事件表示「呼叫了 log.error()」(payload `{ args }`);D-3 (c) 之寫檔失敗亦用 `'error'`,故以 payload 區分(失敗為 `Error` 實例,可 `instanceof Error`),JSDoc/README 載明。下游四套件 `srLog.on(` 0 筆。**此作法已於 run03 依主控裁示廢止,改用專用事件名 `writeError`(見〈二之三〉)。**
- **thread-stream 之 destroy 事件順序**:`'error'` 以 setImmediate 排程,`'close'` 可能經 `worker.terminate().then()`(microtask)先發出。若在 `'close'` 當下移除監聽,其後之 `'error'` 無人接即殺宿主——監聽須於 `'close'` 後再隔一個 setImmediate 才移除(仍早於「clear 後再寫」所排之錯誤,故該情境照樣殺宿主)。只在全套平行測試之負載下才重現(單獨跑過 3 次皆綠),時序類缺陷要在負載下多跑幾輪。
- **timeLimit 過小時之極端情境**:clear 呼叫 `end()` 時若 thread-stream 正在 `flushing`,`end` 延後執行;1ms 逾時先 terminate,其後 `end` 內之 `flushSync` 會阻塞主緒至 10 秒並拋 `_flushSync took too long (10s)`(已被 R8 之監聽接住,不殺宿主,但該批 log 遺失)。測試只斷言存活與 stderr 逾時註記,不斷言筆數。
- **錯誤經 worker 回報主緒**:thread-stream README〈Emit events〉之 `parentPort.postMessage({ code: 'EVENT', name, args })` 為正式協定;formatter 只在 `workerData.workerData.$context.threadStreamVersion` 存在時才發(避免在 mocha 等其他 worker 環境誤發);其他 code 會被主緒 destroy。
- **下游驗證之作法**:把下游之 `server/`、`src/`(或其所需子夾)、`package.json`、`toolg/gDistRollup.mjs` 複製到 `./tmp/downstream/<p>/`,`node_modules` 以 `fs.symlinkSync(target, link, 'junction')` 逐一指向下游之 node_modules(唯 w-syslog 放新版副本),以其 gDistRollup 原樣打包;收尾以 `fs.unlinkSync` 逐一移除 junction 並回驗下游 node_modules 之項目數不變(本機實測 unlinkSync 與遞迴 rmSync 皆不跟隨 junction)。w-web-task 以空 Bearer 權杖 POST `/api/main` 即觸發其 `verifyConn` 之 `srLog.error`,可證 logger 實際寫出。
- 探測腳本若依賴原型才有之輸出(如 `[probe] formatter`),換成正式碼時要改判準,否則全部誤判 FAIL。
- eslint 對資料夾須加 `--ext .mjs,.js`;盤點未提交之新檔用 `git grep --untracked`。
- **報告初稿要逐句回驗產物再交**:run02 初稿有 4 處憑記憶寫成之措辭(「已列入 README」實際只寫了一半、結束路徑之「強制終止」實為卡住後被 SIGTERM、下游 X1 之修法細節、帳本 K 編號未補),都是回頭讀 `tmp/*.json`、腳本、README 才抓到。對他 repo 之現況(是否已修、是否提交)只寫實測與 `git status` 看得到的。

## 二之三、run03(2026-10-14)之教訓:事件改名 `writeError`

- **對外事件一名一義**:新增對外事件前,先以 `git grep -nE "ev\.emit\(" -- src` 盤出事件全集(含六個等級名);同一事件名承載兩種語意、只能靠 payload 型別區分,是契約陷阱。run02 我已察覺撞名,卻照裁示字面實作、只在報告末段提報;派工模式下無法中途詢問時,這類「照字面做會留下契約陷阱」之點應在報告最前列為待裁示並附改名方案(新行為未發布前改名成本最低)。
- **測試 helper 先讀實作再用**:`test/tools/kit.mjs:182-184` 之 `hasMsg` 只比對 info(`level === 30`);拿它驗 `log.error()` 之列必為 false。驗非 info 等級之列改用 `kit.readLog(fd).rows` 直接比對 `level`。
- **修前紅之對象是「改動前之工作樹」**:前一輪改動未提交時 `git show HEAD:` 拿不到它,動工前先把 `src/` 複製到 `tmp/redgreen-<run>/src/`,再把新測試、`test/tools/kit.mjs`、`toolg/distRollupOpt.mjs`、`package.json` 放進同一副本;kit 以 `import.meta.url` 定位 repo 根,副本內之測試自動使用副本 src。(2026-11-02 依 dspec〈自有套件之發布與建置腳本〉撤,改回標準寫法:`toolg/distRollupOpt.mjs` 已移除,副本改放 `toolg/gDistRollup.mjs`)
- clear 進行中(end 已呼叫、detach 前)呼叫 log 方法:thread-stream 報 `the worker is ending`(`index.js:266-267`)→ `writeError`,該筆不寫出;clear 完成後呼叫才殺宿主。
- `WSyslog()` 回傳前已同步跑一次 cleanLogs,此次之 `'delete'` 事件無人能監聽(HEAD 即如此)。
- clear 逾時(READY 前、timeLimit=1)之 transport 錯誤訊息隨時序而異:run02 觀察到 `_flushSync took too long (10s)`,run03 觀察到 `the worker thread exited`;斷言只能看事件型別與存活,不看訊息。

## 二之四、run04(2026-10-14)之教訓:首次清理延後

- **建構時就要發之事件要延後,否則首批不可觀察**:原 `WSyslog()` 內同步跑 cleanLogs,其 `'delete'` 事件無人能收。延後用 `setImmediate`(晚於本輪同步碼與全部 microtask,建立後同步或經 `await` 已完成之 Promise 掛上之監聽器都來得及);Node 指南之慣例為 `process.nextTick`,但它先於 await 之後續執行。測試以 `await new Promise((resolve) => setImmediate(resolve))` 等一輪即可(同一 check 階段 FIFO)。
- **延後之工作要能被 clear 同步取消**:clear 第一次被呼叫就 `clearImmediate` + `clearInterval`,收斂在單一 `stopAutoClean`(原本 `clearInterval` 寫在 fin 內,是等 clear 完成才停),否則會在 clear 之後才刪檔、發事件。所有同步拋錯都在排程之前,失敗之建立不會留下 Immediate。
- **改時序前先盤「建立後同步斷言」之測試**:`git grep`/Grep `WSyslog(` 與 `numKeep` 列出全部建構點,逐一看斷言是否寫在建立後的同一段同步碼裡;本次只有 unit-cleanLogs 第 1 案依賴(其註解即寫明「init同步階段會跑一次cleanLogs()」),其餘以手動 `cleanLogs()` 驗證、首次清理被同一輪次內之 clear 取消。
- 監聽器在 I/O 等待之後才掛上就收不到首批事件(K10);`setTimeout(0)` 拋例外之行程,首次清理有沒有跑依 timers 與 check 階段之先後而定(主模組內不確定,實測兩種都出現)。

## 二之五、sys267(2026-11-02)之教訓:建置腳本回標準寫法後之測試

- **toolg 腳本以副本執行時,其 `import 'w-package-tools/...'` 由副本所在位置往上解析**:副本置於 `test/_tmp/<名>/pkg/`,上層即本 repo 之 `node_modules`,不必連結或複製套件。`rollupFile` 之 banner 讀 cwd 之 `package.json`,故副本須含 `package.json`。
- **external 設定不全不會使建置失敗**:Node 內建模組(如 `module`、`worker_threads`)漏列 external,建置離開碼仍為 0,rollup 只警告(實測 `"module" is imported by "src/resolveFormatter.mjs", but could not be resolved – treating it as an external dependency.`,於副本移除 `module` 後實跑),`w-syslog.umd.js` 之 UMD 標頭與 node 載入測試(U2~U9)皆不變、仍綠;只有 pino 漏列會讓載入失敗。要鑑別內建模組漏列,須斷言建置輸出無此類警告(`test/unit-bundle.test.mjs` 建置(R7) 首案),不能只靠載入測試。
- **變異證明之作法**:Write 一支暫存腳本(放 `./tmp/`,用畢即刪)於單一測試鎖內逐一改壞 `toolg/gDistRollup.mjs` 關鍵行(以 Buffer 保留 CRLF)、跑 `test/unit-bundle.test.mjs`(mocha json reporter 輸出到檔)、`finally` 還原並以雜湊回驗;8 次變異一次排鎖即可,不必每次各排一次(鎖等待約 2.5 分鐘)。

## 三、探測與工具

- 可重用之探測工具(皆在 `./tmp/probe/`,審計後保留供實作驗收;路徑以 `tmp/pkg/<變體>/` 為套件來源):`build.mjs`(rollupFile 建任意 src)、`matrix.mjs`(使用方式 × 變體)、`matrix2.mjs`(使用方式 12 × 結束方式 3 × cwd/fdLog 3)、`exitpaths.mjs`(結束路徑 × 筆數)、`parity.mjs`(src/bundle/dist 功能對照)、`bad-fdlog.mjs`、`folder-gone*.mjs`;驗證腳本在 `./tmp/validate/`(`check-entities.mjs`、`hist-dist-all.mjs`、`rerun-claims.sh`)。
- Grep 工具遵守 `.gitignore`,搜不到 `./tmp/` 內之檔(本 repo 之 `tmp` 被 ignore);要查 tmp 內文件改用 bash grep。
- 本機無 `rg` 執行檔;帳本之盤點指令用 `git grep`(支援 `-P`)。
- 傳路徑給 node 一律 `C:/...`;曾誤用 git-bash 之 `/c/...` 導致 `require` 找不到檔(§11.3)。
- 子代理之盤查結論要逐條核對,**且核對他 repo 時先分清 HEAD 與工作樹**:下游各 repo 常有其主責並行修改(未提交)。本次曾以 Grep 工作樹判定子代理之「四下游非測試碼皆未呼叫 `srLog.clear()`」不屬實,以 `git show HEAD:<path>` 核對後該句於 HEAD 成立,差異來自 w-web-api 主責之並行修改——撤回。對 dist 之結論以 HEAD 與已發布 dist 為準。
- `npm pack --dry-run` 會把未追蹤之 `建議*.md` 納入發布包(主控於發布前移除)。

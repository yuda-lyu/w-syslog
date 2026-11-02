# 狀態(現況)

本檔記當前已開發功能之最新狀態:各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本.只記現況,不寫過程(過程見 `sgud/exp/experience.md`).更新:2026-11-02(sys267).

- 套件:`w-syslog`(基於 pino 之 Node.js 日誌輸出器,依日或時分檔儲存);`package.json` 版本 1.0.37;`dist/` 為 2026-11-01 發布列所產(本輪未重新發布)。
- 發布與建置腳本:`toolg/` 依 dspec〈自有套件之發布與建置腳本〉標準寫法——`addVersion.mjs`、`modifyReadme.mjs`、`cleanFolder.mjs`(`cleanFolder('dist')`、`cleanFolder('docs')`)、`gDistRollup.mjs`(`'./src'`、`'./dist'`,選項寫於本檔)。無 `distRollupOpt.mjs`;`script.txt` 由使用者維護。

## 功能與規則對照

| 功能 | 規則帳本 | 測試檔 | 狀態 |
|---|---|---|---|
| 各使用方式載入並寫出(U1~U9) | R1~R5、R7、R16 | `test/unit-bundle.test.mjs`、`test/unit-basic.test.mjs` | 已套 |
| formatter 解析(含被下游打包) | R4、R13 | `test/unit-resolveFormatter.test.mjs`、`test/unit-pathchars.test.mjs` | 已套 |
| 建置產物(dist 三支 umd、external) | R5、R7 | `test/unit-bundle.test.mjs` 之「建置(R5)」「建置(R7)」(副本並指定 cwd 執行 `toolg/gDistRollup.mjs`) | 已套 |
| log 資料夾與寫檔失敗政策、`writeError` 事件 | R8、R12、R14、R15、R17、R19 | `test/unit-fdLog.test.mjs` | 已套 |
| `clear()` 與行程結束之生命週期 | R9、R10、R11、R12 | `test/unit-lifecycle.test.mjs`、`test/unit-clear.test.mjs` | 已套 |
| 自動清理(首次延後、clear 即停)、numKeep | R20 | `test/unit-cleanLogs.test.mjs` | 已套 |
| timeZone 檔名 | R12 | `test/unit-timeZone.test.mjs` | 已套 |
| 文件規則(clear 後呼叫之兩時段) | R21 | 無專屬測試 | 已套 |

## 測試

- `npm test`(`mocha --parallel "test/*.test.mjs" --timeout 180000`):2026-11-02 sys267 改後 57 案(改前 54 案;`unit-bundle` 13 → 16)。

## 已知缺口與待辦

- 已知限制 K1~K10 見規則帳本 §四(文件化、不修)。
- 無未完成之規則;無待辦。

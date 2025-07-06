import fs from 'fs'
import assert from 'assert'
import _ from 'lodash-es'
import w from 'wsemi'
import WSyslog from '../src/WSyslog.mjs'


describe('WSyslog', function() {

    it('test', async function() {

        w.fsCleanFolder('./logs')

        let log = await WSyslog()
        log.info({ event: 'runner', msg: 'start' })
        log.warn({ event: 'monitor-memory', msg: 'usage-high' })
        log.error({ event: 'crash', msg: 'db connection', code: 500 })

        await w.delay(2000) //等待2秒讓pino能flush數據

        let vpfs = w.fsTreeFolder('./logs')
        // console.log('vpfs', vpfs)

        let fp = _.get(vpfs, `0.path`, '')

        let jj = fs.readFileSync(fp, 'utf8')

        let ss = w.sep(jj, '\n')

        let r = _.map(ss, (j) => {
            let v = JSON.parse(j)
            let event = _.get(v, 'event')
            let msg = _.get(v, 'msg')
            return {
                event,
                msg,
            }
        })
        // console.log('r', r)

        let rr = [
            { event: 'runner', msg: 'start' },
            { event: 'monitor-memory', msg: 'usage-high' },
            { event: 'crash', msg: 'db connection' },
        ]

        assert.strict.deepEqual(r, rr)
    })

})

import process from 'node:process'
import { styleText } from 'node:util'

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 }
const level = LEVELS[(process.env.LOG_LEVEL ?? 'info').toLowerCase()] ?? LEVELS.info

const stamp = () => styleText('gray', `[${new Date().toTimeString().slice(0, 8)}]`)

export const log = {
  error(msg, err) {
    if (level < LEVELS.error) return
    if (msg instanceof Error) {
      err = msg
      msg = err.message
    }
    console.error(stamp(), styleText(['red', 'bold'], 'ERROR'), msg)
    if (err?.stack) console.error(styleText('red', err.stack))
  },
  warn(msg) {
    if (level >= LEVELS.warn) console.warn(stamp(), styleText('yellow', 'WARN'), msg)
  },
  info(msg) {
    if (level >= LEVELS.info) console.info(stamp(), styleText('blue', 'INFO'), msg)
  },
  success(msg) {
    if (level >= LEVELS.info) console.info(stamp(), styleText(['green', 'bold'], 'OK'), msg)
  },
  debug(msg) {
    if (level >= LEVELS.debug) console.debug(stamp(), styleText('cyan', 'DEBUG'), msg)
  }
}

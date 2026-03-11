/**
 * Structured Logger with correlation IDs and timing
 */

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] || LOG_LEVELS.DEBUG;

function createLogger(component, syncRunId = null) {
  function log(level, msg, extra = {}) {
    if (LOG_LEVELS[level] < currentLevel) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      component,
      msg,
      ...(syncRunId && { sync_run_id: syncRunId }),
      ...extra,
    };

    const output = JSON.stringify(entry);
    if (level === 'ERROR') {
      console.error(output);
    } else if (level === 'WARN') {
      console.warn(output);
    } else {
      console.log(output);
    }

    return entry;
  }

  return {
    debug: (msg, extra) => log('DEBUG', msg, extra),
    info: (msg, extra) => log('INFO', msg, extra),
    warn: (msg, extra) => log('WARN', msg, extra),
    error: (msg, extra) => log('ERROR', msg, extra),

    /**
     * Start a timer. Returns a function that logs elapsed time.
     * Usage: const end = logger.startTimer(); ... end('parsed PDF');
     */
    startTimer() {
      const start = Date.now();
      return (msg, extra = {}) => {
        const duration_ms = Date.now() - start;
        log('INFO', msg, { duration_ms, ...extra });
        return duration_ms;
      };
    },

    /**
     * Create a child logger with a different component name but same sync_run_id
     */
    child(childComponent) {
      return createLogger(childComponent, syncRunId);
    },

    /**
     * Create a copy with a sync_run_id set
     */
    withSyncRunId(id) {
      return createLogger(component, id);
    },
  };
}

module.exports = { createLogger };

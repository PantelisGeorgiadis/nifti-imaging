import log from 'loglevel';
import prefix from 'loglevel-plugin-prefix';

prefix.reg(log);
log.disableAll();

prefix.apply(log, {
  format(level, name, timestamp) {
    return `${timestamp} -- ${level.toUpperCase()} --`;
  },
  timestampFormatter(timestamp) {
    return timestamp.toISOString();
  },
});

export default log;

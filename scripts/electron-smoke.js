const { spawn } = require('node:child_process');
const path = require('node:path');

const electron = require('electron');
const args = [path.resolve('.')];
const command = process.platform === 'linux' && !process.env.DISPLAY ? 'xvfb-run' : electron;
if (command === 'xvfb-run') args.unshift('-a', electron);

const child = spawn(command, args, {
  env: {
    ...process.env,
    ELECTRON_SMOKE_TEST: '1',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  },
  stdio: 'inherit',
});
const timeout = setTimeout(() => {
  child.kill('SIGKILL');
  process.stderr.write('Electron smoke timed out\n');
}, 30000);

child.on('error', (error) => {
  clearTimeout(timeout);
  process.stderr.write(`Electron smoke could not start: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  if (signal) process.stderr.write(`Electron smoke exited via ${signal}\n`);
  process.exitCode = code === 0 ? 0 : 1;
});

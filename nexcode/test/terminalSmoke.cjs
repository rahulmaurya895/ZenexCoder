const { app } = require('electron');
const pty = require('node-pty');
app.whenReady().then(() => {
  const shell = process.env.ComSpec || 'cmd.exe';
  const term = pty.spawn(shell, ['/d', '/q'], { name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd(), env: process.env });
  let output = '';
  const timer = setTimeout(() => { console.error(JSON.stringify({ passed: false, error: 'terminal timeout', output })); app.exit(1); }, 10000);
  term.onData((data) => {
    output += data;
    if (output.includes('TERMINAL_OK')) {
      clearTimeout(timer);
      console.log(JSON.stringify({ passed: true, output: output.replace(/\r?\n/g, ' ').trim() }));
      term.kill();
      app.exit(0);
    }
  });
  term.write('echo TERMINAL_OK\r');
});
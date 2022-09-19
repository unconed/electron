import { expect } from 'chai';
import * as childProcess from 'child_process';
import * as path from 'path';
import { BrowserWindow, MessageChannelMain, UtilityProcess } from 'electron/main';
import { emittedOnce } from './events-helpers';
import { ifit } from './spec-helpers';
import { closeWindow } from './window-helpers';

const fixturesPath = path.resolve(__dirname, 'fixtures', 'api', 'utility-process');

describe('UtilityProcess module', () => {
  describe('UtilityProcess constructor', () => {
    it('throws when empty script path is provided', async () => {
      expect(() => {
        /* eslint-disable no-new */
        new UtilityProcess('');
        /* eslint-disable no-new */
      }).to.throw();
    });

    it('throws when options.stdio is not valid', async () => {
      expect(() => {
        /* eslint-disable no-new */
        new UtilityProcess(path.join(fixturesPath, 'empty.js'), [], {
          execArgv: ['--test', '--test2'],
          serviceName: 'test',
          stdio: 'ipc'
        });
        /* eslint-disable no-new */
      }).to.throw(/stdio must be of the following values: inherit, pipe, ignore/);

      expect(() => {
        /* eslint-disable no-new */
        new UtilityProcess(path.join(fixturesPath, 'empty.js'), [], {
          execArgv: ['--test', '--test2'],
          serviceName: 'test',
          stdio: ['ignore', 'ignore']
        });
        /* eslint-disable no-new */
      }).to.throw(/configuration missing for stdin, stdout or stderr/);

      expect(() => {
        /* eslint-disable no-new */
        new UtilityProcess(path.join(fixturesPath, 'empty.js'), [], {
          execArgv: ['--test', '--test2'],
          serviceName: 'test',
          stdio: ['pipe', 'inherit', 'inherit']
        });
        /* eslint-disable no-new */
      }).to.throw(/stdin value other than ignore is not supported/);
    });
  });

  describe('lifecycle events', () => {
    it('emits \'spawn\' when child process successfully launches', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'empty.js'));
      await emittedOnce(child, 'spawn');
    });

    it('emits \'exit\' when child process exits gracefully', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'empty.js'));
      const [, code] = await emittedOnce(child, 'exit');
      expect(code).to.equal(0);
    });

    it('emits \'exit\' when child process crashes', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'crash.js'));
      // Do not check for exit code in this case,
      // SIGSEGV code can be 139 or 11 across our different CI pipeline.
      await emittedOnce(child, 'exit');
    });

    it('emits \'exit\' corresponding to the child process', async () => {
      const child1 = new UtilityProcess(path.join(fixturesPath, 'endless.js'));
      await emittedOnce(child1, 'spawn');
      const child2 = new UtilityProcess(path.join(fixturesPath, 'crash.js'));
      await emittedOnce(child2, 'exit');
      expect(child1.kill()).to.be.true();
      await emittedOnce(child1, 'exit');
    });
  });

  describe('kill() API', () => {
    it('terminates the child process gracefully', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'endless.js'), [], {
        serviceName: 'endless'
      });
      await emittedOnce(child, 'spawn');
      expect(child.kill()).to.be.true();
      await emittedOnce(child, 'exit');
    });
  });

  describe('pid property', () => {
    it('is valid when child process launches successfully', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'empty.js'));
      await emittedOnce(child, 'spawn');
      expect(child.pid).to.not.be.null();
    });

    it('is undefined when child process fails to launch', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'does-not-exist.js'));
      expect(child.pid).to.be.undefined();
    });
  });

  describe('stdout property', () => {
    it('is valid when child process launches with default stdio', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'log.js'));
      await emittedOnce(child, 'spawn');
      expect(child.stdout).to.not.be.null();
      let log = '';
      child.stdout!.on('data', (chunk) => {
        log += chunk.toString('utf8');
      });
      await emittedOnce(child, 'exit');
      expect(log).to.equal('hello\n');
    });

    it('is null when child process launches with ignore stdio configuration', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'log.js'), [], {
        stdio: 'ignore'
      });
      await emittedOnce(child, 'spawn');
      expect(child.stdout).to.be.null();
      expect(child.stderr).to.be.null();
      await emittedOnce(child, 'exit');
    });

    it('is null when child process launches with inherit stdio configuration', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'log.js'), [], {
        stdio: 'inherit'
      });
      await emittedOnce(child, 'spawn');
      expect(child.stdout).to.be.null();
      expect(child.stderr).to.be.null();
      await emittedOnce(child, 'exit');
    });
  });

  describe('stderr property', () => {
    it('is valid when child process launches with default stdio', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'log.js'));
      await emittedOnce(child, 'spawn');
      expect(child.stderr).to.not.be.null();
      let log = '';
      child.stderr!.on('data', (chunk) => {
        log += chunk.toString('utf8');
      });
      await emittedOnce(child, 'exit');
      expect(log).to.equal('world');
    });

    it('is null when child process launches with ignore stdio configuration', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'log.js'), [], {
        stdio: ['ignore', 'pipe', 'ignore']
      });
      await emittedOnce(child, 'spawn');
      expect(child.stderr).to.be.null();
      expect(child.stdout).to.not.be.null();
      await emittedOnce(child, 'exit');
    });

    it('is null when child process launches with inherit stdio configuration', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'log.js'), [], {
        stdio: ['ignore', 'pipe', 'inherit']
      });
      await emittedOnce(child, 'spawn');
      expect(child.stderr).to.be.null();
      expect(child.stdout).to.not.be.null();
      await emittedOnce(child, 'exit');
    });
  });

  describe('postMessage() API', () => {
    it('establishes a default ipc channel with the child process', async () => {
      const result = 'I will be echoed.';
      const child = new UtilityProcess(path.join(fixturesPath, 'post-message.js'));
      await emittedOnce(child, 'spawn');
      child.postMessage(result);
      const [, data] = await emittedOnce(child, 'message');
      expect(data).to.equal(result);
      const exit = emittedOnce(child, 'exit');
      expect(child.kill()).to.be.true();
      await exit;
    });
  });

  describe('behavior', () => {
    it('supports starting the v8 inspector with --inspect-brk', (done) => {
      const child = new UtilityProcess(path.join(fixturesPath, 'log.js'), [], {
        execArgv: ['--inspect-brk']
      });

      let output = '';
      const cleanup = () => {
        child.stderr!.removeListener('data', listener);
        child.stdout!.removeListener('data', listener);
        child.once('exit', () => { done(); });
        child.kill();
      };

      const listener = (data: Buffer) => {
        output += data;
        if (/Debugger listening on ws:/m.test(output)) {
          cleanup();
        }
      };

      child.stderr!.on('data', listener);
      child.stdout!.on('data', listener);
    });

    it('supports starting the v8 inspector with --inspect and a provided port', (done) => {
      const child = new UtilityProcess(path.join(fixturesPath, 'log.js'), [], {
        execArgv: ['--inspect=17364']
      });

      let output = '';
      const cleanup = () => {
        child.stderr!.removeListener('data', listener);
        child.stdout!.removeListener('data', listener);
        child.once('exit', () => { done(); });
        child.kill();
      };

      const listener = (data: Buffer) => {
        output += data;
        if (/Debugger listening on ws:/m.test(output)) {
          expect(output.trim()).to.contain(':17364', 'should be listening on port 17364');
          cleanup();
        }
      };

      child.stderr!.on('data', listener);
      child.stdout!.on('data', listener);
    });

    ifit(process.platform !== 'win32')('supports redirecting stdout to parent process', async () => {
      const result = 'Output from utility process';
      const appProcess = childProcess.spawn(process.execPath, [path.join(fixturesPath, 'inherit-stdout'), `--payload=${result}`]);
      let output = '';
      appProcess.stdout.on('data', (data: Buffer) => { output += data; });
      await emittedOnce(appProcess, 'exit');
      expect(output).to.equal(result);
    });

    it('supports redirecting stderr to parent process', async () => {
      const result = 'Error from utility process';
      const appProcess = childProcess.spawn(process.execPath, [path.join(fixturesPath, 'inherit-stderr'), `--payload=${result}`, '--enable-logging=stderr']);
      let output = '';
      appProcess.stderr.on('data', (data: Buffer) => { output += data; });
      await emittedOnce(appProcess, 'exit');
      expect(output).to.include(result);
    });

    it('throws an error when script path is outside application for packaged apps', async () => {
      const appProcess = childProcess.spawn(process.execPath, [path.join(fixturesPath, 'fake-packaged-app')], {
        env: {
          ELECTRON_FORCE_IS_PACKAGED: '1',
          ...process.env
        }
      });
      let output = '';
      appProcess.stdout.on('data', (data: Buffer) => { output += data; });
      await emittedOnce(appProcess.stdout, 'end');
      expect(output).to.contain('Cannot load entry script from outisde the application.');
    });

    it('can establish communication channel with sandboxed renderer', async () => {
      const result = 'Message from sandboxed renderer';
      const w = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: path.join(fixturesPath, 'preload.js')
        }
      });
      await w.loadFile(path.join(__dirname, 'fixtures', 'blank.html'));
      // Create Message port pair for Renderer <-> Utility Process.
      const { port1: rendererPort, port2: childPort1 } = new MessageChannelMain();
      w.webContents.postMessage('port', result, [rendererPort]);
      // Send renderer and main channel port to utility process.
      const child = new UtilityProcess(path.join(fixturesPath, 'receive-message.js'));
      await emittedOnce(child, 'spawn');
      child.postMessage('', [childPort1]);
      const [, data] = await emittedOnce(child, 'message');
      expect(data).to.equal(result);
      // Cleanup.
      const exit = emittedOnce(child, 'exit');
      expect(child.kill()).to.be.true();
      await exit;
      await closeWindow(w);
    });

    ifit(process.platform === 'linux')('allows executing a setuid binary with child_process', async () => {
      const child = new UtilityProcess(path.join(fixturesPath, 'suid.js'));
      await emittedOnce(child, 'spawn');
      const [, data] = await emittedOnce(child, 'message');
      expect(data).to.not.be.empty();
      const exit = emittedOnce(child, 'exit');
      expect(child.kill()).to.be.true();
      await exit;
    });
  });
});

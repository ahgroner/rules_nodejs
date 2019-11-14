import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as rimraf from 'rimraf';

import {patcher} from '../../src/subprocess';

const requireScript = path.resolve(path.join(__dirname, '..', '..', '..', 'register.js'));

const tmp = path.join(os.tmpdir(), 'node-patches-test-tmp');

function assertPatched(prefix: string, arr: string[]) {
  const binDir = path.join(tmp, '_node_bin');

  const [execPath, execArgv, argv, pathEnv] = arr;
  assert.deepStrictEqual(
      path.join(binDir, 'node'), execPath,
      prefix + ' exec path has been rewritten to subprocess proxy');
  assert.deepStrictEqual(
      path.join(binDir, 'node'), argv[0],
      prefix + ' argv[0] has been rewritten to subprocess proxy');

  assert.ok(
      execArgv.indexOf(requireScript) > -1,
      prefix +
          ' the require script must be in process.execArgv in order for node to use it in worker threads.');
  // this has a downside in that a user can delete it from execArgv and workerThreads will not use
  // the loader. in the future we may remove this loophole by making process.execArgv a getter or
  // something.

  assert.deepStrictEqual(
      binDir, pathEnv.split(path.delimiter)[0],
      prefix + ' the highest priority directory in the PATH must be the node shim dir.');
}

describe('spawning child processes', () => {
  before(() => {
    fs.mkdirSync(tmp, {recursive: true});
  });

  it('get patched if run as shell script.', () => {
    const res = cp.execSync(`NP_SUBPROCESS_BIN_DIR=${tmp} node -r ${
        requireScript} -e 'console.log(JSON.stringify([process.execPath,process.execArgv,process.argv,process.env.PATH]))'`);
    assertPatched('', JSON.parse(res + ''));
  });

  it('overwrites spawn related variables correctly.', () => {
    const res = cp.execSync(`NP_SUBPROCESS_BIN_DIR=${tmp} node -r ${requireScript} ${
        path.join(__dirname, 'worker-threads-script.js')}`);

    const {mainThread, worker} = JSON.parse(res + '');

    assertPatched('main:', mainThread);
    assertPatched('worker:', worker);
  });

  it('can spawn node from the shell', () => {
    const res = cp.execSync(`NP_SUBPROCESS_BIN_DIR=${tmp} node -r ${requireScript} ${
        path.join(__dirname, 'shell-script.js')}`);
    // TODO: this is broken if no environment is passed and a new bash is executed
    // reading only the rc files to build the environment.
    // assert.fail('this doesn't work')

    const {result} = JSON.parse(res + '');

    assertPatched('shell spawn:', result);
  });

  it('can spawn node from spawn', () => {
    const res = cp.execSync(
        `NP_SUBPROCESS_BIN_DIR=${tmp} node -r ${requireScript} ${
            path.join(__dirname, 'spawn-script.js')}`,
        {env: process.env});

    const {result} = JSON.parse(res + '');
    assertPatched('spawn spawn:', result);
  });

  after(() => {
    rimraf.sync(tmp);
  });
});

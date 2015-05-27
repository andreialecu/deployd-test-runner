var fork = require('child_process').fork
  , spawn = require('child_process').spawn
  , shelljs = require('shelljs')
  , fs = require('fs');

var run = function(done) {
  if (!fs.existsSync('app.dpd')) {
    done('Not a deployd app directory, please run this from a deployd app directory');
    return;
  }

  console.log('Running integration tests');
  console.log('');

  if (fs.existsSync('data')) {
    console.log('Removing previous data directory');
    shelljs.rm('-rf', 'data');
  }

  // using `spawn` because with `fork` the child script won't be able to catch a `process.exit()` event
  // thus leaving mongod zombie processes behind. see https://github.com/joyent/node/issues/5766
  var proc = spawn(process.argv[0], [require.resolve("deployd/bin/dpd")], {env: process.env})
    , buf = '';

  proc.on("error", function(err) {
    done("Cannot start dpd: " + err);
  });

  if (proc.stdout) proc.stdout.on('data', function(data) {
    buf += data.toString();
    var match = buf.match(/listening on port (\d+)/);
    if(match && match[1]) {
      proc.emit('listening', match[1]);
    }
  });

  if (proc.stderr) proc.stderr.on('data', function(data) {
    buf += data.toString();
  });

  function kill(e) {
    proc.on('close', function(){
      if (e && e !== 0){
        done("Test run failed. dpd output was: \n\n" + buf);
      } else {
        done();
      }
    });

    proc.stdin.end(); // this will cause the process to exit (see mongod.js, handled there)
  }

  if (proc.once) proc.once('listening', function (port){
    var mpjsProc = fork(require.resolve("mocha-phantomjs/bin/mocha-phantomjs"), [ '--ignore-resource-errors', 'http://localhost:' + port ], {silent: true});
    mpjsProc.on("error", function(err) {
      buf += '\n\nCannot start phantomjs: ' + err;
      kill(1);
    });
    mpjsProc.stdout.on('data', function(data) {
      process.stdout.write(data.toString());
    });
    mpjsProc.stderr.on('data', function(data) {
      process.stderr.write(data.toString());
    });
    mpjsProc.on('exit', kill);
  })
};
exports.run = run;

/**
 * First things first...
 *
 * ==========================================================================
 * Copyright 2019 Oh Kay.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to
 * whom the Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * ==========================================================================
 *
 * This script does the following:
 *   - compiles your tailwind files
 *   - serves an HTML page with your tailwind markup
 *   - watches for changes, recompiles, and refreshes the browser
 */

// The `fs` module will be used for:
//   - reading files that will be served.
//   - watching source code for change.
const fs = require('fs');

// The `http` module will be used to create a web server.
const http = require('http');

// The `spawn` function is used to execute the tailwind compiler.
const { spawn } = require('child_process');

// The `io` module will be used to send messages to the browser window.
const io = require('socket.io');

// Promisify allows for marginally cleaner code :shrugs:
const { promisify } = require('util');

// Chalk provides colorful output
const chalk = require('chalk');

class TailwindCompiler {
    constructor () {
        // this property always contains the latest valid compiled css
        this.css = '';
        // It is easier to read callbacks than promises, but easier to use promises.
        // this provides both.
        this.compile = promisify(this.compile);
    }
    compile (cb) {
        // `spawn` allows for a consistent style of collecting output for
        // both the stdout and stderr streams.
        const result = spawn(
            './node_modules/.bin/tailwind',
            ['build', 'style.css', '-c', 'tailwind.js']
        );
        // build these strings as data comes in, finally calling the callback
        // the callback maybe be sent the error if one is found
        let chunked_css = '';
        let chunked_error  = '';
        result.stdout.on('data', str => chunked_css += str);
        result.stderr.on('data', str => chunked_error += str);
        result.on('exit', () => {
            if (!chunked_error) {
                this.css = chunked_css;
                return cb();
            }
            return cb({error: chunked_error});
        });
    }
}

// this tailwind compiler instance will be used in a few places to
// trigger a new compile, and also for injecting the CSS into the HTML
const tailwind = new TailwindCompiler();

// this is not a recursive wach, and it only expects to handle the files:
//  - index.html
//  - style.css
//  - tailwind.js
// it may work with other *.html, *.js, and *.css files too
fs.watch(__dirname, (type, name) => {
    // this doesn't happen in normal editing, but it happens quite frequently
    // while working on this project. It can be skipped. (TODO: restart node server?)
    if (name === 'server.js') {
        return;
    }
    console.debug(chalk.dim('...'), type, name);
    if (name.match(/\.htm/)) {
        // if they have edited an html page, there is nothing to compile
        reloadPage();
    } else if (name.match(/\.(css|js)$/)) {
        // if it is a css or javascript file, give the compile a shot!
        // after compiling, it will either reload the page, or display an error
        compileStyles();
    }
});

// the socket will be used to send events to the browser
// inside the socket is a _very_ rudimentary web server. It:
//  - ignores that damn favicon request
//  - checks for 404s
//  - serves the file if it finds it
// if the file is an html file, it will inject the socket javascript that listens
// for events from this socket, and also inject the compiled tailwind css
const socket = io(http.createServer(
    (request, response) => {
        if (request.url === '/favicon.ico') {
            return response.end(null);
        }
        fs.readFile(`.${request.url}`, (err, data) => {
            if (err) {
                console.error(chalk.red('404'), request.url);
                response.end('404');
            } else {
                if (request.url.match(/\.htm/)) {
                    data = injectSocketCode(data);
                    data = injectCompiledStyles(data);
                }
                console.log(chalk.green('200'), request.url);
                response.end(data);
            }
        })
    }
).listen(8080, async () => {
    // this is where it all starts
    console.log(chalk.yellow('Tailwind CSS development server'));
    await compileStyles();
    console.log('-->', chalk.blue('http://0.0.0.0:8080'));
}));

// the rest of the functions have been described above, and all that
// remains are simple implementations

// this can be awaited, and is responsible for diverging the flow
// based on the compilers success or not
async function compileStyles () {
    console.debug(chalk.dim('...'), 'compiling tailwind css');
    try {
        await tailwind.compile();
        reloadPage();
    } catch (ex) {
        // get rid of that emoji on the front
        const message = ex.error.match(/(\w(\n|.)*)/)[1];
        showError(message);
    }
}

// this contains the code that listens for the socket messages
function injectSocketCode (html) {
    return `
        ${html}
        <script src="/node_modules/socket.io-client/dist/socket.io.js"></script>
        <script>
            var socket = io();
            socket.on('reload', function () {
                window.location.reload();
            });
            socket.on('error', function (error) {
                console.log(error);
            });
        </script>
    `;
}

function injectCompiledStyles (html) {
    return `
        ${html}
        <style>
            ${tailwind.css}
        </style>
    `;
}

// these last two emit the socket events

function reloadPage () {
    console.debug(chalk.dim('...'), 'sending reload event to browser')
    socket.emit('reload');
}

function showError (message) {
    const lines = message.split(/\n/);
    // Use .write to omit the newline character
    process.stderr.write(chalk.red('ERR '));
    for (let i=0; i<lines.length; i++) {
        // the first line is bold, the second is normal, and the rest are dim
        // by far, the grossest line of code in the file
        let color = i === 0 ? chalk.bold : i === 1 ? chalk: chalk.dim;
        console.error(color(lines[i]));
    }
    socket.emit('error', message);
}


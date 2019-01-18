/**
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
 */

// This dev-server.js script does the following:
//   - compiles your tailwind files, using `./stye.css` and `./tailwind.js`,
//   - serves an HTML page with your tailwind markup,
//   - and watches for changes, recompiles, and refreshes the browser.

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

// Promisify allows for slightly cleaner and more readable code.
const { promisify } = require('util');

// Chalk provides all the colorful output.
const chalk = require('chalk');

class TailwindCompiler {
    constructor () {
        // This property always contains the latest valid compiled css
        this.css = '';
        // It is easier to read callbacks than promises, but easier to use promises.
        // This provides both, letting the code below use the `async` / `await` style.
        this.compile = promisify(this.compile);
    }
    compile (cb) {
        // The `spawn` function allows for a consistent style of
        // collecting tailwind output, for both the stdout and stderr streams.
        const result = spawn(
            './node_modules/.bin/tailwind',
            ['build', 'style.css', '-c', 'tailwind.js']
        );
        // Build these strings as data comes in, finally calling the callback.
        // The callback might be sent the error, if one is found.
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

// This global tailwind compiler instance will be used in a few places to trigger
// a new compile, and also for supplying the CSS that will end up in the HTML.
const tailwind = new TailwindCompiler();

// Monitor this directory and react to changes. This is not a recursive wach,
// and it only expects to handle certain files:
//  - index.html
//  - style.css
//  - tailwind.js
// It may work with other *.html, *.js, and *.css files, too.
fs.watch(__dirname, (type, name) => {
    // This doesn't happen in normal editing, but it happens quite frequently
    // while working on this project. (TODO: restart node server?)
    if (name === 'dev-server.js') {
        return;
    }
    console.debug(chalk.dim('...'), chalk.italic(`detected ${type}:`), chalk.bold(name));
    if (name.match(/\.htm/)) {
        // If they have edited an HTML page, there is nothing to re-compile.
        reloadPage();
    } else if (name.match(/\.(css|js)$/)) {
        // If it is a CSS or JS file, give the compilation a shot!
        // After compiling, it will either reload the page, or display an error.
        compileStyles();
    }
});

// This socket will be used to send events to the browser.
// Inside the socket is a _very_ rudimentary web server. It:
//  - ignores that damn favicon request,
//  - redirects / --> /index.html,
//  - checks for 404s,
//  - and serves the file if it finds it.
// If the file is an HTML file, it will inject the socket javascript that listens
// for events from this socket, and it will also inject the compiled tailwind CSS.
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
    // This is where it all starts.
    console.log(chalk.yellow('Tailwind CSS development server'));
    await compileStyles();
    console.log('-->', chalk.blue('http://0.0.0.0:8080'));
}));

// There are no callbacks, since this uses the `promisified` compile method above.
// After attempting to compile, it will take the next appropriate action:
//   - reload the page on success.
//   - show a nice error message on failure (and in the browser console).
async function compileStyles () {
    console.debug(chalk.dim('...'), 'compiling tailwind css');
    try {
        await tailwind.compile();
        reloadPage();
    } catch (ex) {
        // The tailwind error output starts with a NO emoji,
        // but it doesn't look as nice in this format.
        // This regex moves past that first "non-word" character.
        const message = ex.error.match(/(\w(\n|.)*)/)[1];
        showError(message);
    }
}

// This contains the JS code that listens for the socket messages and takes action.
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

// These last two emit the socket events...

function reloadPage () {
    console.debug(chalk.dim('...'), 'sending reload event to browser')
    socket.emit('reload');
}

function showError (message) {
    const lines = message.split(/\n/);
    // Uses .write to omit the newline character.
    process.stderr.write(chalk.red('ERR '));
    for (let i=0; i<lines.length; i++) {
        // The first line is bold, the second is normal, and the rest are dim.
        // This is, by far, the grossest line of code in the file.
        let color = i === 0 ? chalk.bold : i === 1 ? chalk: chalk.dim;
        console.error(color(lines[i]));
    }
    socket.emit('error', message);
}

// ---

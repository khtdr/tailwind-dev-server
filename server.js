require('npm-path');
const spawn = require('child_process').spawn;
const express = require('express');

const CSS_FILE = 'style.css'
const TAILWIND_CONFIG = 'tailwind.js';

function Tailwind () {
    this.css = ''
    this.compile = (done = () => {}) => {
        const tailwind = spawn(
            'tailwind',
            ['build', CSS_FILE, '-c', TAILWIND_CONFIG]
        );
        let css = ''
        tailwind.stdout.on('data', data => {
            css = `${css}${data}`
        });
        tailwind.stderr.on('data', err => {
            console.error('tailwind: ' + err);
        });
        tailwind.on('exit', () => {
            this.css = css;
            done()
        });
    }
}

const tailwind = new Tailwind();
tailwind.compile();

const app = express();
app.get([/\/$/, /.*\.html$/], function (req, res) {
    let filename = __dirname + req.path;
    filename += filename.endsWith('/')? 'index.html': '';
    fs.readFile(filename, function (_, data) {
        res.send(data
                 + '<script src="/node_modules/socket.io-client/dist/socket.io.js"></script>'
                 + '<script>'
                 + '  var socket = io();'
                 + '  socket.on("file-change-event", function () {'
                 + '    window.location.reload();'
                 + '  });'
                 + '</script>'
                 + '<style>'
                 + tailwind.css
                 + '</style>'
                );
    });
});
app.use(express.static(__dirname));

const http = require('http').Server(app);
http.listen(8080);

const fs = require('fs');
const io = require('socket.io')(http);
fs.watch(__dirname, handleChange);
function handleChange(type, name) {
    if (name.match(/\.htm/)) {
        io.emit('file-change-event');
    } else if (name.match(/\.(css|js)$/)) {
        tailwind.compile(() => {
            io.emit('file-change-event');
        })
    }
}

console.log('http://0.0.0.0:8080');

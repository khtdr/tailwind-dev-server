# Tailwindcss Playground

Simple quick way to get started learning and playing with Tailwindcss

  - No "transpiling" configuration is needed (or used).
  - No build tools need to be set up.
  - Small and documented web server,
  - ~115 lines of code, depends only on `tailwindcss`, `socket.io`, and `chalk`
  
## Installation
```bash
git clone https://github.com/khtdr/tailwind-server
cd tailwind-server
yarn
```

## Running
```bash
yarn start
```

## Building
If you like what you see and want to save it and use it, run:
```bash
yarn build
```
And use your newly built `tailwind-bundle.css` stylesheet.

Open `http://0.0.0.0:8080`

Edit any of the following files:
 - [index.html](https://github.com/khtdr/tailwind-server/blob/master/index.html)
 - [style.css](https://github.com/khtdr/tailwind-server/blob/master/style.css)
 - [tailwind.js](https://github.com/khtdr/tailwind-server/blob/master/tailwind.js)

Changes will be recompiled and automatically refreshed in your browser.

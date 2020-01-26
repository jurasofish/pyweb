# pyWeb

## Summary

pyWeb makes pyodide in the browser more accessible.

## Examples

https://jurasofish.github.io/pyweb/

## JavaScript API

pyWeb creates a single `pyWeb` global in javascript, along with the `pyodide` global.

### `pyWeb.new(div, [options])`

Initialize pyWeb, and attach the terminal to the specified div.
options overrides the default options.
Returns a promise which resolves once pyWeb is ready for use.

### `pyWeb.loadPackage(packageName)`

A light wrapper around pyodide.loadPackage which locks the terminal
while it's running.

### `pyWeb.runCode(code, [display_input], [display_output], [push_to_history])`

Run python code in the terminal.

## Python API

pyWeb creates the following global variables in python

 - `pyWeb`: a reference to the JavaScript global `pyWeb` object.
 - `pyodide`: The pyodide python package
 - `pyodidejs`: A reference to the JavaScript global `pyodide` object.
 - `js`: The special pyodide `js` package.
 - `console`: A reference to the JavaScript console, so you can `console.log(x)` from python
 - `busy_sleep`: A sleep function.

### `pyWeb.loadPackage(packageName)`

Same as the javascript version, since this is merely a reference to it.

### `busy_sleep(dt, clock_src=time.monotonic)`

sleep for dt seconds
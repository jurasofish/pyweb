# pyWeb

## Summary

pyWeb makes pyodide in the browser more accessible.

## Examples

https://jurasofish.github.io/pyweb/

## JavaScript API

pyWeb creates a single `pyWeb` global in javascript, along with the `pyodide` global.

### `pyWeb.new(div, [options])`

Initialize pyWeb/pyodide and attach terminal to the specified div.

        Args:
            div (str): Element to attach the terminal to.
                This is passed directly to the jQuery terminal
                instantiator, so see those docs.
                For a specific div, use e.g '#terminal', in which case you
                would need <div id="terminal"></div> in HTML.
                For fullscreen, use 'body' (might not end up fullscreen 
                if you have lots of styling).
            options (object): map from option name to option value to override
                the default options.
                See the default options in the function body for descriptions.
        
        Returns:
            Promise: Resolved once pyWeb is ready to use.

### `pyWeb.loadPackage(packageName)`

A light wrapper around pyodide.loadPackage which locks the terminal
while it's running.

### `pyWeb.runCode(code, [display_input], [display_output], [push_to_history])`

Run python code in the terminal.

### `pyWeb.clear()`

Clears the console and any partially entered commands.

## Python API

pyWeb creates the following global variables in python

 - `pyWeb`: a reference to the JavaScript global `pyWeb` object.
 - `pyodide`: The pyodide python package
 - `pyodidejs`: A reference to the JavaScript global `pyodide` object.
 - `js`: The special pyodide `js` package.
 - `console`: A reference to the JavaScript console, so you can `console.log(x)` from python
 - `busy_sleep`: A sleep function.

### `pyWeb.loadPackage(packageName), pyWeb.clear()`

Same as the javascript version, since these are merely references to them.

### `busy_sleep(dt, clock_src=time.monotonic)`

sleep for dt seconds
# pyWeb

Check out the [Main demo.](https://jurasofish.github.io/pyweb/)

pyWeb makes pyodide in the browser more accessible for developers, and allows the creation of command line-based python web programs.

[pyodide](https://github.com/iodide-project/pyodide) is the CPython scientific stack, compiled to WebAssembly - yes, CPython with numpy, pandas, etc. in the browser 100% client-side.

### Demos

 - [Overview](https://jurasofish.github.io/pyweb/)
 - [Loading packages (numpy, pandas, etc.)](todo)
 - [Using matplotlib and plotly](todo)
 - [Hiding and displaying the terminal](todo)
 - [Minimal usage](https://jurasofish.github.io/pyweb/demos/minimal.html)

## Guide

### Getting Started

The master branch of this repository contains the lastest version of pyWeb.js.

To use pyWeb load the prerequisite JavaScript libraries and call `pyWeb.new()`.

```html
<!-- Minial example - full screen pyWeb terminal. -->
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="https://code.jquery.com/jquery-latest.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/jquery.terminal/js/jquery.terminal.min.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/jquery.terminal/css/jquery.terminal.min.css" rel="stylesheet"/>
    <script src="https://pyodide.cdn.iodide.io/pyodide.js"></script>
    <script src="../pyWeb.js"></script>
    </head>
  <body>
    <script>
        pyWeb.new()
    </script>
  </body>
</html>
```

Or, to attach to an existing div specify it's name.

```html
<body>
    <div id="myPyWebTerminal"></div>
    <script>
        pyWeb.new('#myPyWebTerminal')
    </script>
</body>
```

### Running code

You can type code in the terminal and run it, of course.
The terminal is intended to vaguely mirror the PyCharm python console behaviour. It supports multi-line input if it detects an incomplete first line or if you use `shift+enter`. History accesible with arrow keys. The terminal itself is based on [jQuery Terminal Emulator](https://github.com/jcubic/jquery.terminal)

From JavaScript, use the `pyWeb.runCode()` function to execute code in the terminal.
Using the `options` argument you can control whether thd code itself and the output of the code are displayed in the terminal.
The returned object gives you access to the output produced by the executed code.
See the [Main demo](https://jurasofish.github.io/pyweb/) where this is bound
to a button.

```javascript
// JavaScript

pyWeb.runCode('print(1)')
    
let exec_res = pyWeb.runCode(String.raw`
        a = 1
        print(a)
    `,
    {display_input: false}
)
console.log(exec_res.output)
```

You can also use the pyodide functions to run code, which do not interact with the pyWeb terminal. e.g. `pyodide.runPython()` (see the pyodide docs).

### Loading packages

pyoodide requires that packages be compiled before importing.
Luckily the pyodide project has already done this for a heap of packages: [This will give you an idea of what's available.](https://github.com/iodide-project/pyodide/tree/master/packages)

pyWeb provides the function `pyWeb.loadPackage(packageName)` to load a pre-built package. It's a very light wrapper around `pyodide.loadPackage`.

```python
>>> # Load the numpy package files.
>>> pyWeb.loadPackage('numpy')
>>> # Now that the files are loaded, we can import it
>>> import numpy as np
```

For installing pure Python packages from PyPI, pyodide's `micropip` package works - see the pyodide docs.
Note that `micropip.install` is aynchronous so you'll have to guess when it's finished. (Could make this block the terminal like `pyWeb.loadPackage` - TODO).

e.g. (copying the example from pyodide)

```python
>>> pyWeb.loadPackage('micropip')
>>> import micropip
>>> micropip.install('snowballstemmer')  # async
>>> import snowballstemmer
>>> stemmer = snowballstemmer.stemmer('english')
>>> stemmer.stemWords('go goes going gone'.split())
['go', 'goe', 'go', 'gone']
```

## Tests

[Run the tests yourself here.](https://jurasofish.github.io/pyweb/tests/pyWebTestRunner.html)

Opening the test page will load pyodide and run the tests locally in your
web browser using [Jasmine](https://jasmine.github.io/).

## JavaScript API

pyWeb creates a single `pyWeb` global in javascript, along with the `pyodide` global.

### `pyWeb.new(div, [options])`
```
Initialize pyWeb/pyodide and attach terminal to the specified div.
Calling this more than once is not well tested, but should reset
the terminal, while leaving the python runtime untouched.

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

Example:
    pyWeb.new('#terminal', {print_to_js_console: false})


The default options are 

let default_options = {
    // If true, dedent text when pasting. 
    dedent_on_paste: true,

    // If true, lines typed at the console have tabs converted to spaces.
    tab_to_space: true,

    // How many spaces to use when converting tabs.
    // Also the number of spaces for auto-indentation when starting
    // a new line in the terminal.
    tab_size: 4,

    // True to push python stdout/stedrr to console.log
    // This has the benefit of being able to see python's output
    // as it's printed, rather than only seeing it displayed in the
    // terminal after the python code has been executed.
    print_to_js_console: true,
    
    // Max number of terminal lines.
    // Changing this after the terminal has been created has no effect.
    output_lines: 10000,

    // True to display info about pyodide and jquery terminal when
    // the terminal is created.
    display_greeting: true,

    // True to display a note when terminal starts about browser 
    // compatibility.
    display_browser_version_note: true,

    // True to display "loading python" and "python loaded" in terminal.
    display_loading_python: true,
}
```

### `pyWeb.loadPackage(packageName)`

```
Lock the console while loading a package into the virtual filesystem.

This is a light wrapper around pyodide.loadPackage.

The pyodide loadPackage method is asynchronous, which by default
would allow the user to enter commands in the terminal
immediately after calling it despite the package files not being
loaded yet. This causes confusion for the user: loading
package files should appear to be a synchronous blocking operation.

This function sets the LOCK_TERMINAL flag and then clears it after the 
loadPackage promise resolve. This has the effect of causing the terminal
to wait while the package is loaded., which causes the terminal
to wait (lowkey busy wait, sorry) until the package is loaded before
allowing the user to enter more input.

The pyodide loadPackage method also spits out essential information
to the console, so the console is redirected to python for the duration
of the loading operation.

Args:
    packageName (str): name of package to load (e.g. "numpy")

Returns:
    Promise: resolved after package files are loaded.
```

### `pyWeb.runCode(code, [options])`

```
/* Run a string of python code in the terminal.

This is intended as an external API to pyWeb, allowing developers
to run commands in the terminal as though they were typed by
a user - or not.

Args:
    code (str): string of code to execute. Can be multiline.
    options (object): Map from option name to value to overried
        the default optins. See function body for defaults and
        descriptions.

Returns:
    object: As described below.

Example:
    pyWeb.runCode('print(1)')
    
    let exec_res = pyWeb.runCode(String.raw`
            a = 1
            print(a)
        `,
        {display_input: false}
    )
    console.log(exec_res.output)

The default options are 

let default_options = {
    // True to dedent code before running and displaying it.
    dedent_code: true,

    // display the code in the terminal as though the user had typed it.
    display_input: true,

    // True to allow the stdout and stderr
    // resulting from the code to be displayed in the terminal.
    display_output: true, 

    // if display_input and push_to_history
    // are both true then split the input code by "\n"
    // and push each line onto the terminal history - just as if
    // they had been typed in manually.
    push_to_history: true
}

The returned object has the following form:

{
    # The code that was executed.
    'code': code_str,

    # A string of what the code caused to be
    # displayed on stdout and stderr.
    'output': _out.get_output(),

    # If the executed code returns a value, this will be that 
    # value. It will follow the type conversion used by pyodide.
    # Will be None for no result.
    'result': res,

    # A string representation of result.
    'result_repr': repr(res),

    # If the code raised an exception, then this will be the
    # exception object.
    # Will be None for no exception.
    'exception': exc,

    # A string representation of the exception object.
    # Will be an empty string for no exception.
    'exception_string': exc_string,
}
```

### `pyWeb.clear()`

Clear the terminal and any partially entered commands.

## Python API

pyWeb creates the following global variables in python

 - `pyWeb`: a reference to the JavaScript global `pyWeb` object.
 - `pyodide`: The **Python** pyodide package. See the pyodide documentation.
 - `pyodidejs`: A reference to the **JavaScript** `pyodide` object.
                See the pyodide documentation.
 - `js`: The special pyodide `js` package. See the pyodide documentation.
 - `console`: A reference to the JavaScript console, so you can use
              `console.log(x)` from python
 - `busy_sleep`: A sleep function.

### `pyWeb.loadPackage(packageName); pyWeb.clear()`

Same as the Javascript versions, since these are merely references to them.

### `busy_sleep(dt, clock_src=time.monotonic)`

Busy sleep for dt seconds (while consuming cpu).
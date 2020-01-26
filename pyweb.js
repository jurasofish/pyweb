'use strict';

/*
todo

Show example of busy wait and printing to console
Check up on the promise chaining
don't accept terminal input while python code is running.
check pyodide version.
*/

var pyWeb = {
    
    // Wait for LOCK_TERMINAL==false before allowing next console prompt.
    LOCK_TERMINAL: true, // Start true and then disable once python is loaded.
    
    // If false the buffer will not be executed when pressing enter.
    MAYBE_RUN: true,
    
    // True to redirect javascript console log/error to terminal.
    // TODO: if REDIRECTCONSOLE and pyWeb.options.print_to_js_console are
    //       both true then there's a double up. Fix.
    REDIRECTCONSOLE: false,

    __delay__: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    loadPackage: (packageName) => {
        /* Lock the console while loading a package into the virtual filesystem.

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
        */

        // Load package into virtual filesystem and lock the console.
        pyWeb.LOCK_TERMINAL = true;
        pyWeb.REDIRECTCONSOLE = true;  // Display info/errors for user.
        return pyodide.loadPackage(packageName).then(
            (r) => {
                pyWeb.LOCK_TERMINAL = false;
                pyWeb.REDIRECTCONSOLE = false;
                pyWeb.removeBufferedLines();
                pyWeb.term.echoRaw(r);
                pyWeb.restoreBufferedLines();
            },
            (r) => {
                pyWeb.LOCK_TERMINAL = false;
                pyWeb.REDIRECTCONSOLE = false;
                pyWeb.removeBufferedLines();
                pyWeb.term.error(r);
                pyWeb.restoreBufferedLines();
            }
        );
    },

    runCode: (code, display_input=true, display_output=true,
              push_to_history=false) => {
        /* Run a string of python code in the terminal.

        This is intended as an external API to pyWeb, allowing developers
        to run commands in the terminal as though they were typed by
        a user.

        Args:
            code (str): string of code to execute. Can be multiline.
            display_input (bool): True to display the code in the terminal
                as though the user had typed it.
            display_output (bool): True to allow the stdout and stderr
                resulting from the code to be displayed in the terminal.
             push_to_history(bool): if display_input and push_to_history
                are both true then split the input code by "\n"
                and push each line onto the terminal history - just as if
                they had been typed in manually.

        Returns:
            object: as described in the python _exec() function.
        */

        pyWeb.removeBufferedLines();
        let rawCode;
        if(display_input) {
            let lines = code.split("\n");
            let prompt = '[[;gray;]>>> ]'
            lines.forEach( line => {
                rawCode = $.terminal.escape_brackets(line);
                pyWeb.term.echo(prompt + rawCode);
                if (push_to_history) {
                    pyWeb.term.history().append(line);
                }
                prompt = '[[;gray;]... ]';  // The prompt for subsequent lines.
            })
        }
        
        let exec_info = pyodide.globals._exec_buffer(code, display_output)
        pyWeb.restoreBufferedLines();
        return exec_info;
    },

    removeBufferedLines: () => {
        // Remove buffered lines from terminal
        let buffer_len = pyodide.runPython('len(_buffer)');
        for (let i=0; i < buffer_len; i++) {
            pyWeb.term.remove_line(-1);
        }
    },

    restoreBufferedLines: () => {
        // Restore buffered lines to terminal
        let rawCode;
        let buffer_len = pyodide.runPython('len(_buffer)');
        let prompt = '[[;gray;]>>> ]';
        for (let i=0; i < buffer_len; i++) {
            rawCode = $.terminal.escape_brackets(pyodide.runPython(`_buffer[${i}]`));
            pyWeb.term.echo(prompt + rawCode);
            prompt = '[[;gray;]... ]';  // continuation prompt for subsequent lines.
        }
        if(buffer_len > 0) {pyWeb.term.set_prompt('[[;gray;]... ]')}
    },

    shift_enter: () => {
        // Add a line of code to the buffer without executing and create a
        // continuation line.
        pyWeb.MAYBE_RUN = false;
        let cmd = pyWeb.term.get_command();
        pyWeb.term.set_command('');
        pyWeb.term.history().append(cmd);
        pyWeb.term.exec(cmd, false)
    },

    backspace: (e, orig) => {
        // This code extends the base backspace method to allow
        // previous lines of the buffer to be removed.
        let cmd = pyWeb.term.get_command();
        if (cmd.length > 0) {
            orig();  // Normal backspace if there are characters.
        } else {
            let buffer_len = pyodide.runPython('len(_buffer)');
            if (buffer_len == 0) {return};
            pyWeb.term.remove_line(-1);
            let new_cmd = pyodide.runPython('_buffer.pop()');
            pyWeb.term.set_command(new_cmd)
            if (buffer_len == 1) {
                pyWeb.term.set_prompt('[[;gray;]>>> ]');
            }
        }
    },

    ctrl_c: () => {
        // Cancel current input: push currently typed text onto the history
        // and start a fresh line.
        let cmd = pyWeb.term.get_command();
        pyWeb.term.insert('^C');
        let rawCmdReproduce = $.terminal.escape_brackets(pyWeb.term.get_command());
        if (cmd.trim().length > 0){
            pyWeb.term.history().append(cmd);
        }
        pyodide.runPython('_buffer.clear()');
        pyWeb.term.set_command('');
        pyWeb.term.exec('', false);
        pyWeb.term.update(-1, pyWeb.term.get_prompt() + rawCmdReproduce);
    },

    paste: (e) => {
        // Paste text in terminal as though shift + enter was used between
        // each line of the pasted text.
        
        // TODO: pasting in middle of line does not set cursor position
        //       correctly when pasting a multi line string.
        
        e = e.originalEvent;
        if (e.clipboardData.getData) {
            let text = e.clipboardData.getData('text/plain');
            if (pyWeb.options.dedent_on_paste) {
                text = pyodide.globals.textwrap.dedent(text);
            }
            
            // Keep track of text before and after cursor to allow
            // pasting in middle of line.
            let full_cmd = pyWeb.term.get_command();
            let left_cmd = pyWeb.term.before_cursor();
            let right_cmd = full_cmd.substring(left_cmd.length);
            pyWeb.term.set_command('');
            pyWeb.term.insert(left_cmd);
            
            let lines = text.split("\n");
            lines.forEach( (line, i) => {
                pyWeb.term.insert(line);
                if (i != lines.length - 1) {  // skip last line.
                    pyWeb.shift_enter();
                    pyWeb.term.set_command('');  // clear auto indent.
                }
            });

            // Insert right string and move cursor to just before it.
            pyWeb.term.insert(right_cmd);
            for (let i = 0; i < right_cmd.length; i++) {
                pyWeb.term.invoke_key('CTRL+B');  // Move left.
            }
        }
        return false; // Don't run other paste events :)
    },

    new: (div='body', options={}) => {
        /* Initialize pyWeb/pyodide and attach terminal to the specified div.
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
        */
        
        let default_options = {
            // If true, dedent text when pasting. 
            dedent_on_paste: true,

            // If true, lines pushed onto buffer have leading tabs 
            // converted to spaces.
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

            // True to display info about pyodide and jquery terminal.
            display_greeting: true,

            // True no display a note when terminal starts about browser 
            // compatibility.
            display_browser_version_note: true,

            // True to display "loading python" and "python loaded" in terminal.
            display_loading_python: true,
        }

        // Check that provided options are valid.
        let orig_keys = Object.keys(default_options);
        let new_keys = Object.keys(options);
        let diff = new_keys.filter(x => !orig_keys.includes(x));
        if (diff.length > 0) {
            // not critical so don't throw, just display error.
            console.error(`unknown options provided: ${diff}`)
        }
        // update the defaults with the provided options.
        pyWeb.options = Object.assign(default_options, options);

        async function pushCode(line) {
            // Handle a line being entered in the terminal.
            
            // Wait for LOCK_TERMINAL to be cleared.
            while (pyWeb.LOCK_TERMINAL) {await pyWeb.__delay__(1)}
            
            pyodide.globals._push(line);
            
            // Wait for LOCK_TERMINAL to be cleared.
            // Calling _push may have caused python to run code which may
            // have set the LOCK_TERMINAL flag.
            while (pyWeb.LOCK_TERMINAL) {await pyWeb.__delay__(1)}
            
            pyWeb.MAYBE_RUN = true;  // Default back to true.
        }

        var term = $(div).terminal(
            pushCode,
            {
                greetings: "",
                prompt: "[[;grey;]>>> ]",
                clear: false,  //  disable "clear" command.
                outputLimit: pyWeb.options.output_lines,
                exceptionHandler: (e) => {
                    console.log(e.message);
                    console.log(e.stack);
                    pyWeb.term.error(e.message);
                },
                keymap: {
                    "SHIFT+ENTER": pyWeb.shift_enter,
                    "BACKSPACE": pyWeb.backspace,
                    "CTRL+C": pyWeb.ctrl_c,
                }
            }
        );
        pyWeb.term = term;
        if (pyWeb.options.display_greeting) {
            term.echo((
                `Welcome to the pyWeb console, built on `
              + `<a target="_blank" `
              +  `href="https://github.com/iodide-project/pyodide">pyodide</a> `
              + `and `
              + `<a target="_blank" `
              + `href="https://github.com/jcubic/jquery.terminal">`
              + `jQuery Terminal Emulator</a>. `
              ),
                {raw:true}  // allow html
            )
            term.echo(''); // newline
        }
            
        if (pyWeb.options.display_browser_version_note) {
            term.error('Please note that pyWweb/pyodide only works on Chrome and '
                     + 'Firefox desktop, and probably Firefox Android. '
                     + 'An incompatible browser will likely hang at '
                     + '"Loading Python..."\n');
        }
        if (pyWeb.options.display_loading_python) {term.echo('Loading Python...')}

        term.bind("paste", pyWeb.paste);

        term.echoRaw = function(line) {
            // Echo with escaped brackets.
            line = $.terminal.escape_brackets(line);
            term.echo(line);
        };

        term.updateRaw = function(lineno, line) {
            // update with escaped brackets.
            line = $.terminal.escape_brackets(line);
            term.update(lineno, line);
        };

        (function(){
            // Override console.log and console.error to add terminal 
            // echo/error to it.
            // https://stackoverflow.com/a/11403146/8899565
            let oldLog = console.log;
            let oldError = console.error;
            console.log = function (message) {
                if (pyWeb.REDIRECTCONSOLE) {
                    pyWeb.removeBufferedLines();
                    pyWeb.term.echoRaw(message)
                    pyWeb.restoreBufferedLines();
                }
                oldLog.apply(console, arguments);
            };
            console.error = function (message) {
                if (pyWeb.REDIRECTCONSOLE) {
                    pyWeb.removeBufferedLines();
                    pyWeb.term.error(message)
                    pyWeb.restoreBufferedLines();
                }
                oldError.apply(console, arguments);
            };
        })();

        let pyodidePromise = languagePluginLoader.then(() => {

            pyodide.runPython(String.raw`
            import io
            import code
            import sys
            import traceback
            import textwrap
            import time
            from js import pyodide as pyodidejs, console, pyWeb
            import pyodide
            import js


            # buffer lines of code input from the terminal, to be executed later.
            _buffer = []


            class _StringIORedirect(io.StringIO):
                """ StringIO, but everything is echoed to the terminal.
                Since while python code is running the browser UI is blocked 
                (does not re-render), calling term.echo every time data is written
                is no different to calling term.echo once after the code
                has been executed with all the data.
                Hence the use of display() and clear() instead of incrementally
                calling term.echo().
                """
                def __init__(self, *args, **kwargs):
                    self.line_buffer = ''
                    super().__init__(*args, **kwargs)
                def write(self, data, *args, **kwargs):
                    # super().write(data, *args, **kwargs)
                    self.line_buffer += data
                    if js.pyWeb.options.print_to_js_console:
                        console.log(data)
                def display(self):
                    if self.line_buffer:
                        pyWeb.term.echoRaw(self.line_buffer)
                def clear(self):
                    self.line_buffer = ''
                def get_output(self):
                    return self.line_buffer

            
            # Redirect stdout and stderr
            _out = sys.stdout = sys.stderr = _StringIORedirect()


            def busy_sleep(dt, clock_src=time.monotonic):  
                """ Busy sleep for dt seconds.

                Let me know if you find a not busy way to sleep from pyodide.
                Maybe using Emscripten Asyncify?
                
                Args:
                    dt (float, int): Time in seconds to sleep.
                    clock_src (callable): function returning relative time
                        in floating point seconds.
                """ 
                start_time = clock_src()
                while (clock_src() < start_time+dt):
                    pass

            
            def _ready_to_run(buffer):
                """ Return True if the buffer of code is ready to run.

                Whether it's "ready to run" is decided based on some heuristics.

                Args:
                    buffer (list of str): list of buffered lines of code.
                
                Returns:
                    bool: whether code is ready to run.
                """
                # Always exec if final line is whitespace.
                if buffer[-1].split('\n')[-1].strip() == "":
                    return True
                
                # Exec on single line input if it's complete.
                if len(_buffer) == 1:
                    try:
                        if code.compile_command(buffer[0]):
                            return True
                    except (OverflowError, SyntaxError, ValueError):
                        pass  # Allow these to occur later


            def _push(line):
                """Add line of code to buffer and maybe execute it.

                Leading tabs in the line are replaced with spaces
                if the pyWeb tab_to_space option is set.

                If the pyWeb flag MAYBE_RUN is set then the buffer might
                be executed after the line is pushed. See function body
                for logic of how this is decided.
                If MAYBE_RUN is false, the buffer will not be executed.

                Args:
                    line (str): A string of code to be pushed onto the buffer.

                Returns:
                    If the buffer is executed, then the return value
                    of _exec() is returned.
                    If the buffer is not executed, None is returned.
                """

                # Equivalent to one tab, in spaces.
                tab_equiv = ' '*js.pyWeb.options.tab_size
                
                # replace leading tabs with spaces
                if line and js.pyWeb.options.tab_to_space:
                    white_count = len(line) - len(line.lstrip())
                    white_expanded = line[:white_count].replace('\t', tab_equiv)
                    line = white_expanded + line[white_count:]

                _buffer.append(line)
                
                if js.pyWeb.MAYBE_RUN and _ready_to_run(_buffer):
                    return _exec_buffer()

                # Haven't returned, so more input expected. Set prompt accordingly.
                pyWeb.term.set_prompt('[[;gray;]... ]')

                # Reproduce indentation from previous line.
                cur_indent = len(_buffer[-1]) - len(_buffer[-1].lstrip())
                pyWeb.term.insert(cur_indent * ' ')

                # Add more indentation if line ends with a colon.
                if line and line.strip()[-1] == ':':
                    pyWeb.term.insert(tab_equiv)

                return None


            def _exec_buffer(buffer=_buffer, display_output=True):
                """ Execute and clear the buffer.

                Args:
                    buffer (str or list of str): The code to be joined by
                        "\n" and executed. This buffer will be cleared in-place.
                        Can be a list of strings, or a string.
                    display_output (bool): True to push stdout and stderr
                        onto the pyWeb terminal.
                
                Returns:
                    dict: A dictionary with info about the execution.
                        See the function body for a description of the dictionary.
                """
                if isinstance(buffer, str):
                    buffer = [buffer]
                _out.clear()  # Clear previous stdout/stderr.
                code_str = "\n".join(buffer)
                print_repr = len(buffer)==1  # Only if code is a single line.
                buffer.clear()
                pyWeb.term.set_prompt('[[;grey;]>>> ]')
                try:
                    res = pyodide.eval_code(code_str, globals())
                    exc = None
                    exc_string = ''
                except Exception as e:
                    res = None
                    exc = e
                    exc_string = traceback.format_exc()
                    if display_output:
                        print(exc_string, file=sys.stderr, end='')
                if print_repr and display_output and res is not None:
                    print(repr(res), end='')
                if display_output:
                    _out.display()
                return {
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
            `)
        }).then(() => {
            if (pyWeb.options.display_loading_python) {term.echo('Python loaded.\n')}
            pyWeb.runCode(`print('Python %s on %s' % (sys.version, sys.platform), end='')`,
                          false)
            pyWeb.LOCK_TERMINAL = false;
        }, 
        () => {
            term.echo('Loading Python failed.')
        }, 
        )
        return pyodidePromise;
    }
}
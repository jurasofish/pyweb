'use strict';

var pyWeb = {

    RUNNING: false,  // Wait for RUNNING==false before allowing next console prompt.
    MAYBE_RUN: true,  // If false the buffer will not be executed when pressing enter.
    REDIRECTCONSOLE: false,  // True to redirect console log/error to terminal.

    __delay__: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    loadPackageFlagged: (packageName) => {
        // Load package into virtual filesystem and flag to console
        // that code is running.
        pyWeb.RUNNING = true;
        pyWeb.REDIRECTCONSOLE = true;  // Display info/errors for user.
        pyodide.loadPackage(packageName).then(
            (r) => {
                pyWeb.RUNNING = false;
                pyWeb.REDIRECTCONSOLE = false;
                pyWeb.term.echoRaw(r);
            },
            (r) => {
                pyWeb.RUNNING = false;
                pyWeb.REDIRECTCONSOLE = false;
                pyWeb.term.error(r);
            }
        );
    },

    runCode: (code, display_input=true, display_output=true) => {
        // Run a string of python code, can be multiline.
        // display_input and display_output control whether the code and
        // any outputs are displayed in the terinal or suppressed.

        let rawCode, buffer_len;

        // Remove buffered lines from terminal
        buffer_len = pyodide.runPython('len(_buffer)');
        for (let i=0; i < buffer_len; i++) {
            pyWeb.term.remove_line(-1);
        }
        
        if(display_input) {
            rawCode = $.terminal.escape_brackets(code);
            term.echo('[[;gray;]>>> ]' + rawCode);
        }
        let exec_info = pyodide.globals._exec_buffer(code, display_output)
        
        // Restore buffered lines to terminal
        let prompt = '[[;gray;]>>> ]';
        for (let i=0; i < buffer_len; i++) {
            rawCode = $.terminal.escape_brackets(pyodide.runPython(`_buffer[${i}]`));
            term.echo(prompt + rawCode);
            prompt = '[[;gray;]... ]';  // continuation prompt for subsequent lines.
        }
        if(buffer_len > 0) {term.set_prompt('[[;gray;]... ]')}

        return exec_info;
    },

    shift_enter: () => {
        pyWeb.MAYBE_RUN = false;
        let cmd = pyWeb.term.get_command();
        pyWeb.term.set_command('');
        pyWeb.term.history().append(cmd);
        pyWeb.term.exec(cmd, false)
    },

    backspace: (e, orig) => {
        // Allow backspace to remove a line.
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
        // Cancel current input.
        let cmd = pyWeb.term.get_command();
        pyWeb.term.insert('^C');
        let rawCmdReproduce = $.terminal.escape_brackets(pyWeb.term.get_command());
        if (cmd.trim().length > 0){
            pyWeb.term.history().append(cmd);
        }
        pyodide.runPython('_buffer.clear()');
        pyWeb.term.set_command('');
        pyWeb.term.exec('', false);
        pyWeb.term.update(-1, term.get_prompt() + rawCmdReproduce);
    },

    paste: (e) => {
        // Paste text in terminal as though shift + enter was used.
        // TODO: handle pasting in the middle of a line.
        e = e.originalEvent;
        if (e.clipboardData.getData) {
            let text = e.clipboardData.getData('text/plain');
            if (pyWeb.options.dedent_on_paste) {
                text = pyodide.globals.textwrap.dedent(text);
            }
            let lines = text.split("\n");
            lines.forEach( (line, i) => {
                pyWeb.term.insert(line);
                if (i != lines.length - 1) {  //  Don't return on last line.
                    pyWeb.shift_enter();
                }
            })
        }
        return false; // Don't run other paste events :)
    },

    new: (div, options={}) => {
        
        let default_options = {
            dedent_on_paste: true,  // If true, dedent text when pasting. 
            tab_to_space: true,  // If true input leading tabs converted to spaces.
            tab_size: 4,  // How many spaces per tab if tab_to_space.
            print_to_js_console: true,  // True to push python stdout/stedrr to console.log.
            output_lines: 10000,  // Number of lines to display.
        }
        pyWeb.options = Object.assign(default_options, options);


        (function(){
            // Override console.log and console.error to add terminal echo/error to it.
            // https://stackoverflow.com/a/11403146/8899565
            let oldLog = console.log;
            let oldError = console.error;
            console.log = function (message) {
                if (pyWeb.REDIRECTCONSOLE) {pyWeb.term.echoRaw(message)}
                oldLog.apply(console, arguments);
            };
            console.error = function (message) {
                if (pyWeb.REDIRECTCONSOLE) {pyWeb.term.error(message)}
                oldError.apply(console, arguments);
            };
        })();

        languagePluginLoader.then(() => {
            async function pushCode(line) {
                pyodide.globals._push(line);
                while (pyWeb.RUNNING) {await pyWeb.__delay__(1)}  // Wait for running to finish.
                pyWeb.MAYBE_RUN = true;  // Default back to true.
            }

            var term = $('#' + div).terminal(
                pushCode,
                {
                    greetings: "Welcome to the Pyodide terminal emulator 🐍",
                    prompt: "[[;grey;]>>> ]",
                    clear: false,  //  disable "clear" command.
                    outputLimit: pyWeb.options.output_lines,  // Limit number of displayed lines.
                    exceptionHandler: (e) => {
                        console.log(e.message);
                        console.log(e.stack);
                        term.error(e.message);
                    },
                    keymap: {
                        "SHIFT+ENTER": pyWeb.shift_enter,
                        "BACKSPACE": pyWeb.backspace,
                        "CTRL+C": pyWeb.ctrl_c,
                    }
                }
            );
            pyWeb.term = term;
            window.term = term;

            term.bind("paste", pyWeb.paste);

            term.echoRaw = function(line) {
                line = $.terminal.escape_brackets(line);
                term.echo(line);
            };

            term.updateRaw = function(lineno, line) {
                line = $.terminal.escape_brackets(line);
                term.update(lineno, line);
            };

            pyodide.runPython(String.raw`
            import io
            import code
            import sys
            import traceback
            import textwrap
            from js import term, pyodide as pyodidejs, console
            import pyodide
            import js

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
                    super().write(data, *args, **kwargs)
                    self.line_buffer += data
                    if js.pyWeb.options.print_to_js_console:
                        console.log(data)
                def display(self):
                    if self.line_buffer:
                        term.echoRaw(self.line_buffer)
                def clear(self):
                    self.line_buffer = ''
                def get_output(self):
                    return self.line_buffer


            _out = sys.stdout = sys.stderr = _StringIORedirect()

            def _push(line):
                """Add line of code to buffer and execute it if ready.
                returns a tuple of (stdout string, execution result),
                both of which are None if no execution was performed.
                """
                
                # replace leading tabs with spaces
                if line and js.pyWeb.options.tab_to_space:
                    white_count = len(line) - len(line.lstrip())
                    white_expanded = line[:white_count].replace('\t', ' '*js.pyWeb.options.tab_size)
                    line = white_expanded + line[white_count:]

                _buffer.append(line)
                
                if js.pyWeb.MAYBE_RUN:
                    # Always exec if final line is whitespace.
                    if line.split('\n')[-1].strip() == "":
                        return _exec_buffer()
                    
                    # Exec on single line input 
                    if len(_buffer) == 1:
                        try:
                            if code.compile_command(line):
                                return _exec_buffer()
                        except (OverflowError, SyntaxError, ValueError):
                            pass  # Allow these to occur when the user executes the code.

                # More input expected, set prompt accordingly.
                term.set_prompt('[[;gray;]... ]')

                # Reproduce indentation from previous line.
                cur_indent = len(_buffer[-1]) - len(_buffer[-1].lstrip())
                term.insert(cur_indent * ' ')

                # Add more indentatino if line ends with a colon
                if line and line.strip()[-1] == ':':
                    term.insert(' '*js.pyWeb.options.tab_size)
                
                return (None, None)


            def _exec_buffer(buffer=_buffer, display_output=True):
                """ Execute and clear the buffer.
                display_output controls whether output is printed.
                buffer is a list of lines to be joined by '\n' and executed,
                which will be cleared. Can also be a string.
                returns a dict of info from the execution.
                """
                if isinstance(buffer, str):
                    buffer = [buffer]
                _out.clear()
                code_str = "\n".join(buffer)
                print_repr = len(buffer)==1  # Only if code is a single line.
                buffer.clear()
                term.set_prompt('[[;grey;]>>> ]')
                try:
                    res = pyodide.eval_code(code_str, globals())
                    exc = None
                    exc_string = None
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
                    'code': code_str,
                    'output': _out.get_output(),
                    'result_repr': repr(res),
                    'result': res,
                    'exception_string': exc_string,
                    'exception': exc,
                }
            `)
        });
    }
}
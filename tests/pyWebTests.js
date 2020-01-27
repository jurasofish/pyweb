jasmine.DEFAULT_TIMEOUT_INTERVAL = 25000;
let termdivCounter = 0;


let newTerminal = async () => {
    let termdiv = document.createElement("div");
    termdiv.id = 'terminal' + String(termdivCounter);
    termdivCounter++;
    document.body.appendChild(termdiv);
    await pyWeb.new('#' + termdiv.id);
    termdiv.style.border = 10;
    termdiv.style.borderColor = 'white';
}


let deleteLastTerminal = () => {
    let termdiv = document.getElementById("terminal");
    termdiv.parentNode.removeChild(termdiv);
}


let last = (arr, n) => {
    if (n == null) 
       return arr[arr.length - 1];
    return arr.slice(Math.max(arr.length - n, 0));  
}


let __delay__ = (ms) => new Promise(resolve => setTimeout(resolve, ms))


describe('pyWeb can', ()=>{

    beforeAll(async () => {
        await newTerminal();
    });

    beforeEach( () => {
        pyWeb.clear();
    });

    it('display the repr() of a single line statement', ()=>{
        pyWeb.term.exec('2 + 1')
        expect(pyWeb.term.get_output()).toBe(">>> 2 + 1\n3");
    })

    it('prompt for new line on obviously incomplete input', ()=>{
        pyWeb.term.exec('print(1')
        expect(pyWeb.term.get_output()).toBe(">>> print(1");
    })

    it('paste text with auto dedent', async ()=>{
        let dedent_on_paste_backup = pyWeb.options.dedent_on_paste;
        pyWeb.options.dedent_on_paste = true;

        // Fake paste event object.
        let e = {originalEvent: {clipboardData: {getData: () => {
            return '    someone    \n          else\n       blah'
        }}}}

        pyWeb.term.insert('random text');
        for (let i = 0; i < 5; i++) {
            pyWeb.term.invoke_key('CTRL+B');  // Move left.
        }
        await __delay__(10);  // let console figure it's life out.
        pyWeb._paste(e);
        await __delay__(10);  // let console figure it's life out.
        expect(pyWeb.term.get_output()).toBe(
            ">>> randomsomeone    \n...       else");
        expect(pyWeb.term.get_command().startsWith('   blah text')).toBe(true);

        pyWeb.options.dedent_on_paste = dedent_on_paste_backup;

    })

    it('paste text without auto dedent', async ()=>{
        let dedent_on_paste_backup = pyWeb.options.dedent_on_paste;
        pyWeb.options.dedent_on_paste = false;

        // Fake paste event object.
        let e = {originalEvent: {clipboardData: {getData: () => {
            return '    someone    \n          else\n       blah'
        }}}}

        pyWeb.term.insert('random text');
        for (let i = 0; i < 5; i++) {
            pyWeb.term.invoke_key('CTRL+B');  // Move left.
        }
        await __delay__(10);  // let console figure it's life out.
        pyWeb._paste(e);
        await __delay__(10);  // let console figure it's life out.
        expect(pyWeb.term.get_output()).toBe(
            ">>> random    someone    \n...           else");
        expect(pyWeb.term.get_command().startsWith('       blah text')).toBe(true);

        pyWeb.options.dedent_on_paste = dedent_on_paste_backup;

    })

    it('prompt for new line on colon at end of line', ()=>{
        pyWeb.term.exec('literally anything with a colon at the end:')
        expect(pyWeb.term.get_output()).toBe(
            ">>> literally anything with a colon at the end:");
    })

    it('allow use of pyodide.runPython and return a value', ()=>{
        expect(pyodide.runPython('2*3')).toBe(6);
    })

    it('use pyWeb.runCode to display the input code, display the output,'
       + ' and not push to history', ()=>{
        
        let code = `
        def something(a):
            return a + 1
        print('1')
        print('2')
        something(4)
        `

        let options = {display_input: true, display_output: true,  
                       push_to_history: false}

        pyWeb.term.history().clear();
        exec_res = pyWeb.runCode(code, options);

        expect(exec_res.code).toBe(code);
        expect(exec_res.output).toBe('1\n2\n');
        expect(exec_res.result).toBe(5);
        expect(exec_res.result_repr).toBe('5');
        expect(exec_res.exception).toBeUndefined();
        expect(exec_res.exception_string).toBe('');

        // Printed stdout should match the returned stdout.
        expect(last(pyWeb.term.get_output(true))[0]).toBe(exec_res.output)

        // Reconstruct the echoed code and compare to the provided code.
        input_code = '';
        num_code_lines = code.split("\n").length;
        code_lines = last(pyWeb.term.get_output(true), num_code_lines + 1);
        code_lines = code_lines.slice(0, num_code_lines);  // last line is stdout.
        code_lines = code_lines.map(x => x[0]);
        code_lines = code_lines.map(x => x.substring(4)); // Remove prompt.
        recon_code = code_lines.join('\n');
        expect(recon_code).toBe(code);

        // Check that the code was NOT pushed onto history
        // note we cleared the history earlier
        expect(pyWeb.term.history().data().length).toBe(0);
    })

    it('push to history from pyWeb.runCode', ()=>{
        let code = "a = 1\nb = 2\n"
        let options = {push_to_history: true}
        exec_res = pyWeb.runCode(code, options);

        // Check that the code was pushed onto history
        num_code_lines = code.split("\n").length;
        last_history = last(pyWeb.term.history().data(), num_code_lines)
        recon_code = last_history.join("\n")
        expect(recon_code).toBe(code);
    })

    it('disable output from pyWeb.runCode', ()=>{
        let code = "a = 1\nb = 2\nprint(5)\nprint(6)"
        let options = {display_output: false}
        exec_res = pyWeb.runCode(code, options);

        // Reconstruct the echoed code and compare to the provided code.
        // if there is any stdout thi will be messed up.
        num_code_lines = code.split("\n").length;
        code_lines = last(pyWeb.term.get_output(true), num_code_lines);
        code_lines = code_lines.map(x => x[0]);
        code_lines = code_lines.map(x => x.substring(4)); // Remove prompt.
        recon_code = code_lines.join('\n');
        expect(recon_code).toBe(code);
    })

    it('disable echoing of input code from pyWeb.runCode', ()=>{
        let code = "a = 1\nb = 2\nprint(5)\nprint(6)"
        let options = {display_input: false, display_output: true}

        exec_res = pyWeb.runCode(code, options);

        // Reconstruct the echoed code and compare to the provided code.
        // if there is any stdout thi will be messed up.
        expect(last(pyWeb.term.get_output(true))[0]).toBe(exec_res.output)
        
        // expect only a single output line.
        // Note that the terminal was cleared before calling runCode.
        expect(pyWeb.term.get_output(true).length).toBe(1)
    })

    it('echo input code from pyWeb.runCode without disturbing the buffer', async ()=>{
        let code = "a = 1\nb = 2\nprint(5)\nprint(6)"
        let options = {display_input: true, display_output: true}
        
        // The user has typed a few lines of input
        pyWeb.term.set_command('');
        let user_code = ['for i in range(10):', 'print(i)'];
        user_code.forEach(line => {
            pyWeb.term.insert(line);
            pyWeb._shift_enter()
        })

        exec_res = pyWeb.runCode(code, options);

        // delay to give terminal a chance to render
        await __delay__(10);

        let expected_displayed_lines = [
            `>>> a = 1`,
            `... b = 2`,
            `... print(5)`,
            `... print(6)`,
            `5`,
            `6`,
            ``,
            `>>> for i in range(10):`,
            `...     print(i)`,
        ].join("\n")

        let displayed_lines = last(pyWeb.term.get_output().split("\n"), 9)
        displayed_lines = displayed_lines.join("\n");
        expect(displayed_lines).toBe(expected_displayed_lines)
    })

    it('load and use numpy, from Python', async () => {
        await pyWeb.runCode('pyWeb.loadPackage("numpy")').result;
        pyWeb.runCode('import numpy as np');
        let exec_res = pyWeb.runCode('np.array([1, 2, 3])');
        expect(exec_res.result_repr).toBe('array([1, 2, 3])');
    })

    it('load and use networkx through Python from JavaScript', async () => {
        await pyWeb.loadPackage('networkx');
        pyWeb.runCode('import networkx as nx');
        pyWeb.runCode('g = nx.Graph() \ng.add_node(1)');
        let exec_res = pyWeb.runCode('g.number_of_nodes()');
        expect(exec_res.result).toBe(1);
    })

    it('silently load xlrd from JavaScript, and then use it', async () => {
        await pyodide.loadPackage('xlrd');
        // Nothing should have been displayed in the python terminal:
        expect(pyWeb.term.get_output().length).toBe(0);

        pyWeb.runCode('import xlrd');
        let exec_res = pyWeb.runCode('xlrd.__version__');
        expect(exec_res.result).toBeDefined();
        expect(exec_res.exception).toBeUndefined();
    })

    it('echo the console to the terminal', () => {
        REDIRECTCONSOLE_backup = pyWeb.REDIRECTCONSOLE;
        pyWeb.REDIRECTCONSOLE = true;
        console.log('test log\nwhatup');
        console.error('test error\n\n');
        pyWeb.REDIRECTCONSOLE = REDIRECTCONSOLE_backup;
        
        let expected_displayed_lines = [
            `test log`,
            `whatup`,
            `[[;;;terminal-error]test error`,
            ``,
            `]`,
        ].join("\n")
        expect(pyWeb.term.get_output()).toBe(expected_displayed_lines);
    })

    it('handle multiple levels of buffer removal', async () => {

        pyWeb.term.set_command('');
        let user_code = ['for i in range(10):', 'print(i)', 'print(2*i)'];
        user_code.forEach(async (line) => {
            
            // kill me, jq term. Wait for terminal to rerender or some shit.
            await __delay__(10);
            
            pyWeb.term.insert(line);
            pyWeb._shift_enter()
        })

        pyWeb._removeBufferedLines();
        pyWeb._removeBufferedLines();
        pyWeb._removeBufferedLines();

        REDIRECTCONSOLE_backup = pyWeb.REDIRECTCONSOLE;
        pyWeb.REDIRECTCONSOLE = true;
        console.log('blah');
        console.error('whatever');
        pyWeb.REDIRECTCONSOLE = REDIRECTCONSOLE_backup;

        pyWeb._restoreBufferedLines();
        pyWeb._restoreBufferedLines();
        pyWeb._restoreBufferedLines();

        await __delay__(10);  // ugh, give terminal a chance to catch up
        
        let expected_displayed_lines = [
            `blah`,
            `[[;;;terminal-error]whatever]`,
            `>>> for i in range(10):`,
            `...     print(i)`,
            `...     print(2*i)`,
        ].join("\n")
        expect(pyWeb.term.get_output()).toBe(expected_displayed_lines);
        
    })

    it('handle exceptions in pyWeb.runCode', () => {
        // todo this one
        let exec_res = pyWeb.runCode('print(1)\na=1/0\nb=2');
        expect(exec_res.result).toBeUndefined();
        expect(exec_res.exception_string).toContain('ZeroDivisionError');
        expect(exec_res.output).toContain('ZeroDivisionError');
    })
})
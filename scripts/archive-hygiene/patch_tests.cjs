const fs = require('fs');

let apiTest = fs.readFileSync('src/services/__tests__/supabaseApiService.test.js', 'utf8');

// We incorrectly commented out the initialize step for all tests
apiTest = apiTest.replace(/\/\/ supabaseApiService\.initialize/g, 'supabaseApiService.initialize');

// Remove previous spy patch which caused TypeError
apiTest = apiTest.replace(/let consoleErrorSpy = \{ mockRestore: \(\) => \{\} \};/g, 'let consoleErrorSpy;');
apiTest = apiTest.replace(/consoleErrorSpy = vi\.spyOn\(console, "error"\)\.mockImplementation\(\(\) => \{\}\);/g, "consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});");
apiTest = apiTest.replace(/\/\/ consoleErrorSpy\.mockRestore\(\);/g, 'consoleErrorSpy.mockRestore();');

fs.writeFileSync('src/services/__tests__/supabaseApiService.test.js', apiTest);

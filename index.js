// Create an instance of CSInterface.
var csInterface = new CSInterface();

// Server startup state
var serverStartAttempted = false;
var serverModule = null;

// Start the server automatically - try immediately and keep retrying if needed
function startServerAutomatically() {
    if (serverStartAttempted && serverModule) {
        console.log('Server already started');
        return;
    }
    
    serverStartAttempted = true;
    console.log('Attempting to start server automatically...');
    
    // Try to start server using cep_node (available in CEP extensions with --enable-nodejs)
    if (typeof cep_node !== 'undefined' && cep_node.require) {
        // Get the extension path using CSInterface
        var extensionPath = '';
        try {
            extensionPath = csInterface.getSystemPath('EXTENSION');
            // Remove file:// prefix if present
            extensionPath = extensionPath.replace(/^file:\/\//, '');
            console.log('Extension path:', extensionPath);
        } catch (e) {
            console.log('Could not get extension path:', e);
        }
        
        // Try multiple path formats
        var serverPaths = [];
        if (extensionPath) {
            serverPaths.push(extensionPath + '/server/main.js');
            serverPaths.push(extensionPath + '\\server\\main.js'); // Windows path
        }
        serverPaths.push(__dirname + '/server/main.js');
        serverPaths.push('./server/main.js');
        serverPaths.push('server/main.js');
        serverPaths.push('/server/main.js');
        
        var serverStarted = false;
        for (var i = 0; i < serverPaths.length && !serverStarted; i++) {
            try {
                console.log('Trying to load server from:', serverPaths[i]);
                serverModule = cep_node.require(serverPaths[i]);
                // The server starts automatically when required (it calls app.listen() at module level)
                console.log('✓ Server module loaded successfully from:', serverPaths[i]);
                serverStarted = true;
                
                // Verify server is actually running by checking after a short delay
                setTimeout(function() {
                    httpRequest('http://localhost:3002/test', {
                        method: 'GET',
                        timeout: 2000
                    })
                    .then(function(response) {
                        console.log('✓ Server confirmed running on port 3002');
                    })
                    .catch(function(error) {
                        console.warn('Server module loaded but not responding:', error);
                    });
                }, 1000);
                
                break;
            } catch (pathError) {
                console.log('Path failed:', serverPaths[i], pathError.message);
            }
        }
        
        if (!serverStarted) {
            console.error('✗ Could not start server automatically - all paths failed');
            console.error('This might be a CEP security restriction');
            // Retry after a delay in case cep_node becomes available later
            setTimeout(function() {
                if (!serverModule) {
                    console.log('Retrying server startup...');
                    serverStartAttempted = false;
                    startServerAutomatically();
                }
            }, 2000);
        }
    } else {
        console.error('✗ cep_node not available');
        console.error('Node.js integration may not be enabled in CEP');
        // Retry after a delay
        setTimeout(function() {
            if (typeof cep_node !== 'undefined') {
                console.log('cep_node now available, retrying...');
                serverStartAttempted = false;
                startServerAutomatically();
            }
        }, 1000);
    }
}

// Check if server is running, and start if needed
function ensureServerRunning() {
    httpRequest('http://localhost:3002/test', {
        method: 'GET',
        timeout: 1000
    })
    .then(function(response) {
        console.log('✓ Server is already running');
    })
    .catch(function(error) {
        // Server not running, start it
        console.log('Server not running, starting automatically...');
        startServerAutomatically();
    });
}

// HTTP request helper using XMLHttpRequest (works in all CEP versions)
function httpRequest(url, options) {
    options = options || {};
    var timeout = options.timeout || 30000;
    var method = options.method || 'GET';
    
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        var timeoutId = setTimeout(function() {
            xhr.abort();
            reject(new Error('Request timeout'));
        }, timeout);
        
        xhr.open(method, url, true);
        
        // Set headers
        if (options.headers) {
            for (var key in options.headers) {
                if (options.headers.hasOwnProperty(key)) {
                    xhr.setRequestHeader(key, options.headers[key]);
                }
            }
        }
        
        xhr.onload = function() {
            clearTimeout(timeoutId);
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            } else {
                var error = new Error('HTTP ' + xhr.status + ': ' + xhr.statusText);
                error.status = xhr.status;
                error.responseText = xhr.responseText;
                reject(error);
            }
        };
        
        xhr.onerror = function() {
            clearTimeout(timeoutId);
            reject(new Error('Network error - cannot connect to server'));
        };
        
        xhr.ontimeout = function() {
            clearTimeout(timeoutId);
            reject(new Error('Request timeout'));
        };
        
        // Send request
        if (options.body) {
            xhr.send(options.body);
        } else {
            xhr.send();
        }
    });
}

// State management
var state = {
    changes: [],
    commandHistory: [],
    currentOutput: null,
    historyIndex: -1,
    currentInput: ''
};

// DOM Elements (will be initialized after DOM is ready)
var changesList;
var changesCount;
var commandInput;
var executeButton;
var commandHistory;
var outputPanel;
var outputContent;
var closeOutputButton;
var refreshButton;

// Initialize DOM elements
function initializeDOMElements() {
    changesList = document.getElementById('changes-list');
    changesCount = document.getElementById('changes-count');
    commandInput = document.getElementById('command-input');
    executeButton = document.getElementById('execute-button');
    commandHistory = document.getElementById('command-history');
    outputPanel = document.getElementById('output-panel');
    outputContent = document.getElementById('output-content');
    closeOutputButton = document.getElementById('close-output');
    refreshButton = document.getElementById('refresh-button');
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded');
    
    // Initialize DOM elements first
    initializeDOMElements();
    
    // Verify critical elements exist
    if (!commandInput || !executeButton) {
        console.error('Critical DOM elements not found!');
        console.error('commandInput:', commandInput);
        console.error('executeButton:', executeButton);
        return;
    }
    
    console.log('DOM elements initialized successfully');
    console.log('commandInput:', commandInput);
    console.log('executeButton:', executeButton);
    
    // Setup immediately - no need to wait for jQuery
    console.log('Setting up extension...');
    setupEventListeners();
    loadCommandHistory();
    updateChangesDisplay();
    
    // Start server immediately - don't wait
    startServerAutomatically();
    
    // Also check if server is already running (in case it was started by localServer.html)
    ensureServerRunning();
    
    // Wait a bit for server to start, then test connection
    setTimeout(function() {
        testServerConnection();
        autoInitialize();
    }, 2000); // Give server 2 seconds to start
});

// Event Listeners
function setupEventListeners() {
    // Verify elements exist before adding listeners
    if (!commandInput || !executeButton) {
        console.error('Cannot setup event listeners: DOM elements not found');
        console.error('commandInput:', commandInput);
        console.error('executeButton:', executeButton);
        return;
    }
    
    console.log('Setting up event listeners...');
    console.log('executeButton element:', executeButton);
    
    // Execute command on button click - use both native and jQuery for compatibility
    executeButton.addEventListener('click', function(e) {
        console.log('Execute button clicked (native listener)!');
        e.preventDefault();
        e.stopPropagation();
        executeCommand();
    });
    
    // No jQuery needed - using native event listeners
    
    // Execute command on Enter key
    commandInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            executeCommand();
        }
    });
    
    // Terminal-like history navigation with arrow keys
    commandInput.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateHistory(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateHistory(1);
        } else if (e.key === 'Tab') {
            // Prevent tab from moving focus
            e.preventDefault();
        }
    });
    
    // Show command history on focus
    commandInput.addEventListener('focus', function() {
        if (commandHistory && state.commandHistory.length > 0) {
            commandHistory.classList.add('visible');
        }
        state.currentInput = commandInput.value;
    });
    
    // Hide history on blur (with delay to allow clicks)
    commandInput.addEventListener('blur', function() {
        setTimeout(function() {
            if (commandHistory) {
                commandHistory.classList.remove('visible');
            }
        }, 200);
    });
    
    // Close output panel
    if (closeOutputButton) {
        closeOutputButton.addEventListener('click', function() {
            if (outputPanel) {
                outputPanel.style.display = 'none';
            }
        });
    }
    
    // Refresh changes
    if (refreshButton) {
        refreshButton.addEventListener('click', function() {
            refreshChanges();
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to execute
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            executeCommand();
        }
        
        // Escape to close output
        if (e.key === 'Escape') {
            if (outputPanel) {
                outputPanel.style.display = 'none';
            }
            if (commandInput) {
                commandInput.focus();
            }
        }
    });
}

// Navigate command history
function navigateHistory(direction) {
    if (!commandInput) {
        console.error('Command input element not found');
        return;
    }
    
    if (state.commandHistory.length === 0) return;
    
    if (state.historyIndex === -1) {
        state.currentInput = commandInput.value;
    }
    
    state.historyIndex += direction;
    
    if (state.historyIndex < 0) {
        state.historyIndex = -1;
        commandInput.value = state.currentInput;
    } else if (state.historyIndex >= state.commandHistory.length) {
        state.historyIndex = state.commandHistory.length - 1;
    } else {
        // Show command without "vervids" prefix
        var cmd = state.commandHistory[state.historyIndex];
        var displayCmd = cmd.startsWith('vervids ') ? cmd.substring(8) : cmd;
        commandInput.value = displayCmd;
    }
}

// Execute vervids command (make it globally accessible)
window.executeCommand = function executeCommand() {
    console.log('executeCommand() called');
    
    if (!commandInput) {
        console.error('Command input element not found');
        return;
    }
    
    var command = commandInput.value.trim();
    console.log('Command entered:', command);
    
    if (!command) {
        console.log('No command entered');
        appendOutput('Please enter a command', 'error');
        return;
    }
    
    // Auto-prepend "vervids" if not already present
    var fullCommand = command;
    if (!command.toLowerCase().startsWith('vervids')) {
        fullCommand = 'vervids ' + command;
    }
    
    // Check if it's "vervids init" without a path
    var initMatch = fullCommand.match(/^vervids\s+init\s*$/i);
    if (initMatch) {
        // Clear input first
        commandInput.value = '';
        
        // Show output panel
        if (outputPanel) {
            outputPanel.style.display = 'flex';
        }
        
        // Display command
        if (outputContent) {
            outputContent.innerHTML = '<div class="output-line info">$ ' + escapeHtml('vervids init') + '</div>';
        }
        
        // Get the current project file path from After Effects
        appendOutput('Getting current project file...', 'info');
        
        var script = 'getProjectFilePath()';
        csInterface.evalScript(script, function(result) {
            if (result && result !== 'null' && !result.startsWith('Error')) {
                var projectPath = result;
                
                // Normalize path case for macOS (fix /users/ -> /Users/)
                // macOS file system is case-insensitive but case-preserving
                // Some tools require correct case
                if (projectPath.indexOf('/users/') === 0) {
                    projectPath = '/Users' + projectPath.substring(6);
                }
                
                appendOutput('Found project: ' + projectPath, 'success');
                
                // Now execute vervids init with the project path
                var initCommand = 'vervids init ' + projectPath;
                appendOutput('Executing: ' + initCommand, 'info');
                
                // Reset history navigation
                state.historyIndex = -1;
                state.currentInput = '';
                
                // Add to history (store the full command with path)
                if (!state.commandHistory.includes(initCommand)) {
                    state.commandHistory.unshift(initCommand);
                    if (state.commandHistory.length > 50) {
                        state.commandHistory.pop();
                    }
                    saveCommandHistory();
                }
                
                // Execute the command with the path
                executeVervidsCommand(initCommand);
            } else if (result === 'null') {
                appendOutput('Error: Project is not saved yet.', 'error');
                appendOutput('Please save your After Effects project first (File → Save or Save As).', 'info');
            } else {
                appendOutput('Error getting project path: ' + result, 'error');
            }
        });
        return; // Don't execute the original command
    }
    
    // Reset history navigation
    state.historyIndex = -1;
    state.currentInput = '';
    
    // Add to history (store the full command)
    if (!state.commandHistory.includes(fullCommand)) {
        state.commandHistory.unshift(fullCommand);
        if (state.commandHistory.length > 50) {
            state.commandHistory.pop();
        }
        saveCommandHistory();
    }
    
    // Clear input
    commandInput.value = '';
    
    // Show output panel
    if (outputPanel) {
        outputPanel.style.display = 'flex';
    }
    
    // Display command (show what user typed, but execute full command)
    var displayCommand = command.startsWith('vervids') ? command : 'vervids ' + command;
    if (outputContent) {
        // Clear previous output and show the command
        outputContent.innerHTML = '<div class="output-line info">$ ' + escapeHtml(displayCommand) + '</div>';
    }
    
    // Execute command via Node.js server
    // Note: executeVervidsCommand will append to outputContent, not replace it
    executeVervidsCommand(fullCommand);
}

// Auto-initialize vervids when extension opens
function autoInitialize() {
    // Wait a bit for server connection to establish
    setTimeout(function() {
        // Show output panel
        if (outputPanel) {
            outputPanel.style.display = 'flex';
        }
        
        appendOutput('Checking vervids...', 'info');
        
        // Run vervids --help to show available commands (this should produce output)
        // If --help doesn't work, try --version or just vervids
        executeVervidsCommand('vervids --help');
    }, 1500);
}

// Test server connection
function testServerConnection() {
    // Wait a bit for server to be ready if it just started
    setTimeout(function() {
        // Show output panel for connection status
        if (outputPanel) {
            outputPanel.style.display = 'flex';
        }
        if (outputContent) {
            outputContent.innerHTML = '<div class="output-line info">Checking server connection...</div>';
        }
        
        httpRequest('http://localhost:3002/test', {
            method: 'GET',
            timeout: 3000
        })
        .then(function(response) {
            console.log('Server connection successful');
            appendOutput('✓ Server connected', 'success');
        })
        .catch(function(error) {
            console.error('Server connection failed:', error);
            appendOutput('✗ Server connection failed', 'error');
            appendOutput('', 'info'); // blank line
            appendOutput('Attempting to start server automatically...', 'info');
            
            // Try one more time to start the server
            setTimeout(function() {
                startServerAutomatically();
                
                // Check again after a delay
                setTimeout(function() {
                    httpRequest('http://localhost:3002/test', {
                        method: 'GET',
                        timeout: 2000
                    })
                    .then(function(response) {
                        appendOutput('✓ Server started successfully!', 'success');
                    })
                    .catch(function(retryError) {
                        appendOutput('', 'info'); // blank line
                        appendOutput('Auto-start failed. Please start manually:', 'error');
                        appendOutput('Terminal: cd "/Library/Application Support/Adobe/CEP/extensions/vervids" && node server/main.js', 'info');
                        appendOutput('Or: npm start', 'info');
                    });
                }, 2000);
            }, 500);
        });
    }, 500); // Wait 500ms for server to be ready
}

// Execute vervids command via terminal
function executeVervidsCommand(command) {
    // Ensure output panel is visible before showing anything
    if (outputPanel) {
        outputPanel.style.display = 'flex';
    }
    
    // Show loading state
    appendOutput('Executing command...', 'info');
    
    // Use the local server to execute commands
    httpRequest('http://localhost:3002/execute', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command: command }),
        timeout: 300000 // 5 minute timeout
    })
    .then(function(response) {
        console.log('Command response:', response);
        console.log('Response output:', response.output);
        console.log('Response output type:', typeof response.output);
        console.log('Response output length:', response.output ? response.output.length : 'null/undefined');
        console.log('Response stdout:', response.stdout);
        console.log('Response stdout type:', typeof response.stdout);
        console.log('Response stdout length:', response.stdout ? response.stdout.length : 'null/undefined');
        console.log('Response stderr:', response.stderr);
        console.log('Response stderr type:', typeof response.stderr);
        console.log('Response stderr length:', response.stderr ? response.stderr.length : 'null/undefined');
        
        // Ensure output panel is visible
        if (outputPanel) {
            outputPanel.style.display = 'flex';
        }
        
        if (response.success) {
            // Debug: Log everything about the response
            console.log('=== RESPONSE DEBUG ===');
            console.log('response.success:', response.success);
            console.log('response.stdout:', JSON.stringify(response.stdout));
            console.log('response.stderr:', JSON.stringify(response.stderr));
            console.log('response.output:', JSON.stringify(response.output));
            console.log('response keys:', Object.keys(response));
            
            var hasOutput = false;
            
            // Always check stdout first (most reliable)
            if (response.stdout !== undefined && response.stdout !== null) {
                console.log('Checking stdout, value:', JSON.stringify(response.stdout), 'trimmed:', response.stdout.trim());
                if (response.stdout.trim()) {
                    // Has stdout content
                    var stdoutLines = response.stdout.split('\n');
                    stdoutLines.forEach(function(line, index) {
                        // Show all lines, including empty ones for formatting
                        if (index < stdoutLines.length - 1 || line.length > 0) {
                            appendOutput(line || ' ', 'success');
                            hasOutput = true;
                        }
                    });
                } else if (response.stdout.length > 0) {
                    // Empty string but not null/undefined
                    appendOutput(' ', 'success');
                    hasOutput = true;
                }
            }
            
            // Then check stderr (might contain output if stdout is empty)
            if (response.stderr !== undefined && response.stderr !== null && response.stderr !== response.stdout) {
                if (response.stderr.trim()) {
                    if (hasOutput) {
                        appendOutput('--- stderr ---', 'info');
                    }
                    var stderrLines = response.stderr.split('\n');
                    stderrLines.forEach(function(line, index) {
                        if (index < stderrLines.length - 1 || line.length > 0) {
                            appendOutput(line || ' ', hasOutput ? 'error' : 'success');
                            hasOutput = true;
                        }
                    });
                }
            }
            
            // Fallback: check combined output field
            console.log('Checking combined output field, hasOutput:', hasOutput, 'response.output:', JSON.stringify(response.output));
            if (!hasOutput && response.output && response.output !== '(Command executed successfully but produced no output)') {
                console.log('Output field exists and is not empty message, checking trim...');
                if (response.output.trim()) {
                    console.log('Output field has content after trim, displaying...');
                    var outputLines = response.output.split('\n');
                    outputLines.forEach(function(line, index) {
                        if (index < outputLines.length - 1 || line.length > 0) {
                            appendOutput(line || ' ', 'success');
                            hasOutput = true;
                        }
                    });
                }
            }
            
            // If still no output, show the empty message
            console.log('Final check - hasOutput:', hasOutput);
            if (!hasOutput) {
                console.log('No output detected, showing debug info');
                if (response.output && response.output.includes('(Command executed successfully but produced no output)')) {
                    appendOutput(response.output, 'info');
                } else {
                    appendOutput('Command executed successfully (no output detected)', 'info');
                    appendOutput('', 'info');
                    appendOutput('=== DEBUG INFO ===', 'info');
                    appendOutput('stdout: ' + JSON.stringify(response.stdout), 'info');
                    appendOutput('stderr: ' + JSON.stringify(response.stderr), 'info');
                    appendOutput('output: ' + JSON.stringify(response.output), 'info');
                    appendOutput('stdout type: ' + typeof response.stdout, 'info');
                    appendOutput('stderr type: ' + typeof response.stderr, 'info');
                    appendOutput('output type: ' + typeof response.output, 'info');
                    appendOutput('', 'info');
                    appendOutput('Check browser console (http://localhost:7777) for full response details', 'info');
                    appendOutput('Note: If you expected output, check Docker logs or try running the command in Terminal', 'info');
                }
            } else {
                console.log('Output was displayed successfully');
            }
            
            if (response.changes) {
                updateChanges(response.changes);
            }
        } else {
            appendOutput('Command failed: ' + (response.error || 'Unknown error'), 'error');
            if (response.code) {
                appendOutput('Exit code: ' + response.code, 'error');
            }
            if (response.signal) {
                appendOutput('Signal: ' + response.signal, 'error');
            }
            if (response.output) {
                appendOutput('--- Error Output ---', 'error');
                var errorLines = response.output.split('\n');
                errorLines.forEach(function(line, index) {
                    // Show all error lines, including empty ones for formatting
                    if (index < errorLines.length - 1 || line.length > 0) {
                        appendOutput(line || ' ', 'error');
                    }
                });
                
                // Check for common errors and provide helpful messages
                var outputLower = response.output.toLowerCase();
                if (outputLower.indexOf('read-only file system') !== -1 || outputLower.indexOf('read-only') !== -1) {
                    appendOutput('', 'info');
                    appendOutput('💡 Troubleshooting read-only file system error:', 'info');
                    appendOutput('  • Check directory permissions: ls -ld "$(dirname <project-path>)"', 'info');
                    appendOutput('  • Docker volume might not be mounted correctly', 'info');
                    appendOutput('  • Ensure the project directory is writable', 'info');
                }
            }
        }
    })
    .catch(function(error) {
        console.error('Request error:', error);
        console.error('Error status:', error.status);
        console.error('Error responseText:', error.responseText);
        
        // Ensure output panel is visible
        if (outputPanel) {
            outputPanel.style.display = 'flex';
        }
        
        var errorMsg = 'Connection error: ';
        
        if (error.message === 'Request timeout') {
            errorMsg += 'Request timed out';
            appendOutput(errorMsg, 'error');
        } else if (error.status) {
            // Try to parse error response from server
            if (error.responseText) {
                try {
                    var errorResponse = JSON.parse(error.responseText);
                    console.log('Parsed error response:', errorResponse);
                    
                    // If it's a 500 error with command execution details, show them
                    if (error.status === 500 && errorResponse.success === false) {
                        appendOutput('Command execution failed', 'error');
                        if (errorResponse.error) {
                            appendOutput('Error: ' + errorResponse.error, 'error');
                        }
                        if (errorResponse.code) {
                            appendOutput('Exit code: ' + errorResponse.code, 'error');
                        }
                        if (errorResponse.output) {
                            appendOutput('--- Command Output ---', 'error');
                            var outputLines = errorResponse.output.split('\n');
                            outputLines.forEach(function(line, index) {
                                if (index < outputLines.length - 1 || line.length > 0) {
                                    appendOutput(line || ' ', 'error');
                                }
                            });
                        }
                        if (errorResponse.stderr && errorResponse.stderr !== errorResponse.output) {
                            appendOutput('--- stderr ---', 'error');
                            var stderrLines = errorResponse.stderr.split('\n');
                            stderrLines.forEach(function(line, index) {
                                if (index < stderrLines.length - 1 || line.length > 0) {
                                    appendOutput(line || ' ', 'error');
                                }
                            });
                        }
                    } else {
                        errorMsg += 'HTTP ' + error.status + ': ' + (errorResponse.error || error.message || 'Unknown error');
                        appendOutput(errorMsg, 'error');
                    }
                } catch (e) {
                    // Not JSON, show raw error
                    errorMsg += 'HTTP ' + error.status + ': ' + (error.message || 'Unknown error');
                    appendOutput(errorMsg, 'error');
                    appendOutput('Response: ' + error.responseText.substring(0, 200), 'error');
                }
            } else {
                errorMsg += 'HTTP ' + error.status + ': ' + (error.message || 'Unknown error');
                appendOutput(errorMsg, 'error');
            }
        } else {
            errorMsg += error.message || 'Cannot connect to server. Make sure the server is running.';
            appendOutput(errorMsg, 'error');
            appendOutput('Start the server with: node server/main.js', 'info');
        }
    });
}

// Append output to output panel
function appendOutput(text, type) {
    if (!outputContent) {
        console.error('Output content element not found');
        return;
    }
    
    // Ensure output panel is visible
    if (outputPanel) {
        outputPanel.style.display = 'flex';
    }
    
    // Handle empty or whitespace-only text
    if (!text || (typeof text === 'string' && !text.trim() && text.length > 0)) {
        text = ' '; // Add a space for empty lines
    }
    
    var line = document.createElement('div');
    line.className = 'output-line ' + (type || '');
    line.textContent = text;
    outputContent.appendChild(line);
    
    // Scroll to bottom
    outputContent.scrollTop = outputContent.scrollHeight;
    
    console.log('Appended output:', text.substring(0, 100), 'Type:', type);
}

// Update changes display
function updateChangesDisplay() {
    if (!changesList || !changesCount) {
        console.error('Changes display elements not found');
        return;
    }
    
    if (state.changes.length === 0) {
        changesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64" color="currentColor" fill="none">
                        <path d="M20 22H6C4.89543 22 4 21.1046 4 20M4 20C4 18.8954 4.89543 18 6 18H20V6C20 4.11438 20 3.17157 19.4142 2.58579C18.8284 2 17.8856 2 16 2H10C7.17157 2 5.75736 2 4.87868 2.87868C4 3.75736 4 5.17157 4 8V20Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M19.5 18C19.5 18 18.5 18.7628 18.5 20C18.5 21.2372 19.5 22 19.5 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        <path d="M9 10C9 10 11.2095 13 12 13C12.7906 13 15 10 15 10M12 12.5V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </div>
                <div class="empty-text">No changes detected</div>
                <div class="empty-hint">Initialize a project to start tracking changes</div>
            </div>
        `;
        changesCount.textContent = '0';
    } else {
        changesList.innerHTML = '';
        state.changes.forEach(function(change, index) {
            var item = createChangeItem(change, index);
            changesList.appendChild(item);
        });
        changesCount.textContent = state.changes.length.toString();
    }
}

// Create change item element
function createChangeItem(change, index) {
    var item = document.createElement('div');
    item.className = 'change-item';
    item.dataset.index = index;
    
    var icon = getChangeIcon(change.status);
    var status = change.status || 'modified';
    
    item.innerHTML = `
        <span class="change-icon">${icon}</span>
        <span class="change-label" title="${escapeHtml(change.path)}">${escapeHtml(change.name || change.path)}</span>
        <span class="change-status">${status}</span>
    `;
    
    item.addEventListener('click', function() {
        // Handle change item click
        console.log('Change clicked:', change);
    });
    
    return item;
}

// Get icon for change status
function getChangeIcon(status) {
    switch(status) {
        case 'added':
        case 'new':
            return '🆕';
        case 'deleted':
        case 'removed':
            return '🗑️';
        case 'modified':
        case 'changed':
            return '📝';
        case 'renamed':
            return '↪️';
        default:
            return '📄';
    }
}

// Update changes from command output
function updateChanges(changes) {
    state.changes = changes || [];
    updateChangesDisplay();
}

// Refresh changes
function refreshChanges() {
    // Execute 'vervids status' or similar command
    executeVervidsCommand('vervids status');
}

// Command history management
function saveCommandHistory() {
    try {
        localStorage.setItem('vervids_command_history', JSON.stringify(state.commandHistory));
        updateCommandHistoryDisplay();
    } catch (e) {
        console.error('Failed to save command history:', e);
    }
}

function loadCommandHistory() {
    try {
        var saved = localStorage.getItem('vervids_command_history');
        if (saved) {
            state.commandHistory = JSON.parse(saved);
            updateCommandHistoryDisplay();
        }
    } catch (e) {
        console.error('Failed to load command history:', e);
    }
}

function updateCommandHistoryDisplay() {
    if (!commandHistory || !commandInput) {
        console.error('Command history elements not found');
        return;
    }
    
    commandHistory.innerHTML = '';
    state.commandHistory.forEach(function(cmd) {
        var item = document.createElement('div');
        item.className = 'history-item';
        // Show command without "vervids" prefix for cleaner display
        var displayCmd = cmd.startsWith('vervids ') ? cmd.substring(8) : cmd;
        item.textContent = displayCmd;
        item.addEventListener('click', function() {
            // Store the full command but show without prefix
            commandInput.value = displayCmd;
            state.currentInput = displayCmd;
            commandInput.focus();
            commandHistory.classList.remove('visible');
        });
        commandHistory.appendChild(item);
    });
}

// Utility functions
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Sample changes for demo (remove in production)
function loadSampleChanges() {
    state.changes = [
        { name: 'project.aepx', path: '/Users/john/Projects/project.aepx', status: 'modified' },
        { name: 'assets/image1.jpg', path: '/Users/john/Projects/assets/image1.jpg', status: 'added' },
        { name: 'assets/audio.mp3', path: '/Users/john/Projects/assets/audio.mp3', status: 'modified' }
    ];
    updateChangesDisplay();
}

// Uncomment to load sample changes for testing
// loadSampleChanges();

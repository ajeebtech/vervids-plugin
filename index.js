// Create an instance of CSInterface.
var csInterface = new CSInterface();

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
    testServerConnection();
    autoInitialize();
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
        outputContent.innerHTML = '<div class="output-line info">$ ' + escapeHtml(displayCommand) + '</div>';
    }
    
    // Execute command via Node.js server
    executeVervidsCommand(fullCommand);
}

// Auto-initialize vervids when extension opens
function autoInitialize() {
    // Wait a bit for server connection to establish
    setTimeout(function() {
        appendOutput('Running vervids...', 'info');
        executeVervidsCommand('vervids');
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
            appendOutput('To start the server manually:', 'info');
            appendOutput('1. Open Terminal', 'info');
            appendOutput('2. Run: cd "/Library/Application Support/Adobe/CEP/extensions/vervids"', 'info');
            appendOutput('3. Run: node server/main.js', 'info');
            appendOutput('', 'info'); // blank line
            appendOutput('Or use npm: npm start', 'info');
            appendOutput('', 'info'); // blank line
            appendOutput('The server should start automatically, but if it doesn\'t, start it manually.', 'info');
        });
    }, 500); // Wait 500ms for server to be ready
}

// Execute vervids command via terminal
function executeVervidsCommand(command) {
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
        if (response.success) {
            if (response.output) {
                // Check if it's the empty output message
                if (response.output.includes('(Command executed successfully but produced no output)')) {
                    appendOutput(response.output, 'info');
                    appendOutput('This is normal if the command completed without output.', 'info');
                } else {
                    appendOutput(response.output, 'success');
                }
                
                // Also show stderr if it exists and is different from stdout
                if (response.stderr && response.stderr !== response.stdout && response.stderr.trim()) {
                    appendOutput('--- stderr ---', 'info');
                    appendOutput(response.stderr, 'error');
                }
            } else {
                appendOutput('Command executed successfully (no output)', 'success');
            }
            if (response.changes) {
                updateChanges(response.changes);
            }
        } else {
            appendOutput('Command failed: ' + (response.error || 'Unknown error'), 'error');
            if (response.code) {
                appendOutput('Exit code: ' + response.code, 'error');
            }
            if (response.output) {
                appendOutput(response.output, 'error');
            }
        }
    })
    .catch(function(error) {
        console.error('Request error:', error);
        var errorMsg = 'Connection error: ';
        
        if (error.message === 'Request timeout') {
            errorMsg += 'Request timed out';
        } else if (error.status) {
            errorMsg += 'HTTP ' + error.status + ': ' + (error.message || 'Unknown error');
            if (error.responseText) {
                try {
                    var errorResponse = JSON.parse(error.responseText);
                    if (errorResponse.error) {
                        errorMsg += ' - ' + errorResponse.error;
                    }
                } catch (e) {
                    // Not JSON, ignore
                }
            }
        } else {
            errorMsg += error.message || 'Cannot connect to server. Make sure the server is running.';
        }
        
        appendOutput(errorMsg, 'error');
        appendOutput('Start the server with: node server/main.js', 'info');
    });
}

// Append output to output panel
function appendOutput(text, type) {
    if (!outputContent) {
        console.error('Output content element not found');
        return;
    }
    
    var line = document.createElement('div');
    line.className = 'output-line ' + (type || '');
    line.textContent = text;
    outputContent.appendChild(line);
    outputContent.scrollTop = outputContent.scrollHeight;
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
                <div class="empty-icon">📝</div>
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

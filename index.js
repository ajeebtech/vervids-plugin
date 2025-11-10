// Create an instance of CSInterface.
var csInterface = new CSInterface();

// Wait for jQuery to be available
function waitForJQuery(callback) {
    if (window.jQuery) {
        callback();
    } else {
        setTimeout(function() {
            waitForJQuery(callback);
        }, 100);
    }
}

// State management
var state = {
    changes: [],
    commandHistory: [],
    currentOutput: null,
    historyIndex: -1,
    currentInput: ''
};

// DOM Elements
var changesList = document.getElementById('changes-list');
var changesCount = document.getElementById('changes-count');
var commandInput = document.getElementById('command-input');
var executeButton = document.getElementById('execute-button');
var commandHistory = document.getElementById('command-history');
var outputPanel = document.getElementById('output-panel');
var outputContent = document.getElementById('output-content');
var closeOutputButton = document.getElementById('close-output');
var refreshButton = document.getElementById('refresh-button');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    waitForJQuery(function() {
        setupEventListeners();
        loadCommandHistory();
        updateChangesDisplay();
        testServerConnection();
        autoInitialize();
    });
});

// Event Listeners
function setupEventListeners() {
    // Execute command on button click
    executeButton.addEventListener('click', executeCommand);
    
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
        if (state.commandHistory.length > 0) {
            commandHistory.classList.add('visible');
        }
        state.currentInput = commandInput.value;
    });
    
    // Hide history on blur (with delay to allow clicks)
    commandInput.addEventListener('blur', function() {
        setTimeout(function() {
            commandHistory.classList.remove('visible');
        }, 200);
    });
    
    // Close output panel
    closeOutputButton.addEventListener('click', function() {
        outputPanel.style.display = 'none';
    });
    
    // Refresh changes
    refreshButton.addEventListener('click', function() {
        refreshChanges();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to execute
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            executeCommand();
        }
        
        // Escape to close output
        if (e.key === 'Escape') {
            outputPanel.style.display = 'none';
            commandInput.focus();
        }
    });
}

// Navigate command history
function navigateHistory(direction) {
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

// Execute vervids command
function executeCommand() {
    var command = commandInput.value.trim();
    
    if (!command) {
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
    outputPanel.style.display = 'flex';
    
    // Display command (show what user typed, but execute full command)
    var displayCommand = command.startsWith('vervids') ? command : 'vervids ' + command;
    outputContent.innerHTML = '<div class="output-line info">$ ' + escapeHtml(displayCommand) + '</div>';
    
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
    if (!window.jQuery) {
        console.error('jQuery not loaded');
        return;
    }
    
    // Show output panel for connection status
    outputPanel.style.display = 'flex';
    outputContent.innerHTML = '<div class="output-line info">Checking server connection...</div>';
    
    $.ajax({
        type: "GET",
        url: "http://localhost:3002/test",
        timeout: 2000,
        success: function(response) {
            console.log('Server connection successful');
            appendOutput('✓ Server connected', 'success');
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('Server connection failed:', textStatus, errorThrown);
            appendOutput('✗ Server connection failed', 'error');
            appendOutput('Please start the server: node server/main.js', 'info');
            appendOutput('Navigate to the extension directory and run: cd server && node main.js', 'info');
        }
    });
}

// Execute vervids command via terminal
function executeVervidsCommand(command) {
    if (!window.jQuery) {
        appendOutput('Error: jQuery not loaded', 'error');
        return;
    }
    
    // Show loading state
    appendOutput('Executing command...', 'info');
    
    // Use the local server to execute commands
    $.ajax({
        type: "POST",
        url: "http://localhost:3002/execute",
        contentType: "application/json",
        data: JSON.stringify({ command: command }),
        timeout: 300000, // 5 minute timeout
        success: function(response) {
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
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('AJAX error:', jqXHR, textStatus, errorThrown);
            var errorMsg = 'Connection error: ';
            
            if (textStatus === 'timeout') {
                errorMsg += 'Request timed out';
            } else if (textStatus === 'error') {
                if (jqXHR.status === 0) {
                    errorMsg += 'Cannot connect to server. Make sure the server is running.';
                } else {
                    errorMsg += 'HTTP ' + jqXHR.status + ': ' + errorThrown;
                }
            } else {
                errorMsg += textStatus + ': ' + errorThrown;
            }
            
            appendOutput(errorMsg, 'error');
            appendOutput('Start the server with: node server/main.js', 'info');
            
            // Try to show response text if available
            if (jqXHR.responseText) {
                try {
                    var errorResponse = JSON.parse(jqXHR.responseText);
                    if (errorResponse.error) {
                        appendOutput('Server error: ' + errorResponse.error, 'error');
                    }
                } catch (e) {
                    appendOutput('Response: ' + jqXHR.responseText.substring(0, 200), 'error');
                }
            }
        }
    });
}

// Append output to output panel
function appendOutput(text, type) {
    var line = document.createElement('div');
    line.className = 'output-line ' + (type || '');
    line.textContent = text;
    outputContent.appendChild(line);
    outputContent.scrollTop = outputContent.scrollHeight;
}

// Update changes display
function updateChangesDisplay() {
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

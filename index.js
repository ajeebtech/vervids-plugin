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
    console.log('Checking if server is running...');
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
var commitMessageInput;
var commitButton;
var commitSyncButton;
var outputPanel;
var outputContent;
var closeOutputButton;
var refreshButton;

// Initialize DOM elements
function initializeDOMElements() {
    changesList = document.getElementById('changes-list');
    changesCount = document.getElementById('changes-count');
    commitMessageInput = document.getElementById('commit-message-input');
    commitButton = document.getElementById('commit-button');
    commitSyncButton = document.getElementById('commit-sync-button');
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
    if (!commitMessageInput || !commitButton) {
        console.error('Critical DOM elements not found!');
        console.error('commitMessageInput:', commitMessageInput);
        console.error('commitButton:', commitButton);
        return;
    }
    
    console.log('DOM elements initialized successfully');
    console.log('commitMessageInput:', commitMessageInput);
    console.log('commitButton:', commitButton);
    
    // Setup immediately - no need to wait for jQuery
    console.log('Setting up extension...');
    setupEventListeners();
    
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
    if (!commitMessageInput) {
        console.error('Cannot setup event listeners: DOM elements not found');
        console.error('commitMessageInput:', commitMessageInput);
        return;
    }
    
    console.log('Setting up event listeners...');
    
    // Commit & Sync button click
    if (commitSyncButton) {
        commitSyncButton.addEventListener('click', function(e) {
            console.log('Commit & Sync button clicked!');
            e.preventDefault();
            e.stopPropagation();
            commitChanges();
        });
    }
    
    // Auto-resize textarea to fit content (like Cursor's input)
    function autoResizeTextarea() {
        if (commitMessageInput) {
            commitMessageInput.style.height = 'auto';
            var newHeight = Math.min(commitMessageInput.scrollHeight, 120); // Max 120px
            commitMessageInput.style.height = newHeight + 'px';
        }
    }
    
    // Auto-resize on input
    if (commitMessageInput) {
        commitMessageInput.addEventListener('input', autoResizeTextarea);
        // Initial resize
        autoResizeTextarea();
    }
    
    // Commit on Enter key (but allow Shift+Enter for new line)
    commitMessageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitChanges();
        }
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
            console.log('Refresh button clicked!');
            // Add visual feedback - rotate the refresh icon
            if (refreshButton) {
                refreshButton.style.transform = 'rotate(360deg)';
                setTimeout(function() {
                    if (refreshButton) {
                        refreshButton.style.transform = 'rotate(0deg)';
                    }
                }, 500);
            }
            refreshCommitGraph();
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + Enter to commit
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            commitChanges();
        }
        
        // Escape to close output
        if (e.key === 'Escape') {
            if (outputPanel) {
                outputPanel.style.display = 'none';
            }
            if (commitMessageInput) {
                commitMessageInput.focus();
            }
        }
    });
}

// Commit changes with message
function commitChanges() {
    console.log('commitChanges() called');
    
    if (!commitMessageInput) {
        console.error('Commit message input element not found');
        return;
    }
    
    var message = commitMessageInput.value.trim();
    console.log('Commit message:', message);
    
    if (!message) {
        console.log('No commit message entered');
        // Don't show output panel - just log to console
        console.error('Please enter a commit message');
        return;
    }
    
    // Clear input first and reset height
    commitMessageInput.value = '';
    if (commitMessageInput.style) {
        commitMessageInput.style.height = 'auto';
    }
    
    // Don't show output panel - keep it hidden
    if (outputContent) {
        outputContent.innerHTML = '<div class="output-line info">Committing changes...</div>';
    }
    appendOutput('Getting current project file...', 'info');
    
    // Get project file path and export as .aepx
    var script = 'getProjectFilePath()';
    csInterface.evalScript(script, function(result) {
        if (result && result !== 'null' && !result.startsWith('Error')) {
            var projectPath = result;
            if (projectPath.indexOf('/users/') === 0) {
                projectPath = '/Users' + projectPath.substring(6);
            }
            appendOutput('Found project: ' + projectPath, 'success');
            
            // Escape message for shell (wrap in quotes)
            var escapedMessage = message.replace(/"/g, '\\"');
            var commitCommand = 'vervids commit "' + escapedMessage + '" ' + projectPath;
            appendOutput('Executing: ' + commitCommand, 'info');
            
            // Execute commit command
            executeVervidsCommand(commitCommand, function(response) {
                if (response && response.success) {
                    appendOutput('✓ Commit successful!', 'success');
                    // Refresh commit graph to show new commit
                    setTimeout(function() {
                        refreshCommitGraph();
                    }, 500);
                } else {
                    appendOutput('✗ Commit failed', 'error');
                    if (response && response.error) {
                        appendOutput('Error: ' + response.error, 'error');
                    }
                }
            });
        } else if (result === 'null') {
            appendOutput('Error: Project is not saved yet.', 'error');
            appendOutput('Please save your After Effects project first (File → Save or Save As).', 'info');
        } else {
            appendOutput('Error getting project path: ' + result, 'error');
        }
    });
}


// Parse vervids list output to extract all projects with their names and numbers
function parseProjectList(output) {
    try {
        var lines = output.split('\n');
        var projects = [];
        var currentProject = null;
        
        // Parse all project lines (format: "  02  sloppy" or "→ 02  sloppy")
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            
            // Match lines with project number and name (with or without arrow)
            // Format: "→ 02  sloppy" or "  02  sloppy" or "02  sloppy"
            var match = line.match(/→?\s*(\d+)\s+(.+)/);
            if (match) {
                var projectNumber = parseInt(match[1], 10);
                var projectName = match[2].trim();
                
                projects.push({
                    number: projectNumber,
                    name: projectName
                });
                
                // If this line has the arrow, mark it as current
                if (line.indexOf('→') !== -1) {
                    currentProject = projectNumber;
                }
            }
        }
        
        return {
            projects: projects,
            currentProject: currentProject
        };
    } catch (e) {
        console.error('Error parsing project list:', e);
        return {
            projects: [],
            currentProject: null
        };
    }
}

// Find project by name in the project list
function findProjectByName(projectList, projectName) {
    if (!projectList || !projectList.projects || !projectName) {
        return null;
    }
    
    // Normalize project name (remove extension, lowercase for comparison)
    var normalizedName = projectName.toLowerCase().replace(/\.(aep|aepx)$/i, '').trim();
    
    // Try exact match first
    for (var i = 0; i < projectList.projects.length; i++) {
        var project = projectList.projects[i];
        var normalizedProjectName = project.name.toLowerCase().trim();
        
        // Exact match
        if (normalizedProjectName === normalizedName) {
            return project.number;
        }
        
        // Match if project name contains the file name or vice versa
        if (normalizedProjectName.indexOf(normalizedName) !== -1 || 
            normalizedName.indexOf(normalizedProjectName) !== -1) {
            return project.number;
        }
    }
    
    return null;
}

// Parse vervids list <number> output to extract commit data
function parseCommitList(output) {
    try {
        var commits = [];
        var lines = output.split('\n');
        var inTable = false;
        var projectName = null;
        var commitCount = 0;
        
        // Extract project name
        var projectMatch = output.match(/Project:\s*(.+?)\n/);
        if (projectMatch) {
            projectName = projectMatch[1].trim();
        }
        
        // Extract commit count
        var countMatch = output.match(/Commits:\s*(\d+)/);
        if (countMatch) {
            commitCount = parseInt(countMatch[1], 10);
        }
        
        // Find the table header and parse rows
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            
            // Detect table start (header with #, Time, Size, etc.)
            if (line.indexOf('#') !== -1 && line.indexOf('Time') !== -1 && line.indexOf('Message') !== -1) {
                inTable = true;
                continue;
            }
            
            // Skip separator lines (--  ---)
            if (inTable && line.match(/^--\s+--/)) {
                continue;
            }
            
            // Parse commit rows (format: "00  2025-11-11 18:38:33     0.22       4  Initial version")
            if (inTable && line.match(/^\d{2}\s+\d{4}-\d{2}-\d{2}/)) {
                var parts = line.split(/\s{2,}/);
                if (parts.length >= 4) {
                    var commit = {
                        index: parts[0].trim(),
                        time: parts[1].trim() + ' ' + (parts[2] || '').trim(),
                        size: parts[3] ? parts[3].trim() : '',
                        assets: parts[4] ? parts[4].trim() : '',
                        message: parts.slice(5).join(' ').trim() || parts[4] || ''
                    };
                    commits.push(commit);
                }
            }
        }
        
        return {
            projectName: projectName,
            commitCount: commitCount,
            commits: commits
        };
    } catch (e) {
        console.error('Error parsing commit list:', e);
        return {
            projectName: null,
            commitCount: 0,
            commits: []
        };
    }
}

// Render commit graph in the changes panel
function renderCommitGraph(commitData) {
    var changesList = document.getElementById('changes-list');
    if (!changesList) return;
    
    if (!commitData || commitData.commits.length === 0) {
        // Show empty state with project name if available
        var emptyText = 'No commits found';
        var emptyHint = 'Initialize a project to start tracking commits';
        
        if (commitData && commitData.projectName) {
            emptyText = 'No commits found for "' + escapeHtml(commitData.projectName) + '"';
            emptyHint = 'Make your first commit to start tracking changes';
        }
        
        changesList.innerHTML = '<div class="empty-state">' +
            '<div class="empty-icon">' +
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64" color="currentColor" fill="none">' +
            '<path d="M20 22H6C4.89543 22 4 21.1046 4 20M4 20C4 18.8954 4.89543 18 6 18H20V6C20 4.11438 20 3.17157 19.4142 2.58579C18.8284 2 17.8856 2 16 2H10C7.17157 2 5.75736 2 4.87868 2.87868C4 3.75736 4 5.17157 4 8V20Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />' +
            '<path d="M19.5 18C19.5 18 18.5 18.7628 18.5 20C18.5 21.2372 19.5 22 19.5 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />' +
            '<path d="M9 10C9 10 11.2095 13 12 13C12.7906 13 15 10 15 10M12 12.5V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />' +
            '</svg></div>' +
            '<div class="empty-text">' + emptyText + '</div>' +
            '<div class="empty-hint">' + emptyHint + '</div>' +
            '</div>';
        
        // Update badge to 0
        var changesCount = document.getElementById('changes-count');
        if (changesCount) {
            changesCount.textContent = '0';
        }
        
        return;
    }
    
    // Update badge
    var changesCount = document.getElementById('changes-count');
    if (changesCount) {
        changesCount.textContent = commitData.commitCount || commitData.commits.length;
    }
    
    // Build commit graph HTML
    var html = '<div class="commit-graph">';
    
    // Show project name if available
    if (commitData.projectName) {
        html += '<div class="commit-project-header">' + escapeHtml(commitData.projectName) + '</div>';
    }
    
    // Render commits in reverse order (newest first)
    var reversedCommits = commitData.commits.slice().reverse();
    for (var i = 0; i < reversedCommits.length; i++) {
        var commit = reversedCommits[i];
        var isLatest = i === 0;
        
        html += '<div class="commit-item' + (isLatest ? ' commit-latest' : '') + '">';
        
        // Commit node (circle)
        html += '<div class="commit-node-wrapper">';
        html += '<div class="commit-node' + (isLatest ? ' commit-node-latest' : '') + '"></div>';
        if (i < reversedCommits.length - 1) {
            html += '<div class="commit-line"></div>';
        }
        html += '</div>';
        
        // Commit content
        html += '<div class="commit-content">';
        html += '<div class="commit-message">' + escapeHtml(commit.message || 'No message') + '</div>';
        html += '<div class="commit-meta">';
        if (commit.time) {
            html += '<span class="commit-time">' + escapeHtml(commit.time) + '</span>';
        }
        if (commit.size) {
            html += '<span class="commit-size">' + escapeHtml(commit.size) + ' MB</span>';
        }
        if (commit.assets) {
            html += '<span class="commit-assets">' + escapeHtml(commit.assets) + ' assets</span>';
        }
        html += '</div>';
        html += '</div>';
        
        html += '</div>';
    }
    
    html += '</div>';
    changesList.innerHTML = html;
}

// Refresh commit graph - automatically detect project from current .aep file
function refreshCommitGraph() {
    try {
        console.log('=== refreshCommitGraph() called ===');
        
        // Show loading state
        var changesList = document.getElementById('changes-list');
        if (changesList) {
            changesList.innerHTML = '<div class="empty-state"><div class="empty-text">Loading...</div></div>';
        } else {
            console.error('❌ changes-list element not found!');
            return;
        }
        
        // First, get the current project file path from After Effects
        var script = 'getProjectFilePath()';
        console.log('Calling After Effects script:', script);
        csInterface.evalScript(script, function(result) {
            try {
                console.log('getProjectFilePath() result:', result);
        var projectPath = null;
        var projectName = null;
        
        if (result && result !== 'null' && !result.startsWith('Error')) {
            projectPath = result;
            // Extract project name from path (filename without extension)
            var pathParts = projectPath.split(/[/\\]/);
            var fileName = pathParts[pathParts.length - 1];
            projectName = fileName.replace(/\.(aep|aepx)$/i, '');
            console.log('Current project file:', projectPath);
            console.log('Extracted project name:', projectName);
        } else {
            console.log('Project not saved yet or error getting path:', result);
            // Still try to get projects from vervids list even if project not saved
        }
        
                // Get vervids list to find matching project
                console.log('Executing: vervids list');
                executeVervidsCommand('vervids list', function(response) {
                    try {
                        console.log('vervids list response:', response);
                        
                        if (response && response.success) {
                            var output = response.stdout || response.output || '';
                            console.log('vervids list output:', output);
                            console.log('Output length:', output.length);
                            
                            var projectList = parseProjectList(output);
                            console.log('Parsed project list:', projectList);
                            console.log('Found', projectList.projects.length, 'projects');
                            console.log('Current project (arrow):', projectList.currentProject);
                            
                            var projectNumber = null;
                            
                            // PRIORITY 1: Use arrow-marked current project (most reliable)
                            if (projectList.currentProject !== null) {
                                projectNumber = projectList.currentProject;
                                console.log('✓ Using arrow-marked current project:', projectNumber);
                            }
                            
                            // PRIORITY 2: Try to match by project name if no arrow-marked project
                            if (projectNumber === null && projectName) {
                                projectNumber = findProjectByName(projectList, projectName);
                                if (projectNumber !== null) {
                                    console.log('✓ Found project by name:', projectName, '→ Project #', projectNumber);
                                } else {
                                    console.log('✗ No match found for project name:', projectName);
                                    console.log('Available projects:', projectList.projects.map(function(p) { return p.name; }));
                                }
                            }
                            
                            // PRIORITY 3: Use first project if nothing else works
                            if (projectNumber === null && projectList.projects.length > 0) {
                                projectNumber = projectList.projects[0].number;
                                console.log('⚠ Using first available project:', projectNumber);
                            }
                            
                            // If we found a project, show its commits
                            if (projectNumber !== null) {
                                console.log('Fetching commits for project #', projectNumber);
                                var listCommand = 'vervids list ' + projectNumber;
                                console.log('Executing command:', listCommand);
                                executeVervidsCommand(listCommand, function(commitResponse) {
                                    console.log('vervids list ' + projectNumber + ' response:', commitResponse);
                                    console.log('Response success:', commitResponse ? commitResponse.success : 'null');
                                    console.log('Response stdout:', commitResponse ? commitResponse.stdout : 'null');
                                    console.log('Response output:', commitResponse ? commitResponse.output : 'null');
                                    console.log('Response error:', commitResponse ? commitResponse.error : 'null');
                                    
                                    if (commitResponse && commitResponse.success) {
                                        var commitOutput = commitResponse.stdout || commitResponse.output || '';
                                        console.log('Commit output length:', commitOutput.length);
                                        console.log('Commit output (first 500 chars):', commitOutput.substring(0, 500));
                                        var commitData = parseCommitList(commitOutput);
                                        console.log('Parsed commit data:', commitData);
                                        console.log('Found', commitData.commits.length, 'commits');
                                        if (commitData.commits.length > 0) {
                                            console.log('First commit:', commitData.commits[0]);
                                        }
                                        renderCommitGraph(commitData);
                                    } else {
                                        console.error('❌ Failed to get commits!');
                                        console.error('Response:', commitResponse);
                                        if (commitResponse && commitResponse.error) {
                                            console.error('Error:', commitResponse.error);
                                        }
                                        // Show empty state
                                        renderCommitGraph({ projectName: projectName, commitCount: 0, commits: [] });
                                    }
                                }, true); // silent = true
                            } else {
                                console.error('❌ No project found!');
                                console.log('Project name was:', projectName);
                                console.log('Available projects:', projectList.projects);
                                console.log('Current project (arrow):', projectList.currentProject);
                                // Show empty state with project name if available
                                renderCommitGraph({ 
                                    projectName: projectName || 'Unknown Project', 
                                    commitCount: 0, 
                                    commits: [] 
                                });
                            }
                        } else {
                            console.error('Failed to get project list:', response);
                            if (response && response.error) {
                                console.error('Error:', response.error);
                            }
                            if (response && response.output) {
                                console.error('Output:', response.output);
                            }
                            // Show empty state
                            renderCommitGraph({ 
                                projectName: projectName || 'Unknown Project', 
                                commitCount: 0, 
                                commits: [] 
                            });
                        }
                    } catch (innerError) {
                        console.error('❌ Error in vervids list callback:', innerError);
                        renderCommitGraph({ 
                            projectName: projectName || 'Unknown Project', 
                            commitCount: 0, 
                            commits: [] 
                        });
                    }
                }, true); // silent = true
            } catch (evalError) {
                console.error('❌ Error in evalScript callback:', evalError);
                renderCommitGraph({ 
                    projectName: 'Unknown Project', 
                    commitCount: 0, 
                    commits: [] 
                });
            }
        });
    } catch (error) {
        console.error('❌ Error in refreshCommitGraph:', error);
        console.error('Error stack:', error.stack);
    }
}

// Auto-initialize vervids when extension opens
function autoInitialize() {
    console.log('autoInitialize() called');
    // Wait a bit for server connection to establish
    setTimeout(function() {
        console.log('Calling refreshCommitGraph() from autoInitialize');
        refreshCommitGraph();
    }, 1500);
}

// Test server connection
function testServerConnection() {
    // Wait a bit for server to be ready if it just started
    setTimeout(function() {
        // Don't show output panel - keep hidden for normal use
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
// callback: optional function(response) called after command completes
// silent: if true, don't show output panel or append output
function executeVervidsCommand(command, callback, silent) {
    silent = silent || false;
    
    // Don't show output panel automatically - keep it hidden
    // Show loading state (unless silent)
    if (!silent) {
        appendOutput('Executing command...', 'info');
    }
    
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
        
        // Don't show output panel automatically - keep it hidden
        
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
                        // Show all lines, including empty ones for formatting (unless silent)
                        if (!silent) {
                            if (index < stdoutLines.length - 1 || line.length > 0) {
                                appendOutput(line || ' ', 'success');
                                hasOutput = true;
                            }
                        } else {
                            hasOutput = true;
                        }
                    });
                } else if (response.stdout.length > 0) {
                    // Empty string but not null/undefined
                    if (!silent) {
                        appendOutput(' ', 'success');
                    }
                    hasOutput = true;
                }
            }
            
            // Then check stderr (might contain output if stdout is empty)
            if (response.stderr !== undefined && response.stderr !== null && response.stderr !== response.stdout) {
                if (response.stderr.trim()) {
                    if (!silent) {
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
                    } else {
                        hasOutput = true;
                    }
                }
            }
            
            // Fallback: check combined output field
            console.log('Checking combined output field, hasOutput:', hasOutput, 'response.output:', JSON.stringify(response.output));
            if (!hasOutput && response.output && response.output !== '(Command executed successfully but produced no output)') {
                console.log('Output field exists and is not empty message, checking trim...');
                if (response.output.trim()) {
                    console.log('Output field has content after trim, displaying...');
                    if (!silent) {
                        var outputLines = response.output.split('\n');
                        outputLines.forEach(function(line, index) {
                            if (index < outputLines.length - 1 || line.length > 0) {
                                appendOutput(line || ' ', 'success');
                                hasOutput = true;
                            }
                        });
                    } else {
                        hasOutput = true;
                    }
                }
            }
            
            // If still no output, show the empty message (unless silent)
            console.log('Final check - hasOutput:', hasOutput);
            if (!hasOutput && !silent) {
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
            
            // Call callback if provided
            if (callback && typeof callback === 'function') {
                callback(response);
            }
        } else {
            if (!silent) {
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
            
            // Call callback even on error
            if (callback && typeof callback === 'function') {
                callback(response);
            }
        }
    })
    .catch(function(error) {
        console.error('Request error:', error);
        console.error('Error status:', error.status);
        console.error('Error responseText:', error.responseText);
        
        // Don't show output panel automatically - keep it hidden
        
        var errorMsg = 'Connection error: ';
        
        if (error.message === 'Request timeout') {
            errorMsg += 'Request timed out';
            if (!silent) {
                appendOutput(errorMsg, 'error');
            }
        } else if (error.status) {
            // Try to parse error response from server
            if (error.responseText) {
                try {
                    var errorResponse = JSON.parse(error.responseText);
                    console.log('Parsed error response:', errorResponse);
                    
                    // If it's a 500 error with command execution details, show them
                    if (error.status === 500 && errorResponse.success === false) {
                        if (!silent) {
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
                        }
                        // Call callback with error response
                        if (callback && typeof callback === 'function') {
                            callback(errorResponse);
                        }
                    } else {
                        errorMsg += 'HTTP ' + error.status + ': ' + (errorResponse.error || error.message || 'Unknown error');
                        if (!silent) {
                            appendOutput(errorMsg, 'error');
                        }
                        // Call callback with error
                        if (callback && typeof callback === 'function') {
                            callback({ success: false, error: errorMsg });
                        }
                    }
                } catch (e) {
                    // Not JSON, show raw error
                    errorMsg += 'HTTP ' + error.status + ': ' + (error.message || 'Unknown error');
                    if (!silent) {
                        appendOutput(errorMsg, 'error');
                        appendOutput('Response: ' + error.responseText.substring(0, 200), 'error');
                    }
                    // Call callback with error
                    if (callback && typeof callback === 'function') {
                        callback({ success: false, error: errorMsg });
                    }
                }
            } else {
                errorMsg += 'HTTP ' + error.status + ': ' + (error.message || 'Unknown error');
                if (!silent) {
                    appendOutput(errorMsg, 'error');
                }
                // Call callback with error
                if (callback && typeof callback === 'function') {
                    callback({ success: false, error: errorMsg });
                }
            }
        } else {
            errorMsg += error.message || 'Cannot connect to server. Make sure the server is running.';
            if (!silent) {
                appendOutput(errorMsg, 'error');
                appendOutput('Start the server with: node server/main.js', 'info');
            }
            // Call callback with error
            if (callback && typeof callback === 'function') {
                callback({ success: false, error: errorMsg });
            }
        }
    });
}

// Append output to output panel (hidden by default, for debugging only)
function appendOutput(text, type) {
    if (!outputContent) {
        console.error('Output content element not found');
        return;
    }
    
    // Don't show the panel automatically - keep it hidden for normal use
    // Panel can be manually opened for debugging if needed
    
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

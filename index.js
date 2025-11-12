// Vervids Plugin - Simple & Working
var csInterface = new CSInterface();

// Configuration
var API_BASE = 'http://localhost:8080';
var API_AVAILABLE = false;
var vervidsServeProcess = null;
var loadCommitsRetryCount = 0;
var MAX_RETRIES = 5;

// DOM Elements
var commitsList;
var commitCount;
var commitInput;
var commitButton;
var refreshButton;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('Plugin loading...');
    
    // Get DOM elements
    commitsList = document.getElementById('commits-list');
    commitCount = document.getElementById('commit-count');
    commitInput = document.getElementById('commit-input');
    commitButton = document.getElementById('commit-button');
    refreshButton = document.getElementById('refresh-button');
    
    // Setup event listeners
    if (refreshButton) {
        refreshButton.addEventListener('click', loadCommits);
    }
    
    if (commitButton && commitInput) {
        commitButton.addEventListener('click', function() {
            var message = commitInput.value.trim();
            if (message) {
                commitChanges(message);
            }
        });
        
        commitInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                var message = commitInput.value.trim();
                if (message) {
                    commitChanges(message);
                }
            }
        });
    }
    
    // Start vervids serve and check API
    startVervidsServe().then(function() {
        // Wait a moment for server to start, then check API
        setTimeout(function() {
            checkAPI().then(function() {
                loadCommits();
            });
        }, 2000);
    });
});

// Start vervids serve automatically (in background) - only if not already running
function startVervidsServe() {
    console.log('Checking if vervids serve is running...');
    
    // First check if API is already running
    return fetch(API_BASE + '/health')
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                console.log('✓ vervids serve already running');
                return true;
            }
            // API not running, start it
            throw new Error('Not running');
        })
        .catch(function() {
            console.log('Starting vervids serve...');
            
            // Start local server first if needed
            return startLocalServer().then(function() {
                // Just execute the command - don't overthink it
                return fetch('http://localhost:3002/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        command: 'vervids serve'
                    })
                })
                .then(function(response) {
                    return response.json();
                })
                .then(function(result) {
                    console.log('✓ Command sent: vervids serve');
                    // Just return true - the server will start in background
                    // Don't wait around checking if it worked
                    return true;
                })
                .catch(function(error) {
                    console.log('Error sending command:', error.message);
                    return false;
                });
            });
        });
}

// Start local server (for executing commands)
function startLocalServer() {
    return new Promise(function(resolve) {
        // Check if server is already running
        fetch('http://localhost:3002/test')
            .then(function() {
                console.log('Local server already running');
                resolve(true);
            })
            .catch(function() {
                // Try to start server using cep_node
                if (typeof cep_node !== 'undefined' && cep_node.require) {
                    try {
                        // Get extension path - use SystemPath constant
                        var extensionPath;
                        try {
                            // Use the SystemPath constant properly
                            if (typeof SystemPath !== 'undefined' && SystemPath.EXTENSION) {
                                extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
                            } else {
                                // Fallback: use window location
                                extensionPath = window.location.href.replace(/\/index\.html.*$/, '');
                                extensionPath = extensionPath.replace(/^file:\/\//, '');
                            }
                        } catch (e) {
                            // Fallback: use window location
                            extensionPath = window.location.href.replace(/\/index\.html.*$/, '');
                            extensionPath = extensionPath.replace(/^file:\/\//, '');
                        }
                        
                        // Clean up the path
                        extensionPath = extensionPath.replace(/^file:\/\//, '');
                        extensionPath = decodeURIComponent(extensionPath);
                        
                        // Remove trailing slash if present
                        if (extensionPath.endsWith('/')) {
                            extensionPath = extensionPath.slice(0, -1);
                        }
                        
                        var serverPath = extensionPath + '/server/main.js';
                        console.log('Attempting to load server from:', serverPath);
                        console.log('Extension path:', extensionPath);
                        
                        cep_node.require(serverPath);
                        console.log('Local server started');
                        setTimeout(resolve, 1000);
                    } catch (e) {
                        console.error('Could not start local server:', e.message);
                        console.error('Error details:', e);
                        resolve(false);
                    }
                } else {
                    console.log('cep_node not available');
                    resolve(false);
                }
            });
    });
}

// Check if API is available
function checkAPI() {
    return fetch(API_BASE + '/health')
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                API_AVAILABLE = true;
                console.log('✓ API available');
                return true;
            }
            return false;
        })
        .catch(function(error) {
            console.log('API not available:', error.message);
            API_AVAILABLE = false;
            return false;
        });
}

// Load commits from API
function loadCommits() {
    // Reset retry count if we're starting fresh
    loadCommitsRetryCount = 0;
    loadCommitsWithRetry();
}

// Load commits with retry logic
function loadCommitsWithRetry() {
    // Always check API status first, then try to start if needed
    checkAPI().then(function(available) {
        if (available) {
            API_AVAILABLE = true;
            loadCommitsRetryCount = 0; // Reset on success
            // API is running, proceed with loading commits
            loadCommitsData();
        } else {
            // Check retry limit
            if (loadCommitsRetryCount >= MAX_RETRIES) {
                console.error('Max retries reached, showing error');
                showError('Unable to connect to Vervids API. The server may be starting up - please wait a moment and click refresh, or ensure vervids serve is running on port 8080.');
                return;
            }
            
            loadCommitsRetryCount++;
            console.log('API not available, attempt ' + loadCommitsRetryCount + '/' + MAX_RETRIES);
            showLoading();
            
            // API not available, try to start it
            startVervidsServe().then(function(started) {
                if (started) {
                    // Wait a bit for server to fully start, then retry
                    setTimeout(function() {
                        checkAPI().then(function(nowAvailable) {
                            if (nowAvailable) {
                                API_AVAILABLE = true;
                                loadCommitsRetryCount = 0; // Reset on success
                                loadCommitsData();
                            } else {
                                // Still not available, retry with limit
                                if (loadCommitsRetryCount < MAX_RETRIES) {
                                    setTimeout(function() {
                                        loadCommitsWithRetry();
                                    }, 2000);
                                } else {
                                    showError('Vervids API is not responding. The server may still be starting - please wait and click refresh, or check if vervids serve is running.');
                                }
                            }
                        }).catch(function(error) {
                            console.error('Error checking API:', error);
                            if (loadCommitsRetryCount < MAX_RETRIES) {
                                setTimeout(function() {
                                    loadCommitsWithRetry();
                                }, 2000);
                            } else {
                                showError('Unable to connect to Vervids API. Please check if vervids serve is running.');
                            }
                        });
                    }, 2000);
                } else {
                    // Failed to start, retry with limit
                    if (loadCommitsRetryCount < MAX_RETRIES) {
                        setTimeout(function() {
                            loadCommitsWithRetry();
                        }, 2000);
                    } else {
                        showError('Vervids API is not responding. The server may still be starting - please wait and click refresh.');
                    }
                }
            }).catch(function(error) {
                console.error('Error starting vervids serve:', error);
                if (loadCommitsRetryCount < MAX_RETRIES) {
                    setTimeout(function() {
                        loadCommitsWithRetry();
                    }, 2000);
                } else {
                    showError('Unable to start Vervids API. Please check if vervids serve is running, or try restarting the extension.');
                }
            });
        }
    }).catch(function(error) {
        console.error('Error checking API:', error);
        if (loadCommitsRetryCount < MAX_RETRIES) {
            loadCommitsRetryCount++;
            setTimeout(function() {
                loadCommitsWithRetry();
            }, 2000);
        } else {
            showError('Unable to connect to Vervids API. Please check if vervids serve is running.');
        }
    });
}

// Actually load the commits data (separated from the API check logic)
function loadCommitsData() {
    showLoading();
    
    // Get current project from After Effects
    csInterface.evalScript('getProjectFilePath()', function(projectPath) {
        var projectName = null;
        
        if (projectPath && projectPath !== 'null' && !projectPath.startsWith('Error')) {
            var parts = projectPath.split(/[/\\]/);
            var fileName = parts[parts.length - 1];
            projectName = fileName.replace(/\.(aep|aepx)$/i, '');
        }
        
        // Get all projects from API
        fetch(API_BASE + '/api/projects')
            .then(function(response) {
                return response.json();
            })
            .then(function(result) {
                if (!result.success || !result.data) {
                    showError('Failed to get projects: ' + (result.error || 'Unknown error'));
                    return;
                }
                
                var projects = result.data;
                if (projects.length === 0) {
                    showEmpty('No projects found');
                    return;
                }
                
                // Find matching project
                var selectedProject = null;
                
                if (projectName) {
                    // Try to match by name
                    selectedProject = projects.find(function(p) {
                        return p.name === projectName + '.aepx' || 
                               p.name === projectName + '.aep' ||
                               p.id === projectName.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    });
                }
                
                // Use first project if no match
                if (!selectedProject) {
                    selectedProject = projects[0];
                }
                
                // Get commits for selected project
                fetch(API_BASE + '/api/projects/' + encodeURIComponent(selectedProject.id) + '/commits')
                    .then(function(response) {
                        return response.json();
                    })
                    .then(function(commitResult) {
                        if (!commitResult.success || !commitResult.data) {
                            showError('Failed to get commits: ' + (commitResult.error || 'Unknown error'));
                            return;
                        }
                        
                        var commits = commitResult.data.commits || [];
                        displayCommits(commits, selectedProject.name);
                    })
                    .catch(function(error) {
                        showError('Error loading commits: ' + error.message);
                    });
            })
            .catch(function(error) {
                showError('Error loading projects: ' + error.message);
            });
    });
}

// Display commits
function displayCommits(commits, projectName) {
    if (!commitsList) return;
    
    if (commits.length === 0) {
        showEmpty('No commits found for ' + (projectName || 'this project'));
        return;
    }
    
    // Update count
    if (commitCount) {
        commitCount.textContent = commits.length;
    }
    
    // Build HTML
    var html = '';
    
    // Show newest first
    var reversed = commits.slice().reverse();
    
    reversed.forEach(function(commit, index) {
        var isLatest = index === 0;
        
        // Format timestamp
        var timestamp = commit.timestamp || '';
        var dateTime = timestamp.split(' ');
        var date = dateTime[0] || '';
        var time = dateTime[1] || '';
        
        // Format size (bytes to MB)
        var sizeMB = ((commit.size || 0) / (1024 * 1024)).toFixed(2);
        
        html += '<div class="commit-item' + (isLatest ? ' commit-latest' : '') + '">';
        html += '<div class="commit-node-wrapper">';
        html += '<div class="commit-node' + (isLatest ? ' commit-node-latest' : '') + '"></div>';
        if (index < reversed.length - 1) {
            html += '<div class="commit-line"></div>';
        }
        html += '</div>';
        html += '<div class="commit-content">';
        html += '<div class="commit-message">' + escapeHtml(commit.message || 'No message') + '</div>';
        html += '<div class="commit-meta">';
        if (timestamp) {
            html += '<span class="commit-time">' + escapeHtml(timestamp) + '</span>';
        }
        html += '<span class="commit-size">' + sizeMB + ' MB</span>';
        html += '<span class="commit-assets">' + (commit.asset_count || 0) + ' assets</span>';
        html += '<span class="commit-number">#' + commit.number + '</span>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
    });
    
    commitsList.innerHTML = html;
}

// Commit changes
function commitChanges(message) {
    if (!API_AVAILABLE) {
        alert('Vervids API not running. Start it with: vervids serve');
        return;
    }
    
    // Get current project path
    csInterface.evalScript('getProjectFilePath()', function(projectPath) {
        if (!projectPath || projectPath === 'null' || projectPath.startsWith('Error')) {
            alert('Please save your project first');
            return;
        }
        
        // Execute commit via shell (API doesn't have commit endpoint yet)
        // For now, we'll use the existing server
        fetch('http://localhost:3002/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                command: 'vervids commit "' + message + '" ' + projectPath
            })
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(result) {
            if (result.success) {
                commitInput.value = '';
                loadCommits(); // Reload commits
            } else {
                alert('Commit failed: ' + (result.error || 'Unknown error'));
        }
    })
    .catch(function(error) {
            alert('Error: ' + error.message);
        });
    });
}

// Show loading state
function showLoading() {
    if (commitsList) {
        commitsList.innerHTML = '<div class="empty-state"><div class="empty-text">Loading...</div></div>';
    }
}

// Show empty state
function showEmpty(message) {
    if (commitsList) {
        commitsList.innerHTML = '<div class="empty-state"><div class="empty-text">' + escapeHtml(message) + '</div></div>';
    }
    if (commitCount) {
        commitCount.textContent = '0';
    }
}

// Show error
function showError(message) {
    if (commitsList) {
        commitsList.innerHTML = '<div class="empty-state"><div class="empty-text error">' + escapeHtml(message) + '</div></div>';
    }
}

// Escape HTML
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

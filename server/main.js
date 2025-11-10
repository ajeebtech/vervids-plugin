const express = require("express");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const path = require("path");
const os = require("os");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware for CEP extension
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Define different routes that the client application can hit.
app.get("/test", (req, res) => {
  res.json({ message: "Welcome to the server." });
});

// Execute vervids command
app.post("/execute", async (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command || typeof command !== "string") {
      return res.status(400).json({
        success: false,
        error: "Command is required"
      });
    }

    // Security: Only allow commands starting with 'vervids'
    if (!command.trim().startsWith("vervids")) {
      return res.status(400).json({
        success: false,
        error: "Only vervids commands are allowed"
      });
    }

    console.log(`Executing command: ${command}`);

    // Get the user's shell and ensure we use their environment
    const platform = os.platform();
    const shell = process.env.SHELL || (platform === 'win32' ? 'cmd.exe' : '/bin/zsh');
    const isWindows = platform === 'win32';
    
    // Build command to execute with proper shell environment
    // On macOS/Linux, use login shell to load user profile (PATH, etc.)
    let execCommand;
    if (isWindows) {
      execCommand = command;
    } else {
      // Use login shell to load user's profile (zsh -l or bash -l)
      // This ensures PATH and other env vars are loaded from ~/.zshrc, ~/.bash_profile, etc.
      // Escape single quotes in the command and wrap in single quotes
      const escapedCommand = command.replace(/'/g, "'\"'\"'");
      execCommand = `${shell} -l -c '${escapedCommand}'`;
    }
    
    console.log(`Full execution command: ${execCommand}`);
    console.log(`Using shell: ${shell}`);
    console.log(`Platform: ${platform}`);
    console.log(`Current PATH: ${process.env.PATH}`);

    // Execute the command with proper environment
    // Inherit environment from the Node.js process, which should have user's PATH
    const { stdout, stderr } = await execAsync(execCommand, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      timeout: 300000, // 5 minute timeout
      env: process.env // Use the same environment as Node.js process
    });

    // Combine stdout and stderr, but prefer stdout if both exist
    let output = "";
    if (stdout) {
      output += stdout;
    }
    if (stderr) {
      // If we already have stdout, add stderr on a new line
      if (output) {
        output += "\n" + stderr;
      } else {
        output = stderr;
      }
    }
    
    // Log the output for debugging
    console.log(`Command output (stdout):`, stdout);
    console.log(`Command output (stderr):`, stderr);
    console.log(`Combined output:`, output);
    
    // If output is empty, add a note
    if (!output || output.trim() === "") {
      output = "(Command executed successfully but produced no output)";
    }
    
    // Try to parse changes from output (this is a placeholder - adjust based on actual vervids output)
    let changes = null;
    try {
      // If vervids outputs JSON, parse it
      if (output.includes("{")) {
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.changes) {
            changes = parsed.changes;
          }
        }
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }

    res.json({
      success: true,
      output: output,
      changes: changes,
      stdout: stdout || "",
      stderr: stderr || ""
    });

  } catch (error) {
    console.error("Command execution error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      signal: error.signal,
      stdout: error.stdout,
      stderr: error.stderr
    });
    
    // Build error output message
    let errorOutput = "";
    if (error.stdout) {
      errorOutput += error.stdout;
    }
    if (error.stderr) {
      if (errorOutput) {
        errorOutput += "\n" + error.stderr;
      } else {
        errorOutput = error.stderr;
      }
    }
    if (!errorOutput) {
      errorOutput = error.message || "Unknown error occurred";
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
      output: errorOutput,
      code: error.code,
      signal: error.signal
    });
  }
});

// Start the server on port 3002
const server = app.listen(3002, () => {
  const host = server.address().address;
  const port = server.address().port;

  console.log("Listening on %s port %s", host, port);
});

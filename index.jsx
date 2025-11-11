// Function that sends an alert in After Effects
function sendAlert() {
    alert("Custom Alert")
}

// Function that sends an alert with a custom message
function customAlert(alertMessage) {
    alert(alertMessage)
}
// Function that imports a file into the current project.
function openFile() {
    var fileRef = new File("C:/link/to/your/file.jpg")
    var importOptions = new ImportOptions(fileRef)
    app.project.importFile(importOptions)
}

// Function to get the current project file path and export as .aepx
function getProjectFilePath() {
    try {
        var currentFile = app.project.file;
        
        if (currentFile) {
            // Get the current file path
            var currentPath = currentFile.fsName;
            var currentPathLower = currentPath.toLowerCase();
            var pathLength = currentPathLower.length;
            var aepxPath;
            
            // Check if it's already .aepx (ExtendScript doesn't have endsWith, check last 5 chars)
            if (pathLength >= 5 && currentPathLower.substring(pathLength - 5) === '.aepx') {
                // Already .aepx, just save it
                app.project.save();
                return currentPath;
            } else if (pathLength >= 4 && currentPathLower.substring(pathLength - 4) === '.aep') {
                // Convert .aep to .aepx
                aepxPath = currentPath.substring(0, pathLength - 4) + '.aepx';
            } else {
                // No extension or unknown extension, add .aepx
                aepxPath = currentPath + '.aepx';
            }
            
            // Save as XML format (.aepx)
            // First ensure the current project is saved
            app.project.save();
            
            // Create the .aepx file and save as XML
            // After Effects saves as XML when the extension is .aepx
            var aepxFile = new File(aepxPath);
            app.project.save(aepxFile);
            
            return aepxFile.fsName;
        } else {
            return null; // Project not saved yet
        }
    } catch (e) {
        return "Error: " + e.toString();
    }
}

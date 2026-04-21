import fs from 'fs';
import path from 'path';

const packageJsonPath = path.join(process.cwd(), 'package.json');
const versionJsPath = path.join(process.cwd(), 'src', 'js', 'version.js');

function updateVersion() {
    try {
        // Update package.json
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const currentVersion = packageJson.version;
        const versionParts = currentVersion.split('.').map(Number);
        versionParts[2] += 1; // Increment patch
        
        // If patch reaches 10, rollover to minor
        if (versionParts[2] > 9) {
            versionParts[1] += 1;
            versionParts[2] = 0;
        }

        // If minor reaches 10, rollover to major
        if (versionParts[1] > 9) {
            versionParts[0] += 1;
            versionParts[1] = 0;
            versionParts[2] = 0; // Ensure patch is also 0
        }
        
        const newVersion = versionParts.join('.');
        
        packageJson.version = newVersion;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4));
        console.log(`✅ Updated package.json to v${newVersion}`);

        // Update version.js
        let versionJsContent = fs.readFileSync(versionJsPath, 'utf8');
        versionJsContent = versionJsContent.replace(
            /export const APP_VERSION = '.*?';/,
            `export const APP_VERSION = '${newVersion}';`
        );
        fs.writeFileSync(versionJsPath, versionJsContent);
        console.log(`✅ Updated src/js/version.js to v${newVersion}`);

        return newVersion;
    } catch (error) {
        console.error('❌ Error updating version:', error);
        return null;
    }
}

updateVersion();

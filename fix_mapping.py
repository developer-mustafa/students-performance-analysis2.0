import re

filepath = r'src\js\modules\marksheetManager.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# 1. Add localStorage sync to loadMarksheetSettings
old1 = """        if (snap.exists()) {
            Object.assign(marksheetSettings, snap.data());
        }
    } catch (e) {
        console.warn('\u09ae\u09be\u09b0\u09cd\u0995\u09b6\u09c0\u099f \u09b8\u09c7\u099f\u09bf\u0982\u09b8 \u09b2\u09cb\u09a1 \u0995\u09b0\u09be \u09af\u09be\u09df\u09a8\u09bf, \u09a1\u09bf\u09ab\u09b2\u09cd\u099f \u09ac\u09cd\u09af\u09ac\u09b9\u09be\u09b0 \u09b9\u099a\u09cd\u099b\u09c7');
    }"""

new1 = """        if (snap.exists()) {
            Object.assign(marksheetSettings, snap.data());
            // Sync to localStorage for cross-module access
            try { localStorage.setItem('pa_marksheet_settings', JSON.stringify(marksheetSettings)); } catch(e) {}
        }
    } catch (e) {
        console.warn('\u09ae\u09be\u09b0\u09cd\u0995\u09b6\u09c0\u099f \u09b8\u09c7\u099f\u09bf\u0982\u09b8 \u09b2\u09cb\u09a1 \u0995\u09b0\u09be \u09af\u09be\u09df\u09a8\u09bf, \u09a1\u09bf\u09ab\u09b2\u09cd\u099f \u09ac\u09cd\u09af\u09ac\u09b9\u09be\u09b0 \u09b9\u099a\u09cd\u099b\u09c7');
    }"""

if old1 in content:
    content = content.replace(old1, new1)
    changes += 1
    print("1. loadMarksheetSettings patched")
else:
    print("1. loadMarksheetSettings NOT found")

# 2. Add localStorage sync to saveMarksheetSettings  
old2 = """        Object.assign(marksheetSettings, settings);
        showNotification('\u09ae\u09be\u09b0\u09cd\u0995\u09b6\u09c0\u099f \u09b8\u09c7\u099f\u09bf\u0982\u09b8 \u09b8\u0982\u09b0\u0995\u09cd\u09b7\u09a3 \u09b9\u09df\u09c7\u099b\u09c7 \u2705');"""

new2 = """        Object.assign(marksheetSettings, settings);
        // Sync to localStorage for cross-module access
        try { localStorage.setItem('pa_marksheet_settings', JSON.stringify(marksheetSettings)); } catch(e) {}
        showNotification('\u09ae\u09be\u09b0\u09cd\u0995\u09b6\u09c0\u099f \u09b8\u09c7\u099f\u09bf\u0982\u09b8 \u09b8\u0982\u09b0\u0995\u09cd\u09b7\u09a3 \u09b9\u09df\u09c7\u099b\u09c7 \u2705');"""

if old2 in content:
    content = content.replace(old2, new2)
    changes += 1
    print("2. saveMarksheetSettings patched")
else:
    print("2. saveMarksheetSettings NOT found")

# 3. Add localStorage sync to subscribeToMarksheetSettings
old3 = """            Object.assign(marksheetSettings, docSnap.data());
            if (callback) callback(marksheetSettings);"""

new3 = """            Object.assign(marksheetSettings, docSnap.data());
            try { localStorage.setItem('pa_marksheet_settings', JSON.stringify(marksheetSettings)); } catch(e) {}
            if (callback) callback(marksheetSettings);"""

if old3 in content:
    content = content.replace(old3, new3)
    changes += 1
    print("3. subscribeToMarksheetSettings patched")
else:
    print("3. subscribeToMarksheetSettings NOT found")

if changes > 0:
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"\nSUCCESS: Applied {changes} patches")
else:
    print("\nERROR: No patches applied")

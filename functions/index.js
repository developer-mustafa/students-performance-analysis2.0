const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');

admin.initializeApp();

const CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

// Function to fetch all collections for backup
async function generateFullBackup() {
  const db = admin.firestore();
  const collectionsToBackup = [
    'settings', 'exams', 'students', 'examConfigs', 
    'tutorialExamConfigs', 'academicStructure', 
    'teacher_assignments', 'accessControl', 'notices', 'users'
  ];
  
  const backupData = {
    meta: {
      appName: 'EdTech Automata Pro',
      backupDate: new Date().toISOString(),
      backupType: 'full',
      generatedBy: 'Cloud-Function-Auto-Backup'
    },
    data: {}
  };

  for (const colName of collectionsToBackup) {
    const snapshot = await db.collection(colName).get();
    const docs = [];
    snapshot.forEach(doc => {
      docs.push({ _docId: doc.id, ...doc.data() });
    });
    backupData.data[colName] = docs;
  }
  
  return backupData;
}

// Upload file to Google Drive
async function uploadToDrive(backupData, refreshToken) {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `EdTechPro_AutoBackup_${dateStr}.json`;
  
  const fileMetadata = {
    name: fileName,
    mimeType: 'application/json'
  };
  
  const media = {
    mimeType: 'application/json',
    body: JSON.stringify(backupData, null, 2)
  };
  
  const res = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id'
  });
  
  return res.data.id;
}

// 1. Exchange Auth Code for Refresh Token
exports.exchangeGoogleAuthCode = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'super_admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Super Admins can configure Google Drive.');
  }

  const code = data.code;
  if (!code) {
    throw new functions.https.HttpsError('invalid-argument', 'Authorization code is required.');
  }

  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    'postmessage' // Required for web client side auth code flow
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save token to Firestore
    const db = admin.firestore();
    await db.collection('settings').doc('gdriveIntegration').set({
      refreshToken: tokens.refresh_token,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      enabled: true
    }, { merge: true });

    return { success: true };
  } catch (error) {
    console.error('Failed to exchange code:', error);
    throw new functions.https.HttpsError('internal', 'Failed to authenticate with Google Drive.');
  }
});

// 2. HTTP Endpoint for Manual Trigger (Testing or Dashboard Button)
exports.triggerManualBackup = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'super_admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Super Admins can trigger backups.');
  }
  
  const db = admin.firestore();
  const settingsDoc = await db.collection('settings').doc('gdriveIntegration').get();
  
  if (!settingsDoc.exists || !settingsDoc.data().refreshToken) {
    throw new functions.https.HttpsError('failed-precondition', 'Google Drive Refresh Token is not configured.');
  }
  
  try {
    const backupData = await generateFullBackup();
    const fileId = await uploadToDrive(backupData, settingsDoc.data().refreshToken);
    
    // Log success
    await db.collection('backup_logs').add({
      action: 'auto_backup',
      fileName: `AutoBackup_${new Date().toISOString().slice(0, 10)}.json`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      type: 'full',
      status: 'success',
      driveFileId: fileId
    });
    
    return { success: true, fileId: fileId };
  } catch (error) {
    console.error('Backup failed:', error);
    throw new functions.https.HttpsError('internal', 'Backup to Google Drive failed: ' + error.message);
  }
});

// 2. Scheduled Cron Job (Runs every day at 2:00 AM)
exports.scheduledAutoBackup = functions.pubsub.schedule('0 2 * * *')
  .timeZone('Asia/Dhaka')
  .onRun(async (context) => {
    const db = admin.firestore();
    const settingsDoc = await db.collection('settings').doc('gdriveIntegration').get();
    
    if (!settingsDoc.exists || !settingsDoc.data().refreshToken) {
      console.log('Skipping auto-backup: Google Drive not configured.');
      return null;
    }
    
    const config = settingsDoc.data();
    if (!config.enabled) {
        console.log('Skipping auto-backup: Auto backup is disabled in settings.');
        return null;
    }
    
    try {
      const backupData = await generateFullBackup();
      const fileId = await uploadToDrive(backupData, config.refreshToken);
      
      await db.collection('backup_logs').add({
        action: 'scheduled_backup',
        fileName: `ScheduledBackup_${new Date().toISOString().slice(0, 10)}.json`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'full',
        status: 'success',
        driveFileId: fileId
      });
      
      console.log(`Successfully completed scheduled backup. Drive File ID: ${fileId}`);
    } catch (error) {
      console.error('Scheduled backup failed:', error);
    }
    return null;
});

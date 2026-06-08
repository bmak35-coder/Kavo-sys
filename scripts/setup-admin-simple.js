/**
 * Setup Super Admin (using Firebase Auth REST API)
 * 
 * This script sets custom claims for a super admin user using Firebase Cloud Functions.
 * Run with: node scripts/setup-admin-simple.js
 */

const https = require('https');

const FIREBASE_PROJECT_ID = 'kavo-sys-a1118';
const EMAIL = 'admin@kavo.com';

console.log('🔧 Super Admin Setup\n');
console.log('⚠️  IMPORTANT: You need to set custom claims manually.\n');

console.log('Option 1: Using Firebase Console');
console.log('─────────────────────────────────');
console.log('1. Go to: https://console.firebase.google.com/');
console.log(`2. Select project: ${FIREBASE_PROJECT_ID}`);
console.log('3. Navigate to: Authentication → Users');
console.log(`4. Find user: ${EMAIL}`);
console.log('5. Copy the User UID');
console.log('6. Go to: Functions (if you have the updateUserClaims function deployed)');
console.log('   OR use the Firebase CLI method below\n');

console.log('Option 2: Using Firebase CLI (Recommended)');
console.log('─────────────────────────────────────────────');
console.log('Run these commands:\n');
console.log('  firebase login');
console.log('  firebase functions:config:set admin.email="admin@kavo.com"');
console.log('  firebase deploy --only functions');
console.log('');
console.log('Then create a Cloud Function to set claims, or use the method below:\n');

console.log('Option 3: Direct Firebase Admin SDK');
console.log('────────────────────────────────────');
console.log('1. Download Service Account Key:');
console.log('   • Go to Firebase Console → Project Settings → Service Accounts');
console.log('   • Click "Generate New Private Key"');
console.log('   • Save as: firebase-admin-key.json in project root');
console.log('');
console.log('2. Run: node scripts/setup-admin.js\n');

console.log('Option 4: Quick Fix with Node.js Script');
console.log('────────────────────────────────────────────');
console.log('If you have firebase-admin installed, run this in Node.js REPL:\n');
console.log('  const admin = require("firebase-admin");');
console.log('  admin.initializeApp({ projectId: "kavo-sys-a1118" });');
console.log('  admin.auth().getUserByEmail("admin@kavo.com")');
console.log('    .then(user => admin.auth().setCustomUserClaims(user.uid, { role: "admin" }))');
console.log('    .then(() => console.log("✅ Done!"));');
console.log('');

console.log('After setting claims, sign out and sign in again at: http://localhost:5176/admin\n');

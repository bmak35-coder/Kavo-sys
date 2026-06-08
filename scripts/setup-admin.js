/**
 * Setup Super Admin
 * 
 * This script sets custom claims for a super admin user.
 * Run with: node scripts/setup-admin.js
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
const serviceAccount = require('../firebase-admin-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'kavo-sys-a1118'
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setupSuperAdmin() {
  console.log('🔧 Super Admin Setup\n');
  
  const email = 'admin@kavo.com';
  
  try {
    // Get user by email
    console.log(`Looking up user: ${email}...`);
    const user = await admin.auth().getUserByEmail(email);
    
    console.log(`Found user: ${user.uid}`);
    console.log(`Current claims:`, user.customClaims || 'None');
    
    // Set custom claims
    console.log('\nSetting super admin claims...');
    await admin.auth().setCustomUserClaims(user.uid, {
      role: 'admin'
    });
    
    console.log('✅ Super admin claims set successfully!');
    console.log('\nUser must sign out and sign in again for claims to take effect.');
    console.log('Custom claims:', { role: 'admin' });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupSuperAdmin();

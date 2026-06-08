/**
 * Set Super Admin Claims
 * 
 * Run this script once to set admin@kavo.com as super admin
 * Usage: cd functions && node set-admin-claims.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Load service account key
const serviceAccount = require(path.join(__dirname, '..', 'firebase-admin-key.json'));

// Initialize Firebase Admin with service account
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'kavo-sys-a1118'
});

const EMAIL = 'admin@kavo.com';

async function setSuperAdminClaims() {
  try {
    console.log(`🔧 Setting super admin claims for: ${EMAIL}\n`);
    
    // Get user by email
    console.log('1. Looking up user...');
    const user = await admin.auth().getUserByEmail(EMAIL);
    console.log(`   ✓ Found user: ${user.uid}`);
    
    // Check current claims
    const currentUser = await admin.auth().getUser(user.uid);
    console.log('   Current claims:', currentUser.customClaims || 'None');
    
    // Set super admin claims
    console.log('\n2. Setting super admin claims...');
    await admin.auth().setCustomUserClaims(user.uid, {
      role: 'admin'
    });
    console.log('   ✓ Claims updated');
    
    // Verify new claims
    const updatedUser = await admin.auth().getUser(user.uid);
    console.log('   New claims:', updatedUser.customClaims);
    
    console.log('\n✅ SUCCESS! Super admin claims set.');
    console.log('\n⚠️  IMPORTANT: User must sign out and sign in again for changes to take effect.');
    console.log('   Go to: http://localhost:5176/admin');
    console.log('   1. Click "Sign Out"');
    console.log('   2. Sign in again with: admin@kavo.com / kavo123\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.code === 'auth/user-not-found') {
      console.error(`\nUser ${EMAIL} not found in Firebase Authentication.`);
      console.error('Please create the user first in Firebase Console.\n');
    }
    process.exit(1);
  }
}

setSuperAdminClaims();

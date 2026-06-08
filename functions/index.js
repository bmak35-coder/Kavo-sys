/**
 * Cloud Functions for KAVO-SYS Multi-Tenant POS
 * 
 * CRITICAL SECURITY FUNCTIONS:
 * - Tenant creation and management
 * - Custom claims management
 * - Session management
 * - Audit logging
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// ==================== TENANT MANAGEMENT ====================

/**
 * Create a new tenant and owner account
 * Only callable by super admins
 */
exports.createTenant = functions.https.onCall(async (data, context) => {
  try {
    // Verify caller is super admin
    if (!context.auth || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only super admins can create tenants'
      );
    }

    const { tenantName, ownerEmail, ownerPassword, ownerName, domain } = data;

    // Validate input
    if (!tenantName || !ownerEmail || !ownerPassword || !ownerName) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    // Generate slug and token
    const slug = generateSlug(tenantName);
    const token = generateToken();

    // Check if slug already exists
    const existingTenant = await db
      .collection('tenants')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (!existingTenant.empty) {
      throw new functions.https.HttpsError(
        'already-exists',
        'Tenant with this name already exists'
      );
    }

    // Create tenant document
    const tenantRef = await db.collection('tenants').add({
      name: tenantName,
      slug: slug,
      token: token,
      domain: domain || null,
      status: 'trial',
      plan: 'free',
      billingStatus: 'trialing',
      settings: {
        currency: 'USD',
        timezone: 'UTC',
        language: 'en',
        taxRate: 0,
        receiptFormat: 'standard',
        autoLogout: 30,
        allowedDevices: 5,
        features: {
          inventory: true,
          kitchen: true,
          reports: true,
          multiLocation: false,
          api: false,
          customReports: false,
        },
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid,
    });

    const tenantId = tenantRef.id;

    // Create owner Firebase Auth account
    const userRecord = await auth.createUser({
      email: ownerEmail,
      password: ownerPassword,
      displayName: ownerName,
      emailVerified: true,
    });

    // Set custom claims
    await auth.setCustomUserClaims(userRecord.uid, {
      tenantId: tenantId,
      tenantSlug: slug,
      role: 'owner',
    });

    // Create user document
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('users')
      .doc(userRecord.uid)
      .set({
        uid: userRecord.uid,
        tenantId: tenantId,
        email: ownerEmail,
        name: ownerName,
        role: 'owner',
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth.uid,
      });

    // Create default settings
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('settings')
      .doc('general')
      .set({
        tenantId: tenantId,
        initialized: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    // Create default roles
    await createDefaultRoles(tenantId, userRecord.uid);

    // Return tenant info
    return {
      success: true,
      tenantId: tenantId,
      slug: slug,
      loginUrl: `${process.env.APP_URL || 'https://pos.com'}/${slug}`,
      ownerEmail: ownerEmail,
    };
  } catch (error) {
    console.error('Error creating tenant:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Update user custom claims
 * Triggered when user role changes
 */
exports.updateUserClaims = functions.https.onCall(async (data, context) => {
  try {
    // Verify caller is owner or super admin
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User not authenticated');
    }

    const callerRole = context.auth.token.role;
    if (callerRole !== 'owner' && callerRole !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only owners and admins can update user claims'
      );
    }

    const { userId, tenantId, role } = data;

    // Get user document to verify tenant match
    const userDoc = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('users')
      .doc(userId)
      .get();

    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();

    // Set custom claims
    await auth.setCustomUserClaims(userId, {
      tenantId: tenantId,
      tenantSlug: userData.tenantSlug || context.auth.token.tenantSlug,
      role: role,
    });

    return { success: true, message: 'Claims updated successfully' };
  } catch (error) {
    console.error('Error updating claims:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Disable tenant (suspend all access)
 */
exports.disableTenant = functions.https.onCall(async (data, context) => {
  try {
    // Verify caller is super admin
    if (!context.auth || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only super admins can disable tenants'
      );
    }

    const { tenantId } = data;

    // Update tenant status
    await db.collection('tenants').doc(tenantId).update({
      status: 'disabled',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Disable all users in tenant
    const usersSnapshot = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('users')
      .get();

    const batch = db.batch();
    usersSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { active: false });
      
      // Disable Firebase Auth account
      auth.updateUser(doc.id, { disabled: true }).catch(console.error);
    });

    await batch.commit();

    return { success: true, message: 'Tenant disabled successfully' };
  } catch (error) {
    console.error('Error disabling tenant:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Enable tenant
 */
exports.enableTenant = functions.https.onCall(async (data, context) => {
  try {
    // Verify caller is super admin
    if (!context.auth || context.auth.token.role !== 'admin') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only super admins can enable tenants'
      );
    }

    const { tenantId } = data;

    // Update tenant status
    await db.collection('tenants').doc(tenantId).update({
      status: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Enable owner account
    const usersSnapshot = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('users')
      .where('role', '==', 'owner')
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      const ownerDoc = usersSnapshot.docs[0];
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('users')
        .doc(ownerDoc.id)
        .update({ active: true });

      await auth.updateUser(ownerDoc.id, { disabled: false });
    }

    return { success: true, message: 'Tenant enabled successfully' };
  } catch (error) {
    console.error('Error enabling tenant:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// ==================== SESSION MANAGEMENT ====================

/**
 * Clean up expired sessions
 * Runs every hour
 */
exports.cleanupExpiredSessions = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    try {
      const expirationTime = new Date();
      expirationTime.setMinutes(expirationTime.getMinutes() - 30);

      // Get all tenants
      const tenantsSnapshot = await db.collection('tenants').get();

      for (const tenantDoc of tenantsSnapshot.docs) {
        const tenantId = tenantDoc.id;

        // Find expired sessions
        const sessionsSnapshot = await db
          .collection('tenants')
          .doc(tenantId)
          .collection('sessions')
          .where('active', '==', true)
          .where('lastActivity', '<', expirationTime)
          .get();

        // Deactivate expired sessions
        const batch = db.batch();
        sessionsSnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, {
            active: false,
            logoutAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        if (sessionsSnapshot.docs.length > 0) {
          await batch.commit();
          console.log(
            `Cleaned up ${sessionsSnapshot.docs.length} sessions for tenant ${tenantId}`
          );
        }
      }

      return null;
    } catch (error) {
      console.error('Error cleaning up sessions:', error);
      throw error;
    }
  });

/**
 * Create session on user login
 * Triggered by authentication
 */
exports.onUserLogin = functions.auth.user().onCreate(async (user) => {
  try {
    // This is just a placeholder - actual session creation happens in the app
    console.log(`New user created: ${user.uid}`);
    return null;
  } catch (error) {
    console.error('Error on user login:', error);
    return null;
  }
});

// ==================== AUDIT LOGGING ====================

/**
 * Auto-create audit log for important operations
 * Triggered by Firestore writes
 */
exports.auditLogger = functions.firestore
  .document('tenants/{tenantId}/{collection}/{docId}')
  .onWrite(async (change, context) => {
    try {
      const tenantId = context.params.tenantId;
      const collection = context.params.collection;
      const docId = context.params.docId;

      // Skip audit logs collection itself
      if (collection === 'auditLogs' || collection === 'sessions') {
        return null;
      }

      let action = 'update';
      if (!change.before.exists) {
        action = 'create';
      } else if (!change.after.exists) {
        action = 'delete';
      }

      const data = change.after.exists ? change.after.data() : change.before.data();

      // Create audit log
      await db
        .collection('tenants')
        .doc(tenantId)
        .collection('auditLogs')
        .add({
          tenantId: tenantId,
          action: action,
          entityType: collection,
          entityId: docId,
          userId: data.createdBy || 'system',
          userName: data.userName || 'System',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          changes: [],
          metadata: {
            automated: true,
          },
        });

      return null;
    } catch (error) {
      console.error('Error creating audit log:', error);
      return null;
    }
  });

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate slug from name
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Generate secure token
 */
function generateToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

/**
 * Create default roles for a tenant
 */
async function createDefaultRoles(tenantId, userId) {
  const roles = [
    {
      name: 'owner',
      permissions: [{ resource: '*', actions: ['create', 'read', 'update', 'delete', 'export'] }],
      isSystem: true,
    },
    {
      name: 'manager',
      permissions: [
        { resource: 'products', actions: ['create', 'read', 'update', 'export'] },
        { resource: 'orders', actions: ['create', 'read', 'update', 'export'] },
        { resource: 'reports', actions: ['read', 'export'] },
      ],
      isSystem: true,
    },
    {
      name: 'cashier',
      permissions: [
        { resource: 'products', actions: ['read'] },
        { resource: 'orders', actions: ['create', 'read', 'update'] },
        { resource: 'customers', actions: ['create', 'read', 'update'] },
      ],
      isSystem: true,
    },
  ];

  const batch = db.batch();
  
  for (const role of roles) {
    const roleRef = db.collection('tenants').doc(tenantId).collection('roles').doc();
    batch.set(roleRef, {
      ...role,
      tenantId: tenantId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: userId,
    });
  }

  await batch.commit();
}

// ==================== SETUP FUNCTIONS ====================

/**
 * Set Super Admin Claims (One-time setup)
 * This function can be called once to set up the initial super admin
 */
exports.setupSuperAdmin = functions.https.onCall(async (data, context) => {
  try {
    const { email, secretKey } = data;

    // Simple security check - you should change this secret key
    const SETUP_SECRET = functions.config().setup?.secret || 'change-me-in-production';
    
    if (secretKey !== SETUP_SECRET) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Invalid setup secret key'
      );
    }

    if (!email) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Email is required'
      );
    }

    // Get user by email
    const user = await auth.getUserByEmail(email);

    // Set super admin custom claims
    await auth.setCustomUserClaims(user.uid, {
      role: 'admin'
    });

    console.log(`✅ Super admin claims set for: ${email} (${user.uid})`);

    return {
      success: true,
      message: 'Super admin claims set successfully',
      email: email,
      uid: user.uid
    };
  } catch (error) {
    console.error('Error setting super admin claims:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

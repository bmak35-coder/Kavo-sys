# Setup Super Admin Guide

Your login works! You're successfully authenticated as `admin@kavo.com`, but you need super admin claims set.

## ✅ Easiest Method: Download Service Account Key

### Step 1: Download Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **kavo-sys-a1118**
3. Click ⚙️ (Settings) → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the downloaded JSON file as: `firebase-admin-key.json` in your project root

### Step 2: Run the Setup Script

```bash
node functions/set-admin-claims.js
```

That's it! The script will:
- Connect to Firebase using the service account key
- Find your user: `admin@kavo.com`
- Set custom claims: `{ role: 'admin' }`
- Confirm success

### Step 3: Sign Out and Sign In Again

1. Go to http://localhost:5176/admin
2. Click "Sign Out"
3. Sign in again with: `admin@kavo.com` / `kavo123`
4. You'll now see the Super Admin Dashboard! 🎉

---

## Alternative: Manual Setup via Firestore

If you prefer not to download the service account key:

### Via Firebase Console UI

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select: **kavo-sys-a1118**
3. Go to: **Authentication** → **Users**
4. Find: `admin@kavo.com`
5. Copy the **User UID**
6. Open Cloud Shell or use Firebase CLI locally
7. Run:
   ```javascript
   const admin = require('firebase-admin');
   admin.initializeApp();
   admin.auth().setCustomUserClaims('PASTE_USER_UID_HERE', { role: 'admin' });
   ```

---

## What Happens After Claims Are Set?

✅ You'll be able to access `/admin` dashboard  
✅ Create new tenants  
✅ Manage all restaurants  
✅ Enable/disable tenants  
✅ View platform statistics  

## Tenant Creation Flow

Once you're a super admin:

1. Click "Create New Tenant"
2. Enter restaurant details
3. System generates secure token
4. Share URL: `http://localhost:5176/{token}`
5. Restaurant owner can sign in and use POS

---

## Security Notes

- ✅ Tokens are randomly generated (not predictable slugs)
- ✅ Each tenant is fully isolated
- ✅ Custom claims prevent cross-tenant access
- ✅ Only super admins can create tenants
- ✅ Firestore rules enforce tenant boundaries


# Firebase Multi-Tenant POS - Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add Project"
3. Name it (e.g., "kavo-sys-pos")
4. Disable Google Analytics (optional)
5. Click "Create Project"

### Step 2: Enable Services

#### Enable Firestore
1. Click "Firestore Database" in left sidebar
2. Click "Create Database"
3. Choose "Start in production mode"
4. Select a location close to your users
5. Click "Enable"

#### Enable Authentication
1. Click "Authentication" in left sidebar
2. Click "Get Started"
3. Click "Email/Password"
4. Enable both toggles
5. Click "Save"

#### Enable Cloud Functions
1. Click "Functions" in left sidebar
2. Click "Get Started"
3. Upgrade to Blaze plan (pay-as-you-go)

### Step 3: Get Firebase Credentials

1. Click gear icon ⚙️ → "Project Settings"
2. Scroll down to "Your apps"
3. Click the web icon `</>`
4. Name your app (e.g., "KAVO-SYS POS Web")
5. Copy the configuration object

### Step 4: Configure Your App

Create `.env` file:

```env
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

VITE_APP_URL=https://pos.com
```

### Step 5: Install and Deploy

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase
firebase init

# Select:
# - Firestore
# - Functions
# - Hosting

# Install dependencies
npm install
cd functions && npm install && cd ..

# Deploy everything
firebase deploy
```

### Step 6: Create Super Admin

```bash
# Open Firebase Console → Authentication
# Add a user manually (e.g., admin@yourcompany.com)
# Copy the user UID

# Set custom claims using Firebase CLI
firebase functions:shell

# In the shell, run:
const admin = require('firebase-admin');
admin.auth().setCustomUserClaims('PASTE_USER_UID_HERE', { role: 'admin' });
```

### Step 7: Create Your First Tenant

1. Go to `/admin` in your deployed app
2. Login with super admin credentials
3. Click "Create New Tenant"
4. Fill in:
   - Tenant Name: Pizza Palace
   - Owner Name: John Doe
   - Owner Email: owner@pizzapalace.com
   - Owner Password: SecurePassword123
5. Click "Create Tenant"
6. Copy the login URL (e.g., `/pizza-palace`)

### Step 8: Login as Tenant Owner

1. Go to the tenant login URL
2. Login with owner credentials
3. Start using the POS system!

---

## 📦 File Structure

```
├── src/
│   ├── firebase/
│   │   ├── config.js                    # Firebase initialization
│   │   └── services/                    # All Firebase services
│   │       ├── tenantService.js
│   │       ├── productService.js
│   │       ├── orderService.js
│   │       ├── customerService.js
│   │       ├── tableService.js
│   │       ├── userService.js
│   │       ├── sessionService.js
│   │       ├── auditService.js
│   │       └── migrationService.js
│   ├── contexts/
│   │   ├── TenantProvider.jsx           # Tenant resolution
│   │   ├── FirebaseAuthProvider.jsx     # Authentication
│   │   └── PermissionProvider.jsx       # Role-based permissions
│   ├── pages/
│   │   ├── admin/
│   │   │   └── SuperAdminDashboard.jsx  # Tenant management
│   │   └── DataMigration.jsx            # Migration UI
│   └── types/
│       └── tenant.d.ts                  # TypeScript definitions
├── functions/
│   ├── index.js                         # Cloud Functions
│   └── package.json
├── firestore.rules                      # Security rules
├── firestore.indexes.json               # Firestore indexes
├── firebase.json                        # Firebase config
└── .firebaserc                          # Firebase project

```

---

## 🔐 Security Checklist

- ✅ Firestore security rules deployed
- ✅ Custom claims configured
- ✅ Tenant isolation verified
- ✅ Super admin account created
- ✅ Environment variables secured
- ✅ HTTPS enabled
- ✅ Audit logging active

---

## 🎯 Next Steps

### Migrate Existing Data

1. Go to Settings → Data Migration
2. Click "Start Migration"
3. Wait for completion
4. Verify migrated data

### Configure Tenant Settings

1. Go to Settings Center
2. Configure:
   - Currency
   - Timezone
   - Tax Rate
   - Receipt Format
   - Auto-logout time

### Add More Users

1. Go to User Management
2. Click "Add User"
3. Select role:
   - Manager
   - Cashier
   - Waiter
   - Kitchen
4. Send credentials to user

### Set Up Real-Time Features

Real-time updates are automatic for:
- 📊 Kitchen Display
- 🪑 Table Status
- 📦 Inventory Updates
- 👥 Active Sessions

---

## 🆘 Common Issues

### Issue: "Permission Denied"

**Fix:**
```javascript
// Check custom claims
const { claims } = useFirebaseAuth();
console.log(claims);

// Refresh claims
await refreshClaims();
```

### Issue: "Tenant Not Found"

**Fix:**
- Verify slug in URL
- Check Firestore for tenant document
- Ensure tenant status is "active"

### Issue: "Function Not Found"

**Fix:**
```bash
# Redeploy functions
cd functions
npm install
cd ..
firebase deploy --only functions
```

### Issue: Migration Fails

**Fix:**
- Check browser console for errors
- Export migration log
- Verify local database structure
- Contact support

---

## 📱 Mobile Support

The system works on all devices:
- ✅ Desktop (recommended for admin)
- ✅ Tablet (great for POS)
- ✅ Mobile (orders and kitchen)

---

## 💰 Pricing Estimate

### Firebase Costs (typical restaurant):

**Firestore:**
- Reads: ~1M/month = $0.36
- Writes: ~200K/month = $0.18
- Storage: 1GB = $0.18

**Cloud Functions:**
- Invocations: ~100K/month = $0.40
- Compute: minimal = ~$1.00

**Authentication:**
- Free for most use cases

**Total: ~$2-5/month per tenant**

For 100 tenants: ~$200-500/month

---

## 🎓 Training Resources

### For Super Admins
1. Review admin dashboard
2. Practice creating tenants
3. Learn to manage subscriptions
4. Monitor system health

### For Tenant Owners
1. Complete initial setup
2. Add products and categories
3. Create user accounts
4. Configure settings

### For Staff
1. Learn POS interface
2. Practice creating orders
3. Understand kitchen display
4. Review end-of-shift procedures

---

## 📞 Support Contacts

For technical issues:
- Check documentation
- Review Firebase logs
- Contact: support@kavosys.com

For urgent issues:
- Use admin dashboard monitoring
- Check system health page
- Emergency: [phone number]

---

## ✅ Launch Checklist

Before going live:

- [ ] Firebase project created
- [ ] All services enabled
- [ ] Security rules deployed
- [ ] Indexes created
- [ ] Cloud Functions deployed
- [ ] Super admin configured
- [ ] Test tenant created
- [ ] Migration tested
- [ ] SSL certificate configured
- [ ] Domain configured
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Staff trained
- [ ] Documentation reviewed

---

**You're ready to launch! 🎉**

For detailed information, see [FIREBASE_MIGRATION_GUIDE.md](./FIREBASE_MIGRATION_GUIDE.md)

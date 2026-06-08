# Firebase Multi-Tenant POS System - Complete Guide

## Overview

This guide covers the complete Firebase multi-tenant architecture for the KAVO-SYS Restaurant POS system. The system is designed to support multiple restaurants (tenants) with complete data isolation, secure authentication, and scalable infrastructure.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Setup and Installation](#setup-and-installation)
3. [Firebase Configuration](#firebase-configuration)
4. [Deployment](#deployment)
5. [Tenant Management](#tenant-management)
6. [Security](#security)
7. [API Reference](#api-reference)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Multi-Tenancy Model

The system uses a **Shared Database / Tenant ID Per Document** architecture:

- All tenants share the same Firestore database
- Every document contains a `tenantId` field
- Security rules enforce strict tenant isolation
- Users can NEVER access data from other tenants

### URL Structure

#### Path-based (Primary)
```
https://pos.com/pizza-palace
https://pos.com/burger-house
```

#### Subdomain-based (Optional, Future)
```
https://pizza-palace.pos.com
https://burger-house.pos.com
```

### Firestore Structure

```
/tenants/{tenantId}
  ├── name, slug, token, status, plan
  ├── /users/{userId}
  ├── /roles/{roleId}
  ├── /products/{productId}
  ├── /categories/{categoryId}
  ├── /customers/{customerId}
  ├── /orders/{orderId}
  ├── /payments/{paymentId}
  ├── /sessions/{sessionId}
  ├── /tables/{tableId}
  ├── /inventory/{inventoryId}
  ├── /kitchenOrders/{kitchenOrderId}
  ├── /shifts/{shiftId}
  ├── /auditLogs/{logId}
  └── /settings/{settingId}
```

---

## Setup and Installation

### Prerequisites

- Node.js 18 or higher
- Firebase CLI
- A Firebase project (Blaze plan recommended for production)

### Step 1: Install Dependencies

```bash
# Install frontend dependencies
npm install firebase firebase-admin

# Install Cloud Functions dependencies
cd functions
npm install
cd ..
```

### Step 2: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable Firestore Database
4. Enable Authentication (Email/Password)
5. Enable Cloud Functions

### Step 3: Configure Environment Variables

Create a `.env` file in the root directory:

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

VITE_USE_FIREBASE_EMULATORS=false
VITE_APP_URL=https://pos.com
VITE_APP_NAME=KAVO-SYS POS
```

### Step 4: Update Firebase Configuration

Edit `.firebaserc`:

```json
{
  "projects": {
    "default": "your-project-id"
  }
}
```

---

## Firebase Configuration

### Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

### Deploy Firestore Indexes

```bash
firebase deploy --only firestore:indexes
```

### Deploy Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### Enable Authentication Methods

1. Go to Firebase Console → Authentication
2. Enable Email/Password sign-in method
3. Configure authorized domains (add your production domain)

---

## Deployment

### Deploy to Firebase Hosting

```bash
# Build the application
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

### Deploy Everything

```bash
firebase deploy
```

### Deploy Specific Services

```bash
# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting

# Deploy only Firestore rules
firebase deploy --only firestore:rules
```

---

## Tenant Management

### Create Super Admin Account

Before creating tenants, you need a super admin account. This must be done manually in Firebase Console:

1. Go to Firebase Console → Authentication
2. Add a new user manually
3. Note the user UID
4. Open Firestore Database
5. Create a custom claims using Firebase CLI:

```bash
firebase functions:shell

# In the shell:
const admin = require('firebase-admin');
admin.auth().setCustomUserClaims('USER_UID_HERE', { role: 'admin' });
```

### Create a New Tenant

#### Option 1: Using Super Admin Dashboard

1. Login as super admin at `/admin`
2. Click "Create New Tenant"
3. Fill in the form:
   - Tenant Name (e.g., "Pizza Palace")
   - Owner Name
   - Owner Email
   - Owner Password
   - Custom Domain (optional)
4. Click "Create Tenant"
5. Copy the login URL and share with the tenant owner

#### Option 2: Using Cloud Function Directly

```javascript
const createTenant = httpsCallable(functions, 'createTenant');

const result = await createTenant({
  tenantName: 'Pizza Palace',
  ownerEmail: 'owner@pizzapalace.com',
  ownerPassword: 'SecurePassword123',
  ownerName: 'John Doe',
  domain: 'pizzapalace.com' // optional
});

console.log('Login URL:', result.data.loginUrl);
```

### Tenant Status Management

#### Disable Tenant (Suspend Access)

```javascript
const disableTenant = httpsCallable(functions, 'disableTenant');
await disableTenant({ tenantId: 'TENANT_ID' });
```

#### Enable Tenant

```javascript
const enableTenant = httpsCallable(functions, 'enableTenant');
await enableTenant({ tenantId: 'TENANT_ID' });
```

---

## Security

### Custom Claims

Every authenticated user has custom claims:

```javascript
{
  tenantId: 'abc123',
  tenantSlug: 'pizza-palace',
  role: 'owner'
}
```

### Security Rules Validation

The Firestore security rules ensure:

1. ✅ Users can only access their own tenant data
2. ✅ Tenant ID is derived from custom claims, NOT from request data
3. ✅ Required fields (tenantId, createdAt, createdBy) are enforced
4. ✅ Tenant ID cannot be changed after document creation
5. ✅ Role-based permissions are enforced

### Testing Security Rules

```bash
# Start emulators
firebase emulators:start

# In another terminal, run tests
npm test
```

### Refresh Custom Claims

After role changes, users must refresh their claims:

```javascript
const { refreshClaims } = useFirebaseAuth();
await refreshClaims();
```

---

## API Reference

### Tenant Service

```javascript
import tenantService from './firebase/services/tenantService';

// Get tenant by slug
const tenant = await tenantService.getTenantBySlug('pizza-palace');

// Get all tenants (super admin only)
const { tenants } = await tenantService.getTenants(20);

// Update tenant
await tenantService.updateTenant(tenantId, { status: 'active' }, userId);
```

### Product Service

```javascript
import productService from './firebase/services/productService';

// Create product
const product = await productService.createProduct(tenantId, {
  name: 'Margherita Pizza',
  sku: 'PIZZA-001',
  categoryId: 'cat123',
  price: 12.99,
  active: true
}, userId);

// Get products
const { products } = await productService.getProducts(tenantId, {
  categoryId: 'cat123',
  active: true
});

// Update product
await productService.updateProduct(tenantId, productId, {
  price: 14.99
}, userId);
```

### Order Service

```javascript
import orderService from './firebase/services/orderService';

// Create order
const order = await orderService.createOrder(tenantId, {
  type: 'dine-in',
  tableId: 'table1',
  items: [
    {
      productId: 'prod123',
      productName: 'Pizza',
      quantity: 2,
      price: 12.99,
      subtotal: 25.98
    }
  ],
  subtotal: 25.98,
  tax: 2.60,
  total: 28.58
}, userId);

// Get orders
const { orders } = await orderService.getOrders(tenantId, {
  status: 'pending',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31')
});
```

### Session Service

```javascript
import sessionService from './firebase/services/sessionService';

// Create session
await sessionService.createSession(tenantId, {
  userId: 'user123',
  ip: '192.168.1.1',
  device: 'desktop',
  browser: 'Chrome'
});

// Get active sessions
const sessions = await sessionService.getActiveSessions(tenantId, userId);

// End all sessions (force logout)
await sessionService.endAllUserSessions(tenantId, userId);
```

### Audit Service

```javascript
import auditService from './firebase/services/auditService';

// Log audit event
await auditService.log(tenantId, {
  action: 'update',
  entityType: 'product',
  entityId: 'prod123',
  userId: 'user123',
  userName: 'John Doe',
  changes: [
    { field: 'price', oldValue: 12.99, newValue: 14.99 }
  ]
});

// Get audit logs
const { logs } = await auditService.getAuditLogs(tenantId, {
  entityType: 'product',
  startDate: new Date('2024-01-01')
});
```

---

## Troubleshooting

### Common Issues

#### 1. "Permission Denied" Errors

**Cause:** User doesn't have proper custom claims or tenant ID mismatch.

**Solution:**
```javascript
// Refresh custom claims
const { refreshClaims } = useFirebaseAuth();
await refreshClaims();

// Verify claims
const { claims } = useFirebaseAuth();
console.log('Current claims:', claims);
```

#### 2. Tenant Not Found

**Cause:** Slug doesn't exist or tenant is disabled.

**Solution:**
- Verify the slug is correct
- Check tenant status in Firestore
- Ensure tenant document exists

#### 3. Session Expired

**Cause:** User session has timed out.

**Solution:**
- Configure `autoLogout` in tenant settings
- Sessions are automatically cleaned up by Cloud Function

#### 4. Migration Fails

**Cause:** Data format mismatch or missing required fields.

**Solution:**
- Check migration logs
- Verify local database structure
- Ensure all required fields are present

### Debug Mode

Enable Firebase emulators for local development:

```bash
# In .env
VITE_USE_FIREBASE_EMULATORS=true

# Start emulators
firebase emulators:start
```

### Logging

All services include comprehensive logging:

```javascript
// Enable verbose logging
localStorage.setItem('firebase:logging', 'true');
```

---

## Performance Optimization

### Firestore Indexes

All required indexes are defined in `firestore.indexes.json`. Deploy them:

```bash
firebase deploy --only firestore:indexes
```

### Caching

Implement client-side caching for frequently accessed data:

```javascript
// Use React Query or SWR for caching
import { useQuery } from 'react-query';

const { data: products } = useQuery(
  ['products', tenantId],
  () => productService.getProducts(tenantId),
  { staleTime: 5 * 60 * 1000 } // 5 minutes
);
```

### Pagination

Always use pagination for large collections:

```javascript
const { products, lastDoc, hasMore } = await productService.getProducts(tenantId, {
  pageSize: 50,
  lastDoc: previousLastDoc
});
```

---

## Monitoring

### Firebase Console

Monitor your application:
- Authentication: Track user logins and sessions
- Firestore: Monitor read/write operations
- Functions: View function executions and logs
- Performance: Track app performance metrics

### Audit Logs

Review security events:
```javascript
const { logs } = await auditService.getAuditLogs(tenantId, {
  action: 'login',
  startDate: new Date('2024-01-01')
});
```

---

## Support

For issues and questions:
- Review this documentation
- Check Firebase documentation
- Review security rules
- Check Cloud Function logs

---

## License

Copyright © 2025 KAVO-SYS. All rights reserved.

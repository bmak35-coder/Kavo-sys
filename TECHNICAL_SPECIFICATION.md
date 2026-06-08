# Firebase Multi-Tenant Architecture - Technical Specification

## System Architecture

### Multi-Tenancy Model

**Type:** Shared Database with Tenant Isolation  
**Isolation Level:** Document-level with Security Rules

### Key Design Decisions

1. **Tenant Identification**
   - Primary: URL slug (`/pizza-palace`)
   - Secondary: Subdomain (future: `pizza-palace.pos.com`)
   - Internal: Firestore tenant ID (UUID)
   - API: Tenant token (secure webhook integration)

2. **Data Isolation**
   - Every document contains `tenantId` field
   - Security rules enforce tenant matching via custom claims
   - Users cannot access other tenants even with direct document IDs

3. **Authentication Flow**
   ```
   User → URL Slug → Tenant Resolution → Login → Custom Claims → Access Token → Firestore
   ```

4. **Custom Claims Structure**
   ```json
   {
     "tenantId": "abc123xyz",
     "tenantSlug": "pizza-palace",
     "role": "owner"
   }
   ```

---

## Data Model

### Tenant Document

```typescript
interface Tenant {
  id: string;                    // Auto-generated
  name: string;                  // Display name
  slug: string;                  // URL-friendly identifier (unique)
  token: string;                 // API/webhook token (UUID)
  domain?: string;               // Optional custom domain
  status: 'active' | 'trial' | 'suspended' | 'disabled';
  plan: 'free' | 'starter' | 'business' | 'enterprise';
  billingStatus: 'active' | 'past_due' | 'canceled' | 'trialing';
  renewalDate?: Date;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}
```

### User Document

```typescript
interface User {
  uid: string;                   // Firebase Auth UID
  tenantId: string;              // Parent tenant
  email: string;
  name: string;
  role: 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'admin';
  active: boolean;
  phone?: string;
  avatar?: string;
  permissions?: string[];
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}
```

### Order Document

```typescript
interface Order {
  id: string;
  tenantId: string;              // Required for isolation
  orderNumber: string;           // Auto-generated (ORD-12345678-123)
  type: 'dine-in' | 'takeout' | 'delivery';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  tableId?: string;
  customerId?: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payments: Payment[];
  notes?: string;
  userId: string;                // Cashier/waiter
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  createdBy: string;
}
```

---

## Security Rules Design

### Core Principles

1. **Custom Claims First**
   - Security rules use `request.auth.token.tenantId`
   - NEVER trust `request.resource.data.tenantId` from client
   - Super admins have `role === 'admin'` claim

2. **Tenant Matching Function**
   ```javascript
   function tenantMatch(tenantId) {
     return request.auth.token.tenantId == tenantId;
   }
   ```

3. **Required Fields Validation**
   ```javascript
   function hasRequiredFields() {
     return request.resource.data.keys()
       .hasAll(['tenantId', 'createdAt', 'createdBy']);
   }
   ```

4. **Immutable Tenant ID**
   ```javascript
   function tenantIdUnchanged() {
     return request.resource.data.tenantId == resource.data.tenantId;
   }
   ```

### Rule Hierarchy

```
1. Authentication Check → isAuthenticated()
2. Tenant Match Check → tenantMatch(tenantId)
3. Role Check → hasRole('owner')
4. Resource-specific Logic
```

---

## Cloud Functions

### Critical Functions

#### 1. `createTenant`
**Purpose:** Create new restaurant tenant with owner account  
**Trigger:** HTTPS Callable  
**Auth:** Super admin only  
**Operations:**
- Generate unique slug
- Generate secure token
- Create tenant document
- Create Firebase Auth user
- Set custom claims
- Create user document
- Initialize default settings
- Create default roles

**Security:**
```javascript
if (!context.auth || context.auth.token.role !== 'admin') {
  throw new HttpsError('permission-denied');
}
```

#### 2. `updateUserClaims`
**Purpose:** Update user role and claims  
**Trigger:** HTTPS Callable  
**Auth:** Owner or super admin  
**Operations:**
- Verify caller permissions
- Validate tenant match
- Update custom claims
- Return success

#### 3. `disableTenant`
**Purpose:** Suspend tenant access  
**Trigger:** HTTPS Callable  
**Auth:** Super admin only  
**Operations:**
- Update tenant status to 'disabled'
- Deactivate all tenant users
- Disable Firebase Auth accounts
- Log audit event

#### 4. `cleanupExpiredSessions`
**Purpose:** Remove inactive sessions  
**Trigger:** Scheduled (every hour)  
**Auth:** System  
**Operations:**
- Query sessions older than 30 minutes
- Mark as inactive
- Log cleanup stats

---

## API Service Layer

### Service Pattern

All services follow this pattern:

```javascript
class ServiceName {
  getCollectionRef(tenantId) {
    return collection(db, 'tenants', tenantId, 'collection');
  }

  async create(tenantId, data, userId) {
    // Add required fields
    const doc = {
      ...data,
      tenantId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: userId,
    };

    // Create in Firestore
    const docRef = await addDoc(this.getCollectionRef(tenantId), doc);

    // Log audit
    await auditService.log(tenantId, {
      action: 'create',
      entityType: 'resource',
      entityId: docRef.id,
      userId,
    });

    return { id: docRef.id, ...doc };
  }

  async update(tenantId, docId, updates, userId) {
    // Get old data for audit
    const oldData = await this.getById(tenantId, docId);

    // Update in Firestore
    await updateDoc(doc(db, 'tenants', tenantId, 'collection', docId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    // Log audit with changes
    await auditService.log(tenantId, {
      action: 'update',
      entityType: 'resource',
      entityId: docId,
      userId,
      changes: auditService.getChanges(oldData, updates),
    });

    return await this.getById(tenantId, docId);
  }
}
```

### Service List

- `tenantService` - Tenant management
- `productService` - Products and categories
- `orderService` - Orders and payments
- `customerService` - Customer management
- `tableService` - Table management
- `userService` - User management
- `sessionService` - Session tracking
- `auditService` - Audit logging
- `migrationService` - Data migration

---

## Frontend Architecture

### Context Providers

#### 1. TenantProvider
**Responsibility:** Resolve and maintain tenant context

```javascript
{
  tenant: Tenant | null,
  tenantId: string | null,
  tenantSlug: string | null,
  loading: boolean,
  error: string | null,
  resolveTenant: (slug: string) => Promise<void>,
  clearTenant: () => void
}
```

#### 2. FirebaseAuthProvider
**Responsibility:** Handle authentication with custom claims

```javascript
{
  user: User | null,
  loading: boolean,
  error: string | null,
  claims: CustomClaims | null,
  login: (email, password) => Promise<void>,
  logout: () => Promise<void>,
  refreshClaims: () => Promise<void>
}
```

#### 3. PermissionProvider
**Responsibility:** Role-based access control

```javascript
{
  permissions: Permission[],
  loading: boolean,
  hasPermission: (resource, action) => boolean,
  canView: (resource) => boolean,
  canEdit: (resource) => boolean,
  canDelete: (resource) => boolean,
  canCreate: (resource) => boolean
}
```

### Provider Hierarchy

```jsx
<TenantProvider>
  <FirebaseAuthProvider>
    <PermissionProvider>
      <App />
    </PermissionProvider>
  </FirebaseAuthProvider>
</TenantProvider>
```

---

## Scaling Considerations

### Firestore Limits

- **Document Size:** Max 1MB
- **Writes per Second:** 10,000 (can request increase)
- **Reads per Second:** Unlimited
- **Collection Depth:** 100 levels
- **Document ID Length:** 1,500 bytes

### Optimization Strategies

1. **Indexing**
   - Composite indexes for common queries
   - Index all `tenantId + field` combinations
   - Use `firestore.indexes.json` for definitions

2. **Pagination**
   - Always use `limit()` and `startAfter()`
   - Default page size: 50 documents
   - Use cursor-based pagination

3. **Caching**
   - Client-side caching for static data
   - Use React Query or SWR
   - Cache tenant settings globally

4. **Real-time Listeners**
   - Use sparingly (costs per document)
   - Limit to active screens only
   - Unsubscribe when component unmounts

### Cost Optimization

**Firestore Pricing (as of 2024):**
- Reads: $0.36 per 1M documents
- Writes: $1.08 per 1M documents
- Deletes: $0.02 per 1M documents
- Storage: $0.18 per GB

**Estimated Costs per Tenant:**
- Small restaurant (~50 orders/day): $2-3/month
- Medium restaurant (~200 orders/day): $8-12/month
- Large restaurant (~500 orders/day): $20-30/month

---

## Monitoring and Logging

### Audit Logging

Every operation is logged with:
- Action (create, update, delete)
- Entity type and ID
- User ID and name
- Timestamp
- Changes (before/after)
- IP address
- Metadata

### Session Tracking

Sessions include:
- Login/logout times
- Last activity timestamp
- Device and browser info
- IP address
- Active/inactive status

### Performance Monitoring

Use Firebase Performance Monitoring:
- Page load times
- API response times
- Network latency
- Cache hit rates

---

## Backup and Recovery

### Firestore Backup Strategy

1. **Automated Exports**
   ```bash
   gcloud firestore export gs://bucket-name/path
   ```

2. **Scheduled Exports**
   - Daily: Full database export
   - Hourly: Transaction logs
   - Retention: 30 days

3. **Point-in-Time Recovery**
   - Use Firestore point-in-time recovery
   - Retention: 7 days (configurable)

### Disaster Recovery Plan

1. **Tenant Data Loss**
   - Restore from latest export
   - Replay transaction logs
   - Verify data integrity

2. **Complete System Failure**
   - Deploy to backup Firebase project
   - Restore Firestore from exports
   - Update DNS to backup instance
   - Verify all services operational

---

## Testing Strategy

### Unit Tests
- Service layer functions
- Utility functions
- Data transformations

### Integration Tests
- Authentication flow
- Tenant resolution
- CRUD operations
- Permission checks

### Security Tests
- Firestore rules validation
- Cross-tenant access attempts
- Custom claims validation
- Role-based access control

### Load Tests
- Concurrent user simulation
- High-volume order creation
- Real-time listener performance
- Database write throughput

---

## Deployment Pipeline

### Development
```bash
firebase use dev
firebase emulators:start
npm run dev
```

### Staging
```bash
firebase use staging
firebase deploy
npm run build
npm run preview
```

### Production
```bash
firebase use production
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
npm run build
firebase deploy --only hosting
```

---

## Security Best Practices

1. ✅ Never trust client-provided tenant IDs
2. ✅ Always validate custom claims in security rules
3. ✅ Use serverTimestamp() for all dates
4. ✅ Validate required fields in security rules
5. ✅ Log all sensitive operations
6. ✅ Rotate API tokens regularly
7. ✅ Monitor failed authentication attempts
8. ✅ Implement rate limiting for Cloud Functions
9. ✅ Use environment variables for secrets
10. ✅ Regular security audits

---

## Compliance

### Data Privacy
- GDPR compliant
- Data residency options
- User data export
- Right to deletion

### Data Retention
- Active data: Indefinite
- Deleted data: 30 days
- Audit logs: 1 year
- Backups: 30 days

---

## Future Enhancements

### Phase 2
- [ ] Subdomain support
- [ ] Custom domain mapping
- [ ] Advanced analytics
- [ ] Bulk operations
- [ ] Data export tools

### Phase 3
- [ ] Multi-location support
- [ ] Franchise management
- [ ] White-label solutions
- [ ] API marketplace
- [ ] Third-party integrations

---

## References

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Multi-Tenancy Best Practices](https://cloud.google.com/architecture/best-practices-for-multi-tenant-saas)

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-01  
**Author:** KAVO-SYS Development Team

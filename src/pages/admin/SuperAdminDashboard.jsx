/**
 * Super Admin Dashboard
 * 
 * Platform administration for managing all tenants, users, and subscriptions.
 * Only accessible by super admins (role === 'admin').
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, functions, db } from '../../firebase/config';
import tenantService from '../../firebase/services/tenantService';
import { hashPassword } from '../../utils/password';

const SuperAdminDashboard = () => {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [stats, setStats] = useState({
    totalTenants: 0,
    activeTenants: 0,
    trialTenants: 0,
    suspendedTenants: 0,
  });

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Debug: Check auth claims on mount
  useEffect(() => {
    const checkAuthClaims = async () => {
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdTokenResult();
        console.log('🔑 Super Admin Auth Check:');
        console.log('  UID:', user.uid);
        console.log('  Email:', user.email);
        console.log('  Claims:', token.claims);
        console.log('  Has admin role?', token.claims.role === 'admin');
      }
    };
    checkAuthClaims();
  }, []);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const result = await tenantService.getTenants(50);
      setTenants(result.tenants);
      
      // Calculate stats
      const stats = {
        totalTenants: result.tenants.length,
        activeTenants: result.tenants.filter((t) => t.status === 'active').length,
        trialTenants: result.tenants.filter((t) => t.status === 'trial').length,
        suspendedTenants: result.tenants.filter((t) => t.status === 'suspended').length,
      };
      setStats(stats);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading tenants:', error);
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', minHeight: '100vh', background: '#f5f5f5' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Super Admin Dashboard</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '0.5rem 1rem',
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Create New Tenant
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '0.5rem 1rem',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Statistics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard title="Total Tenants" value={stats.totalTenants} color="#007bff" />
        <StatCard title="Active" value={stats.activeTenants} color="#28a745" />
        <StatCard title="Trial" value={stats.trialTenants} color="#ffc107" />
        <StatCard title="Suspended" value={stats.suspendedTenants} color="#dc3545" />
      </div>

      {/* Tenants Table */}
      <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ marginBottom: '1rem' }}>All Tenants</h2>
        
        {loading ? (
          <p>Loading tenants...</p>
        ) : (
          <TenantsTable tenants={tenants} onRefresh={loadTenants} />
        )}
      </div>

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadTenants();
          }}
        />
      )}
    </div>
  );
};

const StatCard = ({ title, value, color }) => (
  <div
    style={{
      background: 'white',
      borderRadius: '8px',
      padding: '1.5rem',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
    }}
  >
    <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>{title}</div>
    <div style={{ fontSize: '2rem', fontWeight: 'bold', color }}>{value}</div>
  </div>
);

const TenantsTable = ({ tenants, onRefresh }) => {
  const [expandedTenant, setExpandedTenant] = useState(null);

  const handleDisable = async (tenantId) => {
    if (!confirm('Are you sure you want to disable this tenant?')) return;

    try {
      const disableTenant = httpsCallable(functions, 'disableTenant');
      await disableTenant({ tenantId });
      alert('Tenant disabled successfully');
      onRefresh();
    } catch (error) {
      console.error('Error disabling tenant:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleEnable = async (tenantId) => {
    try {
      const enableTenant = httpsCallable(functions, 'enableTenant');
      await enableTenant({ tenantId });
      alert('Tenant enabled successfully');
      onRefresh();
    } catch (error) {
      console.error('Error enabling tenant:', error);
      alert('Error: ' + error.message);
    }
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
          <th style={{ padding: '0.75rem' }}>Name</th>
          <th style={{ padding: '0.75rem' }}>Token (URL)</th>
          <th style={{ padding: '0.75rem' }}>Status</th>
          <th style={{ padding: '0.75rem' }}>Plan</th>
          <th style={{ padding: '0.75rem' }}>Created</th>
          <th style={{ padding: '0.75rem' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {tenants.map((tenant) => (
          <tr key={tenant.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
            <td style={{ padding: '0.75rem' }}>{tenant.name}</td>
            <td style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <code style={{ background: '#f5f5f5', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                  /{tenant.token}
                </code>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/${tenant.token}`;
                    navigator.clipboard.writeText(url);
                    alert('URL copied to clipboard!');
                  }}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  📋 Copy URL
                </button>
              </div>
            </td>
            <td style={{ padding: '0.75rem' }}>
              <StatusBadge status={tenant.status} />
            </td>
            <td style={{ padding: '0.75rem' }}>
              <span style={{ textTransform: 'capitalize' }}>{tenant.plan}</span>
            </td>
            <td style={{ padding: '0.75rem' }}>
              {tenant.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A'}
            </td>
            <td style={{ padding: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setExpandedTenant(expandedTenant === tenant.id ? null : tenant.id)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: '#f5f5f5',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {expandedTenant === tenant.id ? 'Hide' : 'View'}
                </button>
                {tenant.status === 'active' || tenant.status === 'trial' ? (
                  <button
                    onClick={() => handleDisable(tenant.id)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    onClick={() => handleEnable(tenant.id)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Enable
                  </button>
                )}
              </div>
              {expandedTenant === tenant.id && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9f9f9', borderRadius: '4px' }}>
                  <p><strong>ID:</strong> {tenant.id}</p>
                  <p><strong>Token:</strong> <code>{tenant.token}</code></p>
                  <p><strong>Login URL:</strong> <a href={`/${tenant.slug}`}>/{tenant.slug}</a></p>
                  <p><strong>Domain:</strong> {tenant.domain || 'None'}</p>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const StatusBadge = ({ status }) => {
  const colors = {
    active: '#28a745',
    trial: '#ffc107',
    suspended: '#dc3545',
    disabled: '#6c757d',
  };

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.25rem 0.75rem',
        background: colors[status] || '#6c757d',
        color: 'white',
        borderRadius: '12px',
        fontSize: '0.875rem',
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  );
};

const CreateTenantModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    tenantName: '',
    ownerEmail: '',
    ownerPassword: '',
    ownerName: '',
    domain: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Generate slug and token
      const slug = formData.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Check if slug exists
      try {
        const existingTenant = await tenantService.getTenantBySlug(slug);
        if (existingTenant) {
          throw new Error('A tenant with this name already exists');
        }
      } catch (err) {
        // If error is "Tenant not found", that's what we want - continue
        if (!err.message.includes('Tenant not found')) {
          console.error('Error checking slug:', err);
          throw err;
        }
        // Suppress "Tenant not found" error - it's expected
      }

      // Create tenant document directly in Firestore
      console.log('Creating tenant document...');
      const tenantRef = await addDoc(collection(db, 'tenants'), {
        name: formData.tenantName,
        slug: slug,
        token: token,
        domain: formData.domain || null,
        status: 'active',
        plan: 'trial',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        settings: {
          currency: 'USD',
          language: 'en',
          timezone: 'UTC',
        },
      });
      console.log('Tenant created with ID:', tenantRef.id);

      // Create owner user in Firestore subcollection (NOT in Firebase Auth)
      console.log('Creating owner user...');
      const hashedPassword = await hashPassword(formData.ownerPassword);
      const ownerRef = await addDoc(collection(db, 'tenants', tenantRef.id, 'users'), {
        email: formData.ownerEmail,
        name: formData.ownerName,
        username: formData.ownerEmail.split('@')[0],
        password: hashedPassword, // Hashed using PBKDF2
        role: 'owner',
        tenantId: tenantRef.id,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        permissions: {
          all: true, // Owner has all permissions
        },
      });
      console.log('Owner user created with ID:', ownerRef.id);

      const loginUrl = `${window.location.origin}/${token}`;

      // Copy URL to clipboard (with fallback)
      let clipboardSuccess = false;
      try {
        await navigator.clipboard.writeText(loginUrl);
        clipboardSuccess = true;
      } catch (clipErr) {
        console.warn('Clipboard write failed:', clipErr);
      }

      alert(`✅ Tenant Created Successfully!\n\n` +
            `Tenant Name: ${formData.tenantName}\n` +
            `Tenant Token: ${token}\n` +
            `Login URL: ${loginUrl}\n\n` +
            `Owner Credentials:\n` +
            `Username: ${formData.ownerEmail}\n` +
            `Password: ${formData.ownerPassword}\n\n` +
            `⚠️ NOTE: Tenant users are stored in Firestore, NOT in Firebase Authentication.\n` +
            `Only the super admin uses Firebase Auth.\n\n` +
            (clipboardSuccess ? `URL copied to clipboard!` : `Please copy the URL manually.`));

      onSuccess();
    } catch (err) {
      console.error('Error creating tenant:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '2rem',
          maxWidth: '500px',
          width: '100%',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginBottom: '1.5rem' }}>Create New Tenant</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Tenant Name *
            </label>
            <input
              type="text"
              required
              value={formData.tenantName}
              onChange={(e) => setFormData({ ...formData, tenantName: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
              placeholder="Pizza Palace"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Owner Name *
            </label>
            <input
              type="text"
              required
              value={formData.ownerName}
              onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
              placeholder="John Doe"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Owner Email *
            </label>
            <input
              type="email"
              required
              value={formData.ownerEmail}
              onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
              placeholder="owner@example.com"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Owner Password *
            </label>
            <input
              type="password"
              required
              value={formData.ownerPassword}
              onChange={(e) => setFormData({ ...formData, ownerPassword: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
              placeholder="Minimum 6 characters"
              minLength={6}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Custom Domain (Optional)
            </label>
            <input
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
              }}
              placeholder="pizza-palace.com"
            />
          </div>

          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8d7da', color: '#721c24', borderRadius: '4px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {loading ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;

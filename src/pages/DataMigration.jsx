/**
 * Migration UI Component
 * 
 * User interface for migrating data from local Dexie database to Firebase.
 */

import React, { useState } from 'react';

// Check if Firebase is configured
const isFirebaseConfigured = () => {
  try {
    // Check if env variables exist
    return !!(import.meta.env.VITE_FIREBASE_PROJECT_ID);
  } catch {
    return false;
  }
};

const DataMigration = ({ onBack }) => {
  const firebaseConfigured = isFirebaseConfigured();
  const [migrating, setMigrating] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [showGuide, setShowGuide] = useState(!firebaseConfigured);

  const handleMigration = async () => {
    if (!firebaseConfigured) {
      alert('Please configure Firebase first. See the setup guide below.');
      return;
    }

    if (!confirm('Are you sure you want to migrate data? This will transfer all local data to Firebase.')) {
      return;
    }

    try {
      setMigrating(true);
      setError(null);
      setResults(null);
      setProgress('Initializing migration...');

      // Dynamic import to avoid errors when Firebase isn't configured
      const { default: migrationService } = await import('../firebase/services/migrationService');
      
      setProgress('Migrating categories...');
      await new Promise((resolve) => setTimeout(resolve, 500));

      setProgress('Migrating products...');
      await new Promise((resolve) => setTimeout(resolve, 500));

      setProgress('Migrating customers...');
      await new Promise((resolve) => setTimeout(resolve, 500));

      setProgress('Migrating tables...');
      await new Promise((resolve) => setTimeout(resolve, 500));

      setProgress('Migrating orders...');
      await new Promise((resolve) => setTimeout(resolve, 500));

      const migrationResults = await migrationService.migrateAll();
      
      setResults(migrationResults.results);
      setProgress('Migration completed!');
      setMigrating(false);

      alert('Migration completed successfully! Check the results below.');
    } catch (err) {
      console.error('Migration error:', err);
      setError(err.message);
      setMigrating(false);
    }
  };

  const handleExportLog = async () => {
    try {
      const { default: migrationService } = await import('../firebase/services/migrationService');
      migrationService.exportLog();
    } catch (err) {
      alert('Migration service not available. Please configure Firebase first.');
    }
  };

  // Setup guide component
  const SetupGuide = () => (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔄</div>
        <h1 style={{ margin: 0, color: '#070c16' }}>Firebase Migration Tool</h1>
        <p style={{ color: '#666', marginTop: '0.5rem' }}>
          Migrate your local POS data to Firebase multi-tenant cloud infrastructure
        </p>
      </div>

      <div
        style={{
          padding: '1.5rem',
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
          marginBottom: '2rem',
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#856404' }}>⚠️ Firebase Not Configured</h3>
        <p style={{ margin: 0, color: '#856404' }}>
          Before you can migrate, you need to set up Firebase. Follow the steps below.
        </p>
      </div>

      {/* Quick Setup Steps */}
      <div style={{ background: 'white', padding: '2rem', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>🚀 Quick Setup (5 minutes)</h2>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#007bff' }}>Step 1: Create Firebase Project</h3>
          <ol style={{ paddingLeft: '1.5rem', lineHeight: '1.8' }}>
            <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>Firebase Console</a></li>
            <li>Click "Add Project"</li>
            <li>Name it (e.g., "kavo-sys-pos")</li>
            <li>Enable Firestore, Authentication, and Functions</li>
          </ol>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#007bff' }}>Step 2: Get Firebase Credentials</h3>
          <ol style={{ paddingLeft: '1.5rem', lineHeight: '1.8' }}>
            <li>In Firebase Console, click Settings ⚙️ → Project Settings</li>
            <li>Scroll to "Your apps" → Click web icon {"</>"}</li>
            <li>Register app and copy the config object</li>
          </ol>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#007bff' }}>Step 3: Configure Environment</h3>
          <div style={{ background: '#f6f8fa', padding: '1rem', borderRadius: '4px', marginTop: '0.5rem' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#666' }}>
              Create a <code style={{ background: '#e1e4e8', padding: '2px 6px', borderRadius: '3px' }}>.env</code> file in your project root:
            </p>
            <pre style={{ 
              background: '#0d1117', 
              color: '#c9d1d9', 
              padding: '1rem', 
              borderRadius: '4px', 
              overflow: 'auto',
              fontSize: '0.85rem',
              margin: 0 
            }}>
{`VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_APP_URL=https://yourapp.com`}</pre>
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#007bff' }}>Step 4: Deploy Firebase Infrastructure</h3>
          <div style={{ background: '#f6f8fa', padding: '1rem', borderRadius: '4px', marginTop: '0.5rem' }}>
            <pre style={{ 
              background: '#0d1117', 
              color: '#c9d1d9', 
              padding: '1rem', 
              borderRadius: '4px', 
              overflow: 'auto',
              fontSize: '0.85rem',
              margin: 0 
            }}>
{`# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy infrastructure
firebase deploy --only firestore:rules
firebase deploy --only functions`}</pre>
          </div>
        </div>

        <div>
          <h3 style={{ color: '#28a745' }}>✅ Ready!</h3>
          <p style={{ margin: 0, color: '#666' }}>
            After completing these steps, restart your dev server and return to this page.
          </p>
        </div>
      </div>

      {/* Documentation Links */}
      <div style={{ background: '#f8f9fa', padding: '1.5rem', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0 }}>📚 Documentation</h3>
        <ul style={{ lineHeight: '2' }}>
          <li><strong>QUICK_START.md</strong> - Complete setup guide</li>
          <li><strong>FIREBASE_MIGRATION_GUIDE.md</strong> - Detailed technical guide</li>
          <li><strong>TECHNICAL_SPECIFICATION.md</strong> - Architecture details</li>
        </ul>
      </div>

      {onBack && (
        <button
          onClick={onBack}
          style={{
            marginTop: '2rem',
            padding: '0.75rem 1.5rem',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          ← Back to Home
        </button>
      )}
    </div>
  );

  // Show setup guide if Firebase isn't configured
  if (showGuide) {
    return <SetupGuide />;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      
      {onBack && (
        <button
          onClick={onBack}
          style={{
            marginBottom: '1rem',
            padding: '0.5rem 1rem',
            background: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
      )}
      
      <h1>Database Migration</h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Transfer your local database to Firebase Firestore. This will migrate all categories, products,
        customers, tables, and orders to the cloud.
      </p>

      {/* Warning */}
      <div
        style={{
          padding: '1rem',
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          marginBottom: '2rem',
        }}
      >
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#856404' }}>⚠️ Important</h3>
        <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#856404' }}>
          <li>Make sure you have a backup of your local database</li>
          <li>The migration process may take several minutes depending on data size</li>
          <li>Do not close this window during migration</li>
          <li>This operation cannot be undone</li>
        </ul>
      </div>

      {/* Migration Button */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={handleMigration}
          disabled={migrating}
          style={{
            padding: '1rem 2rem',
            background: migrating ? '#6c757d' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: migrating ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          {migrating ? 'Migrating...' : 'Start Migration'}
        </button>

        <button
          onClick={() => setShowGuide(true)}
          style={{
            marginLeft: '1rem',
            padding: '1rem 2rem',
            background: 'transparent',
            color: '#007bff',
            border: '1px solid #007bff',
            borderRadius: '4px',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          Setup Guide
        </button>
      </div>

      {/* Progress */}
      {migrating && (
        <div
          style={{
            padding: '1rem',
            background: '#e7f3ff',
            border: '1px solid #007bff',
            borderRadius: '4px',
            marginBottom: '2rem',
          }}
        >
          <p style={{ margin: 0, color: '#004085' }}>
            <strong>{progress}</strong>
          </p>
          <div
            style={{
              marginTop: '0.5rem',
              height: '4px',
              background: '#ccc',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                background: '#007bff',
                width: '100%',
                animation: 'progress 2s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#f8d7da',
            border: '1px solid #dc3545',
            borderRadius: '4px',
            marginBottom: '2rem',
            color: '#721c24',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem 0' }}>❌ Migration Failed</h3>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div
          style={{
            padding: '1.5rem',
            background: 'white',
            border: '1px solid #28a745',
            borderRadius: '8px',
            marginBottom: '2rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, color: '#28a745' }}>✅ Migration Successful</h2>
            {firebaseConfigured && (
              <button
                onClick={handleExportLog}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Export Log
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <ResultCard title="Categories" data={results.categories} />
            <ResultCard title="Products" data={results.products} />
            <ResultCard title="Customers" data={results.customers} />
            <ResultCard title="Tables" data={results.tables} />
            <ResultCard title="Orders" data={results.orders} />
          </div>
        </div>
      )}

      {/* Instructions */}
      <div
        style={{
          padding: '1.5rem',
          background: '#f8f9fa',
          borderRadius: '8px',
          marginTop: '2rem',
        }}
      >
        <h3>What happens after migration?</h3>
        <ol style={{ paddingLeft: '1.5rem' }}>
          <li>All your data will be available in Firebase Firestore</li>
          <li>Your application will automatically use the cloud database</li>
          <li>The local database will remain unchanged as a backup</li>
          <li>You can continue using the system normally</li>
          <li>All new data will be stored in Firebase</li>
        </ol>
      </div>
    </div>
  );
};

const ResultCard = ({ title, data }) => (
  <div
    style={{
      padding: '1rem',
      background: '#f8f9fa',
      borderRadius: '4px',
      border: '1px solid #e0e0e0',
    }}
  >
    <h4 style={{ margin: '0 0 0.5rem 0' }}>{title}</h4>
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>Migrated:</span>
      <strong style={{ color: '#28a745' }}>{data.migrated || 0}</strong>
    </div>
    {data.failed > 0 && (
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Failed:</span>
        <strong style={{ color: '#dc3545' }}>{data.failed}</strong>
      </div>
    )}
  </div>
);

export default DataMigration;

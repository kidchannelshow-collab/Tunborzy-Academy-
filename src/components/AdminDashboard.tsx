import React, { useState, useEffect } from 'react';
import AdminDashboardLayout from './admin/AdminDashboardLayout';
import Overview from './admin/Overview';
import UserManagement from './admin/UserManagement';
import LecturerManagement from './admin/LecturerManagement';
import CourseManagement from './admin/CourseManagement';
import UTMEManagement from './utme/UTMEManagement';
import PostUtmeManagement from './postutme/PostUtmeManagement';
import UndergraduateManager from './admin/UndergraduateManager';
import Analytics from './admin/Analytics';
import PartnershipManagement from './admin/PartnershipManagement';
import SystemSettings from './admin/SystemSettings';
import PendingReviews from './admin/PendingReviews';
import AuditLog from './admin/AuditLog';

interface AdminDashboardProps {
  onLogout: () => void;
  onNavigate?: (view: string) => void;
}

/**
 * The admin sub-view is not a URL route. The sidebar ids are local state here,
 * not entries in App.tsx's hash router — and writing them to the hash would fight
 * App.tsx's `hashchange` handler, which would treat an unknown hash as a
 * top-level route and blank the page. sessionStorage keeps the chosen section
 * selected across a refresh without touching routing.
 */
const ADMIN_VIEW_STORAGE_KEY = 'tunborzy.admin.currentView';

function readStoredAdminView(): string {
  try {
    return sessionStorage.getItem(ADMIN_VIEW_STORAGE_KEY) || 'overview';
  } catch {
    // Storage can throw in a private window or when site data is blocked.
    return 'overview';
  }
}

export default function AdminDashboard({ onLogout, onNavigate }: AdminDashboardProps) {
  const [currentView, setCurrentView] = useState<string>(readStoredAdminView);

  useEffect(() => {
    try {
      sessionStorage.setItem(ADMIN_VIEW_STORAGE_KEY, currentView);
    } catch {
      // Non-fatal: the section simply will not survive a refresh.
    }
  }, [currentView]);

  const renderView = () => {
    switch (currentView) {
      case 'overview':
        return <Overview />;
      case 'users':
        return <UserManagement />;
      case 'lecturers':
        return <LecturerManagement />;
      case 'courses':
        // onNavigate lets the UTME branch hand off to the existing CBT Manager
        // instead of duplicating question management inside Course Management.
        return <CourseManagement onNavigate={setCurrentView} />;
      case 'utme':
        return <UTMEManagement />;
      case 'post-utme':
        return <PostUtmeManagement />;
      case 'ug_cbt':
        return <UndergraduateManager />;
      case 'analytics':
      // Undergraduate Performance is now the fourth tab of Analytics; the
      // standalone destination is gone, so this id routes there for any
      // bookmarked link.
      case 'ug_performance':
        return <Analytics />;
      case 'partnerships':
        return <PartnershipManagement />;
      case 'reviews':
        return <PendingReviews />;
      case 'settings':
        return <SystemSettings />;
      case 'audit':
        return <AuditLog />;
      default:
        return <Overview />;
    }
  };

  return (
    <AdminDashboardLayout 
      onLogout={onLogout} 
      currentView={currentView} 
      onNavigate={(view) => {
        if (view === 'announcements') {
          onNavigate?.('announcements');
          return;
        }
        setCurrentView(view);
      }}
    >
      {renderView()}
    </AdminDashboardLayout>
  );
}

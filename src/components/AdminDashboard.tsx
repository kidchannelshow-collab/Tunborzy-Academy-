import React, { useState } from 'react';
import AdminDashboardLayout from './admin/AdminDashboardLayout';
import Overview from './admin/Overview';
import UserManagement from './admin/UserManagement';
import LecturerManagement from './admin/LecturerManagement';
import CourseManagement from './admin/CourseManagement';
import UTMEManagement from './utme/UTMEManagement';
import PostUtmeManagement from './postutme/PostUtmeManagement';
import AIManagement from './admin/AIManagement';
import ConversationManagement from './admin/ConversationManagement';
import AIFeedbackManagement from './admin/AIFeedbackManagement';
import AIPerformanceDashboard from './admin/AIPerformanceDashboard';
import Analytics from './admin/Analytics';
import AdminUndergraduatePerformance from './admin/AdminUndergraduatePerformance';
import PartnershipManagement from './admin/PartnershipManagement';
import SystemSettings from './admin/SystemSettings';
import PendingReviews from './admin/PendingReviews';
import AuditLog from './admin/AuditLog';

interface AdminDashboardProps {
  onLogout: () => void;
  onNavigate?: (view: string) => void;
}

export default function AdminDashboard({ onLogout, onNavigate }: AdminDashboardProps) {
  const [currentView, setCurrentView] = useState('overview');

  const renderView = () => {
    switch (currentView) {
      case 'overview':
        return <Overview />;
      case 'users':
        return <UserManagement />;
      case 'lecturers':
        return <LecturerManagement />;
      case 'courses':
        return <CourseManagement />;
      case 'utme':
        return <UTMEManagement />;
      case 'post-utme':
        return <PostUtmeManagement />;
      case 'ai':
        return <AIManagement />;
      case 'conversations':
        return <ConversationManagement />;
      case 'feedback':
        return <AIFeedbackManagement />;
      case 'ai_performance':
        return <AIPerformanceDashboard />;
      case 'analytics':
        return <Analytics />;
      case 'ug_performance':
        return <AdminUndergraduatePerformance />;
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

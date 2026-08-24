import { useState, useEffect } from 'react';
import DashboardLayout from './dashboard/DashboardLayout';
import UTMEDashboard from './utme/UTMEDashboard';
import UTMEExamTaker from './utme/UTMEExamTaker';
import UTMEResultView from './utme/UTMEResultView';
import PostUtmeDrillPage from './postutme/PostUtmeDrillPage';
import { useProfile } from '../lib/useProfile';

export default function UTMECBTPage({ onLogout, onNavigate }: { onLogout: () => void, onNavigate?: (view: string) => void }) {
  const { profile, loading } = useProfile();
  const [view, setView] = useState<'dashboard' | 'exam' | 'result'>('dashboard');
  const [examConfig, setExamConfig] = useState<any>(null);
  const [examResult, setExamResult] = useState<any>(null);

  if (loading) {
    return (
      <DashboardLayout onLogout={onLogout} currentView="utme" onNavigate={onNavigate}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (profile?.portal === 'Post-UTME') {
    return (
      <DashboardLayout onLogout={onLogout} currentView="utme" onNavigate={onNavigate}>
        <PostUtmeDrillPage />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout onLogout={onLogout} currentView="utme" onNavigate={onNavigate}>
      {view === 'dashboard' && (
        <UTMEDashboard
          onStartExam={(config) => {
            setExamConfig(config);
            setView('exam');
          }}
          onViewHistory={() => {}}
        />
      )}

      {view === 'exam' && examConfig && (
        <UTMEExamTaker
          config={examConfig}
          onFinish={(res) => {
            setExamResult(res);
            setView('result');
          }}
          onCancel={() => setView('dashboard')}
        />
      )}

      {view === 'result' && examResult && (
        <UTMEResultView
          result={examResult}
          onRetry={() => setView('exam')}
          onBack={() => setView('dashboard')}
        />
      )}
    </DashboardLayout>
  );
}

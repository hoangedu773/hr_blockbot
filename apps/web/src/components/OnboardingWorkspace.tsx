import { useState } from 'react';
import { InitialReportingView } from './InitialReportingView';
import { OnboardingView } from './OnboardingView';

export function OnboardingWorkspace({ canReadOnboarding, canReadReporting }: {
  canReadOnboarding: boolean;
  canReadReporting: boolean;
}) {
  const [showReporting, setShowReporting] = useState(false);
  const reporting = canReadReporting && (showReporting || !canReadOnboarding);
  return <>
    {canReadOnboarding && canReadReporting && <div className="crm-work-actions" aria-label="Tiếp nhận và quản lý trực tiếp">
      <button type="button" className="btn" aria-pressed={!reporting} onClick={() => setShowReporting(false)}>Hồ sơ tiếp nhận</button>
      <button type="button" className="btn" aria-pressed={reporting} onClick={() => setShowReporting(true)}>Quản lý trực tiếp</button>
    </div>}
    {reporting ? <InitialReportingView /> : <OnboardingView />}
  </>;
}

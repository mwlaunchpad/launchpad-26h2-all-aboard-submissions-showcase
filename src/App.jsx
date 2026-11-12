import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Picker from './variants/picker/Picker.jsx';
import { VariantBar } from './components/Chrome.jsx';
import { config_ } from './lib/content.js';

const Manifest = lazy(() => import('./variants/manifest/Manifest.jsx'));
const MissionControl = lazy(() => import('./variants/mission-control/MissionControl.jsx'));
const LaunchSequence = lazy(() => import('./variants/launch-sequence/LaunchSequence.jsx'));
const FlightLog = lazy(() => import('./variants/flight-log/FlightLog.jsx'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const home = config_.defaultVariant ? <Navigate to={`/${config_.defaultVariant}`} replace /> : <Picker />;
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<div className="loading" aria-busy="true" />}>
        <Routes>
          <Route path="/" element={home} />
          <Route path="/layouts" element={<Picker />} />
          <Route path="/manifest/*" element={<Manifest />} />
          <Route path="/mission-control/:slug?" element={<MissionControl />} />
          <Route path="/launch-sequence" element={<LaunchSequence />} />
          <Route path="/flight-log" element={<FlightLog />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <VariantBar />
    </>
  );
}

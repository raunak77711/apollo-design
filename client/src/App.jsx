import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.jsx';
import { ToastProvider } from './lib/toast.jsx';
import { Spinner } from './ui/primitives.jsx';
import Home from './pages/Home.jsx';

// Home is the landing page and loads eagerly; everything else — especially the
// editor, which pulls in the icon libraries and the whole design toolchain —
// only downloads once it's actually visited.
const Templates = lazy(() => import('./pages/Templates.jsx'));
const Scribble = lazy(() => import('./pages/ScribblePage.jsx'));
const Assets = lazy(() => import('./pages/Assets.jsx'));
const EditorPage = lazy(() => import('./pages/EditorPage.jsx'));

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/scribble" element={<Scribble />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/editor/:id" element={<EditorPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner />
    </div>
  );
}

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
const ApolloAI = lazy(() => import('./pages/ApolloAI.jsx'));
const Assets = lazy(() => import('./pages/Assets.jsx'));
const EditorPage = lazy(() => import('./pages/EditorPage.jsx'));
const Boards = lazy(() => import('./pages/BoardsPage.jsx'));
const BoardPage = lazy(() => import('./pages/BoardPage.jsx'));
const Content = lazy(() => import('./pages/ContentPage.jsx'));
const Combinator = lazy(() => import('./pages/CombinatorPage.jsx'));
const Distribution = lazy(() => import('./pages/DistributionPage.jsx'));
const DistributionCallback = lazy(() => import('./pages/DistributionCallback.jsx'));

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
              <Route path="/ai" element={<ApolloAI />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/editor/:id" element={<EditorPage />} />
              <Route path="/board" element={<Boards />} />
              <Route path="/board/:id" element={<BoardPage />} />
              <Route path="/content" element={<Content />} />
              <Route path="/content-machine" element={<Combinator />} />
              <Route path="/combinator" element={<Navigate to="/content-machine" replace />} />
              <Route path="/content/:id" element={<Content />} />
              <Route path="/distribution/callback" element={<DistributionCallback />} />
              <Route path="/distribution" element={<Distribution />} />
              <Route path="/distribution/:id" element={<Distribution />} />
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

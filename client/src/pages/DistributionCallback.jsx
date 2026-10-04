import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { distributionApi } from '../api/distribution.js';
import { Spinner } from '../ui/primitives.jsx';

/** Where a platform's OAuth consent screen sends the browser back to. `state` carries which platform. */
export default function DistributionCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = params.get('code');
    const platform = params.get('state');
    const redirectUri = sessionStorage.getItem('apollo:oauth:redirect') || `${window.location.origin}/distribution/callback`;
    if (!code || !platform) {
      setError('That link is missing what it needs to connect the account.');
      return;
    }
    distributionApi
      .connectAccount(platform, code, redirectUri)
      .then(() => navigate('/distribution', { replace: true }))
      .catch((e) => setError(e.message));
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-void text-ink">
      {error ? (
        <div className="max-w-sm text-center">
          <p className="text-[14px] text-danger">{error}</p>
          <a href="/distribution" className="mt-3 inline-block text-sm text-ink-2 underline hover:text-ink">Back to Distribution</a>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <p className="text-sm text-ink-3">Connecting the account…</p>
        </div>
      )}
    </div>
  );
}

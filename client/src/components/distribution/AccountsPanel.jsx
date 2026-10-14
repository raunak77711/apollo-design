import { useState } from 'react';
import { ChevronDown, Copy, Link2, TriangleAlert, Unlink } from 'lucide-react';
import { distributionApi } from '../../api/distribution.js';
import { cx } from '../../lib/cx.js';
import { useToast } from '../../lib/toast.jsx';
import { Button } from '../../ui/primitives.jsx';

const LABELS = { youtube: 'YouTube', facebook: 'Facebook Page', instagram: 'Instagram', tiktok: 'TikTok' };
const CALLBACK_PATH = '/distribution/callback';

// What's actually true about each platform's setup - not fabricated, just not otherwise surfaced in the UI:
// the developer console to use, the env vars Apollo reads (see .env.example), and anything platform-specific.
const SETUP = {
  youtube: {
    console: 'https://console.cloud.google.com/apis/credentials', consoleLabel: 'Google Cloud Console — APIs & Services → Credentials',
    env: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
    extra: 'Create an "OAuth client ID" (type: Web application), and enable the "YouTube Data API v3" and "YouTube Analytics API" for the project.',
  },
  facebook: {
    console: 'https://developers.facebook.com/apps/', consoleLabel: 'Meta for Developers — My Apps',
    env: ['FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET'],
    extra: 'Add the "Facebook Login for Business" product. This also connects Instagram (below) — no separate Meta app needed.',
  },
  tiktok: {
    console: 'https://developers.tiktok.com/apps/', consoleLabel: 'TikTok for Developers — My Apps',
    env: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
    extra: 'Apply for the "Content Posting API" (Direct Post). Until TikTok approves it, connecting still works, but publishing lands in "needs review" instead of going out automatically.',
  },
  instagram: {
    console: '', consoleLabel: '', env: [],
    extra: 'No separate app: it rides on the Facebook app above. Connect Facebook first, then use "Link via..." below.',
  },
};

/**
 * Connected platform accounts, and the capability truth for each platform — never hidden, because
 * "TikTok needs its own app review before it can publish unattended" is the kind of thing a person
 * needs to see before they schedule something and wonder why it never went out.
 */
export default function AccountsPanel({ status, accounts, onChanged }) {
  const toast = useToast();
  const [linkingFacebookId, setLinkingFacebookId] = useState('');
  const [setupOpen, setSetupOpen] = useState('');
  const redirectUri = `${window.location.origin}${CALLBACK_PATH}`;

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success?.(`${label} copied`);
    } catch {
      toast.error('Could not copy that', 'Select and copy it manually.');
    }
  };

  const connect = (platform) => {
    const nonce = crypto.randomUUID();
    sessionStorage.setItem('apollo:oauth:redirect', redirectUri);
    sessionStorage.setItem('apollo:oauth:state', JSON.stringify({ nonce, platform }));
    distributionApi.authUrl(platform, redirectUri, nonce).then((url) => { window.location.href = url; }).catch((e) => toast.error("Couldn't start connecting", e.message));
  };

  const linkInstagram = async (facebookAccountId) => {
    setLinkingFacebookId(facebookAccountId);
    try {
      await distributionApi.linkInstagram(facebookAccountId);
      toast.success('Instagram linked');
      onChanged();
    } catch (e) {
      toast.error("Couldn't link Instagram", e.message);
    } finally {
      setLinkingFacebookId('');
    }
  };

  const disconnect = async (id) => {
    if (!window.confirm('Disconnect this account? Anything already scheduled to it will fail until it is reconnected.')) return;
    try {
      await distributionApi.disconnectAccount(id);
      onChanged();
    } catch (e) {
      toast.error("Couldn't disconnect", e.message);
    }
  };

  const facebookAccounts = accounts.filter((a) => a.platform === 'facebook');

  return (
    <section>
      <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Connected accounts</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {status.map((p) => {
          const connected = accounts.filter((a) => a.platform === p.platform);
          return (
            <li key={p.platform} className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[14px] text-ink">{LABELS[p.platform]}</p>
                {p.capabilities.nativeScheduling ? (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-2xs text-accent-text">native scheduling</span>
                ) : (
                  <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-2xs text-ink-3">local queue only</span>
                )}
              </div>
              {p.capabilities.requiresAppReview && (
                <p className="mt-1.5 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-3">
                  <TriangleAlert size={11} className="mt-0.5 shrink-0" /> {p.capabilities.notes}
                </p>
              )}
              {!p.configured && (
                <div className="mt-1.5">
                  <button type="button" onClick={() => setSetupOpen((s) => (s === p.platform ? '' : p.platform))} className="flex items-center gap-1 text-2xs text-ink-2 hover:text-ink">
                    <ChevronDown size={11} className={cx('transition-transform', setupOpen === p.platform && '-rotate-180')} /> Not set up yet — show me how
                  </button>
                  {setupOpen === p.platform && (
                    <div className="mt-2 space-y-2 rounded-lg border border-line bg-void p-2.5 text-2xs leading-relaxed text-ink-2">
                      {SETUP[p.platform].console && (
                        <p>
                          1. Create an app at{' '}
                          <a href={SETUP[p.platform].console} target="_blank" rel="noreferrer" className="text-ink underline hover:text-accent-text">{SETUP[p.platform].consoleLabel}</a>.
                        </p>
                      )}
                      {SETUP[p.platform].extra && <p>{SETUP[p.platform].console ? '2. ' : ''}{SETUP[p.platform].extra}</p>}
                      {SETUP[p.platform].env.length > 0 && (
                        <p className="flex flex-wrap items-center gap-1.5">
                          3. Add to the server's .env:{' '}
                          {SETUP[p.platform].env.map((v) => (
                            <button key={v} type="button" onClick={() => copy(v, v)} className="inline-flex items-center gap-1 rounded bg-raised px-1.5 py-0.5 font-mono text-ink hover:text-accent-text">
                              {v} <Copy size={9} />
                            </button>
                          ))}
                        </p>
                      )}
                      {SETUP[p.platform].console && (
                        <p className="flex flex-wrap items-center gap-1.5">
                          4. Register this exact redirect URI:{' '}
                          <button type="button" onClick={() => copy(redirectUri, 'Redirect URI')} className="inline-flex items-center gap-1 rounded bg-raised px-1.5 py-0.5 font-mono text-ink hover:text-accent-text">
                            {redirectUri} <Copy size={9} />
                          </button>
                        </p>
                      )}
                      {status.find((x) => x.platform === p.platform)?.scopes?.length > 0 && (
                        <p>5. Permissions Apollo will request: <span className="font-mono text-ink">{status.find((x) => x.platform === p.platform).scopes.join(', ')}</span>.</p>
                      )}
                      <p className="text-ink-3">Restart the server after editing .env.</p>
                    </div>
                  )}
                </div>
              )}

              <ul className="mt-2.5 space-y-1.5">
                {connected.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-raised px-2 py-1.5 text-xs">
                    <span className="truncate text-ink">{a.accountName}</span>
                    <button type="button" onClick={() => disconnect(a.id)} className="shrink-0 text-ink-3 hover:text-danger" aria-label={`Disconnect ${a.accountName}`}>
                      <Unlink size={12} />
                    </button>
                  </li>
                ))}
              </ul>

              {p.platform === 'instagram' ? (
                facebookAccounts.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {facebookAccounts.map((fb) => (
                      <Button key={fb.id} size="sm" variant="secondary" onClick={() => linkInstagram(fb.id)} disabled={linkingFacebookId === fb.id}>
                        <Link2 size={12} /> Link via {fb.accountName}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2.5 text-2xs text-ink-3">Connect Facebook first.</p>
                )
              ) : (
                <Button size="sm" variant="secondary" className="mt-2.5" onClick={() => connect(p.platform)} disabled={!p.configured}>
                  <Link2 size={12} /> Connect {LABELS[p.platform]}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const accountsNeedingSetup = (status) => status.filter((p) => !p.configured).map((p) => LABELS[p.platform]);

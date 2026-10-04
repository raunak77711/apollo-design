import { useState } from 'react';
import { Link2, TriangleAlert, Unlink } from 'lucide-react';
import { distributionApi } from '../../api/distribution.js';
import { cx } from '../../lib/cx.js';
import { useToast } from '../../lib/toast.jsx';
import { Button } from '../../ui/primitives.jsx';

const LABELS = { youtube: 'YouTube', facebook: 'Facebook Page', instagram: 'Instagram', tiktok: 'TikTok' };
const CALLBACK_PATH = '/distribution/callback';

/**
 * Connected platform accounts, and the capability truth for each platform — never hidden, because
 * "TikTok needs its own app review before it can publish unattended" is the kind of thing a person
 * needs to see before they schedule something and wonder why it never went out.
 */
export default function AccountsPanel({ status, accounts, onChanged }) {
  const toast = useToast();
  const [linkingFacebookId, setLinkingFacebookId] = useState('');

  const connect = (platform) => {
    const redirectUri = `${window.location.origin}${CALLBACK_PATH}`;
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
              {!p.configured && <p className="mt-1.5 text-2xs text-ink-3">No developer app configured yet — see the README.</p>}

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

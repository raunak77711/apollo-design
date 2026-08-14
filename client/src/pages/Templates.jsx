import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { TEMPLATES, TEMPLATE_CATEGORIES, documentFromTemplate } from '../design/templates.js';
import { useCreateDesign } from '../lib/useCreateDesign.js';
import { Button, Chip, EmptyState, Spinner } from '../ui/primitives.jsx';
import AppHeader from '../components/AppHeader.jsx';
import DesignPreview from '../components/DesignPreview.jsx';

export default function Templates() {
  const { create, creating } = useCreateDesign();
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter(
      (t) =>
        (category === 'All' || t.category === category) &&
        (!q || t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    );
  }, [category, query]);

  const use = (template) => {
    if (creating) return;
    setOpening(template.id);
    create({ name: template.name, document: documentFromTemplate(template) });
  };

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto w-full max-w-[1180px] px-5 pb-28 sm:px-8">
        <header className="pt-12 sm:pt-16">
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.035em] sm:text-[38px]">Templates</h1>
          <p className="mt-2 max-w-[54ch] text-[15px] leading-relaxed text-ink-2">
            Finished layouts, opened as live layers. Change a word, swap a photo, or ask Apollo to take it somewhere else.
          </p>
        </header>

        <div className="sticky top-14 z-30 -mx-5 mt-8 border-b border-line bg-void px-5 py-3 sm:-mx-8 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={category === 'All'} onClick={() => setCategory('All')}>
              All
            </Chip>
            {TEMPLATE_CATEGORIES.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {c}
              </Chip>
            ))}

            <div className="flex-1" />

            <div className="relative w-full sm:w-56">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates"
                className="field pl-8 pr-8"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-ink-3 transition-colors hover:text-ink"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {results.length === 0 ? (
          <EmptyState
            className="mt-16"
            icon={Search}
            title="No templates match that"
            body="Try another word, or clear the filters to see everything."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setCategory('All');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((template) => {
              const doc = documentFromTemplate(template);
              const portrait = template.canvas.height > template.canvas.width;
              return (
                <div key={template.id} className="group">
                  <button
                    onClick={() => use(template)}
                    disabled={creating}
                    className="relative block w-full overflow-hidden rounded-lg border border-line bg-workspace transition-all duration-200 ease-out hover:border-line-strong disabled:opacity-60"
                  >
                    <div className="flex aspect-[4/3] items-center justify-center p-4">
                      <DesignPreview
                        document={doc}
                        className="shadow-art transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                        style={portrait ? { height: '100%', width: 'auto' } : { width: '100%', height: 'auto' }}
                      />
                    </div>

                    <span
                      className={cx(
                        'pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-surface/95 py-2.5',
                        'translate-y-full text-[13px] font-medium text-ink opacity-0 transition-all duration-200 ease-out',
                        'group-hover:translate-y-0 group-hover:opacity-100'
                      )}
                    >
                      {opening === template.id ? (
                        <>
                          <Spinner /> Opening…
                        </>
                      ) : (
                        'Use this template'
                      )}
                    </span>
                  </button>

                  <div className="mt-2.5">
                    <p className="truncate text-[13px] font-medium text-ink">{template.name}</p>
                    <p className="num mt-0.5 text-2xs text-ink-3">
                      {template.category} · {template.canvas.width}×{template.canvas.height}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// The real board router with a scripted "model", so the browser scripts can exercise generation,
// section rebuilds and Direct mode without a DeepSeek key. Run from anywhere: node fake-server.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';

// express lives in server/node_modules; resolve it from there rather than from this docs folder.
const require = createRequire(new URL('../../../../server/package.json', import.meta.url));
const express = require('express');
const { createBoardRouter } = await import(new URL('../../../../server/src/routes/board.js', import.meta.url));

const example = JSON.parse(fs.readFileSync(new URL('../../../../client/src/components/board/example/website-is-losing-you-sales.json', import.meta.url), 'utf8'));
const PORT = Number(process.env.FAKE_PORT || 5111);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stub = {
  live: true,
  model: 'scripted',
  async completeJSON(req) {
    await sleep(120);

    if (/INSTRUCTION:/.test(req.user)) {
      const instruction = /INSTRUCTION: (.*)/.exec(req.user)[1].toLowerCase();
      const selected = JSON.parse(/SELECTED: (.*)/.exec(req.user)[1]);
      if (instruction.includes('huge')) return { operations: [{ type: 'SET_STYLE', targets: selected.slice(0, 1), changes: { fontSize: 150 } }], message: 'Made it huge.' };
      if (instruction.includes('under')) return { operations: [{ type: 'MOVE', targets: ['s3.b3'], relativeTo: 's3.b2.n1', position: 'below', gap: 60 }, { type: 'FOCUS', target: 's3.b3' }], message: 'Moved the graph under the click.' };
      if (instruction.includes('circle')) return { operations: [{ type: 'ADD_SHAPE', shape: 'circle', relativeTo: 's3.b2.n3', position: 'over', style: { color: 'problem' } }], message: 'Circled LOADING.' };
      if (instruction.includes('arrow')) return { operations: [{ type: 'ADD_ARROW', from: 's3.b2.n2', to: 's3.b2.n4', dashed: true, tone: 'problem' }], message: 'Drew the arrow.' };
      if (instruction.includes('ghost')) return { operations: [{ type: 'DELETE', target: 's99.b1.n1' }], message: 'Tried.' };
      if (instruction.includes('rename')) return { operations: [{ type: 'SET_TEXT', target: 's3.b2.n2', text: 'YOUR SITE' }], message: 'Renamed it.' };
      if (instruction.includes('insert')) return { operations: [{ type: 'INSERT_BLOCK', section: 's3', index: 2, block: { type: 'statement', text: 'THE BROWSER IS DOING ALL THIS', tone: 'problem' } }], message: 'Added a statement.' };
      return { operations: [], message: "I can't do that with these operations." };
    }

    const section = /Build section (\d+) of/.exec(req.user);
    if (section) {
      const i = Number(section[1]) - 1;
      const note = /Extra direction from the creator for this section: (.*)/.exec(req.user)?.[1] || '';
      return { blocks: note.includes('sparser') ? example.sections[i].blocks.slice(0, 1) : example.sections[i].blocks };
    }
    return { title: example.title, audience: example.audience, sections: example.sections.map(({ title, beat, density }) => ({ title, beat, density })) };
  },
};

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/board', createBoardRouter({ provider: stub }));
app.listen(PORT, () => console.log(`scripted board server on ${PORT}`));

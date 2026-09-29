import assert from 'node:assert/strict';

const bounds = (i) => ({ x: i.cx - i.w / 2, y: i.cy - i.h / 2, w: i.w, h: i.h });

/** The layout contract every scene must satisfy — see Task 9. */
export function checkScene(scene) {
  // sections are contiguous and cover the whole height
  let y = 0;
  for (const s of scene.sections) {
    assert.equal(s.y, y, `section ${s.id} should start where the last ended`);
    assert.ok(s.height >= 1000, 'sections have a minimum height');
    y += s.height;
  }
  assert.equal(scene.height, y);

  for (const block of Object.values(scene.blocks)) {
    assert.ok(Math.abs(block.x + block.w / 2 - 700) < 1, `${block.id} is centred on x = 700`);
    const section = scene.sections.find((s) => s.id === block.section);
    assert.ok(block.y >= section.y && block.y + block.h <= section.y + section.height, `${block.id} is inside its section`);
    for (const item of scene.items.filter((i) => i.block === block.id && i.kind !== 'connector')) {
      const b = bounds(item);
      assert.ok(b.x >= block.x - 2 && b.x + b.w <= block.x + block.w + 2, `${item.id} is inside ${block.id} horizontally`);
      assert.ok(b.y >= block.y - 2 && b.y + b.h <= block.y + block.h + 2, `${item.id} is inside ${block.id} vertically`);
    }
  }

  // blocks never overlap each other
  const list = Object.values(scene.blocks);
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const apart = a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5;
      assert.ok(apart, `${a.id} and ${b.id} overlap`);
    }
  }

  // legibility: nothing is set below 16
  for (const item of scene.items) {
    if (item.kind === 'text') assert.ok(item.font.size >= 16, `${item.id} font ${item.font.size} is too small`);
    if (item.kind === 'box' && item.label) assert.ok(item.labelFont.size >= 16, `${item.id} label is too small`);
    if (item.kind === 'box' && item.tag) assert.ok(item.tagFont.size >= 16, `${item.id} tag is too small`);
    // every id is unique
  }
  const ids = scene.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'item ids are unique');
}

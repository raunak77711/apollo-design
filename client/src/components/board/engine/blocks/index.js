import { layoutBrowser, layoutCards, layoutCompare, layoutHub, layoutPanels } from './diagramBlocks.js';
import { layoutBucket, layoutEquation, layoutList, layoutLoop, layoutMatrix } from './conceptBlocks.js';
import { layoutFlow, layoutFunnel, layoutTimeline } from './flowBlocks.js';
import { layoutBigtype, layoutCode, layoutQuote, layoutStatement, layoutTitle } from './textBlocks.js';

/** One layout function per block type. Each returns { items, w, h } with item cy relative to the block's top. */
export const LAYOUTS = {
  title: layoutTitle,
  statement: layoutStatement,
  bigtype: layoutBigtype,
  quote: layoutQuote,
  code: layoutCode,
  flow: layoutFlow,
  timeline: layoutTimeline,
  funnel: layoutFunnel,
  hub: layoutHub,
  cards: layoutCards,
  compare: layoutCompare,
  panels: layoutPanels,
  browser: layoutBrowser,
  equation: layoutEquation,
  loop: layoutLoop,
  matrix: layoutMatrix,
  bucket: layoutBucket,
  list: layoutList,
};

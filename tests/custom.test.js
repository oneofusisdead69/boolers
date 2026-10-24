const test = require('node:test');
const assert = require('node:assert');
const { clean } = require('../lib/custom');
const { setup } = require('./helpers');
const kingsCup = require('../games/kingsCup');

test('clean keeps only the fields a game asks for, trimmed and within limits', () => {
  const schema = [
    { id: 'questions', kind: 'list', maxItems: 3, maxLen: 10 },
    { id: 'cards', kind: 'cards', items: [{ key: '2' }, { key: '3' }] },
  ];
  const out = clean(schema, {
    questions: ['  a   b ', '', 'a b', 'x'.repeat(50), 42, 'c', 'd'],
    cards: { 2: { title: ' You! ', text: '' }, 3: { title: '', text: '  ' }, 9: { title: 'nope' } },
    hack: ['<script>'],
  });
  assert.deepStrictEqual(out, { questions: ['a b', 'x'.repeat(10), 'c'], cards: { 2: { title: 'You!' } } });
  assert.deepStrictEqual(clean(schema, 'junk'), {});
  assert.deepStrictEqual(clean(schema, { questions: 'not a list' }), {});
});

test('Kings Cup: your own wording for a card, categories and rhymes', () => {
  const t = setup(kingsCup, 2, {
    reactions: false,
    custom: { cards: { 3: { title: 'Me me me', text: 'Take 3, you deserve it.' } }, categories: ['Cheeses'], rhymes: ['moon'] },
  });
  const g = t.room.game;
  g.deck[0] = { rank: 3, suit: 'S' };
  g.deck[1] = { rank: 10, suit: 'S' };
  g.deck[2] = { rank: 9, suit: 'S' };
  t.act(0, 'draw', { slot: 0 });
  assert.strictEqual(t.view(1).rule.title, 'Me me me');
  assert.strictEqual(t.view(1).rule.text, 'Take 3, you deserve it.');
  assert.deepStrictEqual(t.drinks(), [3, 0], 'the card still does what it did');
  t.act(0, 'next');
  t.act(1, 'draw', { slot: 1 });
  assert.strictEqual(t.view(0).prompt, 'Cheeses');
  assert.strictEqual(t.view(0).rule.title, 'Categories', 'cards you left alone keep the usual rule');
  t.act(1, 'next');
  t.act(0, 'draw', { slot: 2 });
  assert.strictEqual(t.view(0).prompt, 'moon');
});

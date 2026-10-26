import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement, RenderPropsOf, RenderSurface } from 'claude-code'

const POOL = ['Apple ships Swift 6.2', 'Rust 1.90 lands', 'Kotlin 2.3 is out']

type Spinner = RenderPropsOf['Spinner']

const THINKING: Spinner = { word: 'Working', message: null, suffix: '…', mode: 'thinking' }

/**
 * Stands in for the engine beneath the mod: settings holding `verbs` as the
 * SessionStart hook writes them, and a Spinner site that draws its own row.
 */
function engine(on: On, verbs: () => unknown) {
  on('settings.read', () => {
    const list = verbs()
    return { value: list === undefined ? {} : { spinnerVerbs: { mode: 'replace', verbs: list } } }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', { component: 'Spinner' }, () => ({ type: 'engine', ref: 0 }))
}

let turns = 0

async function turn($: Engine) {
  turns += 1
  await $.turn.start({ text: 'hi', turnId: `turn-${turns}` })
}

/** What the row shows: the mod's text, or the app's own row as `row`. */
function shown(tree: RenderElement): string {
  if (tree.type === 'engine') return 'row'
  if (tree.type !== 'Text') return `<${tree.type}>`
  return (tree.children ?? []).map(c => (typeof c === 'string' ? c : shown(c))).join('')
}

async function draw($: Engine, surface: RenderSurface, props: Partial<Spinner> = {}) {
  const tree = await $.ui.render({
    component: 'Spinner',
    surface,
    requestId: 'main',
    props: { ...THINKING, ...props },
  })
  return shown(tree)
}

const LINES = POOL.map(h => `${h}…`)

describe('desktop spinner', () => {
  test('shows a headline alone, with the row\'s ellipsis', async ($, on) => {
    engine(on, () => POOL)
    await turn($)
    expect(LINES).toContain(await draw($, 'desktop'))
  })

  test('keeps the headline through the turn', async ($, on) => {
    engine(on, () => POOL)
    await turn($)
    const lines = [
      await draw($, 'desktop'),
      await draw($, 'desktop', { mode: 'requesting' }),
      await draw($, 'desktop', { mode: 'responding' }),
    ]
    expect(new Set(lines).size).toBe(1)
  })

  test('shows every headline once before repeating', async ($, on) => {
    engine(on, () => POOL)
    const lines: string[] = []
    for (let i = 0; i < POOL.length; i++) {
      await turn($)
      lines.push(await draw($, 'desktop'))
    }
    expect([...lines].sort()).toEqual([...LINES].sort())
  })

  test('moves to a new pool when a refresh lands mid-session', async ($, on) => {
    let pool = POOL
    engine(on, () => pool)
    await turn($)
    pool = ['Go 1.26 ships']
    await turn($)
    expect(await draw($, 'desktop')).toBe('Go 1.26 ships…')
  })

  test('leaves a tool step to the app', async ($, on) => {
    engine(on, () => POOL)
    await turn($)
    expect(await draw($, 'desktop', { mode: 'tool-use', word: 'Editing app.ts' })).toBe('row')
  })

  test('fills a tool step that shows no words', async ($, on) => {
    engine(on, () => POOL)
    await turn($)
    expect(LINES).toContain(await draw($, 'desktop', { mode: 'tool-use', word: 'Working' }))
  })

  test('leaves a state message to the app', async ($, on) => {
    engine(on, () => POOL)
    await turn($)
    expect(await draw($, 'desktop', { message: 'Compacting conversation' })).toBe('row')
  })

  test('keeps the app\'s row with no headlines installed', async ($, on) => {
    engine(on, () => undefined)
    await turn($)
    expect(await draw($, 'desktop')).toBe('row')
  })

  test('ignores a malformed verbs list', async ($, on) => {
    engine(on, () => 'not a list')
    await turn($)
    expect(await draw($, 'desktop')).toBe('row')
  })
})

describe('terminal spinner', () => {
  test('is left to spinnerVerbs', async ($, on) => {
    engine(on, () => POOL)
    await turn($)
    expect(await draw($, 'terminal', { word: 'Sauteing' })).toBe('row')
  })
})

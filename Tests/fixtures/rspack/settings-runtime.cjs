const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('../../../Sources/CodexPPCore/Resources/acorn.js');

const slug = 'codexpp-extensions';
const [routeFile, generalFile, layoutFile] = process.argv.slice(2);
const read = file => {
  const source = fs.readFileSync(file, 'utf8');
  return {source, ast: acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'})};
};
function find(node, predicate, results = []) {
  if (!node?.type) return results;
  if (predicate(node)) results.push(node);
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) find(child, predicate, results);
  }
  return results;
}
function readOne(file, predicate) {
  const matches = find(file.ast, predicate);
  assert.equal(matches.length, 1, 'Expected a unique generated node');
  return file.source.slice(matches[0].start, matches[0].end);
}
const declaration = name => node => node.type === 'FunctionDeclaration' && node.id.name === name;
const jsx = (type, props) => ({type, props});

async function main() {
  const route = read(routeFile);
  const layout = read(layoutFile);
  const general = read(generalFile);
  const components = Object.fromEntries(['Page', 'Section', 'Card', 'Row', 'Toggle', 'Button']
    .map(name => [name, function NativeComponent() {}]));
  const snapshot = {extensions: [], extensionsPaused: false};
  const renderedPage = {};
  const outletContext = {};
  const react = {
    useSyncExternalStore(_subscribe, getSnapshot) { return getSnapshot(); },
    createElement: jsx,
    lazy: load => load
  };
  const registry = {
    getSnapshot: () => snapshot,
    subscribe() {},
    render(actualReact, value, actualComponents) {
      assert.equal(actualReact, react);
      assert.equal(value, snapshot);
      for (const [role, component] of Object.entries(components)) assert.equal(actualComponents[role], component);
      assert.equal(actualComponents.Title().type, 'h1');
      return renderedPage;
    }
  };

  const page = vm.runInNewContext('(' + readOne(general, declaration('ppExtensionsPage')) + ')', {
    m: react, eB: {P: components.Page}, P: {X: components.Section}, B: {t: components.Card},
    D: {ic: components.Row}, L: {l: components.Toggle}, __codexPPNativeSettings: registry,
    a(id) { assert.equal(id, 'ygO2'); return {$: components.Button}; }
  });
  assert.equal(page(), renderedPage);

  const modules = [];
  const webpackRequire = id => {
    assert.equal(id, 'pqJp');
    assert.deepEqual(modules, [107421, 280944, 906413, 515055, 553834, 474230]);
    return {codexPPExtensionsPage: page};
  };
  webpackRequire.e = async id => { modules.push(id); };
  const lazyBinding = readOne(route, node => node.type === 'VariableDeclarator' && node.id.name === 'ppExtensionsPage');
  const loadPage = vm.runInNewContext(`const ${lazyBinding}; ppExtensionsPage`, {u: react, n: webpackRequire});
  assert.equal((await loadPage()).default, page);

  // Run the real generated route guard with the vendor router hooks stubbed.
  // The Extensions route must reach its outlet even when stock Settings would redirect.
  const routeGuard = vm.runInNewContext('(' + readOne(route, node =>
    declaration('ng')(node) && route.source.slice(node.start, node.end).includes(slug)) + ')', {
    c: {c: size => Array(size).fill(Symbol.for('react.memo_cache_sentinel'))},
    i: {jsx},
    A: {
      KC: () => ({outletContext, visibility: {shouldRedirectToVisibleSettingsSection: true}}),
      zy: () => ({}),
      RQ: () => ({params: {section: slug}}),
      sv: 'native-outlet'
    }
  });
  assert.equal(routeGuard().type, 'native-outlet');
  assert.equal(routeGuard().props.context, outletContext);

  const searchPath = readOne(layout, node => node.type === 'ReturnStatement' &&
    layout.source.slice(node.start, node.end).startsWith('return{sectionSlug:e,path:e==="codexpp-extensions"'));
  const path = vm.runInNewContext(`(function(e){${searchPath}})("${slug}")`, {});
  assert.equal(path.path, '/settings/codexpp-extensions');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

// Compatibility for the authenticated ChatGPT 25679 archive. Chunk and module
// identifiers belong to that build. Acorn verifies edit sites and results.
globalThis.CodexPPRspackAdapter = Object.freeze({
  adapt({kind, sources, runtime}) {
    const slug = '"codexpp-extensions"';
    const route = '"/settings/codexpp-extensions"';
    const parse = source => acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
    const key = node => node?.name ?? node?.value;
    const properties = node => new Map((node?.properties ?? [])
      .filter(property => property.type === 'Property' && !property.computed)
      .map(property => [key(property.key), property.value]));

    function only(values, label) {
      if (values.length !== 1) throw Error(`ChatGPT 25679 ${label}: expected one match, found ${values.length}.`);
      return values[0];
    }
    function collect(node, predicate, descend = () => true) {
      const result = [];
      function visit(child) {
        if (!child?.type) return;
        if (predicate(child)) result.push(child);
        if (child !== node && !descend(child)) return;
        for (const value of Object.values(child))
          for (const entry of Array.isArray(value) ? value : [value]) visit(entry);
      }
      visit(node);
      return result;
    }

    const modules = new Map();
    function source(name) {
      if (!modules.has(name)) {
        const original = sources[name];
        if (typeof original !== 'string') throw Error(`ChatGPT 25679 missing chunk: ${name}.`);
        modules.set(name, {original, ast: parse(original), edits: [], prefix: ''});
      }
      return modules.get(name);
    }
    function factory(chunk, id) {
      const file = source(chunk);
      const exports = only(file.ast.body.flatMap(node => node.declaration?.declarations ?? [])
        .filter(node => node.id.name === '__webpack_modules__'), 'module table');
      return only(exports.init.properties.filter(property => key(property.key) === id), `module ${id}`).value;
    }
    function replace(chunk, scope, before, after) {
      const file = source(chunk);
      const start = file.original.indexOf(before, scope.start);
      const limit = scope.end - before.length;
      const duplicate = file.original.indexOf(before, start + before.length);
      if (start < 0 || start > limit || (duplicate >= 0 && duplicate <= limit))
        throw Error(`ChatGPT 25679 ${chunk}: expected one occurrence of ${before}.`);
      file.edits.push({start, end: start + before.length, text: after});
    }
    function insert(chunk, start, text) {
      source(chunk).edits.push({start, end: start, text});
    }
    function component(chunk, scope, names, marker) {
      const nodes = collect(scope.body, node => /Function/.test(node.type) &&
        (!marker || source(chunk).original.slice(node.start, node.end).includes(marker)));
      return only(nodes.filter(fn => collect(fn.body, node => node.type === 'ObjectPattern' &&
        names.every(name => properties(node).has(name)), node => !/Function/.test(node.type)).length === 1),
      `${chunk} component (${names.join(', ')})`);
    }
    function wrapReturn(chunk, fn, wrapper) {
      const result = fn.body.body.at(-1);
      if (result?.type !== 'ReturnStatement' || !result.argument) throw Error(`ChatGPT 25679 ${chunk}: missing final return.`);
      const {start, end} = result.argument;
      const file = source(chunk);
      file.edits.push({start, end, text: wrapper(file.original.slice(start, end))});
    }

    if (kind === 'settings') {
      const visibility = factory('visibility', 'HEBX');
      const sidebar = factory('settingsLayout', 'F4PH');
      const app = factory('app', 'bREQ');
      const general = factory('general', 'pqJp');
      const descriptor = `const ppExtensionsSection={slug:${slug}};`;
      insert('visibility', visibility.body.start + 1, descriptor);
      replace('visibility', visibility, 'visibleSettingsSections:ni,activeSettingsSection:nu',
        'visibleSettingsSections:[...ni,ppExtensionsSection],activeSettingsSection:nu');
      replace('visibility', visibility, 'settingsNavigationSections:nm,',
        'settingsNavigationSections:[...nm,ppExtensionsSection],');
      const groups = only(collect(sidebar.body, node => node.type === 'ArrayExpression' &&
        ['personal', 'coding'].every(group => node.elements.some(element => key(properties(element).get('key')) === group))),
      'Settings sidebar groups');
      insert('settingsLayout', groups.end - 1,
        `,{key:"codexpp",heading:{id:"codexpp.settings.heading",defaultMessage:"Codex++"},slugs:[${slug}]}`);
      replace('settingsLayout', sidebar, 'if("billing"===e.slug',
        `if(e.slug===${slug})return(0,a.jsx)(eo.jl,{"data-settings-panel-slug":e.slug,"aria-label":"Extensions",isActive:tr===e.slug,icon:globalThis.__codexPPNativeSettings.icon(a),onClick:()=>eT(${route}),label:"Extensions",weightClassName:"font-normal"},e.slug);if("billing"===e.slug`);
      replace('settingsLayout', sidebar, 'let eF=B;', `let eF=ey===${slug}?${slug}:B;(0,c.useEffect)(()=>globalThis.__codexPPNativeSettings.attachNavigate(eg),[eg]);`);
      replace('settingsLayout', sidebar, 'eF.V5.map(e=>', `[...eF.V5,${slug}].map(e=>`);
      replace('settingsLayout', sidebar, 'return{sectionSlug:e,path:(0,y.Qm)(e)}',
        `return{sectionSlug:e,path:e===${slug}?${route}:(0,y.Qm)(e)}`);
      replace('settingsLayout', sidebar, 'sectionSlug:e,...null==t?{}:{terms:t}',
        `sectionSlug:e,...e===${slug}?{terms:["Codex++","Extensions","Install Extension","Pause Extensions","Open in Finder"]}:null==t?{}:{terms:t}`);
      replace('settingsLayout', sidebar, 'panelLabel:"codex-micro"===t.sectionSlug',
        `panelLabel:t.sectionSlug===${slug}?"Extensions":"codex-micro"===t.sectionSlug`);
      // The Settings layout may ask the shared registry for a label and a URL
      // before the route renders (search results and keyboard navigation).
      const searchLabel = only(collect(sidebar.body, node => node.type === 'CallExpression' &&
        node.callee.type === 'SequenceExpression' && node.callee.expressions.at(-1)?.object?.name === 'eM' &&
        key(node.callee.expressions.at(-1).property) === 'G' &&
        node.arguments[0]?.object?.name === 't' && key(node.arguments[0].property) === 'sectionSlug'),
      'Settings search label');
      const labelSource = source('settingsLayout').original.slice(searchLabel.start, searchLabel.end);
      source('settingsLayout').edits.push({start: searchLabel.start, end: searchLabel.end,
        text: `(t.sectionSlug===${slug}?{id:"codexpp.settings.extensions",defaultMessage:"Extensions"}:${labelSource})`});
      // Use the same lazy dependencies as the app's General Settings route.
      const view = `\nconst ppExtensionsPage=u.lazy(()=>Promise.all([107421,280944,906413,515055,553834,474230].map(id=>n.e(id))).then(()=>({default:n("pqJp").codexPPExtensionsPage})));
`;
      insert('app', app.body.end - 1, view);
      replace('app', app, 'path:"/settings",element:(0,i.jsx)(ng,{}),children:[',
        `path:"/settings",element:(0,i.jsx)(ng,{}),children:[(0,i.jsx)(A.qh,{path:${slug},element:(0,i.jsx)(ppExtensionsPage,{})}),`);
      replace('app', app, 'shouldRenderRouteContent:p}=s;if(h)',
        `shouldRenderRouteContent:p}=s;if(l===${slug})return(0,i.jsx)(A.sv,{context:a});if(h)`);
      replace('general', general, 'GeneralSettings:()=>aH',
        'GeneralSettings:()=>aH,codexPPExtensionsPage:()=>ppExtensionsPage');
      insert('general', general.body.end - 1, `\nfunction ppExtensionsPage(){
  const pp=globalThis.__codexPPNativeSettings;
  const value=m.useSyncExternalStore(pp.subscribe,pp.getSnapshot);
  return pp.render(m,value,{Page:eB.P,Title:()=>m.createElement("h1",null,"Extensions"),Section:P.X,Card:B.t,Row:D.ic,Toggle:L.l,Button:a("ygO2").$});
}\n`);
      source('settingsLayout').prefix = runtime;
    } else if (kind === 'shell') {
      const frame = factory('frame', 'ZIk0');
      const surface = factory('surface', 'bJfu');
      replace('frame', frame, '"data-app-shell-frame":!0,',
        '"data-app-shell-frame":!0,"data-codexpp-shell-role":"frame","data-codexpp-shell-sidebar-open":t$,');
      replace('frame', frame, '"data-slate-sidebar-peeking":el,',
        '"data-slate-sidebar-peeking":el,"data-codexpp-shell-role":"panel","data-codexpp-shell-peeking":el,');
      // The vendor command callback closes over the current shell state.
      replace('frame', frame, 'eP=e_,(0,ts.K)("toggleSidebar",eP)',
        'eP=e_,(0,c.useEffect)(()=>globalThis.__codexPPShell.attachSidebarToggle(eK.current,eP),[eP]),(0,ts.K)("toggleSidebar",eP)');
      replace('surface', surface, '"data-app-shell-main-surface":"default",',
        '"data-app-shell-main-surface":"default","data-codexpp-shell-role":"main",');
      replace('surface', surface, '"data-app-shell-titlebar":L,',
        '"data-app-shell-titlebar":L,"data-codexpp-shell-role":"titlebar",');
      source('frame').prefix = runtime;
    } else if (kind === 'bookmarks') {
      const menu = component('menu', factory('menu', 'MisA'), ['onOpenHistory', 'onOpenBrowserSettings', 'onCaptureScreenshot']);
      const tab = component('tab', factory('tab', 'JQj3'), ['browserTabId', 'conversationId', 'renderSlots', 'onToggleFloatingComposer']);
      const detached = component('detached', factory('detached', 'nuzS'),
        ['browserTabId', 'conversationId', 'snapshot', 'browserToolbarCapabilities', 'requestToolbarSourceAction']);
      const suggestedFactory = factory('suggested', 'deav');
      const suggested = component('suggested', suggestedFactory, ['onNavigate'], 'threadWorkspace.newTab.suggested.heading');
      wrapReturn('menu', menu, original => `globalThis.__codexPPBookmarks.menu(c,i.jsx,m.ms.Item,(${original}))`);
      wrapReturn('tab', tab, original => `globalThis.__codexPPBookmarks.provide(s,n.jsx,iv,(${original}))`);
      wrapReturn('detached', detached, original => `globalThis.__codexPPBookmarks.provide(S,n.jsx,ei,(${original}))`);
      wrapReturn('suggested', suggested, original => `globalThis.__codexPPBookmarks.section(ppBookmarksReact,i.jsx,o,(${original}),eM)`);
      replace('suggested', suggested, 'if(null==c||0===c.length)return null;',
        'if(null==c||0===c.length)return globalThis.__codexPPBookmarks.section(ppBookmarksReact,i.jsx,o,null,eM);');
      insert('suggested', suggestedFactory.body.end - 1, '\nconst ppBookmarksReact=n("zd8w");\n');
      for (const name of ['menu', 'tab', 'detached', 'suggested', 'entry']) source(name).prefix = runtime;
    } else {
      throw Error(`Unknown Rspack adapter: ${kind}`);
    }

    return Object.fromEntries([...modules].map(([name, file]) => {
      let result = file.original, boundary = result.length;
      for (const {start, end, text} of file.edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
        if (end > boundary) throw Error(`Overlapping edits in ${name}.`);
        result = result.slice(0, start) + text + result.slice(end);
        boundary = start;
      }
      result = file.prefix + '\n' + result;
      parse(result);
      return [name, result];
    }));
  }
});

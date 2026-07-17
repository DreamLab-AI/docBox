// docBox architectural boundary gate — makes the frozen-contract rule mechanical.
//
// ADR-009 and CONTRIBUTING rule 3 say: feature panels import ONLY from the data
// adapter seam and shared UI primitives — never from each other's internals, and
// never straight from the mock/live source. That has been followed by hand across
// every import; this config makes a violation FAIL CI instead of relying on review.
// It is the enforcement half of the panel-registry contract (ADR-010).
//
// Run: `pnpm --filter @docbox/app run depcruise`
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-feature',
      severity: 'error',
      comment:
        "A feature panel must not import another feature's internals — features are peers behind the core, not each other (ADR-009).",
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/([^/]+)/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'features-through-adapter',
      severity: 'error',
      comment:
        'Feature panels read the world only through the adapter seam (src/data/adapter), never the mock or live source directly (ADR-001/ADR-009).',
      from: { path: '^src/features/' },
      to: { path: '^src/data/(mock|live)(\\.ts)?$' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make the module graph unpredictable for an agent editing it.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    exclude: { path: '\\.(test|spec)\\.(ts|tsx)$|^src/test/|vite-env\\.d\\.ts' },
    enhancedResolveOptions: { extensions: ['.ts', '.tsx', '.js', '.jsx'] },
  },
};

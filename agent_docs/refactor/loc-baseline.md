# Handwritten Production LOC Baseline

Measured on 2026-08-08 before starting the LOC reduction + OpenAPI refactor.

```text
Baseline (2026-08-08)

API Production LOC:   20,585
Web Production LOC:   33,524
macOS Production LOC: 25,171

Total Handwritten Production LOC: 79,280
```

## Exclusions
- `node_modules/`, `dist/`, `build/`
- Test files (`*.spec.ts`, `*.test.ts`, `*.test.tsx`, `*Tests.swift`, `iTuTests/`)
- Generated artifacts (`web/src/generated/`, `*.generated.swift`, `OpenAPI/`)
- Prisma migrations and Xcode project metadata

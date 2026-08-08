import { defineConfig } from 'orval';

export default defineConfig({
  ituApi: {
    input: '../api/openapi/openapi.json',
    output: {
      mode: 'tags-split',
      target: 'src/generated/api',
      schemas: 'src/generated/api/models',
      client: 'react-query',
      override: {
        mutator: {
          path: './src/shared/api/authenticatedFetch.ts',
          name: 'authenticatedFetch',
        },
      },
    },
  },
});

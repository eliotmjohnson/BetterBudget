import { defineConfig, globalIgnores } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
    ...nextVitals,
    ...nextTypescript,
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/lines-between-class-members': [
                'error',
                'always',
                { exceptAfterSingleLine: true }
            ],
            '@stylistic/linebreak-style': ['error', 'unix'],
            '@stylistic/lines-around-comment': [
                'error',
                {
                    beforeBlockComment: true,
                    beforeLineComment: true,
                    allowArrayStart: true,
                    allowBlockStart: true,
                    allowClassStart: true,
                    allowEnumStart: true,
                    allowInterfaceStart: true,
                    allowModuleStart: true,
                    allowObjectStart: true,
                    allowTypeStart: true
                }
            ],
            '@stylistic/max-statements-per-line': ['error', { max: 1 }],
            '@stylistic/no-mixed-spaces-and-tabs': 'error',
            '@stylistic/no-multi-spaces': 'error',
            '@stylistic/no-multiple-empty-lines': [
                'error',
                { max: 1, maxBOF: 0, maxEOF: 0 }
            ],
            '@stylistic/no-tabs': 'error',
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/one-var-declaration-per-line': ['error', 'always'],
            '@stylistic/padded-blocks': [
                'error',
                {
                    blocks: 'never',
                    classes: 'never',
                    switches: 'never'
                }
            ],
            '@stylistic/padding-line-between-statements': [
                'error',
                { blankLine: 'always', prev: 'directive', next: '*' },
                { blankLine: 'never', prev: 'directive', next: 'directive' },
                { blankLine: 'always', prev: 'import', next: '*' },
                { blankLine: 'never', prev: 'import', next: 'import' },
                {
                    blankLine: 'always',
                    prev: ['const', 'let', 'var'],
                    next: '*'
                },
                {
                    blankLine: 'never',
                    prev: ['const', 'let', 'var'],
                    next: ['const', 'let', 'var']
                },
                {
                    blankLine: 'always',
                    prev: '*',
                    next: ['return', 'throw']
                }
            ],
            '@stylistic/spaced-comment': [
                'error',
                'always',
                {
                    line: { markers: ['/'] },
                    block: { balanced: true }
                }
            ]
        }
    },
    globalIgnores(['.next/**'])
]);

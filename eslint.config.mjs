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

    // Size and complexity budgets. These apply to every source file with no
    // per-file exemptions; when a limit is hit, split the file or extract the
    // function rather than raising the cap.
    {
        files: ['**/*.ts', '**/*.tsx'],
        rules: {
            'max-lines': [
                'error',
                { max: 500, skipBlankLines: true, skipComments: true }
            ],
            'max-depth': ['error', 3],
            'max-params': ['error', 4],
            'max-nested-callbacks': ['error', 3],
            'no-console': ['error', { allow: ['error', 'warn'] }],
            eqeqeq: ['error', 'always']
        }
    },
    {
        files: ['**/*.ts'],
        rules: {
            'max-lines-per-function': [
                'error',
                { max: 150, skipBlankLines: true, skipComments: true }
            ],
            complexity: ['error', 30]
        }
    },
    {
        files: ['scripts/**'],
        rules: {
            'no-console': 'off'
        }
    },
    {
        files: ['src/components/**'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        "MemberExpression[object.name='crypto'][property.name='randomUUID']",
                    message:
                        'Use createUuid() from @/domain/uuid. Mobile browsers withhold secure-context crypto over plain-HTTP LAN addresses.'
                }
            ]
        }
    },
    {
        files: ['src/domain/**/*.ts', 'src/server/**/*.ts', 'src/db/**/*.ts'],
        rules: {
            'no-restricted-globals': [
                'error',
                {
                    name: 'parseFloat',
                    message:
                        'Money is exact signed bigint cents. Use the helpers in src/domain/money.ts.'
                }
            ]
        }
    },
    globalIgnores(['.next/**'])
]);

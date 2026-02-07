module.exports = {
    parser: '@typescript-eslint/parser',
    extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
    plugins: ['@typescript-eslint'],
    env: { node: true, jest: true },
    rules: {
        'no-console': 'off'
    }
};

module.exports = {
 root:true,env:{browser:true,es2022:true},
 parser:'@typescript-eslint/parser',
 plugins:['@typescript-eslint'],
 extends:['eslint:recommended','plugin:@typescript-eslint/recommended'],
 ignorePatterns:['dist','.eslintrc.cjs','playwright.config.mjs'],
 rules:{'@typescript-eslint/no-explicit-any':'off'},
}

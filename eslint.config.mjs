// ESLint is intentionally run as a separate quality gate from TypeScript.
// TypeScript syntax is checked by each package's typecheck task; this flat
// config lints the JavaScript configuration and automation surface without
// silently replacing lint with another typecheck.
export default [
  {
    ignores: [
      "**/*.ts",
      "**/*.tsx",
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-unused-vars": ["error", { args: "none" }],
    },
  },
];

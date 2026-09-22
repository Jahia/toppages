// Aligned with the ESLint config (@jahia) so the formatter and the linter agree.
// The inherited defaults (semi: false, trailingComma: "all", bracketSpacing: true)
// contradict the `semi`, `comma-dangle` and `object-curly-spacing` rules, so any
// format-on-save left `yarn lint` failing across the whole suite.
module.exports = {
    semi: true,
    trailingComma: "none",
    bracketSpacing: false,
    arrowParens: "avoid",
    singleQuote: true,
    printWidth: 120,
    tabWidth: 4
};

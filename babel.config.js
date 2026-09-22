/*
 * Babel is only used by babel-loader on this module's own sources: preset-env targets the
 * browsers the Jahia administration supports, preset-react compiles the JSX. `runtime: automatic`
 * means a component file does not have to import React just to use JSX.
 */
module.exports = {
    presets: [
        ['@babel/preset-env', {targets: {browsers: ['last 2 versions', 'not dead']}}],
        ['@babel/preset-react', {runtime: 'automatic'}]
    ]
};

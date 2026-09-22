/*
 * Webpack build for the module's administration UI.
 *
 * The output is a Module Federation *remote*, not a standalone bundle, because that is the only
 * shape the Jahia app shell can mount a React route from. app-shell's servlet
 * (org.jahia.modules.appshell.Main) scans every bundle for javascript/apps/package.json and
 * javascript/apps/jahia.json, collects their `jahia.remotes` entries, emits one <script> per
 * remote before its own appshell.js, and then calls remote.init(shareScope) on each of them
 * before bootstrapping. Everything under `shared` therefore comes from that shared scope -- the
 * app shell already provides react, react-dom, @apollo/client, @jahia/ui-extender, i18next and
 * react-i18next, and jahia-administration provides @jahia/moonstone 2.x.
 *
 * getModuleFederationConfig() marks every shared dependency `import: false`, which is what makes
 * them true externals: they are NOT bundled, and a second copy of React in this bundle would in
 * any case break every hook in a component the shell renders with its own React.
 */
const path = require('path');
const {ModuleFederationPlugin} = require('webpack').container;
const getModuleFederationConfig = require('@jahia/webpack-config/getModuleFederationConfig');

const packageJson = require('./package.json');

// Where the maven-resources phase picks the bundle up from. Everything webpack writes here is
// generated and git-ignored; javascript/apps/jahia.json next to it is a source file.
const OUTPUT_DIR = path.resolve(__dirname, 'src/main/resources/javascript/apps');

module.exports = (env, argv) => {
    const mode = argv.mode || 'production';

    return {
        mode,
        // A federated remote needs an entry, but all of the code is reached through the container,
        // so this one only carries the webpack runtime.
        entry: {
            toppages: path.resolve(__dirname, 'src/javascript/index.js')
        },
        output: {
            path: OUTPUT_DIR,
            filename: '[name].bundle.js',
            chunkFilename: '[name].toppages.[contenthash:6].js',
            // Chunks are fetched from the module's own static resources, not from the page that
            // happens to host the app shell.
            publicPath: 'auto',
            // Chunk names carry a content hash, so without this every build leaves its
            // predecessor behind and the jar ships a growing pile of dead chunks. jahia.json is
            // the one file in this directory that is a source file, not build output.
            clean: {keep: /^jahia\.json$/}
        },
        resolve: {
            extensions: ['.js', '.jsx']
        },
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    include: path.resolve(__dirname, 'src/javascript'),
                    use: {loader: 'babel-loader'}
                },
                {
                    test: /\.css$/,
                    use: ['style-loader', 'css-loader']
                }
            ]
        },
        plugins: [
            new ModuleFederationPlugin(getModuleFederationConfig(packageJson, {
                // './init' -> src/javascript/init is the default; spelled out because this module
                // keeps its sources under src/javascript rather than the scaffolded layout.
                exposes: {
                    './init': './src/javascript/init'
                }
            }))
        ],
        devtool: mode === 'production' ? false : 'source-map',
        performance: {hints: false},
        stats: 'errors-warnings'
    };
};

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
  // ページごとにエントリを分ける。LP はトップページの客室一覧・アクセス・
  // 言語切り替えを持たないので、それらのコードを読み込ませない。
  entry: {
    main: './src/index.js',
    campaign: './src/campaign.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    // 複数エントリでは出力名を固定にできない（同じ bundle.js に衝突する）。
    // [name] は entry のキー（main / campaign）に置き換わる。
    filename: '[name].bundle.js',
    clean: true,
  },
  module: {
    rules: [
      // package.json の "type": "module" を見て、webpack は .js を strict ESM と
      // みなし拡張子の省略を禁止する（fullySpecified）。"type" を足したのは
      // Node の node:test から src/ を直接 import するためで、バンドル側の
      // 解決規則まで変えたいわけではないので、ここで従来どおりに戻す。
      {
        test: /\.m?js$/,
        resolve: { fullySpecified: false },
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      // 画像は webpack 5 の asset modules で dist/images/ に出力する。
      // import した値が公開 URL になるので、追加のプラグインは要らない。
      {
        test: /\.(png|jpe?g|gif|svg|webp)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name][ext]',
        },
      },
    ],
  },
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'dist'),
    },
    hot: true,
    open: true,
    port: 8080,
  },
  plugins: [
    // chunks は必ず明示する。省くと両方の bundle が両方の HTML に注入され、
    // LP でトップページ用の初期化（客室一覧の描画・言語切り替え）まで走って
    // 「要素が無いので何もしない」処理の分だけ無駄に読み込ませることになる。
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
      chunks: ['main'],
    }),
    new HtmlWebpackPlugin({
      template: './src/campaign.html',
      // dist/campaign/index.html に出し、/campaign/ で開けるようにする。
      // 広告に載せる URL は拡張子が無い方が短く、後から静的ホスティングを
      // 変えても影響を受けにくい。
      filename: 'campaign/index.html',
      chunks: ['campaign'],
    }),
  ],
};

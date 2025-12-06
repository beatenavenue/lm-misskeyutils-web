# LimitManage for Misskey (Web)
WORK IN PROGRESS

## 概要
TBD

## ビルド構成
TBD

## Github Pages での公開
TBD

## 開発サーバの起動と公開

```bash
npm run dev
```

このコマンドは　`/docs` 以下を `http://localhost:3000/` としてアクセスできるよう簡易サーバを起動しますが、  
外部からアクセス可能なURLでなければ認可が通らないため何らかの方法で公開する必要があります。

Dynamic DNS, localtunnel などはセキュリティ面に問題があるため、可能であれば Cloudflare tunnel を利用することを推奨します。

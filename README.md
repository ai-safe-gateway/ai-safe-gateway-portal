# AI Safe Gateway 企業管理ポータル

AI Safe Gatewayの企業管理者向けポータルです。GitHub Pagesで静的画面をHTTPS配信し、
認証・企業情報・ライセンス・匿名利用統計はSupabaseへ接続します。

このリポジトリには、Windowsアプリ本体、原文、辞書、対応表、秘密鍵、
Supabase service role keyを入れないでください。

## 公開

1. このフォルダの内容だけをGitHubリポジトリの`main`ブランチへ登録します。
2. Repository Settings > Pages > Sourceで`GitHub Actions`を選択します。
3. Actionsの`Deploy AI Safe Gateway Portal`完了後に表示されるHTTPS URLを確認します。
4. Supabase AuthenticationのSite URLとRedirect URLsへ、そのURLを登録します。
5. Supabase Edge Functionsの`ALLOWED_ORIGINS`へ、GitHub Pagesのオリジン
   （例: `https://account.github.io`）を追加します。

公開される`config.js`にはSupabaseのpublishable keyだけを置きます。
secret keyやservice role keyは置かないでください。

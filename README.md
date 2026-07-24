# AI Safe Gateway 企業管理ポータル

AI Safe Gatewayの企業管理者向けポータルです。GitHub Pagesで静的画面をHTTPS配信し、
認証・企業情報・ライセンス・匿名利用統計はSupabaseへ接続します。

このリポジトリには、Windowsアプリ本体、原文、辞書、対応表、秘密鍵、
Supabase service role keyを入れないでください。

## 公開

GitHub Actionsで静的ポータルをGitHub Pagesへ配信します。
公開されるconfig.jsにはSupabaseのpublishable keyだけを置きます。
secret keyやservice role keyは置かないでください。

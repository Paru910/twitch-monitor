# Twitch APIチャット情報 完全レポート

> [!IMPORTANT]
> このレポートは、**ブラウザのTwitchチャット欄で視聴者が得られる情報**と**Twitch API（EventSub + Helix）で取得可能な情報**を比較し、本サービスが同等以上の価値を提供するために必要な情報を網羅的にまとめたものです。

---

## 1. `channel.chat.message`（通常チャットメッセージ）

現在のアプリが **最も多く処理しているイベント**。すべてのチャットメッセージがこのイベントで受信される。

| フィールド | 説明 | ブラウザで見える？ | 現在の実装状況 |
|---|---|---|---|
| `chatter_user_id` | 発言者の一意ID | 内部的に使用 | ✅ 初コメ判定に使用 |
| `chatter_user_login` | 発言者のログイン名（小文字） | ✅ | ✅ |
| `chatter_user_name` | 発言者の表示名（大文字あり） | ✅ | ✅ |
| `message_id` | メッセージの一意ID | ❌ 内部的 | ❌ **未使用** |
| `message.text` | メッセージ全文（プレーンテキスト） | ✅ | ✅ |
| `message.fragments[]` | メッセージを構成する断片の配列 | ✅ | ✅ |
| ┗ `fragment.type` | `text` / `emote` / `cheermote` / `mention` | ✅ | ⚠️ `mention`未対応 |
| ┗ `fragment.emote.id` | エモートID（画像URL生成用） | ✅ | ✅ |
| ┗ `fragment.emote.format[]` | `animated` / `static`（アニメ対応判定） | ✅ (自動) | ❌ **未使用（staticのみ表示）** |
| ┗ `fragment.emote.owner_id` | エモートの所有者ID | ❌ 内部的 | ❌ |
| ┗ `fragment.cheermote.prefix` | チアモートの接頭辞 (例: `Cheer`) | ✅ | ❌ **未使用** |
| ┗ `fragment.cheermote.bits` | このチアモートで使われたBits数 | ✅ | ❌ **未使用** |
| ┗ `fragment.cheermote.tier` | 応援レベル（色の段階を決定） | ✅ | ❌ **未使用** |
| ┗ `fragment.mention.user_id` | メンションされたユーザーID | ✅ (@表示) | ❌ **未使用** |
| ┗ `fragment.mention.user_name` | メンションされたユーザー名 | ✅ | ❌ **未使用** |
| `color` | ユーザー名の色（`#RRGGBB`） | ✅ | ✅ |
| `badges[]` | バッジ配列 | ✅ | ✅ |
| ┗ `badge.set_id` | バッジの種類（`moderator`, `subscriber`等） | ✅ | ✅ |
| ┗ `badge.id` | バッジのバージョン（サブ月数等） | ✅ | ✅ |
| ┗ `badge.info` | 追加情報（サブ継続月数等） | ✅ | ❌ **表示していない** |
| `message_type` | `text` / `channel_points_highlighted` / `channel_points_sub_only` / `user_intro` | ✅ (視覚的に区別) | ❌ **未使用** |
| `cheer.bits` | このメッセージに含まれる総Bits数 | ✅ | ✅ |
| `reply` | リプライ（スレッド）情報 | ✅ | ❌ **未使用** |
| ┗ `reply.parent_message_id` | 返信先のメッセージID | ✅ (UIで表示) | ❌ |
| ┗ `reply.parent_message_body` | 返信先のメッセージ本文 | ✅ | ❌ |
| ┗ `reply.parent_user_name` | 返信先のユーザー名 | ✅ | ❌ |
| ┗ `reply.thread_message_id` | スレッド元のメッセージID | ❌ 内部的 | ❌ |
| `channel_points_custom_reward_id` | チャンネルポイント報酬ID | ✅ (ハイライト表示) | ✅ |
| `source_broadcaster_*` | 共有チャット元の配信者情報 | ✅ (共有チャット時) | ❌ **未使用** |
| `source_message_id` | 共有チャット元のメッセージID | ❌ 内部的 | ❌ |
| `source_badges[]` | 共有チャット元でのバッジ | ✅ | ❌ |
| `is_source_only` | 共有チャット専用メッセージか | ❌ 内部的 | ❌ |

---

## 2. `channel.chat.notification`（チャット通知イベント）

サブスクライブ、ギフトサブ、レイド、アナウンスメント等、チャット欄に表示される**システム通知的なメッセージ**を受信する。

### 共通フィールド

| フィールド | 説明 | 現在の実装状況 |
|---|---|---|
| `chatter_user_id/name/login` | 通知に関連するユーザー | ✅ |
| `chatter_is_anonymous` | 匿名かどうか | ❌ **未使用** |
| `color` | ユーザー名の色 | ✅ |
| `badges[]` | バッジ | ❌ **通知では未表示** |
| `system_message` | システム生成メッセージ（ブラウザ表示と同じ文） | ❌ **未使用**（自前で文を生成） |
| `message_id` | メッセージID | ❌ |
| `message` | ユーザーが任意に追加したメッセージ | ⚠️ 部分的 |
| `notice_type` | 通知の種類（詳細は下表） | ✅ |

### `notice_type` 別の追加フィールド

| notice_type | 説明 | 追加データ | 現在の実装 |
|---|---|---|---|
| `sub` | 新規サブスクライブ | `sub_tier`, `is_prime`, `duration_months` | ✅ |
| `resub` | 再サブスクライブ | `cumulative_months`, `streak_months`, `duration_months`, `sub_tier`, `is_prime`, `is_gift`, `gifter_*` | ⚠️ `streak_months`/`is_prime`/`gifter_*`未使用 |
| `sub_gift` | ギフトサブ | `recipient_user_*`, `sub_tier`, `duration_months`, `cumulative_total`, `community_gift_id` | ⚠️ 部分的 |
| `community_sub_gift` | コミュニティギフト（一括ギフト） | `id`, `total`, `sub_tier`, `cumulative_total` | ❌ **未実装** |
| `gift_paid_upgrade` | ギフトからの有料アップグレード | `gifter_is_anonymous`, `gifter_user_*` | ❌ **未実装** |
| `prime_paid_upgrade` | Primeからの有料アップグレード | `sub_tier` | ❌ **未実装** |
| `pay_it_forward` | ペイ・イット・フォワード | `gifter_is_anonymous`, `gifter_user_*` | ❌ **未実装** |
| `raid` | レイド（通知経由） | `user_id`, `user_name`, `viewer_count`, `profile_image_url` | ❌ **別イベントで処理** |
| `unraid` | レイド解除 | — | ❌ **未実装** |
| `announcement` | チャットアナウンスメント | `color`（`blue`/`green`/`orange`/`purple`/`primary`） | ❌ **未実装** |
| `bits_badge_tier` | Bitsバッジティア達成 | `tier` | ❌ **未実装** |
| `charity_donation` | チャリティ寄付 | `charity_name`, `amount`(value/decimal_place/currency) | ❌ **未実装** |

---

## 3. その他の主要イベント

### `channel.follow`（フォロー）
| フィールド | 説明 | 現在の実装 |
|---|---|---|
| `user_id` / `user_login` / `user_name` | フォローしたユーザー | ✅ |
| `followed_at` | フォロー日時 | ❌ **未使用** |

### `channel.raid`（レイド）
| フィールド | 説明 | 現在の実装 |
|---|---|---|
| `from_broadcaster_user_*` | レイド元の配信者 | ✅ |
| `to_broadcaster_user_*` | レイド先の配信者 | ✅ (条件フィルタ) |
| `viewers` | レイド参加人数 | ✅ |

### `channel.channel_points_custom_reward_redemption.add`（チャンネルポイント交換）
| フィールド | 説明 | 現在の実装 |
|---|---|---|
| `user_name` / `user_login` | 交換したユーザー | ✅ |
| `reward.title` | 報酬の名前 | ✅ |
| `reward.cost` | 必要ポイント数 | ❌ **未表示** |
| `reward.prompt` | 報酬の説明文 | ❌ **未表示** |
| `user_input` | ユーザーが入力したテキスト | ✅ |
| `redeemed_at` | 交換日時 | ❌ **未使用** |
| `status` | ステータス (`unfulfilled`等) | ❌ **未使用** |

### `channel.bits.use`（Bits使用 — 新API）
| フィールド | 説明 | 現在の実装 |
|---|---|---|
| `user_*` | Bitsを使用したユーザー | ❌ **イベント未購読** |
| `bits` | 使用Bits数 | ❌ |
| `type` | `cheer` / `power_up` | ❌ |
| `power_up.type` | `message_effect` / `celebration` / `gigantify_an_emote` | ❌ |
| `message.fragments[]` | メッセージ本文 | ❌ |

### `channel.channel_points_automatic_reward_redemption.add`（自動ポイント報酬）

ハイライトメッセージ、サブ専用メッセージ等の**Twitch組み込みチャンネルポイント報酬**。

| フィールド | 説明 | 現在の実装 |
|---|---|---|
| イベント全体 | 自動報酬の交換通知 | ❌ **イベント未購読** |

---

## 4. Helix REST APIで追加取得可能な情報

リアルタイムイベント以外に、REST APIで補完取得できる情報。

| API エンドポイント | 得られる情報 | ブラウザで見える？ | 現在の実装 |
|---|---|---|---|
| **Get Chat Badges** (Global/Channel) | バッジ画像URL | ✅ | ✅ |
| **Get Channel Emotes** | チャンネル固有エモート一覧 | ✅ | ❌ |
| **Get Global Emotes** | グローバルエモート一覧 | ✅ | ❌ |
| **Get Emote Sets** | エモートセット詳細 | ❌ 内部的 | ❌ |
| **Get Cheermotes** | チアモート画像・段階情報 | ✅ | ❌ **未実装** |
| **Get Chat Settings** | スロモ/フォロワー限定/サブ限定等の設定 | ✅ | ❌ |
| **Get Chatters** | 現在のチャット参加者一覧 | ✅ (参加者リスト) | ❌ |
| **Get User Chat Color** | 特定ユーザーのチャット色 | ✅ | ❌ (EventSubから取得) |
| **Get Streams** | 配信状態・タイトル・ゲームカテゴリ | ✅ | ✅ (配信状態のみ) |
| **Get Channel Information** | チャンネル詳細情報 | ✅ | ❌ |
| **Get Custom Reward** | カスタム報酬の詳細 | ✅ | ❌ |

---

## 5. ブラウザのチャット欄 vs 本サービスの情報比較

### ✅ 現在すでに同等以上の価値がある機能
- ユーザー名＋カラー表示
- バッジアイコン表示
- エモート画像表示
- Bits（ビッツ）通知
- サブスクライブ通知（Tier表示・再サブ月数）
- フォロー通知
- レイド通知（人数表示）
- チャンネルポイント交換通知
- **初コメ検出** ← ブラウザにはない独自機能 🌟
- **レイド後の初コメ識別** ← ブラウザにはない独自機能 🌟

### ⚠️ ブラウザでは見えるが本サービスで未対応の情報

| 機能 | 優先度 | 難易度 |
|---|---|---|
| **リプライ（返信先）表示** | 🔴 高 | 低 |
| **メンション（@ユーザー）のハイライト** | 🔴 高 | 低 |
| **アナウンスメント表示** | 🔴 高 | 低 |
| **message_typeの区別**（ハイライト/サブ限定/自己紹介メッセージ） | 🟡 中 | 低 |
| **チアモート画像表示**（現在はBits数のみ） | 🟡 中 | 中 |
| **コミュニティギフトサブ通知** | 🟡 中 | 低 |
| **アニメーションエモート対応** | 🟡 中 | 低 |
| **ギフトサブ継続→有料変更通知** | 🟢 低 | 低 |
| **Prime→有料アップグレード通知** | 🟢 低 | 低 |
| **Bitsバッジティア達成通知** | 🟢 低 | 低 |
| **チャリティ寄付通知** | 🟢 低 | 低 |
| **共有チャット対応** | 🟢 低 | 中 |
| **メッセージ削除/チャットクリア対応** | 🟢 低 | 中 |
| **Power Ups** (Bits新機能: メッセージエフェクト等) | 🟢 低 | 中 |

### 🌟 ブラウザにはないがAPIで実現可能な追加機能

| 機能 | 説明 | 配信者にとっての価値 |
|---|---|---|
| 初コメ検出 | 配信内で初めてコメしたユーザーをハイライト | ✅ **実装済み** |
| レイド後初コメ識別 | レイドで来た人の最初のコメントを識別 | ✅ **実装済み** |
| サブスク連続月数 (`streak_months`) | 連続サブ月数の表示 | 📋 未実装 |
| サブスク累計月数 (`cumulative_months`) | 通算サブ月数の表示 | ✅ 実装済み |
| `is_prime` 判定 | Prime Gaming経由のサブを識別 | 📋 未実装 |
| ギフター情報 | 再サブ時のギフト元ユーザー名 | 📋 未実装 |
| `badge.info` | サブ継続月数等の詳細情報 | 📋 未実装 |
| `system_message` | Twitchが自動生成するシステム文表示 | 📋 未実装 |

---

## 6. まとめ — 対応推奨の優先順位

### 第1優先（ブラウザ同等の基本体験を保証）
1. **リプライ表示** — `reply` オブジェクトの活用
2. **メンション（@）ハイライト** — `fragment.mention` の描画
3. **アナウンスメント対応** — `notice_type: announcement` の処理
4. **`message_type` 区別** — ハイライト/サブ限定/自己紹介メッセージの視覚的区別

### 第2優先（配信者向け付加価値）
5. **コミュニティギフトサブ通知** — 一括ギフトの表示
6. **アニメーションエモート** — `format: animated` 判定
7. **チアモート画像** — Cheermotes APIから画像取得
8. **`system_message` 活用** — Twitch純正のシステム文表示
9. **サブ詳細情報** — `streak_months`, `is_prime`, `gifter` 等

### 第3優先（完全網羅）
10. ギフトサブ→有料変更、Prime→有料変更 等の通知
11. チャリティ寄付、Bitsバッジティア 等
12. 共有チャット対応
13. Power Ups対応

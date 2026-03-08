import { config } from './config.js';
import { state } from './state.js';
import { logout } from './auth.js';
import { updateStatus, elements, clearLogs } from './ui.js';
import { addCard } from './card.js';

export async function fetchUserData() {
    try {
        const res = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${state.accessToken}`,
                'Client-Id': config.CLIENT_ID
            }
        });
        if (!res.ok) {
            if (res.status === 401) {
                logout();
                return;
            }
            throw new Error('Failed to fetch user data');
        }
        const data = await res.json();
        state.loggedInUserId = data.data[0].id;

        const savedChannel = localStorage.getItem('target_channel');
        if (savedChannel) {
            state.targetChannelName = savedChannel;
        } else {
            state.targetChannelName = data.data[0].login;
            localStorage.setItem('target_channel', state.targetChannelName);
        }

        await fetchTargetBroadcasterAndConnect();
    } catch (err) {
        console.error(err);
        updateStatus('APIエラー', 'red');
    }
}

export async function checkStreamStatus() {
    try {
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${state.targetBroadcasterId}`, {
            headers: {
                'Authorization': `Bearer ${state.accessToken}`,
                'Client-Id': config.CLIENT_ID
            }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.data && data.data.length > 0) {
                const streamId = data.data[0].id;
                const lastStreamId = localStorage.getItem('last_stream_id');
                if (streamId !== lastStreamId) {
                    console.log('New stream detected, clearing seenUsers...');
                    state.seenUsers.clear();
                    localStorage.removeItem('seenUsers');
                    localStorage.setItem('last_stream_id', streamId);
                }
            } else {
                console.log('Stream offline, cleared seenUsers for next stream...');
                state.seenUsers.clear();
                localStorage.removeItem('seenUsers');
                localStorage.removeItem('last_stream_id');
            }
        }
    } catch (err) {
        console.error('Failed to check stream status:', err);
    }
}

export async function fetchTargetBroadcasterAndConnect() {
    updateStatus('確認中...', 'yellow');
    try {
        const res = await fetch(`https://api.twitch.tv/helix/users?login=${state.targetChannelName}`, {
            headers: {
                'Authorization': `Bearer ${state.accessToken}`,
                'Client-Id': config.CLIENT_ID
            }
        });
        if (!res.ok) throw new Error('Failed to fetch target broadcaster');
        const data = await res.json();

        if (data.data.length === 0) {
            alert(`ユーザー "${state.targetChannelName}" が見つかりませんでした。ご自身のアカウントに戻ります。`);
            localStorage.removeItem('target_channel');
            state.targetChannelName = '';
            updateStatus('ユーザー不明', 'red');
            setTimeout(fetchUserData, 1000);
            return;
        }

        state.targetBroadcasterId = data.data[0].id;
        elements.currentChannelText.textContent = `監視先: ${data.data[0].display_name}`;
        elements.currentChannelText.classList.remove('hidden');

        await checkStreamStatus();
        await fetchBadges();
        connectWebSocket();
    } catch (err) {
        console.error(err);
        updateStatus('APIエラー', 'red');
    }
}

export async function fetchBadges() {
    state.badgeMap = {};
    const headers = { 'Authorization': `Bearer ${state.accessToken}`, 'Client-Id': config.CLIENT_ID };
    try {
        const globalRes = await fetch('https://api.twitch.tv/helix/chat/badges/global', { headers });
        const globalData = await globalRes.json();
        for (const set of (globalData.data || [])) {
            for (const version of (set.versions || [])) {
                state.badgeMap[`${set.set_id}/${version.id}`] = version.image_url_2x;
            }
        }
        const chanRes = await fetch(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${state.targetBroadcasterId}`, { headers });
        const chanData = await chanRes.json();
        for (const set of (chanData.data || [])) {
            for (const version of (set.versions || [])) {
                state.badgeMap[`${set.set_id}/${version.id}`] = version.image_url_2x;
            }
        }
    } catch (err) {
        console.warn('バッジの取得に失敗しました:', err);
    }
}

export async function changeChannelPrompt() {
    const newChannel = prompt('監視したいTwitchのチャンネルID（ユーザーID）を入力してください。\\n※自身以外のチャンネルを指定した場合、セキュリティの都合上ビッツやポイント機能は取得できません。(コメントのみ監視します)', state.targetChannelName);
    if (newChannel && newChannel.trim() !== '' && newChannel.trim() !== state.targetChannelName) {
        state.targetChannelName = newChannel.trim().toLowerCase();
        localStorage.setItem('target_channel', state.targetChannelName);
        clearLogs();
        state.seenUsers.clear();
        localStorage.removeItem('seenUsers');
        await fetchTargetBroadcasterAndConnect();
    }
}

export function connectWebSocket() {
    if (state.ws) {
        state.ws.onclose = null;
        state.ws.close();
    }
    if (state.wsReconnectTimeout) {
        clearTimeout(state.wsReconnectTimeout);
        state.wsReconnectTimeout = null;
    }
    state.ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

    state.ws.onopen = () => {
        console.log('WebSocket connection opened');
    };

    state.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.metadata.message_type === 'session_welcome') {
            const sessionId = data.payload.session.id;
            updateStatus('接続完了', 'green');
            await subscribeToEvents(sessionId);
        } else if (data.metadata.message_type === 'session_keepalive') {
            // Keepalive
        } else if (data.metadata.message_type === 'notification') {
            handleNotification(data.payload);
        } else if (data.metadata.message_type === 'session_reconnect') {
            console.log('Reconnect requested');
        }
    };

    state.ws.onclose = (event) => {
        console.log('WebSocket connection closed', event ? event.code : '', event ? event.reason : '');
        updateStatus('切断', 'red');
        if (state.accessToken) {
            state.wsReconnectTimeout = setTimeout(connectWebSocket, 5000);
        }
    };

    state.ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };
}

export async function subscribeToEvents(sessionId) {
    const types = [
        { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: state.targetBroadcasterId, user_id: state.loggedInUserId } },
        { type: 'channel.chat.notification', version: '1', condition: { broadcaster_user_id: state.targetBroadcasterId, user_id: state.loggedInUserId } }
    ];

    if (state.targetBroadcasterId === state.loggedInUserId) {
        types.push({ type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: state.targetBroadcasterId } });
    }
    types.push({ type: 'channel.follow', version: '2', condition: { broadcaster_user_id: state.targetBroadcasterId, moderator_user_id: state.loggedInUserId } });
    types.push({ type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: state.targetBroadcasterId } });

    await Promise.all(types.map(async (sub) => {
        try {
            const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.accessToken}`,
                    'Client-Id': config.CLIENT_ID,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: sub.type,
                    version: sub.version,
                    condition: sub.condition,
                    transport: {
                        method: 'websocket',
                        session_id: sessionId
                    }
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                console.error(`Failed to subscribe to ${sub.type}:`, errData);
                if (errData.status === 403) {
                    console.error('権限エラー: 指定されたユーザーにこの操作を行う権限がないか、必要なスコープ（moderator:read:followers等）が不足しています。');
                    updateStatus('権限エラー(再ログイン必須)', 'red');
                    if (!window.authErrorAlerted) {
                        alert('【Twitch連携エラー】\n現在の権限が古いため、テキスト無しのチャンネルポイント等を正常に取得できません。\n\nお手数ですが、右下の「ログアウト」ボタンから一度連携を解除し、再度ログインを行ってください。');
                        window.authErrorAlerted = true;
                    }
                }
            } else {
                console.log(`Subscribed to ${sub.type}`);
            }
        } catch (err) {
            console.error('Subscription error:', err);
        }
    }));
}

export function buildMessageHtml(message) {
    if (!message || !message.fragments) return '';
    return message.fragments.map(fragment => {
        if (fragment.type === 'emote' && fragment.emote) {
            const emoteId = fragment.emote.id;
            const emoteName = fragment.text || fragment.emote.emote_set_id;
            // アニメーションエモート対応: format配列にanimatedが含まれていればアニメーション版を使用
            const format = (fragment.emote.format && fragment.emote.format.includes('animated')) ? 'animated' : 'static';
            const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/${format}/dark/2.0`;
            return `<img src="${emoteUrl}" alt="${emoteName}" title="${emoteName}" class="inline-block align-middle" style="height:1.6em;vertical-align:middle;margin:0 2px;">`;
        }
        // チアモート（Bits応援エモート）の画像表示
        if (fragment.type === 'cheermote' && fragment.cheermote) {
            const prefix = fragment.cheermote.prefix;
            const tier = fragment.cheermote.tier;
            const bits = fragment.cheermote.bits;
            // Twitchの標準チアモートURL形式
            const cheermoteUrl = `https://d3aqoihi2n8rts.cloudfront.net/actions/${prefix}/dark/animated/${tier}/2.gif`;
            return `<img src="${cheermoteUrl}" alt="${prefix}${bits}" title="${prefix}${bits}" class="inline-block align-middle" style="height:1.6em;vertical-align:middle;margin:0 2px;"><span class="cheermote-bits">${bits}</span>`;
        }
        // メンション（@ユーザー）をハイライト表示する
        if (fragment.type === 'mention' && fragment.mention) {
            const escapedText = fragment.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<span class="mention-highlight">${escapedText}</span>`;
        }
        return fragment.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }).join('');
}

export function handleNotification(payload) {
    const type = payload.subscription.type;
    const event = payload.event;

    if (type === 'channel.chat.message') {
        const chatterId = event.chatter_user_id;
        const chatterName = event.chatter_user_name || event.chatter_user_login;
        const userColor = event.color || '';
        const messageHtml = buildMessageHtml(event.message);

        if (chatterId === state.loggedInUserId && event.message.text.trim() === '!test') {
            addCard({ type: 'first_comment', title: '【テスト】初コメ', username: chatterName, content: '初見です！(テスト)', colorClass: 'blue', userColor: '#000000' }); // Test black color conversion
            addCard({ type: 'subscribe', title: '初コメ ⭐ サブスク', username: '複合色テストさん', contentHtml: '<span>Tier 1 サブスクライブ！🎉 </span><br><span class="text-gray-300 mt-1 block">複合カラー（外側青色、内側ピンク）のテストです！</span>', extra: 'Tier 1', colorClass: 'sub_first', userColor: '#FF69B4' });
            addCard({ type: 'raid_comment', title: 'レイド 🚨 テストchから', username: chatterName, content: 'レイドの二重構造（青色・オレンジ）テスト', colorClass: 'raid_first', userColor: '#00008B' }); // Test dark blue color conversion
            addCard({ type: 'cheer', title: '【テスト】ビッツ', username: chatterName, content: '応援してます！(テスト)', extra: '500 Bits', colorClass: 'purple', userColor });
            addCard({ type: 'points', title: '【テスト】チャンネルポイント', username: chatterName, content: '(テストのテキスト入力)', extra: '足つぼマッサージ', colorClass: 'emerald', userColor });
            addCard({ type: 'raid', title: 'レイド!', username: 'テストチャンネル', contentHtml: '<span>テスト用レイド通知</span>', extra: '50人', colorClass: 'orange' });
            addCard({ type: 'follow', title: 'フォロー', username: 'テストフォロワー', contentHtml: '<span>チャンネルをフォローしました！</span>', colorClass: 'cyan' });
            addCard({ type: 'subscribe', title: 'サブスク', username: 'テストサブスクライバー', contentHtml: '<span>ティア1 サブスクライブ！🎉</span>', extra: 'Tier 1', colorClass: 'pink', userColor: '#FF1493' });
            // --- v1.1 新機能テストデータ ---
            // リプライ（返信先）表示テスト
            addCard({ type: 'chat', title: '', username: 'リプライテストさん', contentHtml: 'これは返信メッセージです！', colorClass: 'gray', userColor: '#9ACD32', reply: { parent_user_name: chatterName, parent_message_body: '元のメッセージの内容がここに表示されます' } });
            // メンション（@ユーザー）ハイライトテスト
            addCard({ type: 'chat', title: '', username: 'メンションテストさん', contentHtml: '<span class="mention-highlight">@' + chatterName + '</span> こんにちは！メンションのテストです', colorClass: 'gray', userColor: '#FF6347' });
            // アナウンスメントテスト
            addCard({ type: 'announcement', title: '📢 アナウンス', username: chatterName, contentHtml: '<span>本日20時から特別配信を行います！お楽しみに！</span>', colorClass: 'announcement', userColor });
            // ハイライトメッセージ（channel_points_highlighted）テスト
            addCard({ type: 'chat', title: '', username: 'ハイライトテストさん', contentHtml: 'チャンネルポイントで目立たせたメッセージです！', colorClass: 'gray', userColor: '#DAA520', messageType: 'channel_points_highlighted' });
            // 自己紹介メッセージ（user_intro）テスト
            addCard({ type: 'chat', title: '', username: '自己紹介テストさん', contentHtml: 'はじめまして！ゲーム好きです、よろしく！', colorClass: 'gray', userColor: '#20B2AA', messageType: 'user_intro' });
            // --- v1.2 新機能テストデータ ---
            // コミュニティギフトサブテスト
            addCard({ type: 'community_gift', title: '🎁 コミュニティギフト', username: 'ギフターテストさん', contentHtml: '<span>コミュニティに <strong>10個</strong> のTier 1サブギフトを贈りました！</span>', extra: '10個 / Tier 1', colorClass: 'pink', userColor: '#FF69B4' });
            // ギフトサブ→有料アップグレードテスト
            addCard({ type: 'sub_upgrade', title: '⬆ サブ継続', username: 'アップグレードさん', contentHtml: '<span>ギフトサブからTier 1の有料サブに継続しました！<br><span class="text-gray-400 text-xs">ギフト元: ギフターテストさん</span></span>', colorClass: 'pink', userColor: '#BA55D3' });
            // Prime→有料アップグレードテスト
            addCard({ type: 'sub_upgrade', title: '⬆ Prime→有料', username: 'Primeアップグレードさん', contentHtml: '<span>PrimeからTier 1の有料サブにアップグレードしました！</span>', colorClass: 'pink', userColor: '#00CED1' });
            // ペイ・イット・フォワードテスト
            addCard({ type: 'pay_it_forward', title: '💝 ペイフォワード', username: 'ペイフォワードさん', contentHtml: '<span>ギフトサブの恩送り！<br><span class="text-gray-400 text-xs">ギフト元: 匿名さん</span></span>', colorClass: 'pink', userColor: '#FFB6C1' });
            // Bitsバッジティア達成テスト
            addCard({ type: 'bits_badge', title: '💎 Bitsバッジ', username: 'Bitsコレクターさん', contentHtml: '<span>Bitsバッジ <strong>10000</strong> ティアを達成しました！</span>', colorClass: 'purple', userColor: '#9370DB' });
            // チャリティ寄付テスト
            addCard({ type: 'charity', title: '❤️ チャリティ寄付', username: '寄付テストさん', contentHtml: '<span><strong>$25.00</strong> を <strong>テストチャリティ団体</strong> に寄付しました！</span>', colorClass: 'charity', userColor: '#FF6347' });
            // 再サブスク+詳細情報テスト (streak/prime/gifter)
            addCard({ type: 'subscribe', title: 'サブスク', username: '詳細サブテストさん', contentHtml: '<span>Tier 1 サブスクライブ！🎉 (累計24ヶ月)</span><br><span class="sub-detail"><span class="sub-streak">🔥 連続 12ヶ月</span></span><br><span class="text-gray-300 mt-1 block">いつも楽しい配信ありがとう！</span>', extra: 'Tier 1', colorClass: 'pink', userColor: '#FFD700' });
            // Prime サブテスト
            addCard({ type: 'subscribe', title: 'サブスク', username: 'Primeサブさん', contentHtml: '<span>Prime サブスクライブ！🎉</span><br><span class="sub-detail"><span class="sub-prime">👑 Prime Gaming</span></span>', extra: 'Prime', colorClass: 'pink', userColor: '#1E90FF' });
            return;
        }

        // リプライ情報を抽出（返信メッセージの場合のみ存在する）
        const replyData = event.reply ? {
            parent_user_name: event.reply.parent_user_name,
            parent_message_body: event.reply.parent_message_body
        } : null;

        if (event.cheer && event.cheer.bits > 0) {
            addCard({
                type: 'cheer',
                title: 'Bits',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span>${event.cheer.bits} Bits 🎉</span> <span class="text-gray-300"> ${messageHtml}</span>`,
                extra: `${event.cheer.bits} Bits`,
                colorClass: 'purple',
                userColor: userColor,
                reply: replyData
            });
            if (!state.seenUsers.has(chatterId)) {
                state.seenUsers.add(chatterId);
                localStorage.setItem('seenUsers', JSON.stringify(Array.from(state.seenUsers)));
            }
            return;
        }

        const isBroadcaster = state.targetBroadcasterId === state.loggedInUserId;
        if (!isBroadcaster && event.channel_points_custom_reward_id) {
            addCard({
                type: 'points',
                title: 'ポイント',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span class="text-gray-300">${messageHtml}</span>`,
                extra: 'ポイント交換',
                colorClass: 'emerald',
                userColor: userColor
            });
            if (!state.seenUsers.has(chatterId)) {
                state.seenUsers.add(chatterId);
                localStorage.setItem('seenUsers', JSON.stringify(Array.from(state.seenUsers)));
            }
            return;
        }

        const isFirstComment = !state.seenUsers.has(chatterId);
        if (isFirstComment) {
            state.seenUsers.add(chatterId);
            localStorage.setItem('seenUsers', JSON.stringify(Array.from(state.seenUsers)));

            const isRaider = Date.now() < state.raidEndTime;
            addCard({
                type: isRaider ? 'raid_comment' : 'first_comment',
                title: isRaider ? `レイド 🚨 ${state.raidSource}から` : '初コメ ⭐',
                username: chatterName,
                badges: event.badges,
                contentHtml: messageHtml,
                colorClass: isRaider ? 'raid_first' : 'blue',
                userColor: userColor,
                reply: replyData,
                messageType: event.message_type
            });
        } else {
            addCard({
                type: 'chat',
                title: '',
                username: chatterName,
                badges: event.badges,
                contentHtml: messageHtml,
                colorClass: 'gray',
                userColor: userColor,
                reply: replyData,
                messageType: event.message_type
            });
        }
    } else if (type === 'channel.chat.notification') {
        const noticeType = event.notice_type;
        const chatterName = event.chatter_user_name || event.chatter_user_login || 'System';
        const userColor = event.color || '';

        if (noticeType === 'sub' || noticeType === 'resub' || noticeType === 'sub_gift') {
            // サブスクライブ関連の通知処理（詳細情報付き）
            let tier = 'Prime/Tier 1';
            let subExtra = '';
            let customMessageHtml = '';
            let subDetailParts = []; // 追加の詳細情報（連続月数・Prime・ギフター等）

            if (noticeType === 'sub' && event.sub) {
                const isPrime = event.sub.is_prime;
                tier = isPrime ? 'Prime' : event.sub.sub_tier === '1000' ? 'Tier 1' : event.sub.sub_tier === '2000' ? 'Tier 2' : event.sub.sub_tier === '3000' ? 'Tier 3' : 'Tier 1';
                if (isPrime) subDetailParts.push('<span class="sub-prime">👑 Prime Gaming</span>');
                // 初回サブのカスタムメッセージ（稀だがドキュメント上は可能）
                if (event.sub.sub_message && event.sub.sub_message.fragments) {
                    customMessageHtml = buildMessageHtml(event.sub.sub_message);
                } else if (event.message && event.message.fragments) {
                    customMessageHtml = buildMessageHtml(event.message);
                }
            } else if (noticeType === 'resub' && event.resub) {
                const isPrime = event.resub.is_prime;
                tier = isPrime ? 'Prime' : event.resub.sub_tier === '1000' ? 'Tier 1' : event.resub.sub_tier === '2000' ? 'Tier 2' : event.resub.sub_tier === '3000' ? 'Tier 3' : 'Tier 1';
                subExtra = `(累計${event.resub.cumulative_months}ヶ月)`;
                // 連続サブスク月数（streak_months）の表示
                if (event.resub.streak_months && event.resub.streak_months > 0) {
                    subDetailParts.push(`<span class="sub-streak">🔥 連続 ${event.resub.streak_months}ヶ月</span>`);
                }
                if (isPrime) subDetailParts.push('<span class="sub-prime">👑 Prime Gaming</span>');
                // ギフトからの再サブの場合、ギフター情報を表示
                if (event.resub.is_gift && !event.resub.gifter_is_anonymous && event.resub.gifter_user_name) {
                    subDetailParts.push(`<span class="sub-gifter">🎁 ギフト元: ${event.resub.gifter_user_name}</span>`);
                } else if (event.resub.is_gift && event.resub.gifter_is_anonymous) {
                    subDetailParts.push('<span class="sub-gifter">🎁 ギフト元: 匿名さん</span>');
                }
                // 再サブのカスタムメッセージ
                if (event.resub.resub_message && event.resub.resub_message.fragments) {
                    customMessageHtml = buildMessageHtml(event.resub.resub_message);
                } else if (event.message && event.message.fragments) {
                    customMessageHtml = buildMessageHtml(event.message);
                }
            } else if (noticeType === 'sub_gift' && event.sub_gift) {
                tier = event.sub_gift.sub_tier === '1000' ? 'Tier 1' : event.sub_gift.sub_tier === '2000' ? 'Tier 2' : event.sub_gift.sub_tier === '3000' ? 'Tier 3' : 'Tier 1';
                subExtra = `ギフト (${event.sub_gift.recipient_user_name}へ)`;
                if (event.sub_gift.cumulative_total && event.sub_gift.cumulative_total > 1) {
                    subDetailParts.push(`<span class="sub-gifter">通算 ${event.sub_gift.cumulative_total}個ギフト済み</span>`);
                }
                if (event.message && event.message.fragments) {
                    customMessageHtml = buildMessageHtml(event.message);
                }
            }

            // system_messageの活用: Twitchが生成したシステムメッセージがある場合は表示
            let messageHtmlContent = '';
            if (event.system_message && event.system_message.trim()) {
                messageHtmlContent = `<span>${event.system_message}</span>`;
            } else {
                messageHtmlContent = `<span>${tier} サブスクライブ！🎉 ${subExtra}</span>`;
            }
            // サブ詳細情報（連続月数・Prime・ギフター等）の追加
            if (subDetailParts.length > 0) {
                messageHtmlContent += `<br><span class="sub-detail">${subDetailParts.join(' ')}</span>`;
            }
            if (customMessageHtml) {
                messageHtmlContent += `<br><span class="text-gray-300 mt-1 block">${customMessageHtml}</span>`;
            }

            const chatterId = event.chatter_user_id || event.target_user_id;
            let isFirstComment = false;
            if (chatterId && !state.seenUsers.has(chatterId)) {
                isFirstComment = true;
                state.seenUsers.add(chatterId);
                localStorage.setItem('seenUsers', JSON.stringify(Array.from(state.seenUsers)));
            }

            addCard({
                type: isFirstComment ? 'first_comment' : 'subscribe',
                title: isFirstComment ? '初コメ ⭐ サブスク' : 'サブスク',
                username: chatterName,
                badges: event.badges,
                contentHtml: messageHtmlContent,
                extra: tier,
                colorClass: isFirstComment ? 'sub_first' : 'pink',
                userColor: userColor
            });
        } else if (noticeType === 'community_sub_gift' && event.community_sub_gift) {
            // コミュニティギフトサブ（一括ギフト）の処理
            const giftTier = event.community_sub_gift.sub_tier === '1000' ? 'Tier 1' : event.community_sub_gift.sub_tier === '2000' ? 'Tier 2' : event.community_sub_gift.sub_tier === '3000' ? 'Tier 3' : 'Tier 1';
            const total = event.community_sub_gift.total;
            const cumulativeTotal = event.community_sub_gift.cumulative_total;
            let contentParts = `<span>コミュニティに <strong>${total}個</strong> の${giftTier}サブギフトを贈りました！</span>`;
            if (cumulativeTotal && cumulativeTotal > total) {
                contentParts += `<br><span class="text-gray-400 text-xs">通算 ${cumulativeTotal}個ギフト済み</span>`;
            }
            addCard({
                type: 'community_gift',
                title: '🎁 コミュニティギフト',
                username: event.chatter_is_anonymous ? '匿名さん' : chatterName,
                badges: event.badges,
                contentHtml: contentParts,
                extra: `${total}個 / ${giftTier}`,
                colorClass: 'pink',
                userColor: userColor
            });
        } else if (noticeType === 'gift_paid_upgrade' && event.gift_paid_upgrade) {
            // ギフトサブから有料サブへのアップグレード処理
            let gifterInfo = '';
            if (!event.gift_paid_upgrade.gifter_is_anonymous && event.gift_paid_upgrade.gifter_user_name) {
                gifterInfo = `<br><span class="text-gray-400 text-xs">ギフト元: ${event.gift_paid_upgrade.gifter_user_name}</span>`;
            } else {
                gifterInfo = '<br><span class="text-gray-400 text-xs">ギフト元: 匿名さん</span>';
            }
            let sysMsg = event.system_message || 'ギフトサブから有料サブに継続しました！';
            addCard({
                type: 'sub_upgrade',
                title: '⬆ サブ継続',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span>${sysMsg}${gifterInfo}</span>`,
                colorClass: 'pink',
                userColor: userColor
            });
        } else if (noticeType === 'prime_paid_upgrade' && event.prime_paid_upgrade) {
            // PrimeからTier有料サブへのアップグレード処理
            const upgradeTier = event.prime_paid_upgrade.sub_tier === '1000' ? 'Tier 1' : event.prime_paid_upgrade.sub_tier === '2000' ? 'Tier 2' : event.prime_paid_upgrade.sub_tier === '3000' ? 'Tier 3' : 'Tier 1';
            let sysMsg = event.system_message || `Primeから${upgradeTier}の有料サブにアップグレードしました！`;
            addCard({
                type: 'sub_upgrade',
                title: '⬆ Prime→有料',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span>${sysMsg}</span>`,
                colorClass: 'pink',
                userColor: userColor
            });
        } else if (noticeType === 'pay_it_forward' && event.pay_it_forward) {
            // ペイ・イット・フォワード（ギフトサブの恩送り）処理
            let gifterInfo = '';
            if (!event.pay_it_forward.gifter_is_anonymous && event.pay_it_forward.gifter_user_name) {
                gifterInfo = `<br><span class="text-gray-400 text-xs">ギフト元: ${event.pay_it_forward.gifter_user_name}</span>`;
            } else {
                gifterInfo = '<br><span class="text-gray-400 text-xs">ギフト元: 匿名さん</span>';
            }
            let sysMsg = event.system_message || 'ギフトサブの恩送り！';
            addCard({
                type: 'pay_it_forward',
                title: '💝 ペイフォワード',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span>${sysMsg}${gifterInfo}</span>`,
                colorClass: 'pink',
                userColor: userColor
            });
        } else if (noticeType === 'bits_badge_tier' && event.bits_badge_tier) {
            // Bitsバッジティア達成通知
            const badgeTier = event.bits_badge_tier.tier;
            let sysMsg = event.system_message || `Bitsバッジ ${badgeTier} ティアを達成しました！`;
            addCard({
                type: 'bits_badge',
                title: '💎 Bitsバッジ',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span>${sysMsg}</span>`,
                colorClass: 'purple',
                userColor: userColor
            });
        } else if (noticeType === 'charity_donation' && event.charity_donation) {
            // チャリティ寄付通知
            const charityName = event.charity_donation.charity_name;
            const amount = event.charity_donation.amount;
            const value = amount.value;
            const decimal = amount.decimal_place;
            const currency = amount.currency;
            // 通貨フォーマット（小数点位置を考慮）
            const formattedAmount = decimal > 0 ? (value / Math.pow(10, decimal)).toFixed(decimal) : value;
            let sysMsg = event.system_message || `${currency} ${formattedAmount} を ${charityName} に寄付しました！`;
            addCard({
                type: 'charity',
                title: '❤️ チャリティ寄付',
                username: chatterName,
                badges: event.badges,
                contentHtml: `<span>${sysMsg}</span>`,
                colorClass: 'charity',
                userColor: userColor
            });
        } else if (noticeType === 'raid' && event.raid) {
            // レイド通知（notification経由）— 既存のchannel.raidイベントと重複する可能性があるが
            // shared_chat経由の場合はこちらのみ発火するため処理する
            const raiderName = event.raid.user_name || event.raid.user_login;
            const viewerCount = event.raid.viewer_count;
            addCard({
                type: 'raid',
                title: 'レイド!',
                username: raiderName,
                contentHtml: `<span>🚨 <strong>${raiderName}</strong> からレイドが来ました!</span>`,
                extra: `${viewerCount}人`,
                colorClass: 'orange'
            });
        } else if (noticeType === 'unraid') {
            // レイド解除通知
            addCard({
                type: 'system_notice',
                title: 'レイド解除',
                username: 'System',
                contentHtml: '<span>レイドが解除されました。</span>',
                colorClass: 'gray'
            });
        } else if (noticeType === 'announcement') {
            // アナウンスメントの処理
            const announcementColor = event.announcement ? event.announcement.color : 'primary';
            const customMessageHtml = buildMessageHtml(event.message);
            addCard({
                type: 'announcement',
                title: '📢 アナウンス',
                username: chatterName,
                badges: event.badges,
                contentHtml: customMessageHtml,
                colorClass: 'announcement',
                userColor: userColor,
                announcementColor: announcementColor
            });
        } else if (noticeType && noticeType.startsWith('shared_chat_')) {
            // 共有チャット系の通知処理（shared_chat_sub, shared_chat_resub等）
            // 共有チャットの通知は通常の通知と同じ構造だが、source_broadcaster情報がある
            const sourceChannel = event.source_broadcaster_user_name || event.source_broadcaster_user_login || '';
            const baseType = noticeType.replace('shared_chat_', '');
            let contentText = event.system_message || `共有チャット通知 (${baseType})`;
            if (sourceChannel) {
                contentText += `<br><span class="text-gray-400 text-xs">📡 ${sourceChannel} から</span>`;
            }
            addCard({
                type: 'system_notice',
                title: '📡 共有チャット',
                username: chatterName,
                badges: event.source_badges || event.badges,
                contentHtml: `<span>${contentText}</span>`,
                colorClass: 'gray',
                userColor: userColor
            });
        }
    } else if (type === 'channel.channel_points_custom_reward_redemption.add') {
        const rewardName = event.reward.title;
        const userName = event.user_name || event.user_login;

        addCard({
            type: 'points',
            title: 'ポイント',
            username: userName,
            contentHtml: event.user_input ? `<span class="text-gray-300">${event.user_input}</span>` : '',
            extra: rewardName,
            colorClass: 'emerald'
        });
    } else if (type === 'channel.raid') {
        const raiderName = event.from_broadcaster_user_name || event.from_broadcaster_user_login;
        const viewers = event.viewers;
        state.raidSource = raiderName;
        state.raidEndTime = Date.now() + 5 * 60 * 1000;

        addCard({
            type: 'raid',
            title: 'レイド!',
            username: raiderName,
            contentHtml: `<span>🚨 <strong>${raiderName}</strong> からレイドが来ました!</span>`,
            extra: `${viewers}人`,
            colorClass: 'orange'
        });
    } else if (type === 'channel.follow') {
        const followerName = event.user_name || event.user_login;
        addCard({
            type: 'follow',
            title: 'フォロー',
            username: followerName,
            contentHtml: `<span>チャンネルをフォローしました！💙</span>`,
            colorClass: 'cyan'
        });
    } else if (type === 'channel.subscribe') {
        const subName = event.user_name || event.user_login;
        const tierMap = { '1000': 'Tier 1', '2000': 'Tier 2', '3000': 'Tier 3' };
        const tier = tierMap[event.tier] || 'Prime';
        const isGift = event.is_gift ? "ギフト" : "";

        addCard({
            type: 'subscribe',
            title: 'サブスク',
            username: subName,
            contentHtml: `<span>${tier} サブスクライブ！🎉 ${isGift}</span>`,
            extra: tier,
            colorClass: 'pink'
        });
    }
}

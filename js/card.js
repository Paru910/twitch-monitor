import { state } from './state.js';
import { elements } from './ui.js';

export function buildBadgesHtml(badges) {
    if (!badges || badges.length === 0) return '';
    return badges.map(badge => {
        const url = state.badgeMap[`${badge.set_id}/${badge.id}`];
        if (!url) return '';
        return `<img src="${url}" alt="${badge.set_id}" title="${badge.set_id}" class="inline-block align-middle" style="height:1.1em;margin-right:3px;vertical-align:middle;">`;
    }).join('');
}

export function addCard(data, isRestore = false) {
    const card = document.createElement('div');

    const colorMap = {
        'blue': { bg: 'bg-blue-900', border: 'border-blue-500', textTitle: 'text-blue-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'purple': { bg: 'bg-purple-900', border: 'border-purple-500', textTitle: 'text-purple-300', textContent: 'text-gray-100', textExtra: 'text-yellow-400 font-extrabold', extraBg: '' },
        'emerald': { bg: 'bg-emerald-900', border: 'border-emerald-500', textTitle: 'text-emerald-300', textContent: 'text-gray-100', textExtra: 'text-emerald-100', extraBg: 'bg-emerald-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'orange': { bg: 'bg-orange-900', border: 'border-orange-500', textTitle: 'text-orange-300', textContent: 'text-gray-100', textExtra: 'text-orange-100 font-bold', extraBg: 'bg-orange-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'cyan': { bg: 'bg-cyan-900', border: 'border-cyan-500', textTitle: 'text-cyan-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'pink': { bg: 'bg-pink-900', border: 'border-pink-500', textTitle: 'text-pink-300', textContent: 'text-gray-100', textExtra: 'text-pink-200 font-bold', extraBg: 'bg-pink-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'sub_first': { bg: 'bg-gradient-to-r from-blue-900 via-pink-900 to-pink-900', border: 'border-blue-500', textTitle: 'text-blue-300', textContent: 'text-gray-100', textExtra: 'text-pink-200 font-bold', extraBg: 'bg-pink-950 px-2 py-1 rounded mt-1 inline-block text-sm' },
        'raid_first': { bg: 'bg-gradient-to-r from-blue-900 via-orange-900 to-orange-900', border: 'border-blue-500', textTitle: 'text-blue-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'gray': { bg: 'bg-gray-800', border: 'border-gray-600', textTitle: 'text-gray-400', textContent: 'text-gray-100', textExtra: '', extraBg: '' },
        'red': { bg: 'bg-red-900', border: 'border-red-500', textTitle: 'text-red-300', textContent: 'text-gray-100', textExtra: '', extraBg: '' }
    };

    const colors = colorMap[data.colorClass];
    const badgesHtml = buildBadgesHtml(data.badges);
    const messageHtmlContent = data.contentHtml !== undefined
        ? data.contentHtml
        : (data.content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    card.className = `${colors.bg} border-l-4 ${colors.border} p-3 rounded-lg shadow cursor-pointer transition-all duration-300`;

    if (!data.timeStr) {
        const now = new Date();
        data.timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
    const timeStr = data.timeStr;

    let html = '';

    if (data.type === 'cheer') {
        html = `
                    <div class="flex items-start justify-between gap-2 mb-1">
                        <span class="text-lg font-bold text-white truncate">${badgesHtml}${data.username}</span>
                        <div class="flex flex-col items-end whitespace-nowrap">
                            <span class="${colors.textExtra} text-sm font-bold">${data.extra}</span>
                            <span class="text-[0.65rem] text-gray-400 mt-0.5">${timeStr}</span>
                        </div>
                    </div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    } else if (data.type === 'points') {
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-lg font-bold text-white truncate">${badgesHtml}${data.username}</span>
                        <span class="text-[0.65rem] text-gray-400 whitespace-nowrap">${timeStr}</span>
                    </div>
                    <div class="${colors.textExtra} ${colors.extraBg} text-sm font-bold">${data.extra}</div>
                    ${data.contentHtml ? `<div class="text-sm ${colors.textContent} break-words leading-snug mt-1">${messageHtmlContent}</div>` : ''}
                `;
    } else if (data.type === 'first_comment' || data.type === 'raid_comment') {
        const badgeColor = data.type === 'raid_comment' ? 'bg-orange-800' : 'bg-blue-800';
        html = `
                    <div class="flex items-center justify-between gap-1 mb-1">
                        <div class="flex items-center gap-1 truncate">
                            <span class="text-xs font-bold ${colors.textTitle} ${badgeColor} px-1.5 py-0.5 rounded whitespace-nowrap">${data.title}</span>
                            <span class="text-lg font-bold text-white truncate">${badgesHtml}${data.username}</span>
                        </div>
                        <span class="text-[0.65rem] text-gray-400 whitespace-nowrap ml-1">${timeStr}</span>
                    </div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    } else if (data.type === 'raid' || data.type === 'subscribe' || data.type === 'follow') {
        html = `
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="text-lg font-bold text-white truncate">${data.username}</span>
                        <span class="text-[0.65rem] text-gray-400 whitespace-nowrap">${timeStr}</span>
                    </div>
                    ${data.extra ? `<div class="${colors.textExtra} ${colors.extraBg} text-sm font-bold mb-1">${data.extra}</div>` : ''}
                    <div class="text-sm ${colors.textContent} break-words leading-snug mt-1">${messageHtmlContent}</div>
                `;
    } else {
        html = `
                    <div class="flex items-start justify-between gap-2 mb-0.5">
                        <span class="text-sm font-bold ${colors.textTitle} truncate">${badgesHtml}${data.username}</span>
                        <span class="text-[0.65rem] text-gray-500 whitespace-nowrap mt-0.5">${timeStr}</span>
                    </div>
                    <div class="text-sm ${colors.textContent} break-words leading-snug">${messageHtmlContent}</div>
                `;
    }

    card.innerHTML = html;

    card.addEventListener('click', () => {
        const isRead = card.classList.toggle('is-read');
        if (isRead) {
            card.classList.remove(colors.border);
            card.classList.add('border-gray-600', 'opacity-50');
        } else {
            card.classList.remove('border-gray-600', 'opacity-50');
            card.classList.add(colors.border);
        }
    });

    elements.cardsContainer.appendChild(card);

    if (!isRestore) {
        state.messageHistory.push(data);
        if (state.messageHistory.length > 100) {
            state.messageHistory.shift();
        }
        localStorage.setItem('chat_history', JSON.stringify(state.messageHistory));
    }

    if (state.isAutoScroll) {
        elements.mainContainer.scrollTop = elements.mainContainer.scrollHeight;
    }
}

export function restoreHistory() {
    elements.cardsContainer.innerHTML = '';
    state.messageHistory.forEach(data => {
        addCard(data, true);
    });
    if (state.isAutoScroll) {
        elements.mainContainer.scrollTop = elements.mainContainer.scrollHeight;
    }
}

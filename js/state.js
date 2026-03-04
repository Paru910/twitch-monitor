export const state = {
    accessToken: null,
    loggedInUserId: null,
    targetBroadcasterId: null,
    targetChannelName: '',
    ws: null,
    seenUsers: new Set(),
    isAutoScroll: true,
    badgeMap: {},
    fontSizeStep: parseInt(localStorage.getItem('fontSizeStep') || '0', 10),
    raidEndTime: 0,
    raidSource: '',
    wsReconnectTimeout: null
};

// Initialize seenUsers from localStorage
const storedUsers = localStorage.getItem('seenUsers');
if (storedUsers) {
    try {
        state.seenUsers = new Set(JSON.parse(storedUsers));
    } catch (e) {
        state.seenUsers = new Set();
    }
}

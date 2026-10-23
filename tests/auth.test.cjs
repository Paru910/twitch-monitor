const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { webcrypto } = require('node:crypto');
const vm = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, '../js/auth.js'), 'utf8');
const stateKey = 'twitch_oauth_state';

function storage() {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key),
    };
}

async function setup(hash = '', options = {}) {
    const calls = [];
    const state = { accessToken: null, ws: { close: () => calls.push('close') } };
    const localStorage = storage();
    const sessionStorage = storage();
    const location = { hash, search: '', pathname: '/monitor/', href: '', reload: () => calls.push('reload') };
    const config = { CLIENT_ID: 'fixture-client', REDIRECT_URI: 'https://example.invalid/monitor/', SCOPES: 'chat:read channel:read:redemptions' };
    const context = vm.createContext({
        URL, URLSearchParams, Uint8Array, crypto: webcrypto, localStorage, sessionStorage,
        confirm: () => true,
        window: { location, history: { replaceState: (_state, _title, path) => { calls.push('clean-url'); location.hash = ''; } } },
        ...options,
    });
    const modules = {
        './config.js': { config }, './state.js': { state },
        './ui.js': { showLoginUI: () => calls.push('login'), showAppUI: () => calls.push('app') },
        './api.js': { fetchUserData: () => calls.push('fetch') },
        './card.js': { restoreHistory: () => calls.push('restore') },
    };
    const auth = new vm.SourceTextModule(source, { context });
    await auth.link(specifier => {
        const exports = modules[specifier];
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        }, { context });
    });
    await auth.evaluate();
    return { auth: auth.namespace, state, localStorage, sessionStorage, location, calls, config };
}

test('認証URLは要求ごとに異なるCSPRNG stateと既存パラメータを含む', async () => {
    const env = await setup();
    env.auth.initiateLogin();
    const first = new URL(env.location.href);
    assert.match(first.searchParams.get('state'), /^[0-9a-f]{64}$/);
    assert.equal(first.searchParams.get('state'), env.sessionStorage.getItem(stateKey));
    assert.equal(first.origin + first.pathname, 'https://id.twitch.tv/oauth2/authorize');
    for (const [key, value] of Object.entries({ client_id: env.config.CLIENT_ID, redirect_uri: env.config.REDIRECT_URI, response_type: 'token', scope: env.config.SCOPES, force_verify: 'true' })) {
        assert.equal(first.searchParams.get(key), value);
    }
    env.auth.initiateLogin();
    assert.notEqual(new URL(env.location.href).searchParams.get('state'), first.searchParams.get('state'));
});

test('state一致時だけ保存・接続し、一時stateとURL fragmentを消す', async () => {
    const env = await setup('#access_token=fixture-token&state=expected');
    env.sessionStorage.setItem(stateKey, 'expected');
    env.auth.checkAuth();
    assert.equal(env.state.accessToken, 'fixture-token');
    assert.equal(env.localStorage.getItem('twitch_access_token'), 'fixture-token');
    assert.equal(env.sessionStorage.getItem(stateKey), null);
    assert.equal(env.location.hash, '');
    assert.deepEqual(env.calls, ['clean-url', 'app', 'restore', 'fetch']);
});

for (const [name, hash, expected] of [
    ['不一致', '#access_token=fixture-token&state=other', 'expected'],
    ['保存stateなし', '#access_token=fixture-token&state=expected', null],
    ['返却stateなし', '#access_token=fixture-token', 'expected'],
    ['空state', '#access_token=fixture-token&state=', ''],
    ['重複state', '#access_token=fixture-token&state=expected&state=other', 'expected'],
    ['重複token', '#access_token=fixture-token&access_token=other&state=expected', 'expected'],
    ['空token', '#access_token=&state=expected', 'expected'],
    ['エラー応答', '#error=access_denied&state=expected', 'expected'],
]) {
    test(`${name}ではtokenを受理せず既存tokenにも接続しない`, async () => {
        const env = await setup(hash);
        if (expected !== null) env.sessionStorage.setItem(stateKey, expected);
        env.localStorage.setItem('twitch_access_token', 'previous-fixture-token');
        env.auth.checkAuth();
        assert.equal(env.state.accessToken, null);
        assert.equal(env.localStorage.getItem('twitch_access_token'), 'previous-fixture-token');
        assert.equal(env.sessionStorage.getItem(stateKey), null);
        assert.equal(env.location.hash, '');
        assert.deepEqual(env.calls, ['clean-url', 'login']);
    });
}

test('使用済みstateによる再送を拒否する', async () => {
    const hash = '#access_token=fixture-token&state=expected';
    const env = await setup(hash);
    env.sessionStorage.setItem(stateKey, 'expected');
    env.auth.checkAuth();
    env.location.hash = hash;
    env.auth.checkAuth();
    assert.equal(env.state.accessToken, null);
    assert.equal(env.calls.at(-1), 'login');
});

test('通常再訪では保存済みtokenで再接続する', async () => {
    const env = await setup('#section');
    env.localStorage.setItem('twitch_access_token', 'previous-fixture-token');
    env.auth.checkAuth();
    assert.deepEqual(env.calls, ['app', 'restore', 'fetch']);
});

test('ログアウト時はstateと既存認証情報を削除し接続を閉じる', async () => {
    const env = await setup();
    env.sessionStorage.setItem(stateKey, 'expected');
    for (const key of ['twitch_access_token', 'target_channel', 'seenUsers']) env.localStorage.setItem(key, 'fixture');
    env.auth.logout();
    assert.equal(env.sessionStorage.getItem(stateKey), null);
    for (const key of ['twitch_access_token', 'target_channel', 'seenUsers']) assert.equal(env.localStorage.getItem(key), null);
    assert.deepEqual(env.calls, ['close', 'reload']);
});

test('一時保存を使えないときは認証開始・token受理を拒否する', async () => {
    const env = await setup('#access_token=fixture-token&state=expected', {
        sessionStorage: { getItem() { throw Error('unavailable'); }, setItem() { throw Error('unavailable'); }, removeItem() { throw Error('unavailable'); } },
    });
    env.auth.initiateLogin();
    assert.equal(env.location.href, '');
    env.auth.checkAuth();
    assert.equal(env.state.accessToken, null);
    assert.equal(env.localStorage.getItem('twitch_access_token'), null);
    env.auth.logout();
    assert.equal(env.calls.at(-1), 'reload');
});

test('安全な乱数が利用できないときは認証を開始しない', async () => {
    const env = await setup('', { crypto: undefined });
    env.auth.initiateLogin();
    assert.equal(env.location.href, '');
    assert.deepEqual(env.calls, ['login']);
});

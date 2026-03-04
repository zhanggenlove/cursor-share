/**
 * mock_client.js — End-to-end test for the signaling server
 *
 * Simulates two clients (User A and User B) going through the full flow:
 *  1. Both JOIN
 *  2. A sends REQUEST_BORROW to B
 *  3. B receives INCOMING_REQUEST, sends AGREE_BORROW
 *  4. A receives BORROW_APPROVED, sends BORROW_SUCCESS
 *  5. B sends REVOKE_ALL
 *  6. A receives KICKED_OUT
 *  7. A sends RETURN_TOKEN (for the voluntary return path)
 *
 * Usage: First start the server, then run this script.
 *   node src/server.js     (Terminal 1)
 *   node test/mock_client.js  (Terminal 2)
 */

const WebSocket = require('ws');

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8080';

let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  [PASS] ${label}`);
        passed++;
    } else {
        console.log(`  [FAIL] ${label}`);
        failed++;
    }
}

function createClient(id, email, quota) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(SERVER_URL);
        const received = [];

        ws.on('open', () => {
            ws.send(JSON.stringify({
                action: 'JOIN',
                payload: { id, email, quota }
            }));
        });

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw);
            received.push(msg);

            // Trigger event handlers if registered
            if (ws._handlers && ws._handlers[msg.action]) {
                ws._handlers[msg.action](msg);
            }
        });

        ws.on('error', reject);

        ws._handlers = {};
        ws.onAction = (action, fn) => {
            ws._handlers[action] = fn;
        };

        ws.received = received;

        // Wait for the first SYNC_LIST (confirms JOIN was processed)
        ws.onAction('SYNC_LIST', () => {
            resolve(ws);
        });
    });
}

function send(ws, action, payload) {
    ws.send(JSON.stringify({ action, payload }));
}

function waitForAction(ws, action, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for ${action}`));
        }, timeoutMs);

        ws.onAction(action, (msg) => {
            clearTimeout(timer);
            resolve(msg);
        });
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   Cursor Share — Mock Client E2E Test        ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');

    // ── Step 1: Both clients join ──
    console.log('Step 1: Connect & JOIN');
    const clientA = await createClient('user_A', 'a@ly.com', 0);
    const clientB = await createClient('user_B', 'b@ly.com', 450);
    assert(true, 'Client A connected and joined');
    assert(true, 'Client B connected and joined');

    await sleep(300);

    // Verify SYNC_LIST contains both users
    const lastSyncA = clientA.received.filter(m => m.action === 'SYNC_LIST').pop();
    assert(lastSyncA && lastSyncA.data.length === 2, 'SYNC_LIST has 2 users');

    // ── Step 2: A requests to borrow from B ──
    console.log('\nStep 2: A requests to borrow from B');
    const incomingPromise = waitForAction(clientB, 'INCOMING_REQUEST');
    send(clientA, 'REQUEST_BORROW', { target_id: 'user_B', pub_key: 'mock_rsa_pub_key_A' });

    const incoming = await incomingPromise;
    assert(incoming.payload.from_id === 'user_A', 'B received INCOMING_REQUEST from A');
    assert(incoming.payload.pub_key === 'mock_rsa_pub_key_A', 'B received A\'s public key');

    // ── Step 3: B agrees ──
    console.log('\nStep 3: B agrees, sends encrypted token');
    const approvedPromise = waitForAction(clientA, 'BORROW_APPROVED');
    send(clientB, 'AGREE_BORROW', {
        requester_id: 'user_A',
        encrypted_token: 'ENCRYPTED_TOKEN_DATA_PLACEHOLDER'
    });

    const approved = await approvedPromise;
    assert(approved.payload.donor_id === 'user_B', 'A received BORROW_APPROVED from B');
    assert(approved.payload.encrypted_token === 'ENCRYPTED_TOKEN_DATA_PLACEHOLDER', 'A received encrypted token');

    // ── Step 4: A confirms borrow success ──
    console.log('\nStep 4: A confirms borrow success');
    const activatedPromise = waitForAction(clientB, 'BORROWER_ACTIVATED');
    send(clientA, 'BORROW_SUCCESS', { donor_id: 'user_B' });

    const activated = await activatedPromise;
    assert(activated.payload.borrower_id === 'user_A', 'B received BORROWER_ACTIVATED notification');

    await sleep(300);

    // Verify SYNC_LIST shows the relationship
    const syncAfterBorrow = clientA.received.filter(m => m.action === 'SYNC_LIST').pop();
    const userBInList = syncAfterBorrow.data.find(u => u.id === 'user_B');
    assert(userBInList && userBInList.using_count === 1, 'SYNC_LIST shows B has 1 borrower');

    const userAInList = syncAfterBorrow.data.find(u => u.id === 'user_A');
    assert(userAInList && userAInList.using_from === 'user_B', 'SYNC_LIST shows A is using B\'s token');

    // ── Step 5: B revokes all ──
    console.log('\nStep 5: B revokes all — cascade kick');
    const kickedPromise = waitForAction(clientA, 'KICKED_OUT');
    send(clientB, 'REVOKE_ALL', {});

    const kicked = await kickedPromise;
    assert(kicked.payload.by_id === 'user_B', 'A received KICKED_OUT from B');
    assert(kicked.payload.reason.length > 0, 'KICKED_OUT contains reason');

    await sleep(300);

    // Verify SYNC_LIST is clean after revoke
    const syncAfterRevoke = clientA.received.filter(m => m.action === 'SYNC_LIST').pop();
    const userBAfterRevoke = syncAfterRevoke.data.find(u => u.id === 'user_B');
    assert(userBAfterRevoke && userBAfterRevoke.using_count === 0, 'SYNC_LIST shows B has 0 borrowers after revoke');

    // ── Step 6: Test REJECT_BORROW ──
    console.log('\nStep 6: Test reject flow');
    const incomingPromise2 = waitForAction(clientB, 'INCOMING_REQUEST');
    send(clientA, 'REQUEST_BORROW', { target_id: 'user_B', pub_key: 'mock_rsa_pub_key_A' });
    await incomingPromise2;

    const rejectedPromise = waitForAction(clientA, 'BORROW_REJECTED');
    send(clientB, 'REJECT_BORROW', { requester_id: 'user_A', reason: '我现在自己要用' });

    const rejected = await rejectedPromise;
    assert(rejected.payload.donor_id === 'user_B', 'A received BORROW_REJECTED from B');
    assert(rejected.payload.reason === '我现在自己要用', 'Reject reason is correct');

    // ── Summary ──
    console.log('\n══════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('══════════════════════════════════════════════\n');

    clientA.close();
    clientB.close();

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});

// background.js - Service Worker
console.log("Google Keep Background Worker initialized.");

async function sha1(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSapisidHash(sapisid) {
    const time = Date.now();
    const origin = 'https://keep.google.com';
    const input = time + ' ' + sapisid + ' ' + origin;
    const hashHex = await sha1(input);
    return 'SAPISIDHASH ' + time + '_' + hashHex;
}

async function fetchKeepData() {
    try {
        const cookies = await new Promise((resolve) => {
            chrome.cookies.getAll({ url: 'https://keep.google.com' }, resolve);
        });
        
        const sapisidCookie = cookies.find(c => c.name === 'SAPISID');
        
        if (!sapisidCookie) {
            return { success: false, error: 'NOT_LOGGED_IN' };
        }

        // Tạo chuỗi cookie đầy đủ
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // Dùng DNR để ép trình duyệt gửi Cookie (vượt qua giới hạn SameSite=Lax của MV3)
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1],
            addRules: [{
                id: 1,
                priority: 1,
                action: {
                    type: 'modifyHeaders',
                    requestHeaders: [
                        {
                            header: 'Cookie',
                            operation: 'set',
                            value: cookieString
                        },
                        {
                            header: 'Origin',
                            operation: 'remove'
                        }
                    ]
                },
                condition: {
                    urlFilter: 'google.com',
                    resourceTypes: ['xmlhttprequest', 'other']
                }
            }]
        });

        const sapisidHash = await getSapisidHash(sapisidCookie.value);
        const origin = 'https://keep.google.com';

        let allNodes = [];
        let email = 'Đã đăng nhập';
        let isTruncated = true;
        let targetVersion = '';
        let loopCount = 0;

        while (isTruncated && loopCount < 10) {
            loopCount++;
            const payload = {
                "targetVersion": targetVersion,
                "clientTimestamp": new Date().toISOString(),
                "nodes": [],
                "requestHeader": {
                    "requestId": "req_" + Date.now() + "_" + loopCount,
                    "clientVersion": {
                        "major": "3",
                        "minor": "3",
                        "build": "0",
                        "revision": "392"
                    },
                    "clientPlatform": "WEB",
                    "capabilities": [
                        {"type": "EC"}, {"type": "TR"}, {"type": "SH"},
                        {"type": "LB"}, {"type": "RB"}, {"type": "DR"},
                        {"type": "AN"}, {"type": "PI"}, {"type": "EX"},
                        {"type": "IN"}, {"type": "SNB"}, {"type": "CO"},
                        {"type": "MI"}, {"type": "NC"}, {"type": "CL"}
                    ],
                    "clientSessionId": "keep-" + Date.now(),
                    "clientLocale": "vi"
                }
            };

            const response = await fetch('https://notes-pa.clients6.google.com/notes/v1/changes?alt=json&key=AIzaSyDE7NHMUZfMoJVu-YNkK-7AXFSuL1Q9gKE', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': sapisidHash,
                    'X-Origin': origin
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                if (response.status === 401) {
                    return { success: false, error: 'NOT_LOGGED_IN' };
                }
                const errorBody = await response.text();
                return { success: false, error: 'HTTP_ERROR', status: response.status, details: errorBody };
            }

            const data = await response.json();
            
            if (data && data.nodes) {
                allNodes = allNodes.concat(data.nodes);
                const nodeWithEmail = data.nodes.find(n => n.lastModifierEmail);
                if (nodeWithEmail) {
                    email = nodeWithEmail.lastModifierEmail;
                }
            }

            if (data && data.truncated && data.toVersion) {
                targetVersion = data.toVersion;
            } else {
                isTruncated = false;
            }
        }
        
        // Fetch User Avatar from keep.google.com page
        let avatarUrl = '';
        try {
            const keepPageRes = await fetch('https://keep.google.com/', { 
                headers: { 
                    'X-Goog-AuthUser': '0',
                    'Cookie': cookieString // Since DNR rule for notes-pa... doesn't cover keep.google.com directly for fetching html, wait, we can just send Cookie header directly in fetch for MV3 background if it's the same origin? No, we have to add DNR rule or just use the cookie string. Wait! For fetch in background script, if we set 'Cookie' header, it might be stripped, but let's try. Actually, we can add keep.google.com to DNR.
                }
            });
            const keepHtml = await keepPageRes.text();
            const unescapedHtml = keepHtml.replace(/\\\//g, '/');
            // Google usually puts avatar in a JS string or img tag, e.g. /a/ or /ogw/
            const avatarMatch = unescapedHtml.match(/(https:\/\/[a-z0-9-]+\.googleusercontent\.com\/(?:a|ogw)\/[^"'\s\\]+)/);
            if (avatarMatch) {
                avatarUrl = avatarMatch[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
            }
        } catch (e) {
            console.error('Fetch avatar failed', e);
        }
        
        // Extract LIST_ITEMs text
        const listItemsMap = {};
        allNodes.filter(n => n.type === 'LIST_ITEM' && !n.isArchived && !n.timestamps?.trashed?.startsWith('20')).forEach(item => {
            if (!listItemsMap[item.parentId]) {
                listItemsMap[item.parentId] = [];
            }
            listItemsMap[item.parentId].push(item);
        });

        // Sort list items by sortValue (assuming numerical string or just string sort)
        Object.keys(listItemsMap).forEach(parentId => {
            listItemsMap[parentId].sort((a, b) => {
                const svA = parseInt(a.sortValue || '0', 10);
                const svB = parseInt(b.sortValue || '0', 10);
                return svB - svA; // Or a - b depending on Google's sorting direction
            });
        });

        // Lọc ra các ghi chú hợp lệ (không ở trong thùng rác, không bị lưu trữ)
        let notes = allNodes
            .filter(n => (n.type === 'NOTE' || n.type === 'LIST') && !n.isArchived && !n.timestamps?.trashed?.startsWith('20')) 
            .map(n => {
                let noteText = n.indexableText || '';
                
                // Build text for LIST type
                if (n.type === 'LIST') {
                    const items = listItemsMap[n.id] || [];
                    const itemsText = items.map(item => {
                        const checked = item.checked ? '[x]' : '[ ]';
                        return `${checked} ${item.text || item.title || ''}`;
                    }).join('\n');
                    
                    if (itemsText) {
                        noteText = noteText ? noteText + '\n\n' + itemsText : itemsText;
                    }
                }

                return {
                    id: n.id,
                    serverId: n.serverId,
                    timestamps: n.timestamps,
                    title: n.title || '',
                    text: noteText,
                    isPinned: !!n.isPinned,
                    sortValue: parseInt(n.sortValue || '0', 10)
                };
            })
            .sort((a, b) => {
                if (a.isPinned !== b.isPinned) {
                    return a.isPinned ? -1 : 1;
                }
                const timeA = new Date(a.timestamps?.userEdited || a.timestamps?.created || 0).getTime();
                const timeB = new Date(b.timestamps?.userEdited || b.timestamps?.created || 0).getTime();
                return timeB - timeA;
            });
        
        return { success: true, notes: notes, email: email, avatarUrl: avatarUrl };
    } catch (err) {
        return { success: false, error: 'NETWORK_ERROR', details: err.message };
    }
}

async function createNote(title, text) {
    try {
        const cookies = await new Promise((resolve) => { chrome.cookies.getAll({ url: 'https://keep.google.com' }, resolve); });
        const sapisidCookie = cookies.find(c => c.name === 'SAPISID');
        if (!sapisidCookie) return { success: false, error: 'NOT_LOGGED_IN' };

        const sapisidHash = await getSapisidHash(sapisidCookie.value);
        const origin = 'https://keep.google.com';

        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1],
            addRules: [{ id: 1, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieString }, { header: 'Origin', operation: 'remove' }] }, condition: { urlFilter: 'notes-pa.clients6.google.com', resourceTypes: ['xmlhttprequest'] } }]
        });

        // 1. Fetch targetVersion
        let targetVersion = '';
        const clientSessionId = "s--" + Date.now() + "--" + Math.floor(Math.random() * 1000000000);
        const capabilities = [
            { type: "EC" }, { type: "TR" }, { type: "SH" }, { type: "LB" }, { type: "RB" },
            { type: "DR" }, { type: "AN" }, { type: "PI" }, { type: "EX" }, { type: "IN" },
            { type: "SNB" }, { type: "CO" }, { type: "MI" }, { type: "NC" }, { type: "CL" }
        ];

        const syncPayload = {
            targetVersion: '',
            clientTimestamp: new Date().toISOString(),
            requestHeader: {
                requestId: "req_" + Date.now(),
                clientVersion: { major: '3', minor: '3', build: '0', revision: '392' },
                clientPlatform: 'WEB',
                clientSessionId: clientSessionId,
                clientLocale: 'vi'
            }
        };

        const fetchHeaders = {
            'Content-Type': 'application/json',
            'Authorization': sapisidHash,
            'X-Origin': origin,
            'X-Goog-AuthUser': '0'
        };

        const syncRes = await fetch('https://notes-pa.clients6.google.com/notes/v1/changes?alt=json&key=AIzaSyDE7NHMUZfMoJVu-YNkK-7AXFSuL1Q9gKE', {
            method: 'POST',
            credentials: 'include',
            headers: fetchHeaders,
            body: JSON.stringify(syncPayload)
        });

        if (!syncRes.ok) {
            const errorText = await syncRes.text();
            return { success: false, error: 'SYNC_ERROR', status: syncRes.status, details: errorText };
        }

        const syncData = await syncRes.json();
        targetVersion = syncData.toVersion || '';

        // 2. Gửi request tạo ghi chú (Request 1 - Tạo Note & sct-add)
        const ts = new Date().toISOString();
        const id = Date.now() + '.' + Math.floor(Math.random() * 1000000000);
        const sctId = 'sct.' + Math.random().toString(36).substring(2, 14);
        const sessionId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
        let noteTitle = title || '';

        const nodeData = {
            id: id,
            kind: 'notes#node',
            parentId: 'root',
            timestamps: {
                kind: 'notes#timestamps',
                created: ts,
                deleted: '1970-01-01T00:00:00.000Z',
                trashed: '1970-01-01T00:00:00.000Z',
                updated: ts,
                userEdited: ts
            },
            type: 'NOTE',
            trashState: 0,
            deletionState: 0,
            sortValue: 255852544,
            baseVersion: "0",
            title: noteTitle,
            isArchived: false,
            isPinned: false,
            tasks: [],
            clientChanges: {
                clientRevision: "0",
                commandBundles: [{
                    sessionId: sessionId,
                    requestId: "0",
                    serializedCommands: JSON.stringify([["sct-add", 0, sctId, "txt"]])
                }]
            }
        };

        const payload1 = {
            targetVersion: targetVersion,
            clientTimestamp: ts,
            nodes: [nodeData],
            requestHeader: {
                requestId: "req_" + (Date.now() + 1),
                clientVersion: { major: '3', minor: '3', build: '0', revision: '392' },
                clientPlatform: 'WEB',
                capabilities: capabilities,
                clientSessionId: clientSessionId,
                clientLocale: 'vi'
            }
        };

        const res1 = await fetch('https://notes-pa.clients6.google.com/notes/v1/changes?alt=json&key=AIzaSyDE7NHMUZfMoJVu-YNkK-7AXFSuL1Q9gKE', {
            method: 'POST',
            credentials: 'include',
            headers: fetchHeaders,
            body: JSON.stringify(payload1)
        });

        if (!res1.ok) {
            return { success: false, error: 'HTTP_ERROR_1', status: res1.status, details: await res1.text() };
        }
        
        const data1 = await res1.json();
        
        // Nếu không có nội dung text, trả về thành công luôn
        if (!text) {
            return { success: true, data: data1 };
        }

        // Lấy targetVersion mới và serverId từ response 1
        targetVersion = data1.toVersion || targetVersion;
        let serverId = '';
        if (data1.nodes && data1.nodes.length > 0) {
            const returnedNode = data1.nodes.find(n => n.id === id);
            if (returnedNode) serverId = returnedNode.serverId;
        }

        if (!serverId) {
            return { success: false, error: 'NO_SERVER_ID', details: 'Cannot get serverId from Request 1' };
        }

        // 3. Request 2: Chèn text với docs-nestedModel (clientRevision: "1")
        const ts2 = new Date().toISOString();
        nodeData.timestamps.updated = ts2;
        nodeData.timestamps.userEdited = ts2;
        nodeData.serverId = serverId;
        nodeData.clientChanges = {
            clientRevision: "1",
            commandBundles: [{
                sessionId: sessionId,
                requestId: "1",
                serializedCommands: JSON.stringify([["docs-nestedModel", ["text", 1, sctId], { "ty": "is", "ibi": 1, "s": text }]])
            }]
        };

        const payload2 = {
            targetVersion: targetVersion,
            clientTimestamp: ts2,
            nodes: [nodeData],
            requestHeader: {
                requestId: "req_" + (Date.now() + 2),
                clientVersion: { major: '3', minor: '3', build: '0', revision: '392' },
                clientPlatform: 'WEB',
                capabilities: capabilities,
                clientSessionId: clientSessionId,
                clientLocale: 'vi'
            }
        };

        const res2 = await fetch('https://notes-pa.clients6.google.com/notes/v1/changes?alt=json&key=AIzaSyDE7NHMUZfMoJVu-YNkK-7AXFSuL1Q9gKE', {
            method: 'POST',
            credentials: 'include',
            headers: fetchHeaders,
            body: JSON.stringify(payload2)
        });

        if (!res2.ok) {
            return { success: false, error: 'HTTP_ERROR_2', status: res2.status, details: await res2.text() };
        }

        const data2 = await res2.json();
        return { success: true, data: data2 };
    } catch (err) {
        return { success: false, error: 'NETWORK_ERROR', details: err.message };
    }
}

async function deleteNote(note) {
    try {
        const cookies = await new Promise((resolve) => { chrome.cookies.getAll({ url: 'https://keep.google.com' }, resolve); });
        const sapisidCookie = cookies.find(c => c.name === 'SAPISID');
        if (!sapisidCookie) return { success: false, error: 'NOT_LOGGED_IN' };

        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [1],
            addRules: [{ id: 1, priority: 1, action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieString }, { header: 'Origin', operation: 'remove' }] }, condition: { urlFilter: 'notes-pa.clients6.google.com', resourceTypes: ['xmlhttprequest'] } }]
        });

        const sapisidHash = await getSapisidHash(sapisidCookie.value);
        const origin = 'https://keep.google.com';
        const ts = new Date().toISOString();

        const payload = {
            "clientTimestamp": ts,
            "nodes": [{
                "id": note.id,
                "kind": "notes#node",
                "parentId": "root",
                "timestamps": Object.assign({}, note.timestamps, { "trashed": ts, "updated": ts }),
                "type": "NOTE",
                "trashState": 1,
                "serverId": note.serverId,
                "deletionState": 0,
                "baseVersion": "0",
                "title": note.title || "",
                "isArchived": false,
                "isPinned": false
            }],
            "requestHeader": { "requestId": "req_" + Date.now(), "clientVersion": { "major": "3", "minor": "3", "build": "0", "revision": "392" }, "clientPlatform": "WEB", "clientSessionId": "keep-" + Date.now(), "clientLocale": "vi" }
        };

        const response = await fetch('https://notes-pa.clients6.google.com/notes/v1/changes?alt=json&key=AIzaSyDE7NHMUZfMoJVu-YNkK-7AXFSuL1Q9gKE', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'Authorization': sapisidHash, 'X-Origin': origin }, body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            return { success: false, error: 'HTTP_ERROR', status: response.status, details: errorBody };
        }
        return { success: true };
    } catch (err) { return { success: false, error: 'NETWORK_ERROR', details: err.message }; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'PING') {
    console.log("Received PING from popup.");
    sendResponse({ status: 'ACK', data: 'Background worker is running.' });
  } else if (message.action === 'FETCH_KEEP_DATA') {
    fetchKeepData().then(sendResponse);
  } else if (message.action === 'CREATE_NOTE') {
    createNote(message.title, message.text).then(sendResponse);
  } else if (message.action === 'DELETE_NOTE') {
    deleteNote(message.note).then(sendResponse);
  }
  return true; // Keep channel open for async responses
});

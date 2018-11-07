/**
 * Module for bot to monititor conversations it is a part of.
 * Manages co-edit sessions for users over a given conversation
 * Manages the database as a firebase admin account
 */
'use strict';
const admin = require('firebase-admin');
const FileAPI = require('file-api');
const File = FileAPI.File;
const fs = require('fs');
const Firepad = require('firepad');
const fetch = require('node-fetch');
const Circuit = require('circuit-sdk');
const config  = require('./config.json');

// Initalize the firebase admin app
admin.initializeApp({
    databaseURL: config.admin.databaseURL,
    credential: admin.credential.cert(config.admin)
});

const db = admin.database().ref(); // Reference to root of db
const ref = db.child('sessions');  // Reference to local part of db
var conversationsHashMap = {}; // Hash map to keep track of active sessions
const host = `${config.host.url}:${config.host.port}`; // Url of host
let client; // Client for bot

// Deletes the session with key from the database and hash map
async function endSession(key) {
    if (conversationsHashMap[key]) {
        await ref.child(key).child('document').remove();
        delete conversationsHashMap[key];
        console.log(`ENDED SESSION: ${key}`);
    }
}

// Creates a new session if it does not exist or links them to the current session if it does
async function createSession(item) {
    try {
        const snap = await ref.once('value');
        const exist = snap.child(item.convId).child('document').exists();
        // If the session already exists in firebase
        if (!exist) {
            const res = await Promise.all([
                client.getConversationById(item.convId),
                ref.child(item.convId).once('value')
            ]);
            const conversation = res[0];
            const previousSession = res[1].val();
            const participants = conversation.participants;
            // Create a hash map of conversations being listened to
            conversationsHashMap[conversation.convId] = {
                convId: conversation.convId,
                participants: participants,
                creatorId: item.creatorId, // The creator of the session
                tokens: {}  // Used to keep track of active tokens for firebase
            }; 
            // Create a new session in firebase and send link to the users
            const sess = {
                timeCreated: Date.now(),
                creatorId: item.creatorId,
                previousSessionEndTime: previousSession && previousSession.timeCreated || null
            }
            ref.child(conversation.convId).set(sess);
            let defaultText = '';
            if (item.attachments && item.attachments.length) {
                // There is a file to upload along with session
                // Will find the first text file and upload that
                const attachment = item.attachments.find(a => a.mimeType === 'text/plain');
                if (attachment) {
                    const resp = await fetch(attachment.url, { headers: { 'Authorization': 'Bearer ' + client.accessToken }});
                    defaultText = await resp.text();
                }
            }
            conversationsHashMap[conversation.convId].defaultText = defaultText; // will either be the default document or an empty firepad
            const firepadRef = ref.child(item.convId).child('document');
            const headless = new Firepad.Headless(firepadRef);
            headless.setText('', async (err, committed) => {
                if (err) {
                    headless.dispose();
                    throw new Error(err);
                }
                if (!committed) {
                    headless.dispose();
                    throw new Error('Error commiting the default text.');
                }
                const creator = await client.getUserById(item.creatorId); 
                const content = {
                    parentId: item.parentItemId || item.itemId,
                    content: `Created group co-edit session managed by ${creator.displayName}. Click <a href="${host}/conversation/${conversation.convId}">here</a> to join the session.`
                }
                // Send user the link to the session
                await client.addTextItem(conversation.convId, content);
                headless.dispose(); 
            });
        } else {
            const content = {
                parentId: item.parentItemId || item.itemId,
                content: `That session already exists, only one session per conversation can be active. Click <a href="${host}/conversation/${item.convId}">here</a> to join the session.`
            }
            // Send user the link to the session
            await client.addTextItem(item.convId, content);
        }
    } catch (e) {
        // If something went wrong
        console.error(e);
    }
}

function addEventListeners() {
    client.addEventListener('itemAdded', async evt => { // where to initiate session
        let item = evt.item;;
        if (item.type !== Circuit.Enums.ConversationItemType.TEXT || !item.text.content || item.creatorId === client.loggedOnUser.userId) {
            // Ignore item added if it isn't a text item or if the item added was from the bot itself
            return;
        }
        if (item.text.content.startsWith('/start co-edit')) {
            // Create session here
            await createSession(item);
        } else if (item.text.content.startsWith('/stop co-edit')) {
            // End session here if creator does it by the circuit conversation
            const snap = await ref.once('value');
            const exist = snap.child(item.convId).exists();
            const session = conversationsHashMap[item.convId];
            let content;
            if (exist && session) {
                if (item.creatorId === session.creatorId) {
                    try {
                        await uploadDocument(item.convId);
                        await endSession(item.convId);
                    } catch (err) {
                        content = {
                            parentId: item.parentItemId || item.itemId,
                            content: 'There was an error ending the session'
                        };
                        console.error(err);
                    }
                } else {
                    content = {
                        parentId: item.parentItemId || item.itemId,
                        content: 'You are not allowed to close this session'
                    };
                }
            } else {
                content = {
                    parentId: item.parentItemId || item.itemId,
                    content: 'That session does not currently exist'
                };
            }
            if (content) {
                await client.addTextItem(item.convId, content);
            }
        }
    });

    // Keeps track of new users added to the conversation or removed for session permissions
    client.addEventListener('conversationUpdated', evt => { // where to initiate session
        const conversation = evt.conversation;
        const session = conversationsHashMap[conversation.convId];
        if (session) {
            if (conversation.participants.length !== session.participants.length) {
                conversationsHashMap[conversation.convId].participants = conversation.participants;
            }
        }
    });

    // Listener to end sessions after a user joins a session, is deleted when the session is deleted
    ref.on('child_added', childAdded => {
        if (conversationsHashMap[childAdded.key]) {
            const documentRef = ref.child(childAdded.key).child('document');
            conversationsHashMap[childAdded.key].childRemovedListener = documentRef.on('child_removed', async snap => {
                const exist = await ref.once('value');
                if (snap.key === 'users' && exist.child(childAdded.key).hasChild('document')) {
                    // The users branch was delete, meaning all users have left the session
                    try {
                        await uploadDocument(childAdded.key);
                        await endSession(childAdded.key);
                    } catch (err) {
                        await client.addTextItem(childAdded.key, 'There was an error uploading the file.');
                        console.error(err);
                    }
                }
            });
        }
    });
}

// Uploads document of session, itemId is an optional parameter to post as a response to an item.
function uploadDocument(convId) {
    return new Promise(async (resolve, reject) => {
        try {
            const firepadRef = ref.child(convId).child('document');
            const headless = new Firepad.Headless(firepadRef);
            headless.getDocument(async data => {
                if (data && data.ops && data.ops.length) {
                    const newFileName = Date.now();
                    const filePath = `${__dirname}\\documents\\${newFileName}.txt`;
                    const creator = await client.getUserById(conversationsHashMap[convId].creatorId);
                    const document = data.ops[0].text;
                    fs.writeFileSync(filePath, document);
                    const file = new File(filePath);
                    const content = {
                        subject: `Co-edit session hosted by: ${creator.displayName}`,
                        attachments: [file]
                    };
                    await client.addTextItem(convId, content);
                    fs.unlink(filePath, err => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                } else {
                    await client.addTextItem(convId, `The document was empty.`);
                    resolve();
                }
            });
            headless.dispose();
        } catch (err) {
            reject(err);
        }
    });
}
// Loads sessions into hashmap if bot is restarted
function loadConversations() {
    let previousSessions;
    return ref.once('value')
        .then(snap => {
            previousSessions = snap.val();
            // If there is a document then it is an active session
            let keys = Object.keys(previousSessions).filter(key => previousSessions[key].document);
            return keys && keys.length ? client.getConversationsByIds(keys) : [];
        })
        .then(conversations => {
            conversations.forEach(conversation => {
                conversationsHashMap[conversation.convId] = previousSessions[conversation.convId];
                conversationsHashMap[conversation.convId].convId = conversation.convId;
                conversationsHashMap[conversation.convId].participants = conversation.participants;
                conversationsHashMap[conversation.convId].tokens = {}; // will make new tokens if users try to log in again
            });
        });
}

// Session getter where the key is the convId
function getSession(key) {
    return conversationsHashMap[key];
}

// Creates a custom token for the user in firebase
// Sets the auth().uid to their circuit userId and grants permissions based on the convId
function createTokenForUser(userId, convId) {
    return new Promise((resolve,reject) => {
        admin.auth().createCustomToken(userId, { convId: convId })
            .then(token => {
                conversationsHashMap[convId].tokens[userId] = token;
                resolve(token);
            })
            .catch(reject);
    });
}

// Initalize the bot 
function initialize() {
    client = new Circuit.Client(config.bot);;
    return client.logon()
        .then(() => loadConversations())
        .then(() => addEventListeners())
        .then(() => console.log('Bot is successfully launched.'));
}

module.exports = {
    initialize: initialize,
    getSession: getSession,
    uploadDocument: uploadDocument,
    endSession: endSession,
    createTokenForUser: createTokenForUser
}